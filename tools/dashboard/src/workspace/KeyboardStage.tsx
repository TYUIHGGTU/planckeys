import { useEffect, type MouseEvent } from "react";
import {
  ActionIcon,
  Button,
  Card,
  Group,
  Popover,
  Select,
  Stack,
  Switch,
  Text,
  Tooltip,
} from "@mantine/core";
import type { Binding } from "../device/studio/rpc";
import { behaviorName, bindingLabel, prettyBehaviorName } from "../keymap/bindingLabels";
import { BindingPicker } from "../keymap/components/BindingPicker";
import { PhysicalKeyboard } from "../keymap/components/PhysicalKeyboard";
import type {
  StudioController,
  StudioSyncState,
} from "../shared/hooks/useStudioDevice";
import { useKeyboardScale } from "./useKeyboardScale";

interface Props {
  studio: StudioController;
  selectedKey: number | null;
  onSelectKey: (position: number) => void;
  onClearSelection: () => void;
  onAssign: (position: number, binding: Binding) => void;
  advancedOpen: boolean;
  onAdvancedOpen: (open: boolean) => void;
}

const SYNC_META: Record<StudioSyncState, { label: string; color: string; dim: boolean }> = {
  idle: { label: "等待连接", color: "var(--graphite)", dim: true },
  applying: { label: "正在应用", color: "#ffd43b", dim: false },
  pending: { label: "等待自动保存", color: "#ff8a3d", dim: false },
  saving: { label: "正在保存", color: "#3d7bff", dim: false },
  saved: { label: "已保存", color: "#3ddc84", dim: false },
  error: { label: "同步失败", color: "#ff3b3b", dim: false },
};

const layerTitle = (name: string | undefined, index: number): string =>
  name || (index === 0 ? "默认层" : `功能层 ${index}`);

export function KeyboardStage({
  studio,
  selectedKey,
  onSelectKey,
  onClearSelection,
  onAssign,
  advancedOpen,
  onAdvancedOpen,
}: Props) {
  const keymap = studio.keymap;
  const layouts = studio.layouts;
  const layer = keymap?.layers[studio.selectedLayer];
  const layout =
    layouts?.layouts[layouts.activeLayoutIndex] ?? layouts?.layouts[0];
  const currentBinding =
    selectedKey !== null ? layer?.bindings[selectedKey] : undefined;
  const scale = useKeyboardScale(layout);
  const showKeyboard = studio.connected && layout && layer;
  const layoutOptions =
    layouts?.layouts.map((item, index) => ({
      value: String(index),
      label: item.name || `布局 ${index + 1}`,
    })) ?? [];

  const cols = layout
    ? Math.max(1, Math.round(Math.max(0, ...layout.keys.map((k) => k.x + k.width)) / 100))
    : 12;
  const rows = layout
    ? Math.max(1, Math.round(Math.max(0, ...layout.keys.map((k) => k.y + k.height)) / 100))
    : 4;
  const sync = SYNC_META[studio.syncState];
  const syncLabel =
    studio.syncState === "pending" && !studio.autoSaveEnabled
      ? "待保存"
      : sync.label;

  const { undo, canUndo } = studio;
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const isUndo =
        (event.metaKey || event.ctrlKey) &&
        !event.shiftKey &&
        !event.altKey &&
        event.key.toLowerCase() === "z";
      if (!isUndo || !canUndo) return;
      const target = event.target as HTMLElement | null;
      // 输入框内交给浏览器原生撤销。
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      event.preventDefault();
      void undo();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [undo, canUndo]);

  const handleCenterClick = (event: MouseEvent<HTMLDivElement>) => {
    // 点到按键则交给按键自身处理；点空白处取消选中。
    if ((event.target as HTMLElement).closest(".kb-key")) return;
    onClearSelection();
  };

  return (
    <section className="keyboard-stage">
      <div className="stage-label">
        <b>{layerTitle(layer?.name, studio.selectedLayer)}</b>
        <Tooltip label={studio.syncError ?? syncLabel} withArrow>
          <span
            className="stage-saved"
            style={{ opacity: sync.dim ? 0.5 : 1 }}
            aria-label={syncLabel}
          >
            <i style={{ background: sync.color }} />
          </span>
        </Tooltip>
        {showKeyboard && (
          <Group gap={8} wrap="nowrap" className="stage-actions">
            <Tooltip label="撤销上一步改键 (⌘/Ctrl+Z)" withArrow>
              <ActionIcon
                variant="subtle"
                size="sm"
                onClick={() => void studio.undo()}
                disabled={!studio.canUndo}
                aria-label="撤销改键"
              >
                ↶
              </ActionIcon>
            </Tooltip>
            <Switch
              size="xs"
              checked={studio.autoSaveEnabled}
              onChange={(event) =>
                studio.setAutoSaveEnabled(event.currentTarget.checked)
              }
              label="自动保存"
              aria-label="自动保存开关"
            />
            {!studio.autoSaveEnabled && (
              <Button
                size="compact-xs"
                variant="filled"
                onClick={() => void studio.save()}
                disabled={!studio.unsaved || studio.syncState === "saving"}
              >
                保存
              </Button>
            )}
          </Group>
        )}
        {layoutOptions.length > 1 && (
          <Select
            size="xs"
            w={150}
            allowDeselect={false}
            data={layoutOptions}
            value={String(layouts?.activeLayoutIndex ?? 0)}
            onChange={(value) => {
              if (value !== null) void studio.selectPhysicalLayout(Number(value));
            }}
            aria-label="物理布局"
          />
        )}
      </div>

      <div className="stage-ruler-x">
        {Array.from({ length: cols }, (_, i) => (
          <i key={i}>{i}</i>
        ))}
      </div>
      <div className="stage-ruler-y">
        {Array.from({ length: rows }, (_, i) => (
          <i key={i}>{i}</i>
        ))}
      </div>

      <div
        className="keyboard-center"
        ref={scale.containerRef}
        onClick={handleCenterClick}
      >
        {showKeyboard ? (
          <PhysicalKeyboard
            layout={layout}
            layer={layer}
            behaviors={studio.behaviors}
            selectedKey={selectedKey}
            onSelectKey={onSelectKey}
            onDropBinding={onAssign}
            unitPx={scale.unitPx}
          />
        ) : (
          <Stack align="center" gap={6} className="workspace-empty">
            <Text fw={600} c="var(--mantine-color-text)">
              连接 Studio 开始编辑键位
            </Text>
            <Text size="sm" c="dimmed">
              连接后将读取真实物理布局、图层和 behavior。
            </Text>
          </Stack>
        )}
      </div>

      <div className="stage-planck">
        <div>
          <b>h</b> = 6.62607015 × 10<sup>−34</sup> J·s
        </div>
        <div>{studio.deviceName ?? "profile · planck"}</div>
      </div>

      {showKeyboard && (
        <Card className="zoom-controls" p={4} withBorder radius="sm">
          <Group gap={2} wrap="nowrap">
            <ActionIcon
              variant="subtle"
              size="md"
              onClick={scale.zoomOut}
              disabled={!scale.canZoomOut}
              aria-label="缩小"
            >
              −
            </ActionIcon>
            <Tooltip label="恢复自适应大小" withArrow>
              <ActionIcon
                variant="subtle"
                size="md"
                w={52}
                onClick={scale.resetZoom}
                aria-label="重置缩放"
              >
                <Text size="xs" ff="monospace">
                  {scale.zoomPercent}%
                </Text>
              </ActionIcon>
            </Tooltip>
            <ActionIcon
              variant="subtle"
              size="md"
              onClick={scale.zoomIn}
              disabled={!scale.canZoomIn}
              aria-label="放大"
            >
              +
            </ActionIcon>
          </Group>
        </Card>
      )}

      {selectedKey !== null && currentBinding && (
        <Card className="key-inspector" withBorder radius="sm" p="md">
          <Stack gap={10}>
            <div>
              <Text className="eyebrow" component="span">
                selected key
              </Text>
              <div className="insp-pos">KEY {String(selectedKey).padStart(2, "0")}</div>
            </div>
            <div className="insp-glyph">
              {bindingLabel(studio.behaviors, currentBinding)}
            </div>
            <dl className="insp-kv">
              <dt>behavior</dt>
              <dd>{prettyBehaviorName(behaviorName(studio.behaviors, currentBinding.behaviorId))}</dd>
              <dt>param</dt>
              <dd>
                {currentBinding.param1}
                {currentBinding.param2 ? ` · ${currentBinding.param2}` : ""}
              </dd>
            </dl>
            <Popover
              opened={advancedOpen}
              onChange={onAdvancedOpen}
              width={300}
              position="bottom-end"
              withArrow
              shadow="md"
              trapFocus
            >
              <Popover.Target>
                <Button
                  size="xs"
                  variant="default"
                  fullWidth
                  onClick={() => onAdvancedOpen(!advancedOpen)}
                >
                  {advancedOpen ? "收起高级编辑" : "重新分配 / 高级"}
                </Button>
              </Popover.Target>
              <Popover.Dropdown>
                <BindingPicker
                  keyPosition={selectedKey}
                  behaviors={studio.behaviors}
                  current={currentBinding}
                  onApply={(binding) => {
                    onAssign(selectedKey, binding);
                    onAdvancedOpen(false);
                  }}
                  onClose={() => onAdvancedOpen(false)}
                />
              </Popover.Dropdown>
            </Popover>
          </Stack>
        </Card>
      )}
    </section>
  );
}
