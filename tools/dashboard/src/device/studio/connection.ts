/**
 * Web Serial + zmk-studio-ts-client 连接封装（零 React）。
 * 自行接管串口生命周期：不再依赖上游 transport 里那套「断开时先 close 已被
 * pipe 锁定的 writable，抛错后 port.close() 永不执行」的坏逻辑（会导致端口一直
 * open，下次连接报 "The port is already open"）。
 */
import {
  create_rpc_connection,
  type RpcConnection,
} from "@zmkfirmware/zmk-studio-ts-client";

const BAUD_RATE = 12500;

export interface StudioConnection {
  conn: RpcConnection;
  /** 本连接占用的串口（用于识别/去重）。 */
  port: SerialPort;
  /** 主动断开：中止 RPC 管道并确保串口被关闭。 */
  disconnect(): Promise<void>;
}

/**
 * 判断错误是否为「用户取消选择设备」（原生 picker 取消 / 桌面端对话框点取消）。
 * 这类不是真正的失败，不应弹错误提示。
 */
export function isSelectionCancelled(error: unknown): boolean {
  if (error instanceof DOMException && error.name === "NotFoundError") {
    return true;
  }
  return error instanceof Error && /No port selected/i.test(error.message);
}

const getSerial = (): Serial => {
  if (!("serial" in navigator)) {
    throw new Error("此浏览器不支持 Web Serial（请用 Chrome / Edge）");
  }
  return navigator.serial;
};

const hex = (value: number | undefined): string =>
  value === undefined ? "----" : value.toString(16).padStart(4, "0");

const portLabel = (port: SerialPort): string => {
  const info = port.getInfo();
  if (info.usbVendorId === undefined && info.usbProductId === undefined) {
    return "串口设备";
  }
  return `USB ${hex(info.usbVendorId)}:${hex(info.usbProductId)}`;
};

/**
 * 尽力关闭一个串口：等待 RPC 管道 abort 释放 readable/writable 的锁后再 close。
 * 全程吞错——目标只是保证端口最终不再处于 open 状态。
 */
async function closePortSafely(port: SerialPort): Promise<void> {
  for (let i = 0; i < 100; i++) {
    if (!port.readable?.locked && !port.writable?.locked) break;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  try {
    await port.close();
  } catch {
    /* 已关闭或无法关闭：忽略 */
  }
}

/**
 * 打开串口并建立 RPC 连接。
 * @param target 指定要连接的串口；不传则弹出原生选择器（须由用户手势触发）。
 */
export async function openStudioConnection(
  target?: SerialPort,
): Promise<StudioConnection> {
  const serial = getSerial();
  const port = target ?? (await serial.requestPort({}));

  // 端口若因上次未正常断开仍处于 open 状态，先安全关闭，避免 "already open"。
  if (port.readable || port.writable) {
    await closePortSafely(port);
  }

  try {
    await port.open({ baudRate: BAUD_RATE });
  } catch (error) {
    if (error instanceof DOMException && error.name === "NetworkError") {
      throw new Error(
        "打开串口失败：设备可能正被其它程序占用（如已打开的 ZMK Studio），请关闭后重试",
      );
    }
    if (error instanceof DOMException && error.name === "InvalidStateError") {
      // 极少数情况下上一步没能真正关闭：再关一次后重开。
      await closePortSafely(port);
      await port.open({ baudRate: BAUD_RATE });
    } else {
      throw error;
    }
  }

  const abortController = new AbortController();
  const conn = create_rpc_connection(
    {
      label: portLabel(port),
      abortController,
      readable: port.readable!,
      writable: port.writable!,
    },
    { signal: abortController.signal },
  );

  let closed = false;
  return {
    conn,
    port,
    async disconnect() {
      if (closed) return;
      closed = true;
      try {
        // 中止信号会让 RPC 的 pipeTo/pipeThrough 释放对 readable/writable 的锁。
        abortController.abort("user disconnected");
      } catch {
        /* ignore */
      }
      await closePortSafely(port);
    },
  };
}
