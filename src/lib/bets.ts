export interface ActiveBet {
  id: number;
  bettorId: string;
  bettorName: string;
  targetPlayerId: string;
  wagerAmount: number;
  placedAt: number;
}

export interface ActiveBetsResponse {
  bets: ActiveBet[];
  totalPot: number;
}

export type PlaceBetError =
  | 'insufficient_chips'
  | 'room_not_playing'
  | 'invalid_target'
  | 'self_bet'
  | 'invalid_wager'
  | 'room_not_found'
  | 'guest_blocked'
  | 'duplicate_pending'
  | 'network';

export type PlaceBetResult =
  | { ok: true; betId: number; newChips: number }
  | { ok: false; error: PlaceBetError };

export const WAGER_ALLOWLIST = [5, 10, 25, 50, 100, 250] as const;

export async function fetchActiveBets(roomCode: string, game: string): Promise<ActiveBetsResponse> {
  try {
    const res = await fetch(`/api/bets/active?roomCode=${encodeURIComponent(roomCode)}&game=${encodeURIComponent(game)}`);
    if (!res.ok) return { bets: [], totalPot: 0 };
    const data = (await res.json()) as ActiveBetsResponse;
    return {
      bets: Array.isArray(data?.bets) ? data.bets : [],
      totalPot: typeof data?.totalPot === 'number' ? data.totalPot : 0,
    };
  } catch {
    return { bets: [], totalPot: 0 };
  }
}

export async function placeBet(input: {
  roomCode: string;
  game: string;
  targetPlayerId: string;
  wagerAmount: number;
}): Promise<PlaceBetResult> {
  try {
    const res = await fetch('/api/bets/place', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    const data = (await res.json().catch(() => ({}))) as {
      betId?: number;
      success?: boolean;
      newChips?: number;
      error?: string;
    };
    if (!res.ok) {
      const err = (data?.error as PlaceBetError) || 'network';
      return { ok: false, error: err };
    }
    if (typeof data.betId === 'number' && typeof data.newChips === 'number') {
      return { ok: true, betId: data.betId, newChips: data.newChips };
    }
    return { ok: false, error: 'network' };
  } catch {
    return { ok: false, error: 'network' };
  }
}

export function errorMessage(err: PlaceBetError): string {
  switch (err) {
    case 'insufficient_chips':
      return 'Not enough chips for that wager.';
    case 'room_not_playing':
      return 'This room is not in a playable round right now.';
    case 'invalid_target':
      return 'That player cannot be bet on.';
    case 'self_bet':
      return 'You cannot bet on yourself.';
    case 'invalid_wager':
      return 'Pick a valid wager amount.';
    case 'room_not_found':
      return 'Room not found.';
    case 'guest_blocked':
      return 'Log in to place bets.';
    case 'duplicate_pending':
      return 'You already have a pending bet on this player.';
    case 'network':
    default:
      return 'Network error. Try again.';
  }
}
