/**
 * Studio RPC 领域封装：把 zmk-studio-ts-client 的原始 protobuf 响应
 * 映射成本应用使用的精简类型。UI 只依赖这里导出的类型/函数，
 * 不直接 call_rpc，方便单测与日后换 bridge 代理（方案 D）。
 */
import { call_rpc, type RpcConnection } from "@zmkfirmware/zmk-studio-ts-client";

export interface DeviceInfo {
  name: string;
}

export interface Binding {
  behaviorId: number;
  param1: number;
  param2: number;
}

export interface Layer {
  id: number;
  name: string;
  bindings: Binding[];
}

export interface KeymapData {
  layers: Layer[];
  availableLayers: number;
  maxLayerNameLength: number;
}

/** 物理布局里单个键的位置（单位为 1/100 键位；渲染时自行缩放）。 */
export interface PhysicalKey {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PhysicalLayout {
  name: string;
  keys: PhysicalKey[];
}

export interface PhysicalLayoutsData {
  activeLayoutIndex: number;
  layouts: PhysicalLayout[];
}

export interface BehaviorSummary {
  id: number;
  displayName: string;
}

export const getDeviceInfo = async (
  conn: RpcConnection,
): Promise<DeviceInfo | null> => {
  const resp = await call_rpc(conn, { core: { getDeviceInfo: true } });
  const info = resp.core?.getDeviceInfo;
  if (!info) return null;
  return { name: info.name };
};

export const getKeymap = async (
  conn: RpcConnection,
): Promise<KeymapData | null> => {
  const resp = await call_rpc(conn, { keymap: { getKeymap: true } });
  const km = resp.keymap?.getKeymap;
  if (!km) return null;
  return {
    availableLayers: km.availableLayers,
    maxLayerNameLength: km.maxLayerNameLength,
    layers: km.layers.map((l) => ({
      id: l.id,
      name: l.name,
      bindings: l.bindings.map((b) => ({
        behaviorId: b.behaviorId,
        param1: b.param1,
        param2: b.param2,
      })),
    })),
  };
};

export const getPhysicalLayouts = async (
  conn: RpcConnection,
): Promise<PhysicalLayoutsData | null> => {
  const resp = await call_rpc(conn, { keymap: { getPhysicalLayouts: true } });
  const pl = resp.keymap?.getPhysicalLayouts;
  if (!pl) return null;
  return {
    activeLayoutIndex: pl.activeLayoutIndex,
    layouts: pl.layouts.map((layout) => ({
      name: layout.name,
      keys: layout.keys.map((k) => ({
        x: k.x,
        y: k.y,
        width: k.width,
        height: k.height,
      })),
    })),
  };
};

export const listBehaviors = async (
  conn: RpcConnection,
): Promise<BehaviorSummary[]> => {
  const listResp = await call_rpc(conn, {
    behaviors: { listAllBehaviors: true },
  });
  const ids = listResp.behaviors?.listAllBehaviors?.behaviors ?? [];
  const out: BehaviorSummary[] = [];
  for (const id of ids) {
    const detResp = await call_rpc(conn, {
      behaviors: { getBehaviorDetails: { behaviorId: id } },
    });
    const det = detResp.behaviors?.getBehaviorDetails;
    if (det) {
      out.push({ id: det.id, displayName: det.displayName });
    }
  }
  return out;
};

export type SetBindingResult = "ok" | "error";

export const setLayerBinding = async (
  conn: RpcConnection,
  args: { layerId: number; keyPosition: number; binding: Binding },
): Promise<SetBindingResult> => {
  const resp = await call_rpc(conn, {
    keymap: {
      setLayerBinding: {
        layerId: args.layerId,
        keyPosition: args.keyPosition,
        binding: {
          behaviorId: args.binding.behaviorId,
          param1: args.binding.param1,
          param2: args.binding.param2,
        },
      },
    },
  });
  const r = resp.keymap?.setLayerBinding;
  // 0 = OK（SET_LAYER_BINDING_RESP_OK）。非 0 为各类校验失败。
  return r === 0 ? "ok" : "error";
};

export const saveChanges = async (conn: RpcConnection): Promise<boolean> => {
  const resp = await call_rpc(conn, { keymap: { saveChanges: true } });
  const r = resp.keymap?.saveChanges;
  return !!r && !r.err;
};

export const discardChanges = async (conn: RpcConnection): Promise<boolean> => {
  const resp = await call_rpc(conn, { keymap: { discardChanges: true } });
  return !!resp.keymap?.discardChanges;
};
