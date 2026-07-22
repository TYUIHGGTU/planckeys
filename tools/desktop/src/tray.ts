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
import { loadSettings, saveSettings } from "./settings";
import { syncLoginItem } from "./autolaunch";

let tray: Tray | null = null;

const BRIGHTNESS_STEPS = [64, 96, 128, 160, 200, 255];

type Point = readonly [number, number];

const distanceToSegment = (x: number, y: number, a: Point, b: Point): number => {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const lengthSquared = dx * dx + dy * dy;
  const t =
    lengthSquared === 0
      ? 0
      : Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / lengthSquared));
  return Math.hypot(x - (a[0] + t * dx), y - (a[1] + t * dy));
};

/**
 * Planckeys 的菜单栏符号：把 Dock 图标里的双端连接路径压缩成模板图。
 * 以 4×4 子像素采样抗锯齿，保证 16px 和 Retina 下都保持清晰。
 */
const bridgeBitmap = (size: number): Buffer => {
  const buf = Buffer.alloc(size * size * 4); // BGRA
  const scale = size / 18;
  const path: Point[] = [
    [3.7, 5.2],
    [12.1, 5.2],
    [13.8, 6.9],
    [13.8, 11.1],
    [12.1, 12.8],
    [4.2, 12.8],
  ].map(([x, y]) => [x * scale, y * scale] as const);
  const endpoints: Point[] = [path[0], path[4]];
  const strokeRadius = 0.85 * scale;
  const ringOuterRadius = 2.15 * scale;
  const ringInnerRadius = 0.82 * scale;
  const samples = 4;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let covered = 0;
      for (let sy = 0; sy < samples; sy++) {
        for (let sx = 0; sx < samples; sx++) {
          const px = x + (sx + 0.5) / samples;
          const py = y + (sy + 0.5) / samples;
          const onPath = path
            .slice(0, -1)
            .some((point, i) => distanceToSegment(px, py, point, path[i + 1]) <= strokeRadius);
          const onRing = endpoints.some(([cx, cy]) => {
            const distance = Math.hypot(px - cx, py - cy);
            return distance <= ringOuterRadius && distance >= ringInnerRadius;
          });
          const inRingHole = endpoints.some(
            ([cx, cy]) => Math.hypot(px - cx, py - cy) < ringInnerRadius,
          );
          if ((onPath || onRing) && !inRingHole) covered++;
        }
      }
      const i = (y * size + x) * 4;
      buf[i] = 0;
      buf[i + 1] = 0;
      buf[i + 2] = 0;
      buf[i + 3] = Math.round((covered / (samples * samples)) * 255);
    }
  }
  return buf;
};

const trayImage = (): NativeImage => {
  const img = nativeImage.createFromBitmap(bridgeBitmap(18), {
    width: 18,
    height: 18,
  });
  try {
    img.addRepresentation({
      scaleFactor: 2,
      width: 36,
      height: 36,
      buffer: bridgeBitmap(36),
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
