/**
 * Raw HID protocol for the Planckeys left board.
 *
 * These constants MUST stay in sync with the firmware (`src/led_control.c`)
 * and the web tool (`tools/led-web/app.js`). See `docs/led-web-control.md`.
 */

export const USAGE_PAGE = 0xff60;
export const REPORT_SIZE = 32;

/** 0xA1: set global mode/brightness/speed (animation only, does not touch colors). */
export const CMD_CONFIG = 0xa1;
/** 0xA2: write a slice of the per-pixel canvas (does not touch mode). */
export const CMD_PIXELS = 0xa2;
/** 0xA3: set global brightness (part of the firmware protocol; the bridge sets
 * brightness via the 0xA1 CONFIG field instead, so it does not emit 0xA3). */
export const CMD_BRIGHTNESS = 0xa3;
/** 0xA4: fill the whole canvas with one color. */
export const CMD_FILL = 0xa4;
/** 0xA5: independently configure axis or underglow animation. */
export const CMD_ZONE_CONFIG = 0xa5;

/** Global animation modes understood by the firmware (0xA1 byte[1]). */
export enum LedMode {
  Off = 0,
  Solid = 1,
  Breathing = 2,
  Chase = 3,
  Melt = 4,
}

export enum LedZone {
  Axis = 0,
  Underglow = 1,
}

/** Total LEDs on the single chain (must match firmware `chain-length`). */
export const LED_COUNT = 28;

/** Max pixels writable in one 0xA2 report: floor((32 - 3) / 3) = 9. */
export const MAX_PX_PER_REPORT = Math.floor((REPORT_SIZE - 3) / 3);

/** Underglow LEDs (front-invisible), chain index 0..5. */
export const UNDERGLOW_INDICES = [0, 1, 2, 3, 4, 5] as const;

/**
 * All front-visible axis LEDs (chain index 6..27, i.e. every key LED on the
 * left board). Underglow 0..5 is hidden and handled separately. Used to blank
 * the canvas before each dashboard frame.
 */
export const VISIBLE_LED_INDICES: readonly number[] = Array.from(
  { length: LED_COUNT - UNDERGLOW_INDICES.length },
  (_, i) => i + UNDERGLOW_INDICES.length,
);

/**
 * Axis LEDs arranged as the physical dot-matrix (board rotated so it reads as
 * a portrait 4-col × 6-row grid). `null` = no LED at that cell. Mirrors
 * `tools/led-web/app.js` AXIS_LAYOUT. `[row][col]` -> chain index.
 *
 *   c0  c1  c2  c3
 *   10  21  22   6   r0
 *   11  20  23   7   r1
 *   12  19  24   8   r2
 *   13  18  25   9   r3
 *   14  17  26   ·   r4
 *   15  16  27   ·   r5
 */
export const AXIS_LAYOUT: readonly (number | null)[][] = [
  [10, 21, 22, 6],
  [11, 20, 23, 7],
  [12, 19, 24, 8],
  [13, 18, 25, 9],
  [14, 17, 26, null],
  [15, 16, 27, null],
];

export const MATRIX_ROWS = AXIS_LAYOUT.length; // 6
export const MATRIX_COLS = AXIS_LAYOUT[0].length; // 4

/** Map a matrix cell to its chain index, or null if empty / out of range. */
export const cellIndex = (row: number, col: number): number | null => {
  if (row < 0 || row >= MATRIX_ROWS || col < 0 || col >= MATRIX_COLS) {
    return null;
  }
  return AXIS_LAYOUT[row][col];
};

/** Chain indices for one matrix row, left-to-right, skipping empty cells. */
const rowCells = (row: number): number[] =>
  AXIS_LAYOUT[row].filter((x): x is number => x !== null);

/**
 * Dashboard zones. The board is read as a portrait 4-col × 6-row grid:
 *
 *   r0            -> global status bar (aggregate of all conversations)
 *   r1, r2        -> up to 8 per-conversation cells (left-to-right, r1 then r2)
 *   r3, r4, r5    -> attention alert region (off unless input needed / errored)
 */
export const GLOBAL_ROW_INDICES: readonly number[] = rowCells(0);

export const CONVO_INDICES: readonly number[] = [...rowCells(1), ...rowCells(2)];

/** Number of per-conversation cells (rows 1-2). */
export const CONVO_SLOT_COUNT = CONVO_INDICES.length; // 8

export interface MatrixCell {
  index: number;
  row: number;
  col: number;
}

/** Alert-region cells (rows 3-5) with their grid position (for the wave phase). */
export const ALERT_CELLS: readonly MatrixCell[] = (() => {
  const out: MatrixCell[] = [];
  for (let row = 3; row < MATRIX_ROWS; row++) {
    for (let col = 0; col < MATRIX_COLS; col++) {
      const index = AXIS_LAYOUT[row][col];
      if (index !== null) out.push({ index, row, col });
    }
  }
  return out;
})();

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

const clampByte = (n: number): number => {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(255, Math.round(n)));
};

export const rgb = (r: number, g: number, b: number): Rgb => ({
  r: clampByte(r),
  g: clampByte(g),
  b: clampByte(b),
});

/** Scale an RGB triplet by a 0..1 factor (used for low-brightness idle etc.). */
export const scaleRgb = (c: Rgb, factor: number): Rgb =>
  rgb(c.r * factor, c.g * factor, c.b * factor);

const toReport = (bytes: number[]): Uint8Array => {
  const data = new Uint8Array(REPORT_SIZE);
  data.set(bytes.slice(0, REPORT_SIZE));
  return data;
};

/** Build a 0xA1 CONFIG report. */
export const buildConfigReport = (
  mode: LedMode,
  brightness: number,
  speed: number,
): Uint8Array =>
  toReport([CMD_CONFIG, mode & 0xff, clampByte(brightness), clampByte(speed)]);

/** Build a 0xA4 FILL report. */
export const buildFillReport = (color: Rgb): Uint8Array =>
  toReport([CMD_FILL, color.r, color.g, color.b]);

/** Build a 0xA5 ZONE_CONFIG report. */
export const buildZoneConfigReport = (
  zone: LedZone,
  mode: LedMode,
  brightness: number,
  speed: number,
): Uint8Array =>
  toReport([
    CMD_ZONE_CONFIG,
    zone & 0xff,
    mode & 0xff,
    clampByte(brightness),
    clampByte(speed || 1),
  ]);

/**
 * Build one or more 0xA2 PIXELS reports for a contiguous run of pixels.
 * Splits into <=9-pixel chunks automatically.
 */
export const buildPixelReports = (
  offset: number,
  colors: Rgb[],
): Uint8Array[] => {
  const reports: Uint8Array[] = [];
  for (let i = 0; i < colors.length; i += MAX_PX_PER_REPORT) {
    const chunk = colors.slice(i, i + MAX_PX_PER_REPORT);
    const bytes: number[] = [CMD_PIXELS, (offset + i) & 0xff, chunk.length & 0xff];
    for (const c of chunk) {
      bytes.push(c.r, c.g, c.b);
    }
    reports.push(toReport(bytes));
  }
  return reports;
};

/**
 * Build 0xA2 reports for an arbitrary sparse set of {index,color} writes.
 * Groups contiguous indices into single reports where possible so that the
 * 6 Agent LEDs (15..10) still coalesce into a single report.
 */
export const buildSparsePixelReports = (
  writes: { index: number; color: Rgb }[],
): Uint8Array[] => {
  const sorted = [...writes].sort((a, b) => a.index - b.index);
  const reports: Uint8Array[] = [];
  let run: { start: number; colors: Rgb[] } | null = null;

  const flush = () => {
    if (run) {
      reports.push(...buildPixelReports(run.start, run.colors));
      run = null;
    }
  };

  for (const w of sorted) {
    if (
      run &&
      w.index === run.start + run.colors.length &&
      run.colors.length < MAX_PX_PER_REPORT
    ) {
      run.colors.push(w.color);
    } else {
      flush();
      run = { start: w.index, colors: [w.color] };
    }
  }
  flush();
  return reports;
};
