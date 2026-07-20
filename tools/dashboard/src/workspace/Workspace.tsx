import {
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type DragEvent,
} from "react";
import { LedZone, type ZoneConfig } from "../device/hid/protocol";
import type { Binding } from "../device/studio/rpc";
import {
  BINDING_DRAG_TYPE,
  buildBindingCandidates,
  candidateGroups,
  serializeBinding,
  type BindingCandidate,
} from "../keymap/candidateBindings";
import { bindingLabel } from "../keymap/bindingLabels";
import { BindingPicker } from "../keymap/components/BindingPicker";
import { PhysicalKeyboard } from "../keymap/components/PhysicalKeyboard";
import { hexToRgb, normalizeHex } from "../led/color";
import { PRESETS, QUICK_COLORS } from "../led/constants";
import { AxisGrid } from "../led/components/AxisGrid";
import { UnderGrid } from "../led/components/UnderGrid";
import { ledIndexForKeyPosition } from "../led/keyLedMap";
import { COLOR_SCHEMES } from "../led/schemes";
import { ConnectBar } from "../shared/components/ConnectBar";
import { LogPanel } from "../shared/components/LogPanel";
import type { LedController } from "../shared/hooks/useLedDevice";
import type {
  StudioController,
  StudioSyncState,
} from "../shared/hooks/useStudioDevice";
import {
  useCandidateHeight,
  type CandidateHeightController,
} from "./useCandidateHeight";
import { useKeyboardScale } from "./useKeyboardScale";
import {
  THEME_OPTIONS,
  type ThemeController,
  type ThemeMode,
} from "./useTheme";

interface Props {
  led: LedController;
  studio: StudioController;
  theme: ThemeController;
  hint: string | null;
}

const SYNC_LABELS: Record<StudioSyncState, string> = {
  idle: "等待连接",
  applying: "正在应用",
  pending: "等待自动保存",
  saving: "正在保存",
  saved: "所有修改已保存",
  error: "同步失败",
};

function TopBar({
  led,
  studio,
  theme,
}: {
  led: LedController;
  studio: StudioController;
  theme: ThemeController;
}) {
  return (
    <header className="ws-topbar">
      <div className="ws-brand">
        <span className="ws-brand-mark">P</span>
        <div>
          <strong>PlanckKeys</strong>
          <small>键盘工作台</small>
        </div>
      </div>
      <div className="ws-connections">
        <ConnectBar
          label="HID"
          connected={led.connected}
          detail={led.productName}
          onConnect={() => void led.connect().catch(() => undefined)}
          onDisconnect={() => void led.disconnect()}
        />
        <ConnectBar
          label="Studio"
          connected={studio.connected}
          busy={studio.loading}
          detail={studio.deviceName}
          onConnect={() => void studio.connect().catch(() => undefined)}
          onDisconnect={() => void studio.disconnect()}
        />
      </div>
      <label className="theme-select">
        <span>主题</span>
        <select
          value={theme.mode}
          onChange={(event) => theme.setMode(event.target.value as ThemeMode)}
          aria-label="界面主题"
        >
          {THEME_OPTIONS.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
    </header>
  );
}

function LayerRail({
  studio,
  onLayerChange,
}: {
  studio: StudioController;
  onLayerChange: () => void;
}) {
  const layers = studio.keymap?.layers ?? [];
  return (
    <aside className="layer-rail">
      <span className="eyebrow">LAYERS</span>
      <div className="layer-list">
        {layers.map((layer, index) => (
          <button
            key={layer.id}
            className={studio.selectedLayer === index ? "active" : ""}
            onClick={() => {
              studio.selectLayer(index);
              onLayerChange();
            }}
          >
            <strong>{index}</strong>
            <small>{layer.name || (index === 0 ? "默认层" : `功能层 ${index}`)}</small>
          </button>
        ))}
        {!studio.connected && <p>连接 Studio 后加载层</p>}
      </div>
      <details className="log-trigger">
        <summary>设备日志</summary>
        <div className="log-popover">
          <LogPanel />
        </div>
      </details>
    </aside>
  );
}

function SyncState({ studio }: { studio: StudioController }) {
  return (
    <div
      className={`sync-state ${studio.syncState === "error" ? "error" : ""}`}
      title={studio.syncError ?? undefined}
    >
      <span className="status-dot" />
      {SYNC_LABELS[studio.syncState]}
    </div>
  );
}

function KeyboardStage({
  studio,
  selectedKey,
  onSelectKey,
  onAssign,
  advancedOpen,
  onAdvancedOpen,
}: {
  studio: StudioController;
  selectedKey: number | null;
  onSelectKey: (position: number) => void;
  onAssign: (position: number, binding: Binding) => void;
  advancedOpen: boolean;
  onAdvancedOpen: (open: boolean) => void;
}) {
  const keymap = studio.keymap;
  const layouts = studio.layouts;
  const layer = keymap?.layers[studio.selectedLayer];
  const layout =
    layouts?.layouts[layouts.activeLayoutIndex] ?? layouts?.layouts[0];
  const currentBinding =
    selectedKey !== null ? layer?.bindings[selectedKey] : undefined;
  const scale = useKeyboardScale(layout);
  const showKeyboard = studio.connected && layout && layer;

  return (
    <section className="keyboard-stage">
      <div className="stage-heading">
        <div>
          <span>{studio.deviceName ?? "PlanckKeys L"}</span>
          <h1>{layer?.name || (studio.selectedLayer === 0 ? "默认层" : `功能层 ${studio.selectedLayer}`)}</h1>
        </div>
        <SyncState studio={studio} />
      </div>

      <div className="keyboard-center" ref={scale.containerRef}>
        {showKeyboard ? (
          <PhysicalKeyboard
            layout={layout}
            layer={layer}
            behaviors={studio.behaviors}
            selectedKey={selectedKey}
            onSelectKey={onSelectKey}
            onDropBinding={onAssign}
            unitPx={scale.unitPx}
          />
        ) : (
          <div className="workspace-empty">
            <strong>连接 Studio 开始编辑键位</strong>
            <span>连接后将读取真实物理布局、层和 behavior。</span>
          </div>
        )}
      </div>

      {showKeyboard && (
        <div className="zoom-controls" role="group" aria-label="键盘缩放">
          <button
            onClick={scale.zoomOut}
            disabled={!scale.canZoomOut}
            aria-label="缩小"
          >
            −
          </button>
          <button
            className="zoom-value"
            onClick={scale.resetZoom}
            title="恢复自适应大小"
          >
            {scale.zoomPercent}%
          </button>
          <button
            onClick={scale.zoomIn}
            disabled={!scale.canZoomIn}
            aria-label="放大"
          >
            +
          </button>
        </div>
      )}

      {selectedKey !== null && currentBinding && (
        <div className="key-inspector">
          <div>
            <span className="eyebrow">SELECTED KEY</span>
            <strong>{bindingLabel(studio.behaviors, currentBinding)}</strong>
          </div>
          <span>KEY {String(selectedKey + 1).padStart(2, "0")}</span>
          <button onClick={() => onAdvancedOpen(!advancedOpen)}>
            {advancedOpen ? "收起高级编辑" : "高级编辑"}
          </button>
        </div>
      )}

      {advancedOpen && selectedKey !== null && (
        <div className="advanced-picker">
          <BindingPicker
            keyPosition={selectedKey}
            behaviors={studio.behaviors}
            current={currentBinding}
            onApply={(binding) => onAssign(selectedKey, binding)}
            onClose={() => onAdvancedOpen(false)}
          />
        </div>
      )}
    </section>
  );
}

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
    <button
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
      <small>{candidate.group}</small>
    </button>
  );
}

function CandidatePanel({
  studio,
  selectedKey,
  onApply,
  size,
}: {
  studio: StudioController;
  selectedKey: number | null;
  onApply: (binding: Binding) => void;
  size: CandidateHeightController;
}) {
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

  const visible = candidates.filter((candidate) => {
    const matchesGroup = candidate.group === group;
    const normalizedQuery = query.trim().toLowerCase();
    return (
      matchesGroup &&
      (!normalizedQuery ||
        candidate.label.toLowerCase().includes(normalizedQuery) ||
        candidate.search.includes(normalizedQuery))
    );
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
          <strong>候选键</strong>
          <span>
            {selectedKey === null
              ? "先选择键位后点击应用，或直接拖放"
              : `点击将应用到 KEY ${selectedKey + 1}`}
          </span>
        </div>
        <label className="candidate-search">
          <span>搜索</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="键值或行为"
          />
        </label>
      </div>
      <div className="candidate-tabs">
        {groups.map((item) => (
          <button
            key={item}
            className={item === group ? "active" : ""}
            onClick={() => {
              setGroup(item);
              setQuery("");
            }}
          >
            {item}
          </button>
        ))}
      </div>
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
          <span className="candidate-empty">当前分类没有可用候选键。</span>
        )}
        {!studio.connected && (
          <span className="candidate-empty">
            连接 Studio 后会根据固件 behaviors 生成真实候选项。
          </span>
        )}
      </div>
    </section>
  );
}

function RangeControl({
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
    <label className="range-control">
      <span>{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <output>{value}</output>
    </label>
  );
}

function ZoneControls({
  config,
  zone,
  led,
}: {
  config: ZoneConfig;
  zone: LedZone;
  led: LedController;
}) {
  return (
    <>
      <div className="mode-grid">
        {PRESETS.map((preset) => (
          <button
            key={preset.mode}
            className={config.mode === preset.mode ? "active" : ""}
            onClick={() => led.setZoneMode(zone, preset.mode)}
          >
            {preset.label}
          </button>
        ))}
      </div>
      <RangeControl
        label="亮度"
        value={config.brightness}
        min={0}
        max={255}
        onChange={(value) => led.setZoneBrightness(zone, value)}
      />
      <RangeControl
        label="速度"
        value={config.speed}
        min={1}
        max={30}
        onChange={(value) => led.setZoneSpeed(zone, value)}
      />
    </>
  );
}

function LightingPanel({
  led,
  selectedKey,
}: {
  led: LedController;
  selectedKey: number | null;
}) {
  const [zone, setZone] = useState<LedZone>(LedZone.Axis);
  const [hexInput, setHexInput] = useState(led.baseColor);
  const config = zone === LedZone.Axis ? led.axis : led.underglow;

  useEffect(() => setHexInput(led.baseColor), [led.baseColor]);

  const commitHex = () => {
    const normalized = normalizeHex(hexInput);
    if (normalized) {
      led.setBaseColorOnly(normalized);
      setHexInput(normalized);
    } else {
      setHexInput(led.baseColor);
    }
  };

  const applyToSelectedKey = () => {
    if (selectedKey === null) return;
    const ledIndex = ledIndexForKeyPosition(selectedKey);
    if (ledIndex !== null) led.setPixelColor(ledIndex, hexToRgb(led.baseColor));
  };

  return (
    <aside className="lighting-panel">
      <div className="lighting-heading">
        <div>
          <span className="eyebrow">LIGHTING</span>
          <h2>灯光配置</h2>
        </div>
        <span className={led.connected ? "auto-apply" : "offline-badge"}>
          {led.connected ? "实时应用" : "HID 未连接"}
        </span>
      </div>

      {led.error && <div className="inline-error">{led.error}</div>}

      <fieldset disabled={!led.connected}>
        <div className="light-target-tabs">
          <button
            type="button"
            className={zone === LedZone.Axis ? "active" : ""}
            onClick={() => setZone(LedZone.Axis)}
          >
            轴灯
          </button>
          <button
            type="button"
            className={zone === LedZone.Underglow ? "active" : ""}
            onClick={() => setZone(LedZone.Underglow)}
          >
            底灯
          </button>
        </div>

        <section className="lighting-section">
          <div className="section-heading">
            <strong>独立灯效</strong>
            <span>{zone === LedZone.Axis ? "22 颗轴灯" : "6 颗底灯"}</span>
          </div>
          <ZoneControls config={config} zone={zone} led={led} />
        </section>

        <section className="lighting-section">
          <div className="section-heading">
            <strong>预置配色</strong>
          </div>
          <div className="scheme-grid">
            {COLOR_SCHEMES.map((scheme) => (
              <button key={scheme.id} onClick={() => led.applyScheme(scheme)}>
                <span>
                  {scheme.preview.map((color, index) => (
                    <i key={index} style={{ background: color }} />
                  ))}
                </span>
                <small>{scheme.name}</small>
              </button>
            ))}
          </div>
        </section>

        <section className="lighting-section">
          <div className="section-heading">
            <strong>自定义颜色</strong>
          </div>
          <div className="custom-color-row">
            <input
              type="color"
              value={led.baseColor}
              onChange={(event) => {
                setHexInput(event.target.value);
                led.setBaseColorOnly(event.target.value);
              }}
            />
            <input
              className="hex-input"
              value={hexInput}
              onChange={(event) => setHexInput(event.target.value)}
              onBlur={commitHex}
              onKeyDown={(event) => {
                if (event.key === "Enter") commitHex();
              }}
            />
            <button
              className="apply-color"
              onClick={applyToSelectedKey}
              disabled={selectedKey === null}
            >
              应用到所选键
            </button>
          </div>
          <div className="color-swatches">
            {QUICK_COLORS.map((color) => (
              <button
                key={color}
                style={{ background: color }}
                onClick={() => {
                  setHexInput(color);
                  led.setBaseColorOnly(color);
                }}
                aria-label={color}
              />
            ))}
          </div>
          <button
            className="fill-zone"
            onClick={() =>
              led.fillSubset(
                zone === LedZone.Axis
                  ? Array.from({ length: 22 }, (_, index) => index + 6)
                  : [0, 1, 2, 3, 4, 5],
                hexToRgb(led.baseColor),
              )
            }
          >
            用当前颜色填充{zone === LedZone.Axis ? "轴灯" : "底灯"}
          </button>
        </section>

        <section className="lighting-section pixel-section">
          <div className="section-heading">
            <strong>{zone === LedZone.Axis ? "轴灯画布" : "底灯画布"}</strong>
            <span>点击单颗开关</span>
          </div>
          {zone === LedZone.Axis ? (
            <AxisGrid pixels={led.pixels} onToggle={led.togglePixel} />
          ) : (
            <UnderGrid pixels={led.pixels} onToggle={led.togglePixel} />
          )}
        </section>
      </fieldset>
    </aside>
  );
}

export function Workspace({ led, studio, theme, hint }: Props) {
  const [selectedKey, setSelectedKey] = useState<number | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const candidateSize = useCandidateHeight();

  const assignBinding = (position: number, binding: Binding) => {
    setSelectedKey(position);
    void studio.applyBinding(position, binding);
  };

  return (
    <div className="ws-app">
      <TopBar led={led} studio={studio} theme={theme} />
      <div className="ws-body">
        {hint && <div className="browser-banner">{hint}</div>}
        <main
          className="workspace"
          style={
            { "--candidate-height": `${candidateSize.height}px` } as CSSProperties
          }
        >
          <LayerRail
            studio={studio}
            onLayerChange={() => {
              setSelectedKey(null);
              setAdvancedOpen(false);
            }}
          />
          <KeyboardStage
            studio={studio}
            selectedKey={selectedKey}
            onSelectKey={(position) => {
              setSelectedKey(position);
              setAdvancedOpen(false);
            }}
            onAssign={assignBinding}
            advancedOpen={advancedOpen}
            onAdvancedOpen={setAdvancedOpen}
          />
          <CandidatePanel
            studio={studio}
            selectedKey={selectedKey}
            onApply={(binding) => {
              if (selectedKey !== null) assignBinding(selectedKey, binding);
            }}
            size={candidateSize}
          />
          <LightingPanel led={led} selectedKey={selectedKey} />
        </main>
      </div>
    </div>
  );
}
