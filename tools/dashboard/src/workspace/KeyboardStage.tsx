import {
  ActionIcon,
  Badge,
  Button,
  Card,
  Group,
  Popover,
  Stack,
  Text,
  Title,
  Tooltip,
} from "@mantine/core";
import type { Binding } from "../device/studio/rpc";
import { bindingLabel } from "../keymap/bindingLabels";
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
  onAssign: (position: number, binding: Binding) => void;
  advancedOpen: boolean;
  onAdvancedOpen: (open: boolean) => void;
}

const SYNC_META: Record<
  StudioSyncState,
  { label: string; color: string }
> = {
  idle: { label: "等待连接", color: "gray" },
  applying: { label: "正在应用", color: "blue" },
  pending: { label: "等待自动保存", color: "yellow" },
  saving: { label: "正在保存", color: "blue" },
  saved: { label: "已保存", color: "teal" },
  error: { label: "同步失败", color: "red" },
};

function SyncBadge({ studio }: { studio: StudioController }) {
  const meta = SYNC_META[studio.syncState];
  return (
    <Tooltip label={studio.syncError ?? meta.label} withArrow disabled={!studio.syncError}>
      <Badge
        variant="light"
        color={meta.color}
        size="sm"
        radius="sm"
        styles={{ root: { textTransform: "none" } }}
      >
        {meta.label}
      </Badge>
    </Tooltip>
  );
}

const layerTitle = (name: string | undefined, index: number): string =>
  name || (index === 0 ? "默认层" : `功能层 ${index}`);

export function KeyboardStage({
  studio,
  selectedKey,
  onSelectKey,
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

  return (
    <section className="keyboard-stage">
      <Group justify="space-between" align="flex-end" wrap="nowrap">
        <div>
          <Text size="xs" c="dimmed">
            {studio.deviceName ?? "PlanckKeys L"}
          </Text>
          <Title order={1}>{layerTitle(layer?.name, studio.selectedLayer)}</Title>
        </div>
        <SyncBadge studio={studio} />
      </Group>

      <div className="keyboard-center" ref={scale.containerRef}>
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

      {showKeyboard && (
        <Card className="zoom-controls" p={4} withBorder radius="md">
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
        <Card className="key-inspector" withBorder radius="md" p="sm">
          <Stack gap={8}>
            <div>
              <Text className="eyebrow" component="span">
                选中键
              </Text>
              <Text fw={700} c="brand" fz={16} truncate>
                {bindingLabel(studio.behaviors, currentBinding)}
              </Text>
              <Text size="xs" c="dimmed" ff="monospace">
                KEY {String(selectedKey + 1).padStart(2, "0")}
              </Text>
            </div>
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
                  {advancedOpen ? "收起高级编辑" : "高级编辑"}
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
