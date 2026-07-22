import { useEffect, useState } from "react";
import {
  Alert,
  Badge,
  Button,
  ColorInput,
  ColorSwatch,
  Divider,
  Fieldset,
  Group,
  SegmentedControl,
  SimpleGrid,
  Slider,
  Stack,
  Text,
  Title,
  UnstyledButton,
} from "@mantine/core";
import type { KeyboardProfile } from "@planckeys/keyboard-profile";
import { LedZone } from "../device/hid/protocol";
import { hexToRgb, normalizeHex } from "../led/color";
import { PRESETS, QUICK_COLORS } from "../led/constants";
import { AxisGrid } from "../led/components/AxisGrid";
import { UnderGrid } from "../led/components/UnderGrid";
import { ledIndexForKeyPosition } from "../led/keyLedMap";
import { COLOR_SCHEMES } from "../led/schemes";
import type { LedController } from "../shared/hooks/useLedDevice";

interface Props {
  led: LedController;
  profile: KeyboardProfile;
  selectedKey: number | null;
}

function SliderRow({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return (
    <Group gap="sm" wrap="nowrap" align="center">
      <Text size="xs" c="dimmed" w={32}>
        {label}
      </Text>
      <Slider
        flex={1}
        size="sm"
        min={min}
        max={max}
        value={value}
        onChange={onChange}
        label={value}
      />
      <Text size="xs" ff="monospace" w={30} ta="right">
        {value}
      </Text>
    </Group>
  );
}

export function LightingPanel({ led, profile, selectedKey }: Props) {
  const [zone, setZone] = useState<LedZone>(LedZone.Axis);
  const [hexInput, setHexInput] = useState(led.baseColor);
  const config = zone === LedZone.Axis ? led.axis : led.underglow;

  useEffect(() => setHexInput(led.baseColor), [led.baseColor]);

  const commitHex = (value: string) => {
    const normalized = normalizeHex(value);
    if (normalized) {
      led.setBaseColorOnly(normalized);
      setHexInput(normalized);
    } else {
      setHexInput(led.baseColor);
    }
  };

  const applyToSelectedKey = () => {
    if (selectedKey === null) return;
    const ledIndex = ledIndexForKeyPosition(selectedKey, profile);
    if (ledIndex !== null) led.setPixelColor(ledIndex, hexToRgb(led.baseColor));
  };

  const fillZone = () =>
    led.fillSubset(
      zone === LedZone.Axis ? profile.axisIndices : profile.underglowIndices,
      hexToRgb(led.baseColor),
    );

  const zoneName = zone === LedZone.Axis ? "轴灯" : "底灯";

  return (
    <aside className="lighting-panel">
      <Group justify="space-between" align="center" mb="sm">
        <div>
          <Text className="eyebrow" component="span">
            灯光
          </Text>
          <Title order={2}>灯光配置</Title>
        </div>
        <Badge
          variant={led.connected ? "light" : "default"}
          color={led.connected ? "teal" : "gray"}
          size="sm"
          radius="sm"
          styles={{ root: { textTransform: "none" } }}
        >
          {led.connected ? "实时应用" : "HID 未连接"}
        </Badge>
      </Group>

      {led.error && (
        <Alert color="red" mb="sm" p="xs" radius="md">
          <Text size="xs">{led.error}</Text>
        </Alert>
      )}

      <Fieldset variant="unstyled" disabled={!led.connected} p={0}>
        <SegmentedControl
          fullWidth
          size="xs"
          mb="md"
          value={String(zone)}
          onChange={(value) => setZone(Number(value) as LedZone)}
          data={[
            { value: String(LedZone.Axis), label: "轴灯" },
            { value: String(LedZone.Underglow), label: "底灯" },
          ]}
        />

        <Stack gap="xs">
          <Group justify="space-between">
            <Text size="xs" fw={600}>
              独立灯效
            </Text>
            <Text size="xs" c="dimmed">
              {zone === LedZone.Axis
                ? `${profile.axisIndices.length} 颗轴灯`
                : `${profile.underglowIndices.length} 颗底灯`}
            </Text>
          </Group>
          <SegmentedControl
            fullWidth
            size="xs"
            value={String(config.mode)}
            onChange={(value) => led.setZoneMode(zone, Number(value))}
            data={PRESETS.map((preset) => ({
              value: String(preset.mode),
              label: preset.label,
            }))}
          />
          <SliderRow
            label="亮度"
            value={config.brightness}
            min={0}
            max={255}
            onChange={(value) => led.setZoneBrightness(zone, value)}
          />
          <SliderRow
            label="速度"
            value={config.speed}
            min={1}
            max={30}
            onChange={(value) => led.setZoneSpeed(zone, value)}
          />
        </Stack>

        <Divider my="md" />

        <Text size="xs" fw={600} mb="xs">
          预置配色
        </Text>
        <SimpleGrid cols={4} spacing="xs">
          {COLOR_SCHEMES.map((scheme) => (
            <UnstyledButton
              key={scheme.id}
              className="scheme-btn"
              onClick={() => led.applyScheme(scheme)}
              title={scheme.name}
            >
              <span className="scheme-preview">
                {scheme.preview.map((color, index) => (
                  <i key={index} style={{ background: color }} />
                ))}
              </span>
              <Text size="xs" c="dimmed" truncate>
                {scheme.name}
              </Text>
            </UnstyledButton>
          ))}
        </SimpleGrid>

        <Divider my="md" />

        <Text size="xs" fw={600} mb="xs">
          自定义颜色
        </Text>
        <ColorInput
          size="xs"
          format="hex"
          value={hexInput}
          onChange={setHexInput}
          onChangeEnd={commitHex}
          swatches={[...QUICK_COLORS]}
          swatchesPerRow={10}
        />
        <Group gap={6} mt="xs">
          {QUICK_COLORS.map((color) => (
            <ColorSwatch
              key={color}
              component="button"
              color={color}
              size={22}
              style={{ cursor: "pointer" }}
              onClick={() => {
                setHexInput(color);
                led.setBaseColorOnly(color);
              }}
              aria-label={color}
            />
          ))}
        </Group>
        <Group grow gap="xs" mt="sm">
          <Button
            size="xs"
            variant="light"
            disabled={selectedKey === null}
            onClick={applyToSelectedKey}
          >
            应用到所选键
          </Button>
          <Button size="xs" variant="light" onClick={fillZone}>
            填充{zoneName}
          </Button>
        </Group>

        <Divider my="md" />

        <Group justify="space-between" mb="xs">
          <Text size="xs" fw={600}>
            {zoneName}画布
          </Text>
          <Text size="xs" c="dimmed">
            点击单颗开关
          </Text>
        </Group>
        {zone === LedZone.Axis ? (
          <AxisGrid
            pixels={led.pixels}
            profile={profile}
            onToggle={led.togglePixel}
          />
        ) : (
          <UnderGrid
            pixels={led.pixels}
            profile={profile}
            onToggle={led.togglePixel}
          />
        )}
      </Fieldset>
    </aside>
  );
}
