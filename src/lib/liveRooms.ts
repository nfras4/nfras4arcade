export interface LiveRoomPlayer {
  id: string;
  name: string;
  isBot: boolean;
}

export interface LiveRoom {
  code: string;
  game: string;
  phase: 'lobby' | 'playing' | 'round_over' | 'game_over';
  playerCount: number;
  players: LiveRoomPlayer[];
  startedAt: number | null;
  lastUpdatedAt: number;
  spectateUrl: string;
}

const GAME_LABELS: Record<string, string> = {
  coup: 'Coup',
  impostor: 'Impostor',
  wavelength: 'Wavelength',
  poker: 'Poker',
  president: 'President',
  'chase-the-queen': 'Chase the Queen',
  chase_the_queen: 'Chase the Queen',
  'connect-four': 'Connect 4',
  connect_four: 'Connect 4',
  snap: 'Snap',
  'liars-dice': "Liar's Dice",
  liars_dice: "Liar's Dice",
};

export function gameLabel(game: string): string {
  return GAME_LABELS[game] ?? game.replace(/[_-]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Build a one-line summary of room participants. Caps at 3 humans, then "+N more", then bot count. */
export function playersSummary(players: LiveRoomPlayer[]): string {
  const humans = players.filter((p) => !p.isBot);
  const bots = players.filter((p) => p.isBot);
  const shown = humans.slice(0, 3).map((p) => p.name);
  const extraHumans = humans.length - shown.length;
  const parts: string[] = [];
  if (shown.length > 0) parts.push(shown.join(', '));
  if (extraHumans > 0) parts.push(`+${extraHumans} more`);
  if (bots.length > 0) parts.push(`+${bots.length} ${bots.length === 1 ? 'bot' : 'bots'}`);
  return parts.length > 0 ? parts.join(' ') : 'Empty';
}

/** Phase to a short status label. */
export function phaseLabel(phase: LiveRoom['phase']): string {
  if (phase === 'lobby') return 'Waiting';
  if (phase === 'playing') return 'In progress';
  if (phase === 'round_over') return 'Round over';
  return 'Ended';
}

/** Human-readable elapsed time since startedAt (unix seconds). */
export function elapsedLabel(startedAt: number | null): string {
  if (!startedAt) return '';
  const nowSec = Math.floor(Date.now() / 1000);
  const seconds = Math.max(0, nowSec - startedAt);
  if (seconds < 60) return `${seconds}s in`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m in`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m in`;
}

export async function fetchLiveRooms(): Promise<LiveRoom[]> {
  try {
    const res = await fetch('/api/active-rooms', { headers: { 'Cache-Control': 'no-store' } });
    if (!res.ok) return [];
    const data: { rooms?: LiveRoom[] } = await res.json();
    return Array.isArray(data.rooms) ? data.rooms : [];
  } catch {
    return [];
  }
}
