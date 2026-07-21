import {
  app,
  BrowserWindow,
  Notification,
  type Session,
} from "electron";
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { logStore } from "./logStore";

let win: BrowserWindow | null = null;
let permsWired: WeakSet<Session> = new WeakSet();

/** ZMK / nRF52840 常见 USB VID（0x1d50），Electron 串口的 vendorId 是字符串。 */
const ZMK_VENDOR_IDS = ["1d50", "7504"]; // 十六进制 / 十进制两种可能的表示

const dashboardDir = (): string =>
  process.env.PLANCKEYS_DASHBOARD_DIR ||
  resolve(__dirname, "..", "..", "dashboard");

const dashboardIndex = (): string => join(dashboardDir(), "dist", "index.html");

/**
 * 放行渲染层的 WebHID（控灯）与 Web Serial（改键）。Electron 默认会弹出原生设备
 * 选择器并要求我们回调选中项；这里自动挑中 PlanckKeys 设备 / ZMK 串口，体验接近网页。
 */
const wirePermissions = (ses: Session): void => {
  if (permsWired.has(ses)) return;
  permsWired.add(ses);

  ses.setPermissionCheckHandler((_wc, permission) =>
    permission === "hid" || permission === "serial" || permission === "usb",
  );
  ses.setDevicePermissionHandler(() => true);

  ses.on("select-hid-device", (event, details, callback) => {
    event.preventDefault();
    const list = details.deviceList;
    const pick = list.find((d) => (d.name ?? "").includes("PlanckKeys")) ?? list[0];
    logStore.append(`[desktop] 控制台选择 HID：${pick?.name ?? "无匹配设备"}`);
    callback(pick?.deviceId);
  });

  ses.on("select-serial-port", (event, portList, _wc, callback) => {
    event.preventDefault();
    const pick =
      portList.find((p) =>
        ZMK_VENDOR_IDS.includes((p.vendorId ?? "").toLowerCase()),
      ) ?? portList[0];
    logStore.append(
      `[desktop] 控制台选择串口：${pick?.portName ?? pick?.portId ?? "无可用串口"}`,
    );
    callback(pick?.portId ?? "");
  });
};

const buildDashboard = (): Promise<boolean> =>
  new Promise((res) => {
    logStore.append("[desktop] 构建控制台（dashboard）…");
    const npm = process.platform === "win32" ? "npm.cmd" : "npm";
    let child: ChildProcess;
    try {
      child = spawn(npm, ["run", "build"], { cwd: dashboardDir() });
    } catch (e) {
      logStore.append(`[desktop] 无法启动控制台构建：${(e as Error).message}`);
      res(false);
      return;
    }
    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");
    child.stdout?.on("data", (c: string) => logStore.append(`[console] ${c.trimEnd()}`));
    child.stderr?.on("data", (c: string) => logStore.append(`[console] ${c.trimEnd()}`));
    child.on("error", (e) => {
      logStore.append(`[desktop] 控制台构建出错：${e.message}`);
      res(false);
    });
    child.on("exit", (code) => {
      const ok = code === 0;
      logStore.append(`[desktop] 控制台构建${ok ? "成功" : `失败（code=${code}）`}`);
      res(ok);
    });
  });

const loadDashboard = async (target: BrowserWindow): Promise<void> => {
  const devUrl = process.env.PLANCKEYS_DASHBOARD_URL;
  if (devUrl) {
    logStore.append(`[desktop] 控制台加载开发服务器：${devUrl}`);
    await target.loadURL(devUrl);
    return;
  }
  if (!existsSync(dashboardIndex())) {
    logStore.append(
      `[desktop] 未找到控制台产物（${dashboardIndex()}），尝试自动构建…`,
    );
    const ok = await buildDashboard();
    if (!ok || !existsSync(dashboardIndex())) {
      logStore.append(
        "[desktop] 控制台不可用。请先在 tools/dashboard 执行 `npm install && npm run build`。",
      );
      try {
        if (Notification.isSupported())
          new Notification({
            title: "控制台不可用",
            body: "请先在 tools/dashboard 执行 npm install && npm run build",
          }).show();
      } catch {
        /* ignore */
      }
      return;
    }
  }
  await target.loadFile(dashboardIndex());
};

export const openControlWindow = (): void => {
  if (win) {
    win.show();
    win.focus();
    return;
  }

  win = new BrowserWindow({
    width: 1200,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    title: "Planckeys 控制台（灯效 / 改键）",
    backgroundColor: "#14161c",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  wirePermissions(win.webContents.session);

  win.webContents.on("did-finish-load", () =>
    logStore.append("[desktop] 控制台窗口加载完成。"),
  );
  win.webContents.on("did-fail-load", (_e, code, desc, url) =>
    logStore.append(`[desktop] 控制台加载失败（${code} ${desc}）：${url}`),
  );

  // 有可见窗口时，让 Dock 图标出现，方便切换（关闭后回到纯托盘）。
  if (process.platform === "darwin") void app.dock?.show();

  void loadDashboard(win);

  win.on("closed", () => {
    win = null;
    if (process.platform === "darwin") app.dock?.hide();
  });
};

/** 启动即打开控制台（PLANCKEYS_OPEN_CONSOLE=1，便于开发/联调）。 */
export const controlWindow_openIfRequested = (): void => {
  if (process.env.PLANCKEYS_OPEN_CONSOLE === "1") openControlWindow();
};
