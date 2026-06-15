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
  hat: { id: string } | null;
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

// Private helper — zeros out all auth stores in one place. Called by fetchUser
// on non-OK, by authedFetch on 401, and by logout on success.
function clearAuthState(): void {
  currentUser.set(null);
  userStats.set(null);
  userBadges.set([]);
  gameHistory.set([]);
  perGameStats.set([]);
}

export async function fetchUser(): Promise<AuthUser | null> {
  try {
    const res = await fetch('/api/auth/me');
    if (!res.ok) {
      clearAuthState();
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

/**
 * Thin fetch wrapper that clears auth state on a 401 so a stale session
 * (expired cookie or server-side row deletion) automatically signs the user
 * out mid-session rather than leaving a zombie logged-in nav.
 *
 * The raw Response is always returned to the caller — redirect / error UI is
 * the caller's responsibility, not ours.
 */
export async function authedFetch(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  const res = await fetch(input, init);
  if (res.status === 401) {
    clearAuthState();
    // Also evict the guest identity so a re-join after expiry cannot reuse
    // the same guest_<id> (mirrors the logout clearing below).
    try {
      if (typeof window !== 'undefined') {
        localStorage.removeItem('arcade-guest-id');
        sessionStorage.removeItem('arcade-guest-id');
      }
    } catch {
      // storage may be unavailable; ignore
    }
  }
  return res;
}

export async function login(email: string, password: string): Promise<{ ok: boolean; error?: string }> {
  let res: Response;
  try {
    res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
  } catch {
    // Network failure (offline, dropped connection, or an upstream reset).
    // Surface a real message instead of leaving the caller hung on a rejected
    // promise — that was the "click does nothing / button stuck" bug.
    return { ok: false, error: 'Network error. Check your connection and try again.' };
  }
  if (!res.ok) return { ok: false, error: await readAuthError(res, 'Login failed') };

  // Fully hydrate all stores (level, chips, badges, cosmetics, owner crown).
  // fetchUser() does NOT throw on a flaky /api/auth/me — it calls clearAuthState()
  // and returns null. So we must restore the partial data.user afterward when
  // hydration came back empty, otherwise a transient /me hiccup would null out a
  // login that actually succeeded and render a logged-out nav.
  const data: { user?: AuthUser } = await res.json();
  if (data.user) currentUser.set(data.user);
  const hydrated = await fetchUser().catch(() => null);
  if (!hydrated && data.user) currentUser.set(data.user);
  return { ok: true };
}

export async function register(
  email: string,
  password: string,
  displayName: string
): Promise<{ ok: boolean; error?: string }> {
  let res: Response;
  try {
    res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, displayName }),
    });
  } catch {
    return { ok: false, error: 'Network error. Check your connection and try again.' };
  }
  if (!res.ok) return { ok: false, error: await readAuthError(res, 'Registration failed') };

  // Same full-hydration pattern as login(): fetchUser() nulls state on a flaky
  // /me, so restore the partial data.user when hydration returns empty.
  const data: { user?: AuthUser } = await res.json();
  if (data.user) currentUser.set(data.user);
  const hydrated = await fetchUser().catch(() => null);
  if (!hydrated && data.user) currentUser.set(data.user);
  return { ok: true };
}

export async function logout(): Promise<{ ok: boolean; error?: string }> {
  let res: Response;
  try {
    res = await fetch('/api/auth/logout', { method: 'POST' });
  } catch {
    // Network failure — server session is intact, do NOT clear stores so the
    // caller can show 'Could not reach the server, you are still signed in'.
    return { ok: false, error: 'Network error. Check your connection and try again.' };
  }

  if (!res.ok) {
    // Non-OK (e.g. 500 from the server) — same: stay logged in so the user
    // knows the session was not actually terminated.
    const msg = await readAuthError(res, 'Logout failed');
    return { ok: false, error: msg };
  }

  // Logout confirmed by server: clear everything.
  clearAuthState();
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
  return { ok: true };
}
