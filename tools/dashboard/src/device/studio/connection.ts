/**
 * Web Serial + zmk-studio-ts-client 连接封装（零 React）。
 * 只负责建立/断开 RPC 连接；具体请求在 rpc.ts。
 */
import {
  create_rpc_connection,
  type RpcConnection,
} from "@zmkfirmware/zmk-studio-ts-client";
import { connect as connectSerial } from "@zmkfirmware/zmk-studio-ts-client/transport/serial";

export interface StudioConnection {
  conn: RpcConnection;
  /** 主动断开：中止 transport 与所有管道。 */
  disconnect(): Promise<void>;
}

/**
 * 打开串口并建立 RPC 连接（须由用户手势触发 requestPort）。
 */
export async function openStudioConnection(): Promise<StudioConnection> {
  if (!("serial" in navigator)) {
    throw new Error("此浏览器不支持 Web Serial（请用 Chrome / Edge）");
  }

  const transport = await connectSerial();
  const conn = create_rpc_connection(transport, {
    signal: transport.abortController.signal,
  });

  return {
    conn,
    async disconnect() {
      try {
        transport.abortController.abort("user disconnected");
      } catch {
        /* ignore */
      }
    },
  };
}
