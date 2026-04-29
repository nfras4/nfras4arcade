import { CardRoom } from '../cards/cardRoom';
import type { CardAction, CardGameState } from '../cards/types';
import {
  initialDeal,
  applyAction as engineApplyAction,
  applyActionEffect,
  applyExchangeSelect,
  applyLoseInfluence,
  applySuccessfulBlock,
  applyChallengeWonByClaimer,
  resolvePending,
  validateAction,
  alivePlayers,
  isChallengeable,
  isBlockable,
  claimedRole,
  hasRole,
  blockerRoles,
  shuffleDeck,
  buildDeck,
  type Rng,
} from './engine';
import type {
  CoupAction,
  CoupActionType,
  CoupTableState,
  Influence,
  PendingAction,
} from './types';
import { coupBotDecision } from './bot';

const VALID_BUY_INS = [10, 25, 50, 100, 250];

/** Produce an Rng backed by crypto.getRandomValues — used for live rooms. */
function cryptoRng(): Rng {
  return () => {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    return buf[0] / 4294967296;
  };
}

type CoupClientMessage =
  | { type: 'declare_action'; action: CoupActionType; targetId?: string }
  | { type: 'challenge'; targetId?: string }
  | { type: 'block'; claimedRole: Influence }
  | { type: 'pass' }
  | { type: 'lose_card'; cardIdx: number }
  | { type: 'exchange_select'; keepIndices: number[] };

export class CoupRoom extends CardRoom {
  protected get minPlayers(): number { return 2; }
  protected get maxPlayers(): number { return 6; }
  protected get gameType(): string { return 'coup'; }

  // ─── Table state accessors ─────────────────────────────────────

  private getTable(): CoupTableState | null {
    return (this.tableState as CoupTableState) ?? null;
  }

  private setTable(table: CoupTableState): void {
    this.tableState = table;
  }

  // ─── Start-game options: buy-in only ───────────────────────────

  protected onStartGameOptions(msg: any): void {
    // Buy-in (chips deducted in initRound after start)
    let buyIn = 0;
    if (typeof msg?.buyIn === 'number' && VALID_BUY_INS.includes(msg.buyIn)) {
      buyIn = msg.buyIn;
    }
    // Persist intended buy-in into a transient slot used by initRound
    (this as any)._pendingBuyIn = buyIn;
  }

  // ─── Round init: deal cards, deduct buy-ins ────────────────────

  protected initRound(): void {
    const playerIds = Array.from(this.players.keys());
    const rng = cryptoRng();
    const state = initialDeal(playerIds, rng);
    state.buyIn = (this as any)._pendingBuyIn ?? 0;
    state.pot = 0;
    state.forfeitedAtStart = [];

    // Sync currentPlayerIdx with the CardRoom-chosen first turn (already shuffled)
    if (this.currentTurn) {
      const idx = playerIds.indexOf(this.currentTurn);
      if (idx >= 0) state.currentPlayerIdx = idx;
    }

    this.setTable(state);

    // Buy-in deduction happens async — kick it off
    if (state.buyIn > 0) {
      this.deductBuyIns().catch((err) => {
        console.error('coup: buy-in deduction failed', err);
      });
    }
  }

  /** Atomically deduct buy-in from each non-bot non-guest player. Forfeit on insufficient chips. */
  private async deductBuyIns(): Promise<void> {
    const ts = this.getTable();
    if (!ts || ts.buyIn <= 0) return;

    const now = Math.floor(Date.now() / 1000);
    const buyIn = ts.buyIn;

    for (const [id, p] of this.players) {
      if (this.bots.has(id) || id.startsWith('guest_') || p.isBot) {
        // Bots/guests don't pay
        continue;
      }
      try {
        const result = await this.env.DB.prepare(
          'UPDATE player_profiles SET chips = chips - ?, updated_at = ? WHERE id = ? AND chips >= ?',
        )
          .bind(buyIn, now, id, buyIn)
          .run();
        const meta = (result as any)?.meta;
        const changes = meta?.changes ?? meta?.rows_written ?? 0;
        if (changes > 0) {
          ts.pot += buyIn;
        } else {
          // Auto-forfeit
          this.forfeitPlayer(id, ts);
          this.sendTo(id, {
            type: 'error',
            message: `Insufficient chips for ${buyIn} buy-in — auto-forfeited`,
          });
        }
      } catch (err) {
        console.error('coup: chip deduction error', err);
        this.forfeitPlayer(id, ts);
        this.sendTo(id, {
          type: 'error',
          message: 'Buy-in deduction failed — auto-forfeited',
        });
      }
    }

    this.setTable(ts);
    this.broadcastState();
    // If only one player remains after forfeits, end the game
    this.maybeEndGame();
    await this.saveState();
  }

  /** Mark a player as forfeited: reveal both cards, eliminate, mark disconnected. */
  private forfeitPlayer(id: string, ts: CoupTableState): void {
    const ps = ts.playerStates[id];
    if (!ps) return;
    for (const c of ps.cards) c.revealed = true;
    ps.eliminated = true;
    ts.forfeitedAtStart.push(id);
    ts.actionLog.push({ ts: Date.now(), text: `${id} forfeited (insufficient chips)` });
    const pl = this.players.get(id);
    if (pl) pl.connected = false;
  }

  // ─── Action handling: dispatches to phase-specific handler ─────

  protected async handleAction(playerId: string, action: CardAction): Promise<void> {
    if (this.phase !== 'playing') return;
    const ts = this.getTable();
    if (!ts) return;

    const msg = action as unknown as CoupClientMessage;

    switch (msg.type) {
      case 'declare_action':
        await this.handleDeclareAction(playerId, msg, ts);
        break;
      case 'challenge':
        await this.handleChallenge(playerId, ts);
        break;
      case 'block':
        await this.handleBlock(playerId, msg, ts);
        break;
      case 'pass':
        await this.handlePass(playerId, ts);
        break;
      case 'lose_card':
        await this.handleLoseCard(playerId, msg, ts);
        break;
      case 'exchange_select':
        await this.handleExchangeSelect(playerId, msg, ts);
        break;
      default:
        this.sendTo(playerId, { type: 'error', message: 'unknown coup action' });
    }
  }

  private async handleDeclareAction(
    playerId: string,
    msg: Extract<CoupClientMessage, { type: 'declare_action' }>,
    ts: CoupTableState,
  ): Promise<void> {
    const action: CoupAction = {
      type: msg.action,
      playerId,
      targetId: msg.targetId,
    };
    if (this.currentTurn !== playerId) {
      this.sendTo(playerId, { type: 'error', message: 'Not your turn' });
      return;
    }
    const err = validateAction(ts, action);
    if (err) {
      this.sendTo(playerId, { type: 'error', message: err });
      return;
    }
    const next = engineApplyAction(ts, action);
    this.stampLogTimestamps(next);
    this.setTable(next);
    // If turn already advanced (income / coup target with no resolution needed), sync currentTurn
    this.syncCurrentTurnFromTable(next);
    this.maybeEndGame();
    this.broadcastState();
    await this.maybeAutoAdvance();
    await this.maybeScheduleBotTurn();
  }

  private async handleChallenge(playerId: string, ts: CoupTableState): Promise<void> {
    const pa = ts.pendingAction;
    if (!pa) {
      this.sendTo(playerId, { type: 'error', message: 'nothing to challenge' });
      return;
    }
    if (pa.phase === 'awaiting_challenge') {
      if (!isChallengeable(pa.action)) {
        this.sendTo(playerId, { type: 'error', message: 'this action cannot be challenged' });
        return;
      }
      const claimerId = pa.action.playerId;
      if (claimerId === playerId) {
        this.sendTo(playerId, { type: 'error', message: 'cannot challenge yourself' });
        return;
      }
      await this.resolveChallenge(ts, claimerId, playerId, claimedRole(pa.action)!, /*ofBlock*/ false);
      return;
    }
    if (pa.phase === 'awaiting_block_challenge') {
      const blockerId = pa.block.blockerId;
      if (blockerId === playerId) {
        this.sendTo(playerId, { type: 'error', message: 'cannot challenge your own block' });
        return;
      }
      await this.resolveChallenge(ts, blockerId, playerId, pa.block.claimedRole, /*ofBlock*/ true);
      return;
    }
    this.sendTo(playerId, { type: 'error', message: 'no challenge phase active' });
  }

  /** Resolve a challenge: did claimerId actually have `role`? */
  private async resolveChallenge(
    ts: CoupTableState,
    claimerId: string,
    challengerId: string,
    role: Influence,
    ofBlock: boolean,
  ): Promise<void> {
    let next = { ...ts };
    if (hasRole(ts, claimerId, role)) {
      // Claimer wins: challenger loses an influence, claimer reveal-and-replaces
      const claimerPs = ts.playerStates[claimerId];
      const matchingIdx = claimerPs.cards.findIndex((c) => !c.revealed && c.role === role);
      const replaced = applyChallengeWonByClaimer(ts, claimerId, matchingIdx, cryptoRng());
      if (replaced.error) {
        this.broadcastError(`challenge resolve error: ${replaced.error}`);
        return;
      }
      next = replaced.state;
      next.actionLog.push({ ts: Date.now(), text: `${challengerId} challenged ${claimerId} and lost` });
      // Challenger loses an influence; queue lose_influence
      const challengerPs = next.playerStates[challengerId];
      const stillHasFaceDown = challengerPs.cards.some((c) => !c.revealed);
      if (!stillHasFaceDown) {
        // already eliminated somehow — skip
      } else {
        next.pendingAction = {
          phase: 'lose_influence',
          targetId: challengerId,
          reason: 'failed_challenge',
          // After challenger loses card, continue with the original action's normal flow
          originalAction: ofBlock ? null : (ts.pendingAction as any).action,
          cancelAction: ofBlock,  // if challenging a block: action proceeds (cancel the block)
          // If we challenged the action (and lost), action proceeds.
          // If we challenged a block (and lost), the block stands? NO — challenger loses, blocker wins, block stands -> action canceled.
          // Wait: if a player challenges the BLOCK and the blocker had the role, the BLOCK stands. Action is canceled.
          resumeWith: ofBlock ? 'next_turn' : 'effect',
        };
      }
    } else {
      // Claimer loses: claimer loses an influence, action canceled (or block fails)
      next.actionLog.push({ ts: Date.now(), text: `${challengerId} challenged ${claimerId} and won` });
      next.pendingAction = {
        phase: 'lose_influence',
        targetId: claimerId,
        reason: 'caught_bluff',
        originalAction: ofBlock ? null : (ts.pendingAction as any).action,
        cancelAction: !ofBlock,  // if claim was the action: action canceled. If block: block fails -> action proceeds.
        resumeWith: ofBlock ? 'effect' : 'next_turn',
      };
    }
    this.stampLogTimestamps(next);
    this.setTable(next);
    this.broadcastState();
    await this.maybeAutoAdvance();
    await this.maybeScheduleBotTurn();
  }

  private async handleBlock(
    playerId: string,
    msg: Extract<CoupClientMessage, { type: 'block' }>,
    ts: CoupTableState,
  ): Promise<void> {
    const pa = ts.pendingAction;
    if (!pa || pa.phase !== 'awaiting_block') {
      this.sendTo(playerId, { type: 'error', message: 'no block phase active' });
      return;
    }
    if (playerId === pa.action.playerId) {
      this.sendTo(playerId, { type: 'error', message: 'cannot block your own action' });
      return;
    }
    const allowed = blockerRoles(pa.action);
    if (!allowed.includes(msg.claimedRole)) {
      this.sendTo(playerId, { type: 'error', message: 'cannot block with that role' });
      return;
    }
    // Foreign aid: anyone can block. Steal/Assassinate: only target may block.
    if (pa.action.type !== 'foreign_aid' && pa.action.targetId !== playerId) {
      this.sendTo(playerId, { type: 'error', message: 'only the target may block' });
      return;
    }
    const next = { ...ts };
    next.pendingAction = {
      phase: 'awaiting_block_challenge',
      action: pa.action,
      block: { blockerId: playerId, claimedRole: msg.claimedRole },
      passedBy: [],
    };
    next.actionLog.push({ ts: Date.now(), text: `${playerId} blocks with ${msg.claimedRole}` });
    this.stampLogTimestamps(next);
    this.setTable(next);
    this.broadcastState();
    await this.maybeAutoAdvance();
    await this.maybeScheduleBotTurn();
  }

  private async handlePass(playerId: string, ts: CoupTableState): Promise<void> {
    const pa = ts.pendingAction;
    if (!pa) return;
    // Only relevant in challenge/block phases
    if (
      pa.phase !== 'awaiting_challenge' &&
      pa.phase !== 'awaiting_block' &&
      pa.phase !== 'awaiting_block_challenge'
    ) {
      return;
    }
    if (!pa.passedBy.includes(playerId)) {
      pa.passedBy.push(playerId);
    }
    this.setTable(ts);
    await this.maybeAutoAdvance();
    await this.maybeScheduleBotTurn();
    this.broadcastState();
  }

  private async handleLoseCard(
    playerId: string,
    msg: Extract<CoupClientMessage, { type: 'lose_card' }>,
    ts: CoupTableState,
  ): Promise<void> {
    const pa = ts.pendingAction;
    if (!pa || pa.phase !== 'lose_influence') {
      this.sendTo(playerId, { type: 'error', message: 'no lose-influence phase' });
      return;
    }
    if (pa.targetId !== playerId) {
      this.sendTo(playerId, { type: 'error', message: 'not your card to lose' });
      return;
    }
    const result = applyLoseInfluence(ts, playerId, msg.cardIdx);
    if (result.error) {
      this.sendTo(playerId, { type: 'error', message: result.error });
      return;
    }
    const next = result.state;
    // Decide what to do next based on the pending action's continuation
    const cancelAction = pa.cancelAction;
    const resumeWith = pa.resumeWith;
    const originalAction = pa.originalAction;
    next.pendingAction = null;

    if (this.checkGameOverAndFinalize(next)) {
      this.stampLogTimestamps(next);
      this.setTable(next);
      this.broadcastState();
      return;
    }

    if (resumeWith === 'effect' && originalAction && !cancelAction) {
      // Action effect proceeds (e.g., assassinate after caught bluff)
      // For assassinate: lose_influence already happened (just now). So just advance turn.
      // For other effects (tax/steal/exchange): apply the effect.
      if (originalAction.type === 'assassinate') {
        // The assassinate's lose_influence already resolved here when reason was 'assassinate'
        // (Reason check: this branch only runs if reason was caught_bluff/failed_challenge)
        // Actually: if a player challenged the assassin's claim and lost, we should now
        // continue with the assassinate effect (target loses an influence).
        // But the lose_card we just processed was the CHALLENGER losing — different from target.
        // So we still need to apply the assassinate effect.
        const effected = applyActionEffect(next, originalAction);
        this.stampLogTimestamps(effected);
        this.setTable(effected);
      } else {
        const effected = applyActionEffect(next, originalAction);
        this.stampLogTimestamps(effected);
        this.setTable(effected);
      }
    } else {
      // Either cancelAction was true OR resumeWith=next_turn -> just advance
      // For 'coup' / 'assassinate' lose-influence (the success path), advance turn.
      this.advanceTurnInTable(next);
      this.stampLogTimestamps(next);
      this.setTable(next);
    }

    this.syncCurrentTurnFromTable(this.getTable()!);
    if (this.checkGameOverAndFinalize(this.getTable()!)) {
      this.broadcastState();
      return;
    }
    this.broadcastState();
    await this.maybeAutoAdvance();
    await this.maybeScheduleBotTurn();
  }

  private async handleExchangeSelect(
    playerId: string,
    msg: Extract<CoupClientMessage, { type: 'exchange_select' }>,
    ts: CoupTableState,
  ): Promise<void> {
    const result = applyExchangeSelect(ts, playerId, msg.keepIndices, cryptoRng());
    if (result.error) {
      this.sendTo(playerId, { type: 'error', message: result.error });
      return;
    }
    this.stampLogTimestamps(result.state);
    this.setTable(result.state);
    this.syncCurrentTurnFromTable(result.state);
    this.broadcastState();
    await this.maybeAutoAdvance();
    await this.maybeScheduleBotTurn();
  }

  // ─── Auto-advance: when all eligible players have passed ───────

  /** Players eligible to pass/challenge/block in the current pending phase (excludes the actor / target). */
  private eligibleResponders(ts: CoupTableState, pa: NonNullable<PendingAction>): string[] {
    const alive = alivePlayers(ts);
    if (pa.phase === 'awaiting_challenge') {
      // Anyone except the actor
      return alive.filter((id) => id !== pa.action.playerId);
    }
    if (pa.phase === 'awaiting_block') {
      // For foreign_aid: anyone except actor
      // For steal/assassinate: only the target may block (others irrelevant)
      if (pa.action.type === 'foreign_aid') {
        return alive.filter((id) => id !== pa.action.playerId);
      }
      return pa.action.targetId ? [pa.action.targetId] : [];
    }
    if (pa.phase === 'awaiting_block_challenge') {
      // Anyone except the blocker
      return alive.filter((id) => id !== pa.block.blockerId);
    }
    return [];
  }

  /** If everyone eligible has passed, resolve the pending action. */
  private async maybeAutoAdvance(): Promise<void> {
    let ts = this.getTable();
    if (!ts || !ts.pendingAction) return;
    let pa = ts.pendingAction;
    // Loop because resolving one phase may move to another (challenge -> block)
    let safety = 0;
    while (
      ts &&
      pa &&
      (pa.phase === 'awaiting_challenge' ||
        pa.phase === 'awaiting_block' ||
        pa.phase === 'awaiting_block_challenge') &&
      safety < 8
    ) {
      const eligible = this.eligibleResponders(ts, pa);
      const allPassed = eligible.every((id) => pa!.passedBy.includes(id));
      if (!allPassed) break;
      // Resolve this phase
      const next = resolvePending(ts);
      this.stampLogTimestamps(next);
      this.setTable(next);
      ts = this.getTable();
      pa = ts?.pendingAction ?? null;
      safety++;
    }
    if (ts) {
      this.syncCurrentTurnFromTable(ts);
      this.maybeEndGame();
    }
  }

  // ─── Bot turn handling ─────────────────────────────────────────

  /** Override: in Coup, "bot turn" means any phase where a bot needs to act, not just the main turn. */
  protected isBotTurn(): boolean {
    const ts = this.getTable();
    if (!ts) return false;
    const pa = ts.pendingAction;
    if (!pa) {
      // Idle: bot's main turn?
      return !!this.currentTurn && this.bots.has(this.currentTurn);
    }
    // Find a bot that needs to respond
    if (pa.phase === 'awaiting_challenge' || pa.phase === 'awaiting_block' || pa.phase === 'awaiting_block_challenge') {
      const eligible = this.eligibleResponders(ts, pa);
      return eligible.some((id) => this.bots.has(id) && !pa.passedBy.includes(id));
    }
    if (pa.phase === 'lose_influence') {
      return this.bots.has(pa.targetId);
    }
    if (pa.phase === 'exchange_select') {
      return this.bots.has(pa.playerId);
    }
    return false;
  }

  private async maybeScheduleBotTurn(): Promise<void> {
    if (this.phase !== 'playing') return;
    if (!this.isBotTurn()) return;
    await this.scheduleBotTurn();
  }

  protected async processBotTurn(): Promise<void> {
    if (this.phase !== 'playing') return;
    const ts = this.getTable();
    if (!ts) return;

    const pa = ts.pendingAction;
    let actorBotId: string | null = null;

    if (!pa) {
      if (this.currentTurn && this.bots.has(this.currentTurn)) actorBotId = this.currentTurn;
    } else if (pa.phase === 'awaiting_challenge' || pa.phase === 'awaiting_block' || pa.phase === 'awaiting_block_challenge') {
      const eligible = this.eligibleResponders(ts, pa);
      actorBotId = eligible.find((id) => this.bots.has(id) && !pa.passedBy.includes(id)) ?? null;
    } else if (pa.phase === 'lose_influence') {
      if (this.bots.has(pa.targetId)) actorBotId = pa.targetId;
    } else if (pa.phase === 'exchange_select') {
      if (this.bots.has(pa.playerId)) actorBotId = pa.playerId;
    }

    if (!actorBotId) return;
    const decision = coupBotDecision(ts, actorBotId);
    switch (decision.type) {
      case 'declare':
        await this.handleAction(actorBotId, {
          type: 'declare_action',
          action: decision.action.type,
          targetId: decision.action.targetId,
        } as any);
        break;
      case 'pass':
        await this.handleAction(actorBotId, { type: 'pass' } as any);
        break;
      case 'challenge':
        await this.handleAction(actorBotId, { type: 'challenge' } as any);
        break;
      case 'block':
        await this.handleAction(actorBotId, { type: 'block', claimedRole: decision.role } as any);
        break;
      case 'lose_card':
        await this.handleAction(actorBotId, { type: 'lose_card', cardIdx: decision.cardIdx } as any);
        break;
      case 'exchange_select':
        await this.handleAction(actorBotId, {
          type: 'exchange_select',
          keepIndices: decision.keepIndices,
        } as any);
        break;
    }

    if (this.phase === 'playing' && this.isBotTurn()) {
      await this.scheduleBotTurn();
    }
  }

  // ─── Helpers ───────────────────────────────────────────────────

  private advanceTurnInTable(ts: CoupTableState): void {
    if (ts.turnOrder.length === 0) return;
    for (let i = 0; i < ts.turnOrder.length; i++) {
      ts.currentPlayerIdx = (ts.currentPlayerIdx + 1) % ts.turnOrder.length;
      const id = ts.turnOrder[ts.currentPlayerIdx];
      if (!ts.playerStates[id]?.eliminated) {
        this.currentTurn = id;
        return;
      }
    }
  }

  private syncCurrentTurnFromTable(ts: CoupTableState): void {
    if (ts.turnOrder.length === 0) return;
    const id = ts.turnOrder[ts.currentPlayerIdx];
    if (id) this.currentTurn = id;
  }

  private stampLogTimestamps(ts: CoupTableState): void {
    const now = Date.now();
    for (const e of ts.actionLog) {
      if (!e.ts) e.ts = now;
    }
    // Trim to last 50 entries
    if (ts.actionLog.length > 50) {
      ts.actionLog = ts.actionLog.slice(-50);
    }
  }

  private maybeEndGame(): void {
    const ts = this.getTable();
    if (!ts) return;
    const alive = alivePlayers(ts);
    if (alive.length <= 1) {
      this.checkGameOverAndFinalize(ts);
    }
  }

  /** Returns true if the game ended; finalizes payouts. */
  private checkGameOverAndFinalize(ts: CoupTableState): boolean {
    const alive = alivePlayers(ts);
    if (alive.length > 1) return false;
    const winnerId = alive[0] ?? null;
    ts.winnerId = winnerId;
    if (this.phase !== 'game_over') {
      this.phase = 'game_over';
      // Payout pot to winner if eligible
      this.awardPotAndRecord(winnerId, ts).catch((err) => {
        console.error('coup: payout error', err);
      });
    }
    return true;
  }

  private async awardPotAndRecord(winnerId: string | null, ts: CoupTableState): Promise<void> {
    // Pay out the pot if winner is non-bot non-guest and pot > 0
    if (winnerId && ts.pot > 0 && !this.bots.has(winnerId) && !winnerId.startsWith('guest_')) {
      try {
        const now = Math.floor(Date.now() / 1000);
        await this.env.DB.prepare(
          'UPDATE player_profiles SET chips = chips + ?, updated_at = ? WHERE id = ?',
        )
          .bind(ts.pot, now, winnerId)
          .run();
      } catch (err) {
        console.error('coup: chip payout failed', err);
      }
    }
    // Record game-end stats via base class
    await this.recordGameEnd(winnerId);
  }

  private broadcastError(msg: string): void {
    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.send(JSON.stringify({ type: 'error', message: msg }));
      } catch {}
    }
  }

  // ─── State broadcast: hide other players' face-down cards ──────

  protected getGameStateForPlayer(playerId: string): CardGameState {
    const ts = this.getTable();

    const players = Array.from(this.players.values()).map((p) => ({
      id: p.id,
      name: p.name,
      cardCount: ts?.playerStates[p.id]
        ? ts.playerStates[p.id].cards.filter((c) => !c.revealed).length
        : 0,
      connected: p.connected,
      isHost: p.isHost,
      isBot: p.isBot,
      frameSvg: p.frameSvg ?? null,
      emblemSvg: p.emblemSvg ?? null,
      nameColour: p.nameColour ?? null,
      titleBadgeId: p.titleBadgeId ?? null,
    }));

    let tableView: any = null;
    if (ts) {
      const isSpectator = this.spectators.has(playerId);
      const playerView: Record<string, any> = {};
      for (const id of ts.turnOrder) {
        const ps = ts.playerStates[id];
        if (!ps) continue;
        const revealedCards = ps.cards.filter((c) => c.revealed).map((c) => c.role);
        const hiddenCardCount = ps.cards.filter((c) => !c.revealed).length;
        const view: any = {
          id,
          coins: ps.coins,
          eliminated: ps.eliminated,
          revealedCards,
          hiddenCardCount,
        };
        // The viewer themselves sees their own face-down cards
        if (id === playerId && !isSpectator) {
          view.myCards = ps.cards.filter((c) => !c.revealed).map((c) => c.role);
        }
        playerView[id] = view;
      }

      // Pending action: hide drawn exchange cards from non-actors
      let pendingForClient: any = null;
      if (ts.pendingAction) {
        const pa = ts.pendingAction;
        if (pa.phase === 'exchange_select') {
          if (pa.playerId === playerId && !isSpectator) {
            pendingForClient = pa;
          } else {
            pendingForClient = {
              phase: 'exchange_select',
              playerId: pa.playerId,
              drawnCardCount: pa.drawnCards.length,
            };
          }
        } else {
          pendingForClient = pa;
        }
      }

      tableView = {
        playerStates: playerView,
        currentPlayerId: ts.turnOrder[ts.currentPlayerIdx] ?? null,
        pendingAction: pendingForClient,
        actionLog: ts.actionLog.slice(-10),
        buyIn: ts.buyIn,
        pot: ts.pot,
        deckCount: ts.deck.length,
        winnerId: ts.winnerId,
      };
    }

    return {
      code: this.code,
      phase: this.phase,
      players,
      turnOrder: this.turnOrder,
      currentTurn: this.currentTurn,
      roundNumber: this.roundNumber,
      scores: Object.fromEntries(this.scores),
      tableState: tableView,
    };
  }

  protected checkRoundEnd(): string | null {
    const ts = this.getTable();
    if (!ts) return null;
    const alive = alivePlayers(ts);
    if (alive.length === 1) return alive[0];
    return null;
  }
}
