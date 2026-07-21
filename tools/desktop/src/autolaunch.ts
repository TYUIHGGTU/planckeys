import { app } from "electron";

/** 同步登录项（macOS / Windows）。Linux 上 setLoginItemSettings 不支持，忽略。 */
export const syncLoginItem = (enabled: boolean): void => {
  if (process.platform === "darwin" || process.platform === "win32") {
    app.setLoginItemSettings({ openAtLogin: enabled, openAsHidden: true });
  }
};
