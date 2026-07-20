import { useCallback, useMemo, useRef, useState } from "react";
import {
  openStudioConnection,
  type StudioConnection,
} from "../../device/studio/connection";
import {
  discardChanges,
  getDeviceInfo,
  getKeymap,
  getPhysicalLayouts,
  listBehaviors,
  saveChanges,
  setLayerBinding,
  type BehaviorSummary,
  type Binding,
  type KeymapData,
  type PhysicalLayoutsData,
} from "../../device/studio/rpc";
import { pushLog } from "../log";

export interface StudioController {
  connected: boolean;
  loading: boolean;
  deviceName: string | null;
  keymap: KeymapData | null;
  layouts: PhysicalLayoutsData | null;
  behaviors: BehaviorSummary[];
  selectedLayer: number;
  unsaved: boolean;

  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  selectLayer: (index: number) => void;
  applyBinding: (keyPosition: number, binding: Binding) => Promise<void>;
  save: () => Promise<void>;
  discard: () => Promise<void>;
}

export const useStudioDevice = (): StudioController => {
  const connRef = useRef<StudioConnection | null>(null);
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(false);
  const [deviceName, setDeviceName] = useState<string | null>(null);
  const [keymap, setKeymap] = useState<KeymapData | null>(null);
  const [layouts, setLayouts] = useState<PhysicalLayoutsData | null>(null);
  const [behaviors, setBehaviors] = useState<BehaviorSummary[]>([]);
  const [selectedLayer, setSelectedLayer] = useState(0);
  const [unsaved, setUnsaved] = useState(false);

  const connect = useCallback(async () => {
    setLoading(true);
    try {
      const c = await openStudioConnection();
      connRef.current = c;

      const info = await getDeviceInfo(c.conn);
      setDeviceName(info?.name ?? "ZMK");
      pushLog("Studio 已连接: " + (info?.name ?? "?"));

      const [km, pl, bh] = await Promise.all([
        getKeymap(c.conn),
        getPhysicalLayouts(c.conn),
        listBehaviors(c.conn),
      ]);
      setKeymap(km);
      setLayouts(pl);
      setBehaviors(bh);
      setSelectedLayer(0);
      setUnsaved(false);
      setConnected(true);
      pushLog(
        `Studio 载入: ${km?.layers.length ?? 0} 层 / ${bh.length} behaviors`,
      );
    } catch (e) {
      pushLog("Studio 连接失败: " + ((e as Error).message || String(e)));
      connRef.current = null;
      setConnected(false);
      throw e;
    } finally {
      setLoading(false);
    }
  }, []);

  const disconnect = useCallback(async () => {
    await connRef.current?.disconnect();
    connRef.current = null;
    setConnected(false);
    setDeviceName(null);
    setKeymap(null);
    setLayouts(null);
    setBehaviors([]);
    setUnsaved(false);
    pushLog("已断开 Studio");
  }, []);

  const selectLayer = useCallback((index: number) => {
    setSelectedLayer(index);
  }, []);

  const applyBinding = useCallback(
    async (keyPosition: number, binding: Binding) => {
      const c = connRef.current;
      if (!c || !keymap) return;
      const layer = keymap.layers[selectedLayer];
      if (!layer) return;
      const res = await setLayerBinding(c.conn, {
        layerId: layer.id,
        keyPosition,
        binding,
      });
      if (res !== "ok") {
        pushLog(`改键失败 pos=${keyPosition}（behavior/参数不合法或位置越界）`);
        return;
      }
      // 本地同步草稿并标记未保存。
      setKeymap((prev) => {
        if (!prev) return prev;
        const layers = prev.layers.map((l, i) =>
          i === selectedLayer
            ? {
                ...l,
                bindings: l.bindings.map((b, pos) =>
                  pos === keyPosition ? { ...binding } : b,
                ),
              }
            : l,
        );
        return { ...prev, layers };
      });
      setUnsaved(true);
      pushLog(`改键 pos=${keyPosition} -> behavior ${binding.behaviorId}`);
    },
    [keymap, selectedLayer],
  );

  const save = useCallback(async () => {
    const c = connRef.current;
    if (!c) return;
    const ok = await saveChanges(c.conn);
    if (ok) {
      setUnsaved(false);
      pushLog("已保存改键到 settings");
    } else {
      pushLog("保存失败");
    }
  }, []);

  const discard = useCallback(async () => {
    const c = connRef.current;
    if (!c) return;
    const ok = await discardChanges(c.conn);
    if (ok) {
      const km = await getKeymap(c.conn);
      setKeymap(km);
      setUnsaved(false);
      pushLog("已丢弃未保存改键");
    } else {
      pushLog("丢弃失败");
    }
  }, []);

  return useMemo(
    () => ({
      connected,
      loading,
      deviceName,
      keymap,
      layouts,
      behaviors,
      selectedLayer,
      unsaved,
      connect,
      disconnect,
      selectLayer,
      applyBinding,
      save,
      discard,
    }),
    [
      connected,
      loading,
      deviceName,
      keymap,
      layouts,
      behaviors,
      selectedLayer,
      unsaved,
      connect,
      disconnect,
      selectLayer,
      applyBinding,
      save,
      discard,
    ],
  );
};
