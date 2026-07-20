import { hslToHex, lerpHex } from "./color";

/**
 * 配色方案：按轴灯行列生成画布颜色；底灯用方案的 accent 色带。
 * `paint(row, col, cols)` 给轴灯，`under(i, n)` 给底灯。
 */
export interface ColorScheme {
  id: string;
  name: string;
  preview: string[];
  primary: string;
  paint: (row: number, col: number, cols: number) => string;
  under: (i: number, n: number) => string;
}

export const COLOR_SCHEMES: readonly ColorScheme[] = [
  {
    id: "ocean",
    name: "海洋",
    preview: ["#003d7a", "#0077b6", "#00b4d8", "#48cae4", "#90e0ef"],
    primary: "#00b4d8",
    paint: (row, col, cols) =>
      lerpHex("#003d7a", "#90e0ef", (row * cols + col) / (6 * cols - 1)),
    under: (i, n) => lerpHex("#0077b6", "#48cae4", i / (n - 1)),
  },
  {
    id: "sunset",
    name: "日落",
    preview: ["#ff6b35", "#f7c59f", "#ef476f", "#7b2cbf", "#240046"],
    primary: "#ff6b35",
    paint: (row, col, cols) =>
      lerpHex("#ff6b35", "#5a189a", (row * cols + col) / (6 * cols - 1)),
    under: (i, n) => lerpHex("#ef476f", "#240046", i / (n - 1)),
  },
  {
    id: "neon",
    name: "霓虹",
    preview: ["#ff00aa", "#00f0ff", "#39ff14", "#ff00aa", "#00f0ff"],
    primary: "#00f0ff",
    paint: (row, col) => ((row + col) % 2 ? "#ff00aa" : "#00f0ff"),
    under: (i) => (i % 2 ? "#39ff14" : "#ff00aa"),
  },
  {
    id: "forest",
    name: "森林",
    preview: ["#081c15", "#1b4332", "#2d6a4f", "#52b788", "#95d5b2"],
    primary: "#52b788",
    paint: (row, col, cols) =>
      lerpHex("#081c15", "#95d5b2", (row * cols + col) / (6 * cols - 1)),
    under: (i, n) => lerpHex("#1b4332", "#52b788", i / (n - 1)),
  },
  {
    id: "rainbow",
    name: "彩虹",
    preview: ["#ff0040", "#ffd000", "#40ff40", "#00b0ff", "#b000ff"],
    primary: "#ff0040",
    paint: (row, col, cols) => {
      const t = (row * cols + col) / (6 * cols - 1);
      return hslToHex(t * 300, 1, 0.5);
    },
    under: (i, n) => hslToHex((i / (n - 1)) * 300, 1, 0.5),
  },
  {
    id: "cyber",
    name: "赛博",
    preview: ["#ff2a6d", "#05d9e8", "#d1f7ff", "#01012b", "#ff2a6d"],
    primary: "#05d9e8",
    paint: (_row, col, cols) => (col < cols / 2 ? "#ff2a6d" : "#05d9e8"),
    under: (i, n) => (i < n / 2 ? "#ff2a6d" : "#05d9e8"),
  },
  {
    id: "amber",
    name: "暖琥珀",
    preview: ["#3a1800", "#7a3b00", "#c26e00", "#ffb347", "#ffe0a3"],
    primary: "#ffb347",
    paint: (row, col, cols) =>
      lerpHex("#3a1800", "#ffe0a3", (row * cols + col) / (6 * cols - 1)),
    under: (i, n) => lerpHex("#7a3b00", "#ffb347", i / (n - 1)),
  },
  {
    id: "mono",
    name: "冰蓝",
    preview: ["#0040ff", "#0040ff", "#0040ff", "#66a3ff", "#66a3ff"],
    primary: "#0040ff",
    paint: () => "#0040ff",
    under: () => "#66a3ff",
  },
];
