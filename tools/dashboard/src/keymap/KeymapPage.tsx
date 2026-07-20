import { useState } from "react";
import type { StudioController } from "../shared/hooks/useStudioDevice";
import { BindingPicker } from "./components/BindingPicker";
import { LayerTabs } from "./components/LayerTabs";
import { PhysicalKeyboard } from "./components/PhysicalKeyboard";
import { SaveBar } from "./components/SaveBar";

interface Props {
  studio: StudioController;
}

export function KeymapPage({ studio }: Props) {
  const [selectedKey, setSelectedKey] = useState<number | null>(null);

  if (!studio.connected) {
    return (
      <div className="card">
        <h2>键位</h2>
        <div className="hint">
          请先在顶栏点「连接 Studio」，选中键盘的 CDC 串口。需固件已编入
          <code>studio-rpc-usb-uart</code> snippet + <code>CONFIG_ZMK_STUDIO=y</code>。
          {studio.loading ? " 正在载入…" : ""}
        </div>
      </div>
    );
  }

  const { keymap, layouts, behaviors, selectedLayer } = studio;
  if (!keymap || !layouts) {
    return (
      <div className="card">
        <h2>键位</h2>
        <div className="hint">载入 keymap 中…</div>
      </div>
    );
  }

  const layout = layouts.layouts[layouts.activeLayoutIndex] ?? layouts.layouts[0];
  const layer = keymap.layers[selectedLayer];
  const currentBinding =
    selectedKey != null ? layer?.bindings[selectedKey] : undefined;

  return (
    <div className="keymap-layout">
      <div className="card keymap-main">
        <div className="keymap-toolbar">
          <LayerTabs
            layers={keymap.layers}
            selected={selectedLayer}
            onSelect={(i) => {
              studio.selectLayer(i);
              setSelectedKey(null);
            }}
          />
          <SaveBar
            unsaved={studio.unsaved}
            onSave={studio.save}
            onDiscard={studio.discard}
          />
        </div>

        {layout && layer ? (
          <PhysicalKeyboard
            layout={layout}
            layer={layer}
            behaviors={behaviors}
            selectedKey={selectedKey}
            onSelectKey={setSelectedKey}
          />
        ) : (
          <div className="hint">没有可渲染的物理布局或层。</div>
        )}
        <div className="hint">
          点一个键选中，右侧改它的 behavior/参数；「应用」即时生效（走官方
          setLayerBinding），改完记得「保存」写入 settings。
        </div>
      </div>

      {selectedKey != null && (
        <BindingPicker
          keyPosition={selectedKey}
          behaviors={behaviors}
          current={currentBinding}
          onApply={(binding) => {
            void studio.applyBinding(selectedKey, binding);
          }}
          onClose={() => setSelectedKey(null)}
        />
      )}
    </div>
  );
}
