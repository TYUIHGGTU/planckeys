import { useEffect, useState } from "react";
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
    <div className="card binding-picker">
      <h2>编辑位置 {keyPosition}</h2>

      <label className="field">
        Behavior
        <select
          value={behaviorId}
          onChange={(e) => setBehaviorId(Number(e.target.value))}
        >
          {behaviors.map((b) => (
            <option key={b.id} value={b.id}>
              {b.displayName}
            </option>
          ))}
        </select>
      </label>

      <label className="field">
        常用键 (→ param1)
        <select
          value=""
          onChange={(e) => {
            if (e.target.value) setParam1(e.target.value);
          }}
        >
          <option value="">选择填入 param1…</option>
          {COMMON_KB_USAGES.map((u) => (
            <option key={u.value} value={u.value}>
              {u.label}
            </option>
          ))}
        </select>
      </label>

      <div className="param-row">
        <label className="field shrink">
          param1
          <input
            className="hex"
            value={param1}
            onChange={(e) => setParam1(e.target.value)}
          />
        </label>
        <label className="field shrink">
          param2
          <input
            className="hex"
            value={param2}
            onChange={(e) => setParam2(e.target.value)}
          />
        </label>
      </div>

      <div className="toolbar">
        <button
          className="primary"
          onClick={() =>
            onApply({
              behaviorId,
              param1: parseNum(param1),
              param2: parseNum(param2),
            })
          }
        >
          应用（立即生效）
        </button>
        <button onClick={onClose}>取消</button>
      </div>
      <div className="hint">
        param 支持十进制或 0x 十六进制。`&kp` 的 param1 是编码后的 HID usage，可用上方「常用键」快速填入。
      </div>
    </div>
  );
}
