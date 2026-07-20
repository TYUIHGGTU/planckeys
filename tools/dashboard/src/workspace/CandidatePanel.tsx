import {
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type DragEvent,
} from "react";
import { ScrollArea, Tabs, Text, TextInput, Tooltip } from "@mantine/core";
import type { Binding } from "../device/studio/rpc";
import {
  BINDING_DRAG_TYPE,
  buildBindingCandidates,
  candidateGroups,
  serializeBinding,
  type BindingCandidate,
} from "../keymap/candidateBindings";
import type { StudioController } from "../shared/hooks/useStudioDevice";
import type { CandidateHeightController } from "./useCandidateHeight";

function CandidateButton({
  candidate,
  selectedKey,
  onApply,
}: {
  candidate: BindingCandidate;
  selectedKey: number | null;
  onApply: (binding: Binding) => void;
}) {
  const onDragStart = (event: DragEvent<HTMLButtonElement>) => {
    event.dataTransfer.setData(
      BINDING_DRAG_TYPE,
      serializeBinding(candidate.binding),
    );
    event.dataTransfer.effectAllowed = "copy";
  };
  return (
    <Tooltip
      label={candidate.title ?? candidate.label}
      withArrow
      openDelay={300}
      disabled={(candidate.title ?? candidate.label) === candidate.label}
    >
      <button
        type="button"
        className="candidate-key"
        draggable
        onDragStart={onDragStart}
        onClick={() => {
          if (selectedKey !== null) onApply(candidate.binding);
        }}
        aria-disabled={selectedKey === null}
        title={
          selectedKey === null
            ? "先在画布中选择一个键；也可以直接拖到目标键位"
            : `应用到 KEY ${selectedKey + 1}`
        }
      >
        <span>{candidate.label}</span>
      </button>
    </Tooltip>
  );
}

interface Props {
  studio: StudioController;
  selectedKey: number | null;
  onApply: (binding: Binding) => void;
  size: CandidateHeightController;
}

export function CandidatePanel({ studio, selectedKey, onApply, size }: Props) {
  const candidates = useMemo(
    () =>
      buildBindingCandidates(
        studio.behaviors,
        studio.keymap?.layers.length ?? 0,
      ),
    [studio.behaviors, studio.keymap?.layers.length],
  );
  const groups = useMemo(() => candidateGroups(candidates), [candidates]);
  const [group, setGroup] = useState("");
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!groups.includes(group)) setGroup(groups[0] ?? "");
  }, [group, groups]);

  const normalizedQuery = query.trim().toLowerCase();
  const visible = candidates.filter((candidate) => {
    if (normalizedQuery) {
      return (
        candidate.label.toLowerCase().includes(normalizedQuery) ||
        candidate.search.includes(normalizedQuery)
      );
    }
    return candidate.group === group;
  });

  return (
    <section
      className="candidate-panel"
      style={{ "--candidate-height": `${size.height}px` } as CSSProperties}
    >
      <div className="candidate-resizer" {...size.resizeProps}>
        <i />
      </div>

      <div className="candidate-header">
        <div className="candidate-title">
          <Text fw={600} size="sm">
            候选键
          </Text>
          <Text size="xs" c="dimmed">
            {selectedKey === null
              ? "先选择键位后点击应用，或直接拖放"
              : `点击将应用到 KEY ${selectedKey + 1}`}
          </Text>
        </div>
        <TextInput
          size="xs"
          w={220}
          placeholder="搜索键值或行为"
          value={query}
          onChange={(event) => setQuery(event.currentTarget.value)}
        />
      </div>

      {!normalizedQuery && (
        <Tabs
          value={group}
          onChange={(value) => setGroup(value ?? "")}
          variant="default"
          className="candidate-tabs"
        >
          <Tabs.List>
            {groups.map((item) => (
              <Tabs.Tab key={item} value={item}>
                {item}
              </Tabs.Tab>
            ))}
          </Tabs.List>
        </Tabs>
      )}

      <ScrollArea className="candidate-scroll" type="auto" offsetScrollbars>
        <div className="candidate-grid">
          {visible.map((candidate) => (
            <CandidateButton
              key={candidate.id}
              candidate={candidate}
              selectedKey={selectedKey}
              onApply={onApply}
            />
          ))}
          {studio.connected && visible.length === 0 && (
            <Text size="xs" c="dimmed" className="candidate-empty">
              没有匹配的候选键。
            </Text>
          )}
          {!studio.connected && (
            <Text size="xs" c="dimmed" className="candidate-empty">
              连接 Studio 后会根据固件 behaviors 生成真实候选项。
            </Text>
          )}
        </div>
      </ScrollArea>
    </section>
  );
}
