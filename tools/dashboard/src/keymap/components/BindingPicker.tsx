import { useEffect, useState } from "react";
import { Button, Group, Select, Stack, Text, TextInput } from "@mantine/core";
import type { BehaviorSummary, Binding } from "../../device/studio/rpc";
import { COMMON_KB_USAGES } from "../hidUsages";

interface Props {
  keyPosition: number;
  behaviors: BehaviorSummary[];
  current: Binding | undefined;
  onApply: (binding: Binding) => void;
  onClose: () => void;
}

const parseNum = (s: string): number => {
  const t = s.trim();
  if (/^0x[0-9a-fA-F]+$/.test(t)) return parseInt(t, 16);
  const n = Number(t);
  return Number.isFinite(n) ? n : 0;
};

export function BindingPicker({
  keyPosition,
  behaviors,
  current,
  onApply,
  onClose,
}: Props) {
  const [behaviorId, setBehaviorId] = useState<number>(
    current?.behaviorId ?? behaviors[0]?.id ?? 0,
  );
  const [param1, setParam1] = useState<string>(String(current?.param1 ?? 0));
  const [param2, setParam2] = useState<string>(String(current?.param2 ?? 0));

  useEffect(() => {
    setBehaviorId(current?.behaviorId ?? behaviors[0]?.id ?? 0);
    setParam1(String(current?.param1 ?? 0));
    setParam2(String(current?.param2 ?? 0));
  }, [keyPosition, current, behaviors]);

  return (
    <Stack gap="sm">
      <Text size="sm" fw={600}>
        高级编辑 · 位置 {keyPosition}
      </Text>

      <Select
        label="Behavior"
        size="xs"
        value={String(behaviorId)}
        onChange={(value) => value && setBehaviorId(Number(value))}
        data={behaviors.map((b) => ({
          value: String(b.id),
          label: b.displayName,
        }))}
        searchable
        comboboxProps={{ withinPortal: true }}
      />

      <Select
        label="常用键（填入 param1）"
        size="xs"
        placeholder="选择键值…"
        value={null}
        onChange={(value) => value && setParam1(value)}
        data={COMMON_KB_USAGES.map((u) => ({
          value: String(u.value),
          label: u.label,
        }))}
        searchable
        clearable
        comboboxProps={{ withinPortal: true }}
      />

      <Group grow gap="sm">
        <TextInput
          label="param1"
          size="xs"
          value={param1}
          onChange={(event) => setParam1(event.currentTarget.value)}
        />
        <TextInput
          label="param2"
          size="xs"
          value={param2}
          onChange={(event) => setParam2(event.currentTarget.value)}
        />
      </Group>

      <Text size="xs" c="dimmed">
        param 支持十进制或 0x 十六进制。`&kp` 的 param1 是编码后的 HID usage，可用上方「常用键」快速填入。
      </Text>

      <Group gap="xs" justify="flex-end">
        <Button size="xs" variant="default" onClick={onClose}>
          取消
        </Button>
        <Button
          size="xs"
          onClick={() =>
            onApply({
              behaviorId,
              param1: parseNum(param1),
              param2: parseNum(param2),
            })
          }
        >
          应用（立即生效）
        </Button>
      </Group>
    </Stack>
  );
}
