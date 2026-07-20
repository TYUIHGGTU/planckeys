import { AXIS_INDICES, UNDERGLOW_INDICES } from "../device/hid/protocol";
import type { LedController } from "../shared/hooks/useLedDevice";
import { hexToRgb } from "./color";
import { AxisGrid } from "./components/AxisGrid";
import { DigitPanel } from "./components/DigitPanel";
import { Palette } from "./components/Palette";
import { PresetBar } from "./components/PresetBar";
import { UnderGrid } from "./components/UnderGrid";

interface Props {
  led: LedController;
}

export function LedPage({ led }: Props) {
  if (!led.connected) {
    return (
      <div className="card">
        <h2>灯效</h2>
        <div className="hint">
          请先在顶栏点「连接 HID」，选中 <code>PlanckKeys L</code>（usage page 0xFF60）。
          需 Chrome / Edge + USB。
        </div>
      </div>
    );
  }

  return (
    <div className="led-layout">
      <div className="led-col">
        <PresetBar
          mode={led.mode}
          brightness={led.brightness}
          speed={led.speed}
          onMode={led.setMode}
          onBrightness={led.setBrightness}
          onSpeed={led.setSpeed}
        />
        <div className="card">
          <h2>底灯（6 颗，正面不可见）</h2>
          <UnderGrid pixels={led.pixels} onToggle={led.togglePixel} />
          <div className="toolbar">
            <button onClick={() => led.fillSubset(UNDERGLOW_INDICES, hexToRgb(led.baseColor))}>
              底灯全填基色
            </button>
            <button onClick={() => led.fillSubset(UNDERGLOW_INDICES, null)}>底灯全熄</button>
          </div>
        </div>
      </div>

      <div className="led-col grow">
        <Palette
          baseColor={led.baseColor}
          onPickColor={led.applyBaseColor}
          onScheme={led.applyScheme}
        />
        <div className="card axis-card">
          <h2>逐颗 RGB · 轴灯（每键一颗，布局同键盘正面）</h2>
          <AxisGrid pixels={led.pixels} onToggle={led.togglePixel} />
          <div className="toolbar">
            <button onClick={() => led.fillSubset(AXIS_INDICES, hexToRgb(led.baseColor))}>
              轴灯全填基色
            </button>
            <button onClick={() => led.fillSubset(AXIS_INDICES, null)}>轴灯全熄</button>
          </div>
          <DigitPanel
            pixels={led.pixels}
            baseColor={led.baseColor}
            setCanvas={led.setCanvas}
          />
        </div>
      </div>
    </div>
  );
}
