import {
  Badge,
  Button,
  NavLink,
  Popover,
  ScrollArea,
  Stack,
  Text,
} from "@mantine/core";
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

  return (
    <aside className="layer-rail">
      <Text className="eyebrow" component="span">
        图层
      </Text>

      <ScrollArea className="layer-scroll" type="auto">
        <Stack gap={4}>
          {layers.map((layer, index) => (
            <NavLink
              key={layer.id}
              active={studio.selectedLayer === index}
              variant="filled"
              label={layerName(layer.name, index)}
              leftSection={
                <Badge
                  size="sm"
                  radius="sm"
                  variant={studio.selectedLayer === index ? "white" : "default"}
                >
                  {index}
                </Badge>
              }
              onClick={() => {
                studio.selectLayer(index);
                onLayerChange();
              }}
              styles={{ label: { fontSize: 13 } }}
            />
          ))}
          {!studio.connected && (
            <Text size="xs" c="dimmed" px={4} lh={1.5}>
              连接 Studio 后加载图层。
            </Text>
          )}
        </Stack>
      </ScrollArea>

      <Popover width={360} position="top-start" withArrow shadow="md">
        <Popover.Target>
          <Button variant="subtle" size="xs" fullWidth justify="flex-start">
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
