import { CardRoom } from '../cards/cardRoom';
import type { Card, CardAction, CardGameState } from '../cards/types';
import { createDeck, shuffle } from '../cards/deck';
import { evaluateHand, compareHands } from './handEvaluator';
import { calculatePots, type Pot } from './potCalculator';
import { getPokerBotAction } from '../bots/pokerBot';

// ─── Types ──────────────────────────────────────────────────────────

interface PokerTableState {
  communityCards: Card[];
  pots: Pot[];
  currentBet: number;
  bettingRound: 'preflop' | 'flop' | 'turn' | 'river' | 'showdown';
  dealerIndex: number;
  smallBlindAmount: number;
  bigBlindAmount: number;
  deck: Card[];
  lastAction: { playerId: string; action: string; amount?: number } | null;
  winnersInfo: { playerId: string; amount: number; hand?: string }[] | null;
  handNumber: number;
  playerChips: Record<string, number>;
  playerBets: Record<string, number>;
  playerFolded: Record<string, boolean>;
  playerAllIn: Record<string, boolean>;
  isGuestPlayer: Record<string, boolean>;
  actionOnPlayerId: string | null;
  lastRaisePlayerId: string | null;
  bbHasActed: boolean;
  bbPlayerId: string | null;
  roundStartPlayerId: string | null;
  actedThisRound: Record<string, boolean>;
  gameMode: 'casual' | 'competitive';
  casualChipCount: number;
}

type PokerAction = CardAction & (
  | { type: 'fold' }
  | { type: 'check' }
  | { type: 'call' }
  | { type: 'raise'; amount: number }
  | { type: 'all_in' }
  | { type: 'next_hand' }
);

const DEFAULT_SMALL_BLIND = 5;
const DEFAULT_BIG_BLIND = 10;
const DEFAULT_BUY_IN = 1000;
const DEFAULT_REBUY = 100;

// ─── PokerRoom ──────────────────────────────────────────────────────

export class PokerRoom extends CardRoom {
  protected get minPlayers(): number { return 2; }
  protected get maxPlayers(): number { return 8; }
  protected get gameType(): string { return 'poker'; }

  private getTable(): PokerTableState {
    const ts = (this.tableState as PokerTableState) ?? this.defaultTableState();
    // Backward compat for state saved before these fields existed
    if (!ts.actedThisRound) ts.actedThisRound = {};
    if (ts.roundStartPlayerId === undefined) ts.roundStartPlayerId = null;
    return ts;
  }

  private setTable(table: PokerTableState): void {
    this.tableState = table;
  }

  private defaultTableState(): PokerTableState {
    return {
      communityCards: [],
      pots: [],
      currentBet: 0,
      bettingRound: 'preflop',
      dealerIndex: 0,
      smallBlindAmount: DEFAULT_SMALL_BLIND,
      bigBlindAmount: DEFAULT_BIG_BLIND,
      deck: [],
      lastAction: null,
      winnersInfo: null,
      handNumber: 0,
      playerChips: {},
      playerBets: {},
      playerFolded: {},
      playerAllIn: {},
      isGuestPlayer: {},
      actionOnPlayerId: null,
      lastRaisePlayerId: null,
      bbHasActed: false,
      bbPlayerId: null,
      roundStartPlayerId: null,
      actedThisRound: {},
      gameMode: 'casual' as const,
      casualChipCount: 1000,
    };
  }

  // ─── Override fetch for chip loading ────────────────────────────

  async fetch(request: Request): Promise<Response> {
    await this.loadState();

    // Before the base class handles the WS upgrade, extract chip headers
    if (request.headers.get('Upgrade') === 'websocket') {
      const userId = request.headers.get('X-User-Id');
      if (userId) {
        const chipsHeader = request.headers.get('X-Player-Chips');
        const isGuestHeader = request.headers.get('X-Is-Guest');
        const ts = this.getTable();

        const isGuest = isGuestHeader === 'true';
        if (isGuest) {
          ts.isGuestPlayer[userId] = true;
          if (ts.playerChips[userId] === undefined) {
            ts.playerChips[userId] = DEFAULT_BUY_IN;
          }
        } else {
          ts.isGuestPlayer[userId] = false;
          // For casual mode reconnects, DO state is authoritative
          if (!(ts.gameMode === 'casual' && ts.playerChips[userId] !== undefined)) {
            if (chipsHeader !== null) {
              const chips = parseInt(chipsHeader, 10);
              if (!isNaN(chips) && chips > 0) {
                ts.playerChips[userId] = chips;
              } else {
                // Registered player with 0 chips: auto-grant rebuy based on mode
                ts.playerChips[userId] = ts.gameMode === 'competitive' ? 0 : DEFAULT_REBUY;
              }
            } else if (ts.playerChips[userId] === undefined) {
              ts.playerChips[userId] = DEFAULT_BUY_IN;
            }
          }
        }

        this.setTable(ts);
        await this.saveState();
      }
    }

    // Delegate to base class for actual WS upgrade / HTTP handling
    return super.fetch(request);
  }

  // ─── Start game options ─────────────────────────────────────────

  protected onStartGameOptions(msg: any): void {
    const ts = this.getTable();

    // Fix blind bug: consume blindAmount from start_game message (allowlist)
    const VALID_BLINDS = [2, 4, 10, 20, 50, 100];
    if (typeof msg.blindAmount === 'number' && VALID_BLINDS.includes(msg.blindAmount)) {
      ts.bigBlindAmount = msg.blindAmount;
      ts.smallBlindAmount = Math.floor(msg.blindAmount / 2);
    }

    // Game mode
    const mode = msg.gameMode === 'competitive' ? 'competitive' : 'casual';
    ts.gameMode = mode;

    if (mode === 'casual') {
      const presets = [500, 1000, 2500, 5000, 10000];
      const requested = typeof msg.casualChipCount === 'number' ? msg.casualChipCount : 1000;
      ts.casualChipCount = presets.includes(requested) ? requested : 1000;
      for (const [id] of this.players) {
        ts.playerChips[id] = ts.casualChipCount;
      }
    }

    this.setTable(ts);
  }

  // ─── Round init ─────────────────────────────────────────────────

  protected initRound(): void {
    const ts = this.getTable();
    const playerIds = Array.from(this.players.keys());

    // Init chips for any player without them
    for (const id of playerIds) {
      if (ts.playerChips[id] === undefined) {
        ts.playerChips[id] = DEFAULT_BUY_IN;
      }
    }

    // Rotate dealer
    ts.handNumber++;
    ts.dealerIndex = (ts.handNumber - 1) % playerIds.length;

    // Shuffle and deal 2 hole cards
    const deck = shuffle(createDeck());
    ts.deck = deck;

    for (let i = 0; i < playerIds.length; i++) {
      const player = this.players.get(playerIds[i]);
      if (player) {
        player.hand = [deck.shift()!, deck.shift()!];
      }
    }
    ts.deck = deck;

    // Reset round state
    ts.communityCards = [];
    ts.pots = [];
    ts.currentBet = 0;
    ts.bettingRound = 'preflop';
    ts.lastAction = null;
    ts.winnersInfo = null;
    ts.lastRaisePlayerId = null;

    for (const id of playerIds) {
      ts.playerBets[id] = 0;
      ts.playerFolded[id] = false;
      ts.playerAllIn[id] = false;
    }

    // Post blinds
    const sbIndex = (ts.dealerIndex + 1) % playerIds.length;
    const bbIndex = (ts.dealerIndex + 2) % playerIds.length;
    // Heads-up special case: dealer posts SB, other posts BB
    const sbPlayer = playerIds.length === 2 ? playerIds[ts.dealerIndex] : playerIds[sbIndex];
    const bbPlayer = playerIds.length === 2 ? playerIds[(ts.dealerIndex + 1) % playerIds.length] : playerIds[bbIndex];

    const sbAmount = Math.min(ts.smallBlindAmount, ts.playerChips[sbPlayer]);
    ts.playerChips[sbPlayer] -= sbAmount;
    ts.playerBets[sbPlayer] = sbAmount;
    if (ts.playerChips[sbPlayer] === 0) ts.playerAllIn[sbPlayer] = true;

    const bbAmount = Math.min(ts.bigBlindAmount, ts.playerChips[bbPlayer]);
    ts.playerChips[bbPlayer] -= bbAmount;
    ts.playerBets[bbPlayer] = bbAmount;
    ts.currentBet = bbAmount;
    if (ts.playerChips[bbPlayer] === 0) ts.playerAllIn[bbPlayer] = true;

    // UTG: player after BB (or SB in heads-up acts first preflop)
    let utgIndex: number;
    if (playerIds.length === 2) {
      // Heads-up: dealer/SB acts first preflop
      utgIndex = ts.dealerIndex;
    } else {
      utgIndex = (bbIndex + 1) % playerIds.length;
    }
    ts.actionOnPlayerId = playerIds[utgIndex];
    ts.lastRaisePlayerId = null;
    ts.bbHasActed = false;
    ts.bbPlayerId = bbPlayer;
    ts.roundStartPlayerId = playerIds[utgIndex];
    ts.actedThisRound = {};

    this.currentTurn = ts.actionOnPlayerId;
    this.setTable(ts);

    // If all players are all-in from blinds, skip to showdown
    this.checkAllInShowdown();
  }

  // ─── Action handling ────────────────────────────────────────────

  protected async handleAction(playerId: string, action: PokerAction): Promise<void> {
    const ts = this.getTable();

    // next_hand: host-only action between hands
    if (action.type === 'next_hand') {
      if (playerId !== this.hostId) {
        this.sendTo(playerId, { type: 'error', message: 'Only the host can deal the next hand' });
        return;
      }
      if (ts.bettingRound !== 'showdown') {
        this.sendTo(playerId, { type: 'error', message: 'Hand is still in progress' });
        return;
      }

      // Remove busted players (0 chips)
      const busted: string[] = [];
      for (const [id] of this.players) {
        if ((ts.playerChips[id] ?? 0) <= 0) {
          busted.push(id);
        }
      }
      for (const id of busted) {
        this.players.delete(id);
        this.bots.delete(id);
        const idx = this.turnOrder.indexOf(id);
        if (idx !== -1) this.turnOrder.splice(idx, 1);
      }

      // Update turnOrder to current players
      this.turnOrder = Array.from(this.players.keys());

      if (this.players.size < this.minPlayers) {
        this.phase = 'game_over';
        // The remaining player with chips is the overall winner
        const winner = this.turnOrder.find(id => (ts.playerChips[id] ?? 0) > 0) ?? null;
        this.recordGameEnd(winner).catch(() => {});
        this.broadcastState();
        return;
      }

      this.initRound();
      this.broadcastState();

      if (this.isBotTurn() && this.phase === 'playing') {
        await this.scheduleBotTurn();
      }
      return;
    }

    if (this.phase !== 'playing') return;

    // Validate it's this player's turn
    if (ts.actionOnPlayerId !== playerId) {
      this.sendTo(playerId, { type: 'error', message: 'Not your turn to act' });
      return;
    }

    if (ts.playerFolded[playerId] || ts.playerAllIn[playerId]) {
      this.sendTo(playerId, { type: 'error', message: 'Cannot act (folded or all-in)' });
      return;
    }

    const chips = ts.playerChips[playerId] ?? 0;
    const myBet = ts.playerBets[playerId] ?? 0;
    const toCall = ts.currentBet - myBet;

    // Track when the big blind takes their preflop action
    if (ts.bettingRound === 'preflop' && playerId === ts.bbPlayerId) {
      ts.bbHasActed = true;
    }

    // Track that this player has acted this round
    ts.actedThisRound[playerId] = true;

    switch (action.type) {
      case 'fold': {
        ts.playerFolded[playerId] = true;
        ts.lastAction = { playerId, action: 'fold' };

        // Check if only 1 non-folded player remains
        const remaining = this.getActivePlayers(ts);
        if (remaining.length === 1) {
          await this.awardPotToLastPlayer(ts, remaining[0]);
          this.setTable(ts);
          this.broadcastState();
          return;
        }
        break;
      }

      case 'check': {
        if (toCall > 0) {
          this.sendTo(playerId, { type: 'error', message: 'Cannot check, there is a bet to call' });
          return;
        }
        ts.lastAction = { playerId, action: 'check' };
        break;
      }

      case 'call': {
        if (toCall <= 0) {
          // Treat as check
          ts.lastAction = { playerId, action: 'check' };
          break;
        }
        const callAmount = Math.min(toCall, chips);
        ts.playerChips[playerId] -= callAmount;
        ts.playerBets[playerId] += callAmount;
        if (ts.playerChips[playerId] === 0) ts.playerAllIn[playerId] = true;
        ts.lastAction = { playerId, action: 'call', amount: callAmount };
        break;
      }

      case 'raise': {
        const raiseTarget = action.amount;
        if (raiseTarget === undefined || raiseTarget <= ts.currentBet) {
          this.sendTo(playerId, { type: 'error', message: 'Raise must be higher than the current bet' });
          return;
        }
        // Minimum raise: at least 1 big blind more than current bet
        const minRaise = ts.currentBet + ts.bigBlindAmount;
        if (raiseTarget < minRaise && raiseTarget < chips + myBet) {
          this.sendTo(playerId, { type: 'error', message: `Minimum raise is ${minRaise}` });
          return;
        }

        const needed = raiseTarget - myBet;
        if (needed >= chips) {
          // Not enough chips -- becomes all-in
          ts.playerBets[playerId] += chips;
          ts.playerChips[playerId] = 0;
          ts.playerAllIn[playerId] = true;
          if (ts.playerBets[playerId] > ts.currentBet) {
            ts.currentBet = ts.playerBets[playerId];
            ts.lastRaisePlayerId = playerId;
          }
        } else {
          ts.playerChips[playerId] -= needed;
          ts.playerBets[playerId] = raiseTarget;
          ts.currentBet = raiseTarget;
          ts.lastRaisePlayerId = playerId;
        }
        ts.lastAction = { playerId, action: 'raise', amount: ts.playerBets[playerId] };
        break;
      }

      case 'all_in': {
        const allInAmount = chips;
        ts.playerBets[playerId] += allInAmount;
        ts.playerChips[playerId] = 0;
        ts.playerAllIn[playerId] = true;
        if (ts.playerBets[playerId] > ts.currentBet) {
          ts.currentBet = ts.playerBets[playerId];
          ts.lastRaisePlayerId = playerId;
        }
        ts.lastAction = { playerId, action: 'all_in', amount: ts.playerBets[playerId] };
        break;
      }

      default:
        return;
    }

    // Advance to next player
    this.advanceAction(ts);

    // Check if betting round is complete
    if (this.isBettingRoundComplete(ts)) {
      await this.endBettingRound(ts);
    }

    this.setTable(ts);
    this.broadcastState();
  }

  // ─── Action advancement ─────────────────────────────────────────

  /** Get non-folded player IDs. */
  private getActivePlayers(ts: PokerTableState): string[] {
    return this.turnOrder.filter(id => !ts.playerFolded[id]);
  }

  /** Get players who can still act (not folded, not all-in). */
  private getActingPlayers(ts: PokerTableState): string[] {
    return this.turnOrder.filter(id => !ts.playerFolded[id] && !ts.playerAllIn[id]);
  }

  /** Advance actionOnPlayerId to the next player who can act. */
  private advanceAction(ts: PokerTableState): void {
    const acting = this.getActingPlayers(ts);
    if (acting.length === 0) {
      ts.actionOnPlayerId = null;
      return;
    }

    const currentIdx = this.turnOrder.indexOf(ts.actionOnPlayerId ?? '');
    let nextIdx = (currentIdx + 1) % this.turnOrder.length;

    for (let i = 0; i < this.turnOrder.length; i++) {
      const candidateId = this.turnOrder[nextIdx];
      if (!ts.playerFolded[candidateId] && !ts.playerAllIn[candidateId]) {
        ts.actionOnPlayerId = candidateId;
        this.currentTurn = candidateId;
        return;
      }
      nextIdx = (nextIdx + 1) % this.turnOrder.length;
    }

    ts.actionOnPlayerId = null;
  }

  /**
   * Betting round is complete when all acting players have matched
   * the current bet (or are all-in) and we've gone around to the
   * last raiser (or everyone has had a chance to act).
   */
  private isBettingRoundComplete(ts: PokerTableState): boolean {
    const acting = this.getActingPlayers(ts);

    // No one left to act
    if (acting.length === 0) return true;

    // Everyone who can act has matched the current bet
    const allMatched = acting.every(id => ts.playerBets[id] === ts.currentBet);
    if (!allMatched) return false;

    // Preflop: BB must get a chance to act even if everyone just called
    if (ts.bettingRound === 'preflop' && !ts.bbHasActed && ts.bbPlayerId) {
      // BB hasn't acted yet -- don't end the round
      if (acting.includes(ts.bbPlayerId)) return false;
    }

    // Action has come back to the last raiser
    if (ts.lastRaisePlayerId && ts.actionOnPlayerId === ts.lastRaisePlayerId) {
      return true;
    }

    // If no one has raised (e.g. everyone checked), complete when all
    // acting players have had a chance to act this round
    if (!ts.lastRaisePlayerId) {
      const allActed = acting.every(id => ts.actedThisRound[id]);
      return allActed;
    }

    return false;
  }

  // ─── Betting round transitions ──────────────────────────────────

  private async endBettingRound(ts: PokerTableState): Promise<void> {
    // Collect bets into pots
    const betMap = new Map<string, number>();
    const foldedSet = new Set<string>();
    for (const id of this.turnOrder) {
      betMap.set(id, ts.playerBets[id] ?? 0);
      if (ts.playerFolded[id]) foldedSet.add(id);
    }

    const newPots = calculatePots(betMap, foldedSet);

    // Merge new pots into existing pots
    for (const np of newPots) {
      const existingIdx = ts.pots.findIndex(
        p => p.eligiblePlayerIds.sort().join(',') === np.eligiblePlayerIds.sort().join(',')
      );
      if (existingIdx !== -1) {
        ts.pots[existingIdx].amount += np.amount;
      } else {
        ts.pots.push(np);
      }
    }

    // Reset per-round bets
    for (const id of this.turnOrder) {
      ts.playerBets[id] = 0;
    }
    ts.currentBet = 0;
    ts.lastRaisePlayerId = null;

    // Advance betting round
    const active = this.getActivePlayers(ts);

    switch (ts.bettingRound) {
      case 'preflop':
        ts.bettingRound = 'flop';
        ts.communityCards.push(ts.deck.shift()!, ts.deck.shift()!, ts.deck.shift()!);
        break;
      case 'flop':
        ts.bettingRound = 'turn';
        ts.communityCards.push(ts.deck.shift()!);
        break;
      case 'turn':
        ts.bettingRound = 'river';
        ts.communityCards.push(ts.deck.shift()!);
        break;
      case 'river':
        ts.bettingRound = 'showdown';
        await this.resolveShowdown(ts);
        return;
      default:
        break;
    }

    // Check if we need to go straight to showdown (all active players are all-in)
    const acting = this.getActingPlayers(ts);
    if (acting.length <= 1 && active.length >= 2) {
      // All-in runout: deal remaining community cards and go to showdown
      await this.allInRunout(ts);
      return;
    }

    // Set action to first player after dealer who can act
    this.setFirstToAct(ts);
    this.setTable(ts);
  }

  /** Deal all remaining community cards and resolve showdown. */
  private async allInRunout(ts: PokerTableState): Promise<void> {
    while (ts.communityCards.length < 5) {
      ts.communityCards.push(ts.deck.shift()!);
    }
    ts.bettingRound = 'showdown';
    await this.resolveShowdown(ts);
  }

  /** Set first-to-act after dealer for a new betting round. */
  private setFirstToAct(ts: PokerTableState): void {
    const acting = this.getActingPlayers(ts);
    if (acting.length === 0) {
      ts.actionOnPlayerId = null;
      ts.roundStartPlayerId = null;
      return;
    }

    // Start from player after dealer
    const startIdx = (ts.dealerIndex + 1) % this.turnOrder.length;
    for (let i = 0; i < this.turnOrder.length; i++) {
      const idx = (startIdx + i) % this.turnOrder.length;
      const id = this.turnOrder[idx];
      if (!ts.playerFolded[id] && !ts.playerAllIn[id]) {
        ts.actionOnPlayerId = id;
        ts.roundStartPlayerId = id;
        ts.actedThisRound = {};
        this.currentTurn = id;
        return;
      }
    }
  }

  /** Check if all remaining players are all-in right after blinds. */
  private checkAllInShowdown(): void {
    const ts = this.getTable();
    const active = this.getActivePlayers(ts);
    const acting = this.getActingPlayers(ts);

    if (active.length >= 2 && acting.length === 0) {
      // Everyone is all-in from blinds, run it out
      this.allInRunout(ts).then(() => {
        this.setTable(ts);
        this.broadcastState();
        this.saveState();
      });
    }
  }

  // ─── Showdown ───────────────────────────────────────────────────

  private async resolveShowdown(ts: PokerTableState): Promise<void> {
    const active = this.getActivePlayers(ts);
    ts.winnersInfo = [];

    // Evaluate hands for all active players
    const results: { playerId: string; hand: ReturnType<typeof evaluateHand> }[] = [];
    for (const id of active) {
      const player = this.players.get(id);
      if (!player) continue;
      const result = evaluateHand(player.hand, ts.communityCards);
      results.push({ playerId: id, hand: result });
    }

    // Distribute each pot
    for (const pot of ts.pots) {
      const eligible = results.filter(r => pot.eligiblePlayerIds.includes(r.playerId));
      if (eligible.length === 0) continue;

      // Sort by hand strength (best first)
      eligible.sort((a, b) => compareHands(a.hand, b.hand));

      // Find all players tied for best hand
      const winners = [eligible[0]];
      for (let i = 1; i < eligible.length; i++) {
        if (compareHands(eligible[i].hand, eligible[0].hand) === 0) {
          winners.push(eligible[i]);
        } else {
          break;
        }
      }

      // Split pot among winners
      const share = Math.floor(pot.amount / winners.length);
      const remainder = pot.amount - share * winners.length;

      for (let i = 0; i < winners.length; i++) {
        const winAmount = share + (i === 0 ? remainder : 0);
        ts.playerChips[winners[i].playerId] += winAmount;

        const existingWinner = ts.winnersInfo!.find(w => w.playerId === winners[i].playerId);
        if (existingWinner) {
          existingWinner.amount += winAmount;
        } else {
          ts.winnersInfo!.push({
            playerId: winners[i].playerId,
            amount: winAmount,
            hand: winners[i].hand.description,
          });
        }
      }
    }

    this.setTable(ts);

    // Persist chip balances for registered players
    await this.persistChips(ts);
  }

  /** Award entire pot to the last remaining player (everyone else folded). */
  private async awardPotToLastPlayer(ts: PokerTableState, winnerId: string): Promise<void> {
    // Collect all current bets into pots first
    const betMap = new Map<string, number>();
    const foldedSet = new Set<string>();
    for (const id of this.turnOrder) {
      betMap.set(id, ts.playerBets[id] ?? 0);
      if (ts.playerFolded[id]) foldedSet.add(id);
    }
    const newPots = calculatePots(betMap, foldedSet);
    for (const np of newPots) {
      const existingIdx = ts.pots.findIndex(
        p => p.eligiblePlayerIds.sort().join(',') === np.eligiblePlayerIds.sort().join(',')
      );
      if (existingIdx !== -1) {
        ts.pots[existingIdx].amount += np.amount;
      } else {
        ts.pots.push(np);
      }
    }

    // Reset bets
    for (const id of this.turnOrder) {
      ts.playerBets[id] = 0;
    }

    // Award all pots to winner
    let totalWon = 0;
    for (const pot of ts.pots) {
      totalWon += pot.amount;
    }
    ts.playerChips[winnerId] += totalWon;

    ts.bettingRound = 'showdown';
    ts.winnersInfo = [{ playerId: winnerId, amount: totalWon }];
    ts.actionOnPlayerId = null;

    await this.persistChips(ts);
  }

  // ─── Chip persistence ──────────────────────────────────────────

  private async persistChips(ts: PokerTableState): Promise<void> {
    if (ts.gameMode === 'casual') return;
    try {
      const stmts: D1PreparedStatement[] = [];
      for (const [id] of this.players) {
        if (!this.bots.has(id) && !id.startsWith('guest_') && !ts.isGuestPlayer[id]) {
          stmts.push(
            this.env.DB.prepare('UPDATE player_profiles SET chips = ?, updated_at = ? WHERE id = ?')
              .bind(ts.playerChips[id], Math.floor(Date.now() / 1000), id)
          );
        }
      }
      if (stmts.length > 0) await this.env.DB.batch(stmts);
    } catch {}
  }

  // ─── Bot turn ──────────────────────────────────────────────────

  protected async processBotTurn(): Promise<void> {
    if (this.phase !== 'playing') return;

    const ts = this.getTable();
    const botId = ts.actionOnPlayerId;
    if (!botId || !this.bots.has(botId)) return;

    const player = this.players.get(botId);
    if (!player) return;

    // If showdown, bot triggers next hand (only if bot is host, else skip)
    if (ts.bettingRound === 'showdown') return;

    const decision = getPokerBotAction(
      player.hand,
      ts.communityCards,
      ts.currentBet,
      ts.playerBets[botId] ?? 0,
      ts.playerChips[botId] ?? 0,
      ts.bigBlindAmount,
      ts.bettingRound
    );

    await this.handleAction(botId, decision as PokerAction);

    // If next turn is also a bot, schedule it
    if (this.phase === 'playing' && this.isBotTurn()) {
      await this.scheduleBotTurn();
    }
  }

  /** Override isBotTurn to use actionOnPlayerId instead of currentTurn. */
  protected isBotTurn(): boolean {
    const ts = this.getTable();
    const actionPlayer = ts.actionOnPlayerId;
    if (!actionPlayer) return false;
    return this.bots.has(actionPlayer);
  }

  // ─── Game state for player ─────────────────────────────────────

  async webSocketClose(ws: WebSocket, code: number, reason: string): Promise<void> {
    await super.webSocketClose(ws, code, reason);
  }

  async webSocketError(ws: WebSocket, error: unknown): Promise<void> {
    await super.webSocketError(ws, error);
  }

  protected getGameStateForPlayer(playerId: string): CardGameState {
    const ts = this.getTable();
    const player = this.players.get(playerId);
    const isShowdown = ts.bettingRound === 'showdown';

    const players = Array.from(this.players.values()).map(p => ({
      id: p.id,
      name: p.name,
      cardCount: p.hand.length,
      connected: p.connected,
      isHost: p.isHost,
      isBot: p.isBot,
    }));

    // Build player hands visibility: only show own cards, or all at showdown
    const playerHands: Record<string, Card[] | null> = {};
    for (const [id, p] of this.players) {
      if (id === playerId) {
        playerHands[id] = p.hand;
      } else if (isShowdown && !ts.playerFolded[id]) {
        playerHands[id] = p.hand;
      } else {
        playerHands[id] = null;
      }
    }

    // Determine dealer/blind positions by player ID
    const dealerId = this.turnOrder[ts.dealerIndex] ?? null;
    let sbPlayerId: string | null = null;
    let bbPlayerId: string | null = null;
    if (this.turnOrder.length === 2) {
      sbPlayerId = this.turnOrder[ts.dealerIndex];
      bbPlayerId = this.turnOrder[(ts.dealerIndex + 1) % this.turnOrder.length];
    } else if (this.turnOrder.length > 2) {
      sbPlayerId = this.turnOrder[(ts.dealerIndex + 1) % this.turnOrder.length];
      bbPlayerId = this.turnOrder[(ts.dealerIndex + 2) % this.turnOrder.length];
    }

    return {
      code: this.code,
      phase: this.phase,
      players,
      turnOrder: this.turnOrder,
      currentTurn: ts.actionOnPlayerId,
      roundNumber: this.roundNumber,
      scores: Object.fromEntries(this.scores),
      tableState: {
        communityCards: ts.communityCards,
        pots: ts.pots,
        currentBet: ts.currentBet,
        bettingRound: ts.bettingRound,
        smallBlindAmount: ts.smallBlindAmount,
        bigBlindAmount: ts.bigBlindAmount,
        lastAction: ts.lastAction,
        winnersInfo: ts.winnersInfo,
        handNumber: ts.handNumber,
        playerChips: ts.playerChips,
        playerBets: ts.playerBets,
        playerFolded: ts.playerFolded,
        playerAllIn: ts.playerAllIn,
        playerHands,
        dealerId,
        smallBlindPlayerId: sbPlayerId,
        bigBlindPlayerId: bbPlayerId,
        actionOnPlayerId: ts.actionOnPlayerId,
        myHand: player?.hand ?? [],
        gameMode: ts.gameMode,
        casualChipCount: ts.casualChipCount,
      },
    };
  }

  protected checkRoundEnd(): string | null {
    const ts = this.getTable();
    const active = this.getActivePlayers(ts);
    if (active.length === 1) {
      return active[0];
    }
    return null;
  }
}
