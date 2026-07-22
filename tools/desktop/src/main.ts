import { app } from "electron";
import { join } from "node:path";
import { bridge } from "./bridge";
import { controlWindow_openIfRequested, openControlWindow } from "./controlWindow";
import { logStore } from "./logStore";
import { loadSettings } from "./settings";
import { syncLoginItem } from "./autolaunch";
import { createTray } from "./tray";

// 菜单栏常驻应用：只允许单实例，避免多份 daemon 抢同一块 HID。
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  // 包名改为 scope（@planckeys/desktop）后，固定 app 名与 userData 路径，避免路径里出现
  // "@planckeys/desktop" 的斜杠，并保持与旧版一致的设置/日志/登录项位置。
  // 注意：userData 由原生早期解析，仅靠 setName 太晚，必须显式 setPath。
  app.setName("planckeys-desktop");
  app.setPath("userData", join(app.getPath("appData"), "planckeys-desktop"));

  app.on("second-instance", () => {
    logStore.append("[desktop] 检测到第二个实例启动请求，已忽略（保持单实例）。");
  });

  app.whenReady().then(() => {
    const settings = loadSettings();
    syncLoginItem(settings.autoLaunch);
    createTray();

    logStore.append("[desktop] Planckeys Desktop 已启动。");
    controlWindow_openIfRequested();
    if (settings.autoStartBridge) {
      void bridge.start();
    } else {
      logStore.append("[desktop] 已关闭“登录后自动启动 Bridge”，请从菜单手动启动。");
    }
  });

  // 点击 Dock 图标（或无窗口时被激活）→ 打开/聚焦控制台主面板。
  app.on("activate", () => {
    openControlWindow();
  });

  // 托盘应用：没有窗口也要保持运行。
  app.on("window-all-closed", () => {
    /* keep running */
  });

  app.on("before-quit", () => {
    bridge.stop();
  });
}
