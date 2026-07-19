import { cellIndex, Rgb } from "./protocol.js";

/**
 * 3-wide × 5-tall bitmap font ('1' = lit). Stamped into the main matrix area
 * (columns 0..2, rows 0..4). Digits mirror tools/led-web/app.js; symbols and
 * icon "emoji" are added for status semantics.
 */
export type Glyph = readonly string[];

export const GLYPH_W = 3;
export const GLYPH_H = 5;

export const GLYPHS: Record<string, Glyph> = {
  "0": ["111", "101", "101", "101", "111"],
  "1": ["010", "110", "010", "010", "111"],
  "2": ["111", "001", "111", "100", "111"],
  "3": ["111", "001", "111", "001", "111"],
  "4": ["101", "101", "111", "001", "001"],
  "5": ["111", "100", "111", "001", "111"],
  "6": ["111", "100", "111", "101", "111"],
  "7": ["111", "001", "001", "001", "001"],
  "8": ["111", "101", "111", "101", "111"],
  "9": ["111", "101", "111", "001", "111"],

  // Symbols
  "?": ["111", "001", "011", "000", "010"],
  "!": ["010", "010", "010", "000", "010"],
  check: ["000", "001", "101", "010", "000"],

  // Icon "emoji" (status semantics only — real emoji are unreadable at 3×5).
  smile: ["101", "000", "000", "101", "010"],
  sad: ["101", "000", "000", "010", "101"],
  heart: ["101", "111", "111", "010", "000"],
};

export interface PixelWrite {
  index: number;
  color: Rgb;
}

/**
 * Stamp a glyph into the matrix at (row0, col0), returning the lit-cell writes.
 * Cells that fall off the board (or hit an empty matrix cell) are skipped.
 */
export const stampGlyph = (
  key: string,
  color: Rgb,
  row0 = 0,
  col0 = 0,
): PixelWrite[] => {
  const glyph = GLYPHS[key];
  if (!glyph) return [];
  const writes: PixelWrite[] = [];
  for (let r = 0; r < glyph.length; r++) {
    const rowStr = glyph[r];
    for (let c = 0; c < rowStr.length; c++) {
      if (rowStr[c] !== "1") continue;
      const idx = cellIndex(row0 + r, col0 + c);
      if (idx === null) continue;
      writes.push({ index: idx, color });
    }
  }
  return writes;
};

/** Glyph key for a task number 1..9 (0 is reserved for "no number"). */
export const taskGlyphKey = (n: number): string => String(n % 10);
