import {
  app,
  Menu,
  nativeImage,
  Notification,
  shell,
  Tray,
  type MenuItemConstructorOptions,
  type NativeImage,
} from "electron";
import { bridge, HOOK_TARGETS, type BridgeState } from "./bridge";
import { openControlWindow } from "./controlWindow";
import { logStore } from "./logStore";
import { openLogWindow } from "./logWindow";
import { loadSettings, saveSettings, type WorkingEffect } from "./settings";
import { syncLoginItem } from "./autolaunch";

let tray: Tray | null = null;

const EFFECTS: WorkingEffect[] = ["snake", "spinner", "equalizer", "breathe"];
const BRIGHTNESS_STEPS = [64, 96, 128, 160, 200, 255];

/** 画一个 3×2 圆点阵作为菜单栏模板图标（黑色 + alpha，随明暗自适应）。 */
const dotBitmap = (size: number): Buffer => {
  const buf = Buffer.alloc(size * size * 4); // BGRA
  const cols = 3;
  const rows = 2;
  const radius = size * 0.12;
  const marginX = size * 0.22;
  const marginY = size * 0.28;
  const spanX = size - marginX * 2;
  const spanY = size - marginY * 2;
  const centers: Array<[number, number]> = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cx = marginX + (spanX * c) / (cols - 1);
      const cy = marginY + (spanY * r) / (rows - 1);
      centers.push([cx, cy]);
    }
  }
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let on = false;
      for (const [cx, cy] of centers) {
        const dx = x + 0.5 - cx;
        const dy = y + 0.5 - cy;
        if (dx * dx + dy * dy <= radius * radius) {
          on = true;
          break;
        }
      }
      const i = (y * size + x) * 4;
      buf[i] = 0;
      buf[i + 1] = 0;
      buf[i + 2] = 0;
      buf[i + 3] = on ? 255 : 0;
    }
  }
  return buf;
};

const trayImage = (): NativeImage => {
  const img = nativeImage.createFromBitmap(dotBitmap(16), {
    width: 16,
    height: 16,
  });
  try {
    img.addRepresentation({
      scaleFactor: 2,
      width: 32,
      height: 32,
      buffer: dotBitmap(32),
    });
  } catch {
    /* addRepresentation 在个别平台可能不可用，退化为 1x */
  }
  img.setTemplateImage(true);
  return img;
};

const stateLabel = (): string => {
  const state: BridgeState = bridge.getState();
  switch (state) {
    case "stopped":
      return "已停止";
    case "starting":
      return "启动中…";
    case "running":
      return "运行中";
    case "listening":
      return bridge.isHidConnected() ? "运行中 · 已连键盘" : "运行中 · 等待键盘";
    case "error":
      return "出错 / 重连中";
    default:
      return String(state);
  }
};

const notify = (title: string, body: string): void => {
  try {
    if (Notification.isSupported()) new Notification({ title, body }).show();
  } catch {
    /* 通知失败不致命 */
  }
};

export const buildMenu = (): void => {
  if (!tray) return;
  const s = loadSettings();
  const running = bridge.isRunning();

  const template: MenuItemConstructorOptions[] = [
    { label: `Planckeys Bridge · ${stateLabel()}`, enabled: false },
    { type: "separator" },
    { label: "打开控制台（灯效 / 改键）", click: () => openControlWindow() },
    { type: "separator" },
    running
      ? { label: "停止 Bridge", click: () => bridge.stop() }
      : { label: "启动 Bridge", click: () => void bridge.start() },
    { label: "重启 Bridge", enabled: running, click: () => void bridge.restart() },
    { type: "separator" },
    {
      label: "working 灯效",
      submenu: EFFECTS.map(
        (e): MenuItemConstructorOptions => ({
          label: e,
          type: "radio",
          checked: s.workingEffect === e,
          click: () => {
            saveSettings({ workingEffect: e });
            if (bridge.isRunning()) void bridge.restart();
            buildMenu();
          },
        }),
      ),
    },
    {
      label: "亮度",
      submenu: BRIGHTNESS_STEPS.map(
        (b): MenuItemConstructorOptions => ({
          label: String(b),
          type: "radio",
          checked: s.brightness === b,
          click: () => {
            saveSettings({ brightness: b });
            if (bridge.isRunning()) void bridge.restart();
            buildMenu();
          },
        }),
      ),
    },
    { type: "separator" },
    {
      label: "安装 hooks",
      submenu: HOOK_TARGETS.map(
        (t): MenuItemConstructorOptions => ({
          label: t,
          click: async () => {
            const ok = await bridge.runHooks("install-hooks", t);
            notify("安装 hooks", `${t}：${ok ? "完成" : "失败（见日志）"}`);
          },
        }),
      ),
    },
    {
      label: "卸载 hooks",
      submenu: HOOK_TARGETS.map(
        (t): MenuItemConstructorOptions => ({
          label: t,
          click: async () => {
            const ok = await bridge.runHooks("uninstall-hooks", t);
            notify("卸载 hooks", `${t}：${ok ? "完成" : "失败（见日志）"}`);
          },
        }),
      ),
    },
    { type: "separator" },
    {
      label: "开机自启动 App",
      type: "checkbox",
      checked: s.autoLaunch,
      click: (mi) => {
        saveSettings({ autoLaunch: mi.checked });
        syncLoginItem(mi.checked);
      },
    },
    {
      label: "登录后自动启动 Bridge",
      type: "checkbox",
      checked: s.autoStartBridge,
      click: (mi) => {
        saveSettings({ autoStartBridge: mi.checked });
      },
    },
    {
      label: "不驱动键盘（--no-hid 调试）",
      type: "checkbox",
      checked: s.dryRun,
      click: (mi) => {
        saveSettings({ dryRun: mi.checked });
        if (bridge.isRunning()) void bridge.restart();
      },
    },
    { type: "separator" },
    { label: "查看日志", click: () => openLogWindow() },
    { label: "打开日志文件", click: () => void shell.openPath(logStore.filePath()) },
    { label: "打开 bridge 目录", click: () => void shell.openPath(bridge.bridgeDir()) },
    { type: "separator" },
    { label: "退出", click: () => app.quit() },
  ];

  const menu = Menu.buildFromTemplate(template);
  tray.setContextMenu(menu);
  tray.setToolTip(`Planckeys Bridge · ${stateLabel()}`);
};

export const createTray = (): void => {
  tray = new Tray(trayImage());
  tray.setToolTip("Planckeys Bridge");
  buildMenu();
  bridge.on("state", () => buildMenu());
  bridge.on("hid", () => buildMenu());
};
