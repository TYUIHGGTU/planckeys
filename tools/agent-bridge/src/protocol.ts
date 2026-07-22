/**
 * agent-bridge 的协议入口。
 *
 * 线材协议来自 `@planckeys/led-protocol`；板载几何与会话分区来自
 * `@planckeys/keyboard-profile`（默认 planckeys-left）。
 */
export * from "@planckeys/led-protocol";

import {
  DEFAULT_PROFILE,
  type KeyboardProfile,
  type MatrixCell,
} from "@planckeys/keyboard-profile";
import { clampByte, type Rgb } from "@planckeys/led-protocol";

/** 当前桥接使用的 profile（本期固定为默认；后续可按设备匹配切换）。 */
export const ACTIVE_PROFILE: KeyboardProfile = DEFAULT_PROFILE;

const { axisLayout, agentZones } = ACTIVE_PROFILE;

/**
 * All front-visible axis LEDs. Underglow is hidden and handled separately.
 * Used to blank the canvas before each frame.
 */
export const VISIBLE_LED_INDICES: readonly number[] = ACTIVE_PROFILE.axisIndices;

export const MATRIX_ROWS = axisLayout.length;
export const MATRIX_COLS = axisLayout[0]?.length ?? 0;

/** Map a matrix cell to its chain index, or null if empty / out of range. */
export const cellIndex = (row: number, col: number): number | null => {
  if (row < 0 || row >= MATRIX_ROWS || col < 0 || col >= MATRIX_COLS) {
    return null;
  }
  return axisLayout[row][col];
};

export const GLOBAL_ROW_INDICES: readonly number[] = agentZones.globalRowIndices;

export const CONVO_INDICES: readonly number[] = agentZones.convoIndices;

/** Number of per-conversation cells. */
export const CONVO_SLOT_COUNT = CONVO_INDICES.length;

export type { MatrixCell };

/** Alert-region cells with their grid position (for the wave phase). */
export const ALERT_CELLS: readonly MatrixCell[] = agentZones.alertCells;

export const rgb = (r: number, g: number, b: number): Rgb => ({
  r: clampByte(r),
  g: clampByte(g),
  b: clampByte(b),
});

/** Scale an RGB triplet by a 0..1 factor (used for low-brightness idle etc.). */
export const scaleRgb = (c: Rgb, factor: number): Rgb =>
  rgb(c.r * factor, c.g * factor, c.b * factor);
