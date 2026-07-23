import { Button, Popover, ScrollArea, Text } from "@mantine/core";
import { LogPanel } from "../shared/components/LogPanel";
import type { StudioController } from "../shared/hooks/useStudioDevice";

interface Props {
  studio: StudioController;
  onLayerChange: () => void;
}

const layerName = (name: string, index: number): string =>
  name || (index === 0 ? "默认层" : `功能层 ${index}`);

export function LayerRail({ studio, onLayerChange }: Props) {
  const layers = studio.keymap?.layers ?? [];
  const profile = studio.keyboardProfile;
  const deviceName = studio.deviceName ?? profile?.displayName ?? "未连接设备";
  const usagePage =
    profile != null ? `0x${profile.hidUsagePage.toString(16)}` : "—";

  return (
    <aside className="layer-rail">
      <div className="rail-device">
        <Text className="eyebrow" component="span">
          keyboard
        </Text>
        <span className="rail-device-name">{deviceName}</span>
        <span className="rail-device-sub">
          {profile ? `${profile.ledCount} led · zmk studio` : "connect studio"}
        </span>
      </div>

      <div className="rail-layers">
        <Text className="eyebrow rail-layers-head" component="span">
          layers
        </Text>
        <ScrollArea className="layer-scroll" type="auto">
          {layers.map((layer, index) => (
            <button
              key={layer.id}
              type="button"
              className={
                "layer-item" + (studio.selectedLayer === index ? " sel" : "")
              }
              onClick={() => {
                studio.selectLayer(index);
                onLayerChange();
              }}
            >
              <span>{layerName(layer.name, index)}</span>
              <span className="layer-item-reg">
                L{String(index).padStart(2, "0")}
              </span>
            </button>
          ))}
          {!studio.connected && (
            <Text size="xs" c="dimmed" px={4} py={8} lh={1.5}>
              连接 Studio 后加载图层。
            </Text>
          )}
        </ScrollArea>
      </div>

      <div className="rail-foot">
        <div>zmk · {usagePage}</div>
        <div>
          h = 6.62607015 × 10<sup>−34</sup> J·s
        </div>
      </div>

      <Popover width={360} position="top-start" withArrow shadow="md">
        <Popover.Target>
          <Button variant="subtle" size="compact-xs" fullWidth justify="flex-start">
            设备日志
          </Button>
        </Popover.Target>
        <Popover.Dropdown p="sm">
          <LogPanel />
        </Popover.Dropdown>
      </Popover>
    </aside>
  );
}
