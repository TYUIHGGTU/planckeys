import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DEFAULT_PROFILE,
  resolveProfile,
  type KeyboardProfile,
} from "@planckeys/keyboard-profile";
import {
  isSelectionCancelled,
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
  /** 自动保存开关，默认开启；关闭后改键仅缓存，需手动 save()。 */
  autoSaveEnabled: boolean;
  /** 是否存在可撤销的改键。 */
  canUndo: boolean;

  /** 连接键盘：弹出选择器（浏览器原生 / 桌面端对话框）让用户选设备。 */
  connect: (port?: SerialPort) => Promise<void>;
  disconnect: () => Promise<void>;
  selectLayer: (index: number) => void;
  selectPhysicalLayout: (index: number) => Promise<void>;
  applyBinding: (keyPosition: number, binding: Binding) => Promise<void>;
  save: () => Promise<void>;
  discard: () => Promise<void>;
  setAutoSaveEnabled: (enabled: boolean) => void;
  undo: () => Promise<void>;
}

const AUTO_SAVE_DELAY_MS = 500;
const MAX_UNDO_HISTORY = 100;

/** 一次可撤销改键的快照：改动前该键位的绑定。 */
interface UndoEntry {
  layerId: number;
  keyPosition: number;
  prevBinding: Binding;
}

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
  const autoSaveEnabledRef = useRef(true);
  const undoStackRef = useRef<UndoEntry[]>([]);

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
  const [autoSaveEnabled, setAutoSaveEnabledState] = useState(true);
  const [canUndo, setCanUndo] = useState(false);

  const setKeymap = useCallback((next: KeymapData | null) => {
    keymapRef.current = next;
    setKeymapState(next);
  }, []);

  const setUnsaved = useCallback((next: boolean) => {
    unsavedRef.current = next;
    setUnsavedState(next);
  }, []);

  const resetUndo = useCallback(() => {
    undoStackRef.current = [];
    setCanUndo(false);
  }, []);

  const pushUndo = useCallback((entry: UndoEntry) => {
    const next = [...undoStackRef.current, entry];
    if (next.length > MAX_UNDO_HISTORY) next.shift();
    undoStackRef.current = next;
    setCanUndo(true);
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
    // 自动保存关闭时只标记「待保存」，等待用户手动 save()。
    if (!autoSaveEnabledRef.current) return;
    saveTimerRef.current = window.setTimeout(() => {
      saveTimerRef.current = null;
      void enqueue(performSave);
    }, AUTO_SAVE_DELAY_MS);
  }, [clearSaveTimer, enqueue, performSave]);

  const setAutoSaveEnabled = useCallback(
    (enabled: boolean) => {
      autoSaveEnabledRef.current = enabled;
      setAutoSaveEnabledState(enabled);
      // 重新开启时若有未保存改动，立即安排一次保存。
      if (enabled && unsavedRef.current) {
        scheduleAutoSave();
      } else if (!enabled) {
        clearSaveTimer();
      }
    },
    [clearSaveTimer, scheduleAutoSave],
  );

  const connect = useCallback(async (port?: SerialPort) => {
    setLoading(true);
    setSyncError(null);
    try {
      const connection = await openStudioConnection(port);
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
      resetUndo();
      setSyncState("saved");
      setConnected(true);
      pushLog(
        `Studio 载入: ${nextKeymap?.layers.length ?? 0} 层 / ${nextBehaviors.length} behaviors / ${physicalLayouts?.layouts.length ?? 0} layouts`,
      );
    } catch (error) {
      connRef.current = null;
      setConnected(false);
      if (isSelectionCancelled(error)) {
        // 用户取消选择设备：不是失败，保持原状态、静默返回。
        pushLog("已取消选择设备");
        throw error;
      }
      const message = (error as Error).message || String(error);
      pushLog("Studio 连接失败: " + message);
      setSyncState("error");
      setSyncError(message);
      throw error;
    } finally {
      setLoading(false);
    }
  }, [resetUndo, setKeymap, setUnsaved]);

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
    resetUndo();
    setSyncState("idle");
    setSyncError(null);
    pushLog("已断开 Studio");
  }, [clearSaveTimer, performSave, resetUndo, setKeymap, setUnsaved]);

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

        const prevBinding = layer.bindings[keyPosition];

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
          if (prevBinding) {
            pushUndo({
              layerId: layer.id,
              keyPosition,
              prevBinding: { ...prevBinding },
            });
          }
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
    [enqueue, pushUndo, scheduleAutoSave, setKeymap, setUnsaved],
  );

  const undo = useCallback(
    (): Promise<void> =>
      enqueue(async () => {
        const connection = connRef.current;
        const currentKeymap = keymapRef.current;
        const entry = undoStackRef.current[undoStackRef.current.length - 1];
        if (!connection || !currentKeymap || !entry) return;
        const layerIndex = currentKeymap.layers.findIndex(
          (item) => item.id === entry.layerId,
        );
        if (layerIndex < 0) {
          // 目标层已不存在（如切换物理布局），丢弃这条历史。
          undoStackRef.current = undoStackRef.current.slice(0, -1);
          setCanUndo(undoStackRef.current.length > 0);
          return;
        }

        setSyncState("applying");
        setSyncError(null);
        try {
          const result = await setLayerBinding(connection.conn, {
            layerId: entry.layerId,
            keyPosition: entry.keyPosition,
            binding: entry.prevBinding,
          });
          if (result !== "ok") throw new Error("behavior、参数或键位无效");

          const nextLayers = currentKeymap.layers.map((item, i) =>
            i === layerIndex
              ? {
                  ...item,
                  bindings: item.bindings.map((current, position) =>
                    position === entry.keyPosition
                      ? { ...entry.prevBinding }
                      : current,
                  ),
                }
              : item,
          );
          setKeymap({ ...currentKeymap, layers: nextLayers });
          undoStackRef.current = undoStackRef.current.slice(0, -1);
          setCanUndo(undoStackRef.current.length > 0);
          // 切到该键所在层，让撤销结果可见。
          selectedLayerRef.current = layerIndex;
          setSelectedLayer(layerIndex);
          setUnsaved(true);
          pushLog(`撤销改键 pos=${entry.keyPosition}`);
          scheduleAutoSave();
        } catch (error) {
          const message = (error as Error).message || String(error);
          setSyncState("error");
          setSyncError(message);
          pushLog(`撤销失败 pos=${entry.keyPosition}: ${message}`);
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
        resetUndo();
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
  }, [clearSaveTimer, enqueue, resetUndo, setKeymap, setUnsaved]);

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
      autoSaveEnabled,
      canUndo,
      connect,
      disconnect,
      selectLayer,
      selectPhysicalLayout,
      applyBinding,
      save,
      discard,
      setAutoSaveEnabled,
      undo,
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
      autoSaveEnabled,
      canUndo,
      connect,
      disconnect,
      selectLayer,
      selectPhysicalLayout,
      applyBinding,
      save,
      discard,
      setAutoSaveEnabled,
      undo,
    ],
  );
};
