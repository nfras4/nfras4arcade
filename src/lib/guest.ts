/**
 * Guest identity management.
 * Persists in localStorage so guests keep the same ID across in-app
 * WebView refreshes (Instagram, Messenger, iMessage) and tab restarts.
 * Falls back to sessionStorage if localStorage is blocked.
 */

const GUEST_ID_KEY = 'arcade-guest-id';

function generateGuestId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function getGuestId(): string {
  if (typeof window === 'undefined') return generateGuestId();

  try {
    let id = localStorage.getItem(GUEST_ID_KEY);
    if (!id) {
      // Migrate from older sessionStorage value if present
      id = sessionStorage.getItem(GUEST_ID_KEY) || generateGuestId();
      localStorage.setItem(GUEST_ID_KEY, id);
    }
    return id;
  } catch {
    let id = sessionStorage.getItem(GUEST_ID_KEY);
    if (!id) {
      id = generateGuestId();
      sessionStorage.setItem(GUEST_ID_KEY, id);
    }
    return id;
  }
}

export function getGuestDisplayName(): string {
  const id = getGuestId();
  return `Guest_${id.slice(0, 4)}`;
}
