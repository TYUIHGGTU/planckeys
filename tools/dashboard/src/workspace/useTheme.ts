import { useMantineColorScheme, type MantineColorScheme } from "@mantine/core";

export const THEME_OPTIONS = [
  { value: "auto", label: "跟随系统" },
  { value: "light", label: "浅色" },
  { value: "dark", label: "深色" },
] as const;

export type ThemeMode = MantineColorScheme;

export interface ThemeController {
  mode: MantineColorScheme;
  setMode: (mode: MantineColorScheme) => void;
}

/** 主题控制器：桥接 Mantine 的色彩方案管理（自带 localStorage 持久化）。 */
export const useTheme = (): ThemeController => {
  const { colorScheme, setColorScheme } = useMantineColorScheme();
  return { mode: colorScheme, setMode: setColorScheme };
};
