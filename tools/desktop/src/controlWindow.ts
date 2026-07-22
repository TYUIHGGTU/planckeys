import {
  BrowserWindow,
  dialog,
  Notification,
  type SerialPort,
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

/** 为串口条目生成人类可读标签（Electron 的串口列表带 serialNumber，可区分同型号多台）。 */
const serialPortLabel = (port: SerialPort, index: number): string => {
  const base =
    port.displayName ||
    port.portName ||
    [port.vendorId, port.productId].filter(Boolean).join(":") ||
    `串口设备 ${index + 1}`;
  return port.serialNumber ? `${base}（${port.serialNumber}）` : base;
};

/** 是否为 ZMK 键盘（按 USB VID 判断）。 */
const isZmkPort = (port: SerialPort): boolean =>
  ZMK_VENDOR_IDS.includes((port.vendorId ?? "").toLowerCase());

/**
 * 放行渲染层的 WebHID（控灯）与 Web Serial（改键）。Electron 不会弹原生选择器，
 * 需由我们回调选中项。
 *
 * - HID：优先 PlanckKeys（有 LED profile）；否则取列表第一项。
 * - Serial：只有 1 个 ZMK 键盘时直接连、不弹窗（忽略蓝牙口/耳机等非键盘串口）；
 *   有多个 ZMK 键盘时才弹对话框让用户选；一个 ZMK 都识别不到时，退回列出全部设备。
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
    const pick =
      list.find((d) => /planckeys/i.test(d.name ?? "")) ?? list[0];
    logStore.append(`[desktop] 控制台选择 HID：${pick?.name ?? "无匹配设备"}`);
    callback(pick?.deviceId);
  });

  ses.on("select-serial-port", (event, portList, _wc, callback) => {
    event.preventDefault();

    if (portList.length === 0) {
      logStore.append("[desktop] 控制台请求串口：无可用设备");
      callback("");
      return;
    }

    const zmkPorts = portList.filter(isZmkPort);

    // 恰好一个 ZMK 键盘：直接连，不打扰用户（哪怕还有蓝牙口等其它串口）。
    if (zmkPorts.length === 1) {
      const only = zmkPorts[0];
      logStore.append(
        `[desktop] 控制台选择串口（唯一 ZMK 键盘）：${serialPortLabel(only, 0)}`,
      );
      callback(only.portId ?? "");
      return;
    }

    // 有多个 ZMK 键盘 → 只在它们之间选；一个都识别不到 → 退回列出全部。
    const candidates = zmkPorts.length > 1 ? zmkPorts : portList;

    // 非全 ZMK 场景下，把 ZMK 设备排前面作为推荐。
    const ordered = [...candidates].sort((a, b) => {
      const az = isZmkPort(a);
      const bz = isZmkPort(b);
      return az === bz ? 0 : az ? -1 : 1;
    });
    const labels = ordered.map((port, index) => serialPortLabel(port, index));
    const options = {
      type: "question" as const,
      title: "选择要连接的键盘",
      message: "检测到多个串口设备",
      detail: "请选择本次要连接的键盘：",
      buttons: [...labels, "取消"],
      cancelId: labels.length,
      defaultId: 0,
      noLink: true,
    };
    const prompt = win
      ? dialog.showMessageBox(win, options)
      : dialog.showMessageBox(options);
    void prompt
      .then(({ response }) => {
        if (response < 0 || response >= ordered.length) {
          logStore.append("[desktop] 控制台已取消串口选择");
          callback("");
          return;
        }
        const chosen = ordered[response];
        logStore.append(
          `[desktop] 控制台选择串口：${serialPortLabel(chosen, response)}`,
        );
        callback(chosen.portId ?? "");
      })
      .catch((error: unknown) => {
        logStore.append(
          `[desktop] 串口选择对话框出错：${(error as Error).message}`,
        );
        callback("");
      });
  });
};

const buildDashboard = (): Promise<boolean> =>
  new Promise((res) => {
    logStore.append("[desktop] 构建控制台（dashboard，含 led-protocol）…");
    const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
    let child: ChildProcess;
    try {
      child = spawn(
        pnpm,
        ["--filter", "@planckeys/dashboard...", "run", "build"],
        { cwd: dashboardDir() },
      );
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

  const isMac = process.platform === "darwin";
  win = new BrowserWindow({
    width: 1200,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    title: "Planckeys 控制台（灯效 / 改键）",
    backgroundColor: "#14161c",
    // macOS 原生观感：隐藏系统标题栏，把红黄绿交通灯内嵌到应用顶栏里，
    // 竖直居中到 56px 顶栏内（渲染层把顶栏设为可拖拽区域）。
    ...(isMac
      ? {
          titleBarStyle: "hiddenInset" as const,
          trafficLightPosition: { x: 18, y: 20 },
        }
      : {}),
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

  void loadDashboard(win);

  win.on("closed", () => {
    win = null;
  });
};

/** 启动即打开控制台（PLANCKEYS_OPEN_CONSOLE=1，便于开发/联调）。 */
export const controlWindow_openIfRequested = (): void => {
  if (process.env.PLANCKEYS_OPEN_CONSOLE === "1") openControlWindow();
};
