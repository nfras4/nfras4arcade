import confetti from 'canvas-confetti';

// Re-export originals so games can import everything from $lib/vfx/burst
export { fireWinConfetti, fireImpostorVfx } from '../vfx';

/** Casino gold/amber burst from screen center (or provided origin). */
export function fireGoldBurst(origin?: { x: number; y: number }) {
  const o = origin ?? { x: 0.5, y: 0.5 };
  confetti({
    particleCount: 70,
    spread: 70,
    origin: o,
    colors: ['#f0c030', '#f5ad3a', '#ffee88', '#f39c12', '#d4920a'],
    gravity: 0.8,
    ticks: 140,
    startVelocity: 32,
  });
  setTimeout(() => {
    confetti({
      particleCount: 40,
      spread: 50,
      origin: o,
      colors: ['#f0c030', '#ffe680', '#f39c12'],
      gravity: 0.6,
      ticks: 100,
      startVelocity: 20,
    });
  }, 180);
}

/** Localized burst at a fractional viewport position. */
export function fireBurstAt(
  xFraction: number,
  yFraction: number,
  colors: string[]
) {
  confetti({
    particleCount: 45,
    spread: 55,
    origin: { x: xFraction, y: yFraction },
    colors,
    gravity: 0.7,
    ticks: 110,
    startVelocity: 24,
  });
}

/** Small grey/red downward sad puff for a loss. */
export function fireLoss(origin?: { x: number; y: number }) {
  const o = origin ?? { x: 0.5, y: 0.4 };
  confetti({
    particleCount: 30,
    spread: 45,
    origin: o,
    colors: ['#555566', '#443344', '#e94560', '#332233'],
    gravity: 1.4,
    ticks: 80,
    startVelocity: 12,
    angle: 270,
  });
}
