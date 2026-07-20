import { Button, Code, Group, ScrollArea, Stack, Text } from "@mantine/core";
import { clearLog, useLog } from "../log";

export function LogPanel() {
  const entries = useLog();
  return (
    <Stack gap={6} h="100%">
      <Group justify="space-between" align="center">
        <Text size="xs" fw={600}>
          设备日志
        </Text>
        <Button size="compact-xs" variant="subtle" onClick={clearLog}>
          清空
        </Button>
      </Group>
      <ScrollArea h={200} type="auto" offsetScrollbars>
        <Stack gap={2}>
          {entries.length === 0 && (
            <Text size="xs" c="dimmed">
              暂无日志。
            </Text>
          )}
          {entries.map((entry, index) => (
            <Code key={index} block style={{ fontSize: 11, background: "transparent", padding: 0 }}>
              [{entry.time}] {entry.msg}
            </Code>
          ))}
        </Stack>
      </ScrollArea>
    </Stack>
  );
}
