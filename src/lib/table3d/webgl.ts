/**
 * Cheap one-shot WebGL capability probe, shared by the 3D monkey surfaces
 * (home hero, customize preview) so they can fall back to 2D on devices
 * without WebGL. Mirrors the inline probe in the liars-dice table view.
 *
 * Returns false during SSR (no document) and on any context-creation error.
 */
export function probeWebGL(): boolean {
  if (typeof document === 'undefined') return false;
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl') || c.getContext('experimental-webgl'));
  } catch {
    return false;
  }
}
