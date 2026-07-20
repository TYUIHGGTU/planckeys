import { Badge, Button, Group, Text, Tooltip } from "@mantine/core";

interface Props {
  label: string;
  connected: boolean;
  detail: string | null;
  busy?: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
}

export function ConnectBar({
  label,
  connected,
  detail,
  busy,
  onConnect,
  onDisconnect,
}: Props) {
  return (
    <Group gap={8} wrap="nowrap">
      <Badge
        variant={connected ? "light" : "default"}
        color={connected ? "teal" : "gray"}
        size="sm"
        radius="sm"
        styles={{ root: { textTransform: "none" } }}
      >
        {label}
      </Badge>
      <Tooltip
        label={connected ? detail ?? "已连接" : busy ? "连接中…" : "未连接"}
        withArrow
        disabled={!connected && !busy}
      >
        <Text size="xs" c={connected ? "teal.6" : "dimmed"} maw={120} truncate>
          {connected ? detail ?? "已连接" : busy ? "连接中…" : "未连接"}
        </Text>
      </Tooltip>
      {connected ? (
        <Button size="xs" variant="default" onClick={onDisconnect}>
          断开
        </Button>
      ) : (
        <Button size="xs" loading={busy} onClick={onConnect}>
          连接
        </Button>
      )}
    </Group>
  );
}
