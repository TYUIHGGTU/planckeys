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
  findKpBehavior,
  serializeBinding,
  type BindingCandidate,
} from "../keymap/candidateBindings";
import {
  BASIC_LAYOUT_ROWS,
  BASIC_LAYOUT_TAB,
  isGap,
} from "../keymap/basicLayout";
import type { StudioController } from "../shared/hooks/useStudioDevice";
import type { CandidateHeightController } from "./useCandidateHeight";

function CandidateButton({
  candidate,
  selectedKey,
  onApply,
  square,
}: {
  candidate: BindingCandidate;
  selectedKey: number | null;
  onApply: (binding: Binding) => void;
  square?: boolean;
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
        className={square ? "candidate-key candidate-key--square" : "candidate-key"}
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
  const kp = useMemo(
    () => findKpBehavior(studio.behaviors),
    [studio.behaviors],
  );
  const groups = useMemo(() => {
    const base = candidateGroups(candidates);
    return kp ? [BASIC_LAYOUT_TAB, ...base] : base;
  }, [candidates, kp]);
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
          <Text className="eyebrow" component="span">
            candidates
          </Text>
          <span className="candidate-hint">
            {selectedKey === null
              ? "选择键位后点击应用，或直接拖放"
              : `点击应用到 KEY ${String(selectedKey).padStart(2, "0")}`}
          </span>
        </div>
        <TextInput
          size="xs"
          w={220}
          radius="sm"
          placeholder="search behaviors…"
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
        {!normalizedQuery && group === BASIC_LAYOUT_TAB && kp ? (
          <div className="candidate-layout">
            {BASIC_LAYOUT_ROWS.map((row, rowIndex) => (
              <div className="candidate-layout-row" key={rowIndex}>
                {row.map((item, itemIndex) =>
                  isGap(item) ? (
                    <span
                      key={`gap-${rowIndex}-${itemIndex}`}
                      className="candidate-layout-gap"
                      style={{ flexBasis: `calc(var(--layout-key) * ${item.gap})` }}
                    />
                  ) : (
                    <CandidateButton
                      key={`${rowIndex}-${item.value}-${itemIndex}`}
                      square
                      candidate={{
                        id: `layout-${item.value}`,
                        label: item.label,
                        group: BASIC_LAYOUT_TAB,
                        search: "",
                        binding: {
                          behaviorId: kp.id,
                          param1: item.value,
                          param2: 0,
                        },
                      }}
                      selectedKey={selectedKey}
                      onApply={onApply}
                    />
                  ),
                )}
              </div>
            ))}
          </div>
        ) : (
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
        )}
      </ScrollArea>
    </section>
  );
}
