import { createTheme, type MantineColorsTuple } from "@mantine/core";

/**
 * 品牌主色：琥珀铜 / 焦糖（brass），呼应机械键盘的黄铜质感。
 * 刻意避开冷调靛蓝/紫，浅色态 ~#a86b25，深色态 ~#cd9549。
 * 配合 autoContrast，填充按钮会自动挑选可读的深/浅文字。
 */
const brand: MantineColorsTuple = [
  "#faf4e8",
  "#f1e5cf",
  "#e6c9a1",
  "#d8ac6f",
  "#cd9549",
  "#c07f2c",
  "#a86b25",
  "#895424",
  "#6a3f1d",
  "#4a2c14",
];

/** 暖调石墨：深色态整体从冷蓝黑改为带一点棕的中性灰，去掉“科技蓝”味。 */
const dark: MantineColorsTuple = [
  "#d9d4cc",
  "#b7b1a7",
  "#948d82",
  "#6c665d",
  "#48433c",
  "#37332d",
  "#2a2723",
  "#211e1a",
  "#1a1714",
  "#131110",
];

/** 暖调中性灰：浅色态的表面/边框/次要文字，带一点米色而非冷灰。 */
const gray: MantineColorsTuple = [
  "#f7f5f1",
  "#efece6",
  "#e5e1d9",
  "#d7d2c8",
  "#c3bcaf",
  "#a39a8b",
  "#837a6c",
  "#625a4e",
  "#453f36",
  "#2a2620",
];

export const theme = createTheme({
  primaryColor: "brand",
  primaryShade: { light: 6, dark: 4 },
  autoContrast: true,
  luminanceThreshold: 0.45,
  colors: { brand, dark, gray },
  white: "#fbfaf7",
  black: "#1a1714",
  defaultRadius: "md",
  fontFamily:
    'Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif',
  fontFamilyMonospace:
    'ui-monospace, SFMono-Regular, Menlo, "JetBrains Mono", monospace',
  // 消灭 8-9px：全局字号下限提到 12px。
  fontSizes: {
    xs: "12px",
    sm: "13px",
    md: "14px",
    lg: "16px",
    xl: "18px",
  },
  lineHeights: {
    xs: "1.4",
    sm: "1.45",
    md: "1.5",
    lg: "1.5",
    xl: "1.5",
  },
  headings: {
    fontWeight: "700",
    sizes: {
      h1: { fontSize: "20px", lineHeight: "1.3" },
      h2: { fontSize: "16px", lineHeight: "1.35" },
      h3: { fontSize: "14px", lineHeight: "1.4" },
    },
  },
  cursorType: "pointer",
});
