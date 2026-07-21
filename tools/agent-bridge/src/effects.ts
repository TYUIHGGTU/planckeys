/** Host-side brightness modulation helpers for the matrix renderer. */

/** Breathe factor in [0.22, 1.0] over `periodMs`. Never fully dark. */
export const breatheFactor = (now: number, periodMs: number): number => {
  const t = (now % periodMs) / periodMs;
  return 0.22 + 0.78 * (0.5 + 0.5 * Math.sin(t * Math.PI * 2));
};

/** Square-wave blink: true = on half, false = off half. */
export const blinkOn = (now: number, periodMs: number): boolean =>
  now % periodMs < periodMs / 2;

/** Blink brightness factor: bright when on, faint (not black) when off. */
export const blinkFactor = (now: number, periodMs: number): number =>
  blinkOn(now, periodMs) ? 1 : 0.06;
