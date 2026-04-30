const DEVICE_UUID_KEY = 'device-uuid';

export function getDeviceUuid(): string {
  if (typeof localStorage === 'undefined') return '';
  let uuid = localStorage.getItem(DEVICE_UUID_KEY);
  if (!uuid) {
    uuid = crypto.randomUUID();
    localStorage.setItem(DEVICE_UUID_KEY, uuid);
  }
  return uuid;
}

export async function getDeviceFingerprint(): Promise<string> {
  if (typeof localStorage === 'undefined') return '';
  // WHY: window.screen.width/height is stable across viewport changes (URL bar collapse, PWA standalone vs tab); window.innerWidth/innerHeight varies and would break the fingerprint after the first scroll. iOS Safari in particular shifts innerHeight when the URL bar shows/hides.
  const w = Math.min(screen.width, screen.height);
  const h = Math.max(screen.width, screen.height);
  const input = `${navigator.userAgent}:${w}x${h}:${getDeviceUuid()}`;
  const buf = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest('SHA-256', buf);
  const bytes = new Uint8Array(hash);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
