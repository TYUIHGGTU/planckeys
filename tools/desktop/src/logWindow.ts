import { BrowserWindow } from "electron";
import { join } from "node:path";
import { logStore } from "./logStore";

let win: BrowserWindow | null = null;
let listener: ((line: string) => void) | null = null;

export const openLogWindow = (): void => {
  if (win) {
    win.show();
    win.focus();
    return;
  }

  win = new BrowserWindow({
    width: 760,
    height: 480,
    title: "Planckeys Bridge 日志",
    backgroundColor: "#14161c",
    webPreferences: {
      preload: join(__dirname, "preloadLog.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  void win.loadFile(join(__dirname, "..", "assets", "log.html"));

  win.webContents.on("did-finish-load", () => {
    win?.webContents.send("log:init", logStore.recent());
  });

  listener = (line: string) => win?.webContents.send("log:line", line);
  logStore.on("line", listener);

  win.on("closed", () => {
    if (listener) logStore.off("line", listener);
    listener = null;
    win = null;
  });
};
