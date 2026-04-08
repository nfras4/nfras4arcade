import confetti from 'canvas-confetti';

/** Standard win confetti — burst from top, falls naturally. */
export function fireWinConfetti() {
  const duration = 2000;
  const end = Date.now() + duration;

  (function frame() {
    confetti({
      particleCount: 3,
      angle: 60,
      spread: 55,
      origin: { x: 0, y: 0 },
      colors: ['#00e5ff', '#ff2d55', '#ffcc00', '#39ff14', '#bf5af2'],
    });
    confetti({
      particleCount: 3,
      angle: 120,
      spread: 55,
      origin: { x: 1, y: 0 },
      colors: ['#00e5ff', '#ff2d55', '#ffcc00', '#39ff14', '#bf5af2'],
    });
    if (Date.now() < end) requestAnimationFrame(frame);
  })();
}

/** Sinister impostor win — red/dark particle burst from center. */
export function fireImpostorVfx() {
  // Red burst from center
  confetti({
    particleCount: 80,
    spread: 360,
    origin: { x: 0.5, y: 0.5 },
    colors: ['#ff0033', '#cc0000', '#880000', '#ff4444', '#330000'],
    gravity: 0.6,
    ticks: 120,
    startVelocity: 30,
  });

  // Second delayed burst
  setTimeout(() => {
    confetti({
      particleCount: 50,
      spread: 360,
      origin: { x: 0.5, y: 0.5 },
      colors: ['#ff0033', '#cc0000', '#660000'],
      gravity: 0.4,
      ticks: 100,
      startVelocity: 20,
    });
  }, 300);
}
