/**
 * agent-bridge 的协议入口。
 *
 * 「线材协议 + 板载布局 + 报文打包」核心已抽到单一真源包 `@planckeys/led-protocol`，
 * 这里全部再导出；下面只保留 agent-bridge 自己的「会话点阵渲染」解读常量
 * （dashboard 有各自的一份，如 AXIS_INDICES）。
 */
export * from "@planckeys/led-protocol";

import {
  AXIS_LAYOUT,
  LED_COUNT,
  UNDERGLOW_INDICES,
  clampByte,
  type Rgb,
} from "@planckeys/led-protocol";

/**
 * All front-visible axis LEDs (chain index 6..27). Underglow 0..5 is hidden and
 * handled separately. Used to blank the canvas before each frame.
 */
export const VISIBLE_LED_INDICES: readonly number[] = Array.from(
  { length: LED_COUNT - UNDERGLOW_INDICES.length },
  (_, i) => i + UNDERGLOW_INDICES.length,
);

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

export const rgb = (r: number, g: number, b: number): Rgb => ({
  r: clampByte(r),
  g: clampByte(g),
  b: clampByte(b),
});

/** Scale an RGB triplet by a 0..1 factor (used for low-brightness idle etc.). */
export const scaleRgb = (c: Rgb, factor: number): Rgb =>
  rgb(c.r * factor, c.g * factor, c.b * factor);
