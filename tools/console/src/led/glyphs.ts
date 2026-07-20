import { AXIS_INDICES, AXIS_LAYOUT, type Rgb } from "../device/hid/protocol";
import { DIGIT_3X5, DIGIT_COL0, DIGIT_MAX } from "./constants";

/** 把一段字模按左上角 (row0,col0) 盖到画布 draft 上（就地修改）。 */
export const stampGlyph = (
  draft: Rgb[],
  glyph: readonly string[],
  row0: number,
  col0: number,
  color: Rgb,
): void => {
  for (let r = 0; r < glyph.length; r++) {
    const row = glyph[r];
    for (let c = 0; c < row.length; c++) {
      if (row[c] !== "1") continue;
      const idx = AXIS_LAYOUT[row0 + r]?.[col0 + c];
      if (idx == null) continue;
      draft[idx] = { r: color.r, g: color.g, b: color.b };
    }
  }
};

/** 返回把数字 n 画到轴灯后的整块画布（不改底灯）。非法返回 null。 */
export const paintNumber = (
  base: Rgb[],
  n: number,
  color: Rgb,
): Rgb[] | null => {
  if (!Number.isInteger(n) || n < 0 || n > DIGIT_MAX) return null;
  const glyph = DIGIT_3X5[String(n)];
  if (!glyph) return null;
  const draft = base.map((p) => ({ ...p }));
  for (const idx of AXIS_INDICES) draft[idx] = { r: 0, g: 0, b: 0 };
  stampGlyph(draft, glyph, 0, DIGIT_COL0, color);
  return draft;
};

export const parseDigitInput = (raw: string): number | null => {
  const s = String(raw ?? "").replace(/\D/g, "");
  if (!s) return null;
  const n = Number(s);
  if (!Number.isInteger(n) || n < 0 || n > DIGIT_MAX) return null;
  return n;
};
