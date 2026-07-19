import { cellIndex, MATRIX_ROWS, Rgb, scaleRgb } from "./protocol.js";
import { PixelWrite } from "./glyphs.js";

const MAIN_H = MATRIX_ROWS; // 6 rows
const EQ_COLS = 3; // columns 0..2

/** Blend a color toward white by t in [0,1] (used to make the head pop). */
const mixWhite = (c: Rgb, t: number): Rgb => ({
  r: Math.round(c.r + (255 - c.r) * t),
  g: Math.round(c.g + (255 - c.g) * t),
  b: Math.round(c.b + (255 - c.b) * t),
});

/**
 * Clockwise outer-ring path of the 3×6 main area (14 cells). A "loading"
 * spinner rides this ring: a bright head plus a short fading tail.
 */
const RING: readonly { x: number; y: number }[] = [
  { x: 0, y: 0 },
  { x: 1, y: 0 },
  { x: 2, y: 0 },
  { x: 2, y: 1 },
  { x: 2, y: 2 },
  { x: 2, y: 3 },
  { x: 2, y: 4 },
  { x: 2, y: 5 },
  { x: 1, y: 5 },
  { x: 0, y: 5 },
  { x: 0, y: 4 },
  { x: 0, y: 3 },
  { x: 0, y: 2 },
  { x: 0, y: 1 },
];

/** Loading spinner: bright head + 3-cell fading tail travelling the ring. */
export const renderSpinner = (
  color: Rgb,
  now: number,
  stepMs: number,
): PixelWrite[] => {
  const perim = RING.length;
  const head = Math.floor(now / Math.max(60, stepMs)) % perim;
  const writes: PixelWrite[] = [];
  const tail = 4;
  for (let t = 0; t < tail; t++) {
    const pos = ((head - t) % perim + perim) % perim;
    const cell = RING[pos];
    const idx = cellIndex(cell.y, cell.x);
    if (idx === null) continue;
    const col = t === 0 ? mixWhite(color, 0.4) : scaleRgb(color, 1 - t * 0.28);
    writes.push({ index: idx, color: col });
  }
  return writes;
};

/**
 * Audio-style equalizer: each of the 3 columns bounces a bottom-anchored bar
 * whose height oscillates out of phase; bar tops are brightest.
 */
export const renderEqualizer = (color: Rgb, now: number): PixelWrite[] => {
  const writes: PixelWrite[] = [];
  const w = 0.006; // rad/ms -> ~1s period
  for (let c = 0; c < EQ_COLS; c++) {
    const phase = c * 2.1;
    const level = 0.5 + 0.5 * Math.sin(now * w + phase);
    const h = 1 + Math.round(level * (MAIN_H - 1)); // 1..6
    for (let k = 0; k < h; k++) {
      const y = MAIN_H - 1 - k; // fill from the bottom up
      const idx = cellIndex(y, c);
      if (idx === null) continue;
      const f = 0.35 + 0.65 * (h <= 1 ? 1 : k / (h - 1)); // top brightest
      writes.push({ index: idx, color: scaleRgb(color, f) });
    }
  }
  return writes;
};
