import { createTheme, type MantineColorsTuple } from "@mantine/core";

/** 品牌主色（indigo/violet），与旧版 accent 对齐：浅色 ~#5266df，深色 ~#8b9dff。 */
const brand: MantineColorsTuple = [
  "#eef1ff",
  "#dbe0ff",
  "#b3c0ff",
  "#889cff",
  "#647cfa",
  "#4d68f4",
  "#4160f2",
  "#3350d8",
  "#2b47c2",
  "#203aac",
];

export const theme = createTheme({
  primaryColor: "brand",
  primaryShade: { light: 6, dark: 4 },
  colors: { brand },
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
