import { app } from "electron";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export type WorkingEffect = "snake" | "spinner" | "equalizer" | "breathe";
export type LogLevel = "debug" | "info" | "warn" | "error";

export interface DesktopSettings {
  /** 开机自动启动本 App（登录项）。 */
  autoLaunch: boolean;
  /** App 启动后自动拉起 bridge 守护进程。 */
  autoStartBridge: boolean;
  /** working 灯效，透传给 CODEX_BRIDGE_WORKING_EFFECT。 */
  workingEffect: WorkingEffect;
  /** 全局亮度 0..255，透传给 CODEX_BRIDGE_BRIGHTNESS。 */
  brightness: number;
  /** 日志级别，透传给 CODEX_BRIDGE_LOG。 */
  logLevel: LogLevel;
  /** 调试：不驱动键盘（--no-hid）。 */
  dryRun: boolean;
  /** 覆盖 node 可执行文件路径；留空则用 PATH 里的 node。 */
  nodePath: string;
  /** 覆盖 codex-bridge 工程目录；留空则相对本 App 定位。 */
  bridgeDir: string;
}

const DEFAULTS: DesktopSettings = {
  autoLaunch: true,
  autoStartBridge: true,
  workingEffect: "snake",
  brightness: 160,
  logLevel: "info",
  dryRun: false,
  nodePath: "",
  bridgeDir: "",
};

let cache: DesktopSettings | null = null;

const file = (): string => join(app.getPath("userData"), "settings.json");

export const loadSettings = (): DesktopSettings => {
  if (cache) return cache;
  try {
    if (existsSync(file())) {
      const raw = JSON.parse(readFileSync(file(), "utf8")) as Partial<DesktopSettings>;
      cache = { ...DEFAULTS, ...raw };
    } else {
      cache = { ...DEFAULTS };
    }
  } catch {
    cache = { ...DEFAULTS };
  }
  return cache;
};

export const saveSettings = (patch: Partial<DesktopSettings>): DesktopSettings => {
  const next = { ...loadSettings(), ...patch };
  cache = next;
  try {
    mkdirSync(dirname(file()), { recursive: true });
    writeFileSync(file(), JSON.stringify(next, null, 2) + "\n", "utf8");
  } catch {
    /* best-effort persistence */
  }
  return next;
};
