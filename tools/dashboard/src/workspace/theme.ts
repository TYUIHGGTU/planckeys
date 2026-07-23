import { createTheme, type MantineColorsTuple } from "@mantine/core";

/**
 * 品牌信号色：琥珀（signal amber），呼应“精密仪器 / 蓝图标注”的高亮读数。
 * 深色态取 shade 4 = #e8873a 作为主信号；浅色态取 shade 6 略深以保证白底可读。
 * 配合 autoContrast，填充按钮会自动挑选可读的深/浅文字。
 */
const brand: MantineColorsTuple = [
  "#fdf2e6",
  "#f6ddc2",
  "#eec298",
  "#e7a768",
  "#e8873a",
  "#dd7a2c",
  "#c56a27",
  "#9c541f",
  "#743e18",
  "#4d2910",
];

/** 暖石墨：深色态映射到 mockup 的 paper/paper-2/hairline/ink（去掉科技蓝味）。 */
const dark: MantineColorsTuple = [
  "#e9e5dc", // 0 · ink 文字
  "#c9c4ba", // 1
  "#7f838c", // 2 · graphite 次要文字 dimmed
  "#5c5f66", // 3
  "#2b2d33", // 4 · hairline 边框
  "#26282d", // 5 · hover
  "#202227", // 6 · paper-2 控件面
  "#17181b", // 7 · paper 画布底
  "#131417", // 8
  "#0e0f11", // 9
];

/** 暖中性灰：浅色态的表面 / 边框 / 次要文字，带一点米色而非冷灰。 */
const gray: MantineColorsTuple = [
  "#f6f4f0",
  "#eeece7",
  "#e4e1da",
  "#d5d1c8",
  "#c0bbb0",
  "#a39d90",
  "#7d7668",
  "#5c554a",
  "#3f3930",
  "#26221c",
];

export const theme = createTheme({
  primaryColor: "brand",
  primaryShade: { light: 6, dark: 4 },
  autoContrast: true,
  luminanceThreshold: 0.45,
  colors: { brand, dark, gray },
  white: "#fbfaf8",
  black: "#1a1714",
  defaultRadius: "sm",
  radius: {
    xs: "2px",
    sm: "3px",
    md: "4px",
    lg: "8px",
    xl: "12px",
  },
  fontFamily:
    '"Space Grotesk", ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif',
  fontFamilyMonospace:
    '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace',
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
