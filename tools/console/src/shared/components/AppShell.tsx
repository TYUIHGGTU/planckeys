import type { ReactNode } from "react";
import type { LedController } from "../hooks/useLedDevice";
import type { StudioController } from "../hooks/useStudioDevice";
import { ConnectBar } from "./ConnectBar";

export type TabId = "led" | "keymap";

interface Props {
  tab: TabId;
  onTab: (tab: TabId) => void;
  led: LedController;
  studio: StudioController;
  hint: string | null;
  children: ReactNode;
}

export function AppShell({ tab, onTab, led, studio, hint, children }: Props) {
  return (
    <div className="app">
      <header className="header">
        <h1>PlanckKeys 控制台</h1>
        <nav className="tabs">
          <button
            className={tab === "led" ? "active" : undefined}
            onClick={() => onTab("led")}
          >
            灯效
          </button>
          <button
            className={tab === "keymap" ? "active" : undefined}
            onClick={() => onTab("keymap")}
          >
            键位
          </button>
        </nav>
        <div className="conn-group">
          <ConnectBar
            label="HID"
            connected={led.connected}
            detail={led.productName}
            onConnect={() => void led.connect().catch(() => {})}
            onDisconnect={() => void led.disconnect()}
          />
          <ConnectBar
            label="Studio"
            connected={studio.connected}
            busy={studio.loading}
            detail={studio.deviceName}
            onConnect={() => void studio.connect().catch(() => {})}
            onDisconnect={() => void studio.disconnect()}
          />
        </div>
      </header>

      {hint && <div className="banner">{hint}</div>}

      <main className="content">{children}</main>
    </div>
  );
}
