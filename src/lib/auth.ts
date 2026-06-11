import { writable, derived } from 'svelte/store';

export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  avatar: string | null;
  isOwner: boolean;
  nameColour: string | null;
  cardBack: { style: string } | { svg: string } | null;
  tableFelt: { hex: string } | null;
  frame: { svg: string } | null;
  emblem: { svg: string } | null;
  titleBadge: { id: string } | null;
}

export interface AuthStats {
  gamesPlayed: number;
  gamesWon: number;
  chips: number;
  xp: number;
  level: number;
}

export interface AuthBadge {
  slug: string;
  label: string;
  description: string;
  icon: string;
  awardedAt: number;
}

export interface GameHistoryEntry {
  id: string;
  gameType: string;
  roomCode: string;
  playerCount: number;
  startedAt: number;
  endedAt: number;
  won: boolean;
}

export interface PerGameStat {
  gameType: string;
  played: number;
  won: number;
}

export const currentUser = writable<AuthUser | null>(null);
export const userStats = writable<AuthStats | null>(null);
export const userBadges = writable<AuthBadge[]>([]);
export const gameHistory = writable<GameHistoryEntry[]>([]);
export const perGameStats = writable<PerGameStat[]>([]);
export const isLoggedIn = derived(currentUser, ($user) => $user !== null);

export async function fetchUser(): Promise<AuthUser | null> {
  try {
    const res = await fetch('/api/auth/me');
    if (!res.ok) {
      currentUser.set(null);
      userStats.set(null);
      userBadges.set([]);
      gameHistory.set([]);
      perGameStats.set([]);
      return null;
    }
    const data: {
      user: AuthUser;
      stats?: AuthStats;
      badges?: AuthBadge[];
      gameHistory?: GameHistoryEntry[];
      perGameStats?: PerGameStat[];
    } = await res.json();
    currentUser.set(data.user);
    userStats.set(data.stats || null);
    userBadges.set(data.badges || []);
    gameHistory.set(data.gameHistory || []);
    perGameStats.set(data.perGameStats || []);
    return data.user;
  } catch {
    currentUser.set(null);
    return null;
  }
}

// SvelteKit's framework-level error response uses `message`, not `error`, so we
// fall back to it before the generic string. Without this the user sees the
// bland fallback even when the server emitted a useful reason.
async function readAuthError(res: Response, fallback: string): Promise<string> {
  const data = (await res.json().catch(() => null)) as
    | { error?: string; message?: string }
    | null;
  return data?.error || data?.message || fallback;
}

export async function login(email: string, password: string): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) return { ok: false, error: await readAuthError(res, 'Login failed') };
  const data: { user?: AuthUser } = await res.json();
  if (data.user) currentUser.set(data.user);
  return { ok: true };
}

export async function register(
  email: string,
  password: string,
  displayName: string
): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, displayName }),
  });
  if (!res.ok) return { ok: false, error: await readAuthError(res, 'Registration failed') };
  const data: { user?: AuthUser } = await res.json();
  if (data.user) currentUser.set(data.user);
  return { ok: true };
}

export async function logout(): Promise<void> {
  await fetch('/api/auth/logout', { method: 'POST' });
  // Clear guest identity so a re-join after logout cannot reuse the same guest_<id>
  // (identity laundering prevention). Key duplicated here to avoid import cycle with guest.ts.
  try {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('arcade-guest-id');
      sessionStorage.removeItem('arcade-guest-id');
    }
  } catch {
    // storage may be unavailable; ignore
  }
  currentUser.set(null);
  userStats.set(null);
  userBadges.set([]);
  gameHistory.set([]);
  perGameStats.set([]);
}
