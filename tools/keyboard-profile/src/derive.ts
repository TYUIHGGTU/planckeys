import type { AgentZones, MatrixCell } from "./types.js";

/** 所有有灯的轴灯链上 index（按 AXIS_LAYOUT 展平、去空）。 */
export const flattenAxisIndices = (
  axisLayout: readonly (number | null)[][],
): readonly number[] =>
  axisLayout.flat().filter((x): x is number => x !== null);

const rowCells = (
  axisLayout: readonly (number | null)[][],
  row: number,
): number[] =>
  (axisLayout[row] ?? []).filter((x): x is number => x !== null);

/**
 * PlanckKeys 竖向 4×6 点阵的默认 agent 分区：
 * r0 全局条，r1–r2 会话，r3–r5 告警。
 */
export const deriveAgentZones = (
  axisLayout: readonly (number | null)[][],
): AgentZones => {
  const rows = axisLayout.length;
  const cols = axisLayout[0]?.length ?? 0;
  const alertCells: MatrixCell[] = [];
  for (let row = 3; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const index = axisLayout[row]?.[col];
      if (index !== null && index !== undefined) {
        alertCells.push({ index, row, col });
      }
    }
  }
  return {
    globalRowIndices: rowCells(axisLayout, 0),
    convoIndices: [...rowCells(axisLayout, 1), ...rowCells(axisLayout, 2)],
    alertCells,
  };
};

export const ledIndexForKeyPosition = (
  keyPositionToLedIndex: readonly number[],
  keyPosition: number,
): number | null => keyPositionToLedIndex[keyPosition] ?? null;
