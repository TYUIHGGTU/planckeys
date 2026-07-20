import { clampByte, type Rgb } from "../device/hid/protocol";

export const hexToRgb = (hex: string): Rgb => {
  const h = normalizeHex(hex);
  if (!h) return { r: 0, g: 0, b: 0 };
  const n = parseInt(h.slice(1), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
};

export const rgbToHex = ({ r, g, b }: Rgb): string =>
  "#" + [r, g, b].map((v) => clampByte(v).toString(16).padStart(2, "0")).join("");

export const normalizeHex = (hex: string | null | undefined): string | null => {
  if (!hex) return null;
  let s = String(hex).trim();
  if (s[0] !== "#") s = "#" + s;
  if (/^#[0-9a-fA-F]{3}$/.test(s)) {
    s = "#" + s[1] + s[1] + s[2] + s[2] + s[3] + s[3];
  }
  return /^#[0-9a-fA-F]{6}$/.test(s) ? s.toLowerCase() : null;
};

export const lerpHex = (a: string, b: string, t: number): string => {
  const A = hexToRgb(a);
  const B = hexToRgb(b);
  const u = Math.max(0, Math.min(1, t));
  return rgbToHex({
    r: A.r + (B.r - A.r) * u,
    g: A.g + (B.g - A.g) * u,
    b: A.b + (B.b - A.b) * u,
  });
};

export const hslToHex = (h: number, s: number, l: number): string => {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return rgbToHex({ r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255 });
};

export const isLit = (p: Rgb): boolean => !!(p.r || p.g || p.b);
