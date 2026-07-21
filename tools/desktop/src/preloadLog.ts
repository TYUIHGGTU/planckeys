import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("planckeys", {
  onInit: (cb: (lines: string[]) => void) =>
    ipcRenderer.on("log:init", (_e, lines: string[]) => cb(lines)),
  onLine: (cb: (line: string) => void) =>
    ipcRenderer.on("log:line", (_e, line: string) => cb(line)),
});
