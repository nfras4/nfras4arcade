/**
 * Guest identity management.
 * Generates a persistent guest ID per browser session (stored in sessionStorage)
 * so guests can reconnect if their connection drops.
 */

const GUEST_ID_KEY = 'arcade-guest-id';

function generateGuestId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function getGuestId(): string {
  if (typeof window === 'undefined') return generateGuestId();

  let id = sessionStorage.getItem(GUEST_ID_KEY);
  if (!id) {
    id = generateGuestId();
    sessionStorage.setItem(GUEST_ID_KEY, id);
  }
  return id;
}

export function getGuestDisplayName(): string {
  const id = getGuestId();
  return `Guest_${id.slice(0, 4)}`;
}
