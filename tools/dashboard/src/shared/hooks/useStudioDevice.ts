import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DEFAULT_PROFILE,
  resolveProfile,
  type KeyboardProfile,
} from "@planckeys/keyboard-profile";
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
  setActivePhysicalLayout,
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
  /** 当前灯效 profile；Studio 未连时为 DEFAULT；连上无匹配则为 null。 */
  keyboardProfile: KeyboardProfile | null;
  /** 是否展示灯效面板 / 允许 HID 控灯。 */
  supportsLighting: boolean;
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
  selectPhysicalLayout: (index: number) => Promise<void>;
  applyBinding: (keyPosition: number, binding: Binding) => Promise<void>;
  save: () => Promise<void>;
  discard: () => Promise<void>;
}

const AUTO_SAVE_DELAY_MS = 500;

const warnIfLayoutMismatch = (
  profile: KeyboardProfile | null,
  layouts: PhysicalLayoutsData | null,
): void => {
  if (!profile || !layouts) return;
  const active =
    layouts.layouts[layouts.activeLayoutIndex] ?? layouts.layouts[0];
  const keyCount = active?.keys.length ?? 0;
  const mapCount = profile.keyPositionToLedIndex.length;
  if (keyCount !== mapCount) {
    pushLog(
      `警告: Studio 布局键数 ${keyCount} 与 profile「${profile.id}」键灯映射 ${mapCount} 不一致`,
    );
  }
};

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
  const [keyboardProfile, setKeyboardProfile] = useState<KeyboardProfile | null>(
    DEFAULT_PROFILE,
  );
  const [keymap, setKeymapState] = useState<KeymapData | null>(null);
  const [layouts, setLayoutsState] = useState<PhysicalLayoutsData | null>(null);
  const layoutsRef = useRef<PhysicalLayoutsData | null>(null);
  const setLayouts = useCallback((next: PhysicalLayoutsData | null) => {
    layoutsRef.current = next;
    setLayoutsState(next);
  }, []);
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
      const name = info?.name ?? "ZMK";
      setDeviceName(name);
      pushLog("Studio 已连接: " + name);

      const profile = resolveProfile({ name });
      setKeyboardProfile(profile);
      if (profile) {
        pushLog(`已匹配灯效 profile: ${profile.id}`);
      } else {
        pushLog("未匹配灯效 profile，仅启用改键");
      }

      const [nextKeymap, physicalLayouts, nextBehaviors] = await Promise.all([
        getKeymap(connection.conn),
        getPhysicalLayouts(connection.conn),
        listBehaviors(connection.conn),
      ]);
      setKeymap(nextKeymap);
      setLayouts(physicalLayouts);
      setBehaviors(nextBehaviors);
      warnIfLayoutMismatch(profile, physicalLayouts);
      selectedLayerRef.current = 0;
      setSelectedLayer(0);
      setUnsaved(false);
      setSyncState("saved");
      setConnected(true);
      pushLog(
        `Studio 载入: ${nextKeymap?.layers.length ?? 0} 层 / ${nextBehaviors.length} behaviors / ${physicalLayouts?.layouts.length ?? 0} layouts`,
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
    setKeyboardProfile(DEFAULT_PROFILE);
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

  const selectPhysicalLayout = useCallback(
    (index: number): Promise<void> =>
      enqueue(async () => {
        const connection = connRef.current;
        const current = layoutsRef.current;
        if (!connection || !current) {
          setSyncState("error");
          setSyncError("Studio 尚未就绪");
          return;
        }
        if (index === current.activeLayoutIndex) return;
        if (index < 0 || index >= current.layouts.length) return;

        setSyncState("applying");
        setSyncError(null);
        try {
          const nextKeymap = await setActivePhysicalLayout(
            connection.conn,
            index,
          );
          if (!nextKeymap) throw new Error("设备拒绝切换物理布局");
          setLayouts({ ...current, activeLayoutIndex: index });
          setKeymap(nextKeymap);
          selectedLayerRef.current = 0;
          setSelectedLayer(0);
          setUnsaved(true);
          pushLog(
            `切换物理布局 -> ${current.layouts[index]?.name ?? index}`,
          );
          scheduleAutoSave();
        } catch (error) {
          const message = (error as Error).message || String(error);
          setSyncState("error");
          setSyncError(message);
          pushLog("切换物理布局失败: " + message);
        }
      }),
    [enqueue, scheduleAutoSave, setKeymap, setLayouts, setUnsaved],
  );

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

          const nextLayers = currentKeymap.layers.map((item, i) =>
            i === layerIndex
              ? {
                  ...item,
                  bindings: item.bindings.map((current, position) =>
                    position === keyPosition ? { ...binding } : current,
                  ),
                }
              : item,
          );
          setKeymap({ ...currentKeymap, layers: nextLayers });
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

  const supportsLighting = keyboardProfile !== null;

  return useMemo(
    () => ({
      connected,
      loading,
      deviceName,
      keyboardProfile,
      supportsLighting,
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
      selectPhysicalLayout,
      applyBinding,
      save,
      discard,
    }),
    [
      connected,
      loading,
      deviceName,
      keyboardProfile,
      supportsLighting,
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
      selectPhysicalLayout,
      applyBinding,
      save,
      discard,
    ],
  );
};
