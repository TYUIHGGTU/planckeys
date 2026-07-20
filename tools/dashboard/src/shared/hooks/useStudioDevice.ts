import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

export type StudioSyncState =
  | "idle"
  | "applying"
  | "pending"
  | "saving"
  | "saved"
  | "error";

export interface StudioController {
  connected: boolean;
  loading: boolean;
  deviceName: string | null;
  keymap: KeymapData | null;
  layouts: PhysicalLayoutsData | null;
  behaviors: BehaviorSummary[];
  selectedLayer: number;
  unsaved: boolean;
  syncState: StudioSyncState;
  syncError: string | null;

  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  selectLayer: (index: number) => void;
  applyBinding: (keyPosition: number, binding: Binding) => Promise<void>;
  save: () => Promise<void>;
  discard: () => Promise<void>;
}

const AUTO_SAVE_DELAY_MS = 500;

export const useStudioDevice = (): StudioController => {
  const connRef = useRef<StudioConnection | null>(null);
  const keymapRef = useRef<KeymapData | null>(null);
  const selectedLayerRef = useRef(0);
  const unsavedRef = useRef(false);
  const queueRef = useRef<Promise<void>>(Promise.resolve());
  const saveTimerRef = useRef<number | null>(null);

  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(false);
  const [deviceName, setDeviceName] = useState<string | null>(null);
  const [keymap, setKeymapState] = useState<KeymapData | null>(null);
  const [layouts, setLayouts] = useState<PhysicalLayoutsData | null>(null);
  const [behaviors, setBehaviors] = useState<BehaviorSummary[]>([]);
  const [selectedLayer, setSelectedLayer] = useState(0);
  const [unsaved, setUnsavedState] = useState(false);
  const [syncState, setSyncState] = useState<StudioSyncState>("idle");
  const [syncError, setSyncError] = useState<string | null>(null);

  const setKeymap = useCallback((next: KeymapData | null) => {
    keymapRef.current = next;
    setKeymapState(next);
  }, []);

  const setUnsaved = useCallback((next: boolean) => {
    unsavedRef.current = next;
    setUnsavedState(next);
  }, []);

  const enqueue = useCallback((operation: () => Promise<void>): Promise<void> => {
    const next = queueRef.current.catch(() => undefined).then(operation);
    queueRef.current = next.catch(() => undefined);
    return next;
  }, []);

  const clearSaveTimer = useCallback(() => {
    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
  }, []);

  const performSave = useCallback(async () => {
    const connection = connRef.current;
    if (!connection || !unsavedRef.current) return;
    setSyncState("saving");
    setSyncError(null);
    try {
      const ok = await saveChanges(connection.conn);
      if (!ok) throw new Error("设备拒绝保存");
      setUnsaved(false);
      setSyncState("saved");
      pushLog("已自动保存改键到 settings");
    } catch (error) {
      const message = (error as Error).message || String(error);
      setSyncState("error");
      setSyncError(message);
      pushLog("保存失败: " + message);
    }
  }, [setUnsaved]);

  const save = useCallback(async () => {
    clearSaveTimer();
    await enqueue(performSave);
  }, [clearSaveTimer, enqueue, performSave]);

  const scheduleAutoSave = useCallback(() => {
    clearSaveTimer();
    setSyncState("pending");
    saveTimerRef.current = window.setTimeout(() => {
      saveTimerRef.current = null;
      void enqueue(performSave);
    }, AUTO_SAVE_DELAY_MS);
  }, [clearSaveTimer, enqueue, performSave]);

  const connect = useCallback(async () => {
    setLoading(true);
    setSyncError(null);
    try {
      const connection = await openStudioConnection();
      connRef.current = connection;
      const info = await getDeviceInfo(connection.conn);
      setDeviceName(info?.name ?? "ZMK");
      pushLog("Studio 已连接: " + (info?.name ?? "?"));

      const [nextKeymap, physicalLayouts, nextBehaviors] = await Promise.all([
        getKeymap(connection.conn),
        getPhysicalLayouts(connection.conn),
        listBehaviors(connection.conn),
      ]);
      setKeymap(nextKeymap);
      setLayouts(physicalLayouts);
      setBehaviors(nextBehaviors);
      selectedLayerRef.current = 0;
      setSelectedLayer(0);
      setUnsaved(false);
      setSyncState("saved");
      setConnected(true);
      pushLog(
        `Studio 载入: ${nextKeymap?.layers.length ?? 0} 层 / ${nextBehaviors.length} behaviors`,
      );
    } catch (error) {
      const message = (error as Error).message || String(error);
      pushLog("Studio 连接失败: " + message);
      connRef.current = null;
      setConnected(false);
      setSyncState("error");
      setSyncError(message);
      throw error;
    } finally {
      setLoading(false);
    }
  }, [setKeymap, setUnsaved]);

  const disconnect = useCallback(async () => {
    clearSaveTimer();
    await queueRef.current.catch(() => undefined);
    if (unsavedRef.current) {
      await performSave().catch(() => undefined);
    }
    await connRef.current?.disconnect();
    connRef.current = null;
    setConnected(false);
    setDeviceName(null);
    setKeymap(null);
    setLayouts(null);
    setBehaviors([]);
    setUnsaved(false);
    setSyncState("idle");
    setSyncError(null);
    pushLog("已断开 Studio");
  }, [clearSaveTimer, performSave, setKeymap, setUnsaved]);

  const selectLayer = useCallback((index: number) => {
    selectedLayerRef.current = index;
    setSelectedLayer(index);
  }, []);

  const applyBinding = useCallback(
    (keyPosition: number, binding: Binding): Promise<void> =>
      enqueue(async () => {
        const connection = connRef.current;
        const currentKeymap = keymapRef.current;
        const layerIndex = selectedLayerRef.current;
        const layer = currentKeymap?.layers[layerIndex];
        if (!connection || !currentKeymap || !layer) {
          setSyncState("error");
          setSyncError("Studio 尚未就绪");
          return;
        }

        setSyncState("applying");
        setSyncError(null);
        try {
          const result = await setLayerBinding(connection.conn, {
            layerId: layer.id,
            keyPosition,
            binding,
          });
          if (result !== "ok") throw new Error("behavior、参数或键位无效");

          const layers = currentKeymap.layers.map((item, index) =>
            index === layerIndex
              ? {
                  ...item,
                  bindings: item.bindings.map((current, position) =>
                    position === keyPosition ? { ...binding } : current,
                  ),
                }
              : item,
          );
          setKeymap({ ...currentKeymap, layers });
          setUnsaved(true);
          pushLog(`改键 pos=${keyPosition} -> behavior ${binding.behaviorId}`);
          scheduleAutoSave();
        } catch (error) {
          const message = (error as Error).message || String(error);
          setSyncState("error");
          setSyncError(message);
          pushLog(`改键失败 pos=${keyPosition}: ${message}`);
        }
      }),
    [enqueue, scheduleAutoSave, setKeymap, setUnsaved],
  );

  const discard = useCallback(async () => {
    clearSaveTimer();
    await enqueue(async () => {
      const connection = connRef.current;
      if (!connection) return;
      try {
        const ok = await discardChanges(connection.conn);
        if (!ok) throw new Error("设备拒绝丢弃");
        const nextKeymap = await getKeymap(connection.conn);
        setKeymap(nextKeymap);
        setUnsaved(false);
        setSyncState("saved");
        setSyncError(null);
        pushLog("已丢弃未保存改键");
      } catch (error) {
        const message = (error as Error).message || String(error);
        setSyncState("error");
        setSyncError(message);
        pushLog("丢弃失败: " + message);
      }
    });
  }, [clearSaveTimer, enqueue, setKeymap, setUnsaved]);

  useEffect(
    () => () => {
      clearSaveTimer();
    },
    [clearSaveTimer],
  );

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
      syncState,
      syncError,
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
      syncState,
      syncError,
      connect,
      disconnect,
      selectLayer,
      applyBinding,
      save,
      discard,
    ],
  );
};
