import { Group, SegmentedControl, Text, Title } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { ConnectBar } from "../shared/components/ConnectBar";
import type { LedController } from "../shared/hooks/useLedDevice";
import type { StudioController } from "../shared/hooks/useStudioDevice";
import { THEME_OPTIONS, type ThemeController } from "./useTheme";

interface Props {
  led: LedController;
  studio: StudioController;
  theme: ThemeController;
}

const notifyError = (title: string, error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  notifications.show({ color: "red", title, message });
};

export function TopBar({ led, studio, theme }: Props) {
  const connectLed = () => {
    if (!studio.supportsLighting) {
      notifications.show({
        color: "yellow",
        title: "当前设备无灯效 profile",
        message: "仅支持改键；请连接带 LED profile 的键盘",
      });
      return;
    }
    led
      .connect()
      .then(() =>
        notifications.show({ color: "teal", title: "HID 已连接", message: "灯效控制就绪" }),
      )
      .catch((error) => notifyError("HID 连接失败", error));
  };

  const connectStudio = () => {
    studio
      .connect()
      .then(() =>
        notifications.show({
          color: "teal",
          title: "Studio 已连接",
          message: "键位编辑就绪；有灯效 profile 时显示灯光面板",
        }),
      )
      .catch((error) => notifyError("Studio 连接失败", error));
  };

  return (
    <header className="ws-topbar">
      <Group gap={10} wrap="nowrap" className="ws-brand">
        <span className="ws-brand-mark">P</span>
        <div>
          <Title order={3} fz={15} lh={1.1}>
            PlanckKeys
          </Title>
          <Text size="xs" c="dimmed" lh={1.2}>
            键盘工作台
          </Text>
        </div>
      </Group>

      <Group gap={20} wrap="nowrap" ml="auto">
        {studio.supportsLighting && (
          <ConnectBar
            label="HID"
            connected={led.connected}
            detail={led.productName}
            onConnect={connectLed}
            onDisconnect={() => void led.disconnect()}
          />
        )}
        <ConnectBar
          label="Studio"
          connected={studio.connected}
          busy={studio.loading}
          detail={studio.deviceName}
          onConnect={connectStudio}
          onDisconnect={() => void studio.disconnect()}
        />
      </Group>

      <SegmentedControl
        size="xs"
        value={theme.mode}
        onChange={(value) => theme.setMode(value as ThemeController["mode"])}
        data={THEME_OPTIONS.map((option) => ({
          value: option.value,
          label: option.label,
        }))}
        aria-label="界面主题"
      />
    </header>
  );
}
