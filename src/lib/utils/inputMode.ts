// Capability-based input mode detection.
// Returns 'pointer' when the device has a fine pointer AND hover capability,
// otherwise 'touch'. SSR-safe: defaults to 'touch' when window is undefined.

export type InputMode = 'touch' | 'pointer';

export function detectInputMode(): InputMode {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return 'touch';
  }
  try {
    const finePointer = window.matchMedia('(pointer: fine)').matches;
    const canHover = window.matchMedia('(hover: hover)').matches;
    return finePointer && canHover ? 'pointer' : 'touch';
  } catch {
    return 'touch';
  }
}

