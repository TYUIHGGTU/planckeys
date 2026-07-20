import { useCallback, useEffect, useState } from "react";

export const THEME_OPTIONS = [
  { id: "system", label: "跟随系统", colorScheme: "system" },
  { id: "light", label: "浅色", colorScheme: "light" },
  { id: "dark", label: "深色", colorScheme: "dark" },
] as const;

export type ThemeMode = (typeof THEME_OPTIONS)[number]["id"];
export type ResolvedTheme = Exclude<ThemeMode, "system">;

const STORAGE_KEY = "planckeys.theme";

const isThemeMode = (value: string | null): value is ThemeMode =>
  THEME_OPTIONS.some((theme) => theme.id === value);

const systemTheme = (): ResolvedTheme =>
  window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";

const resolveTheme = (mode: ThemeMode): ResolvedTheme =>
  mode === "system" ? systemTheme() : mode;

const applyTheme = (mode: ThemeMode): ResolvedTheme => {
  const resolved = resolveTheme(mode);
  document.documentElement.dataset.theme = resolved;
  document.documentElement.dataset.themeMode = mode;
  const definition = THEME_OPTIONS.find((theme) => theme.id === resolved);
  document.documentElement.style.colorScheme =
    definition?.colorScheme === "light" ? "light" : "dark";
  return resolved;
};

export interface ThemeController {
  mode: ThemeMode;
  resolved: ResolvedTheme;
  setMode: (mode: ThemeMode) => void;
}

export const useTheme = (): ThemeController => {
  const [mode, setModeState] = useState<ThemeMode>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    return isThemeMode(stored) ? stored : "system";
  });
  const [resolved, setResolved] = useState<ResolvedTheme>(() => applyTheme(mode));

  const setMode = useCallback((next: ThemeMode) => {
    localStorage.setItem(STORAGE_KEY, next);
    setModeState(next);
    setResolved(applyTheme(next));
  }, []);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      if (mode === "system") setResolved(applyTheme(mode));
    };
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [mode]);

  return { mode, resolved, setMode };
};
