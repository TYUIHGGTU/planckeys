import { useState } from "react";
import { browserHint } from "./device/browser";
import { KeymapPage } from "./keymap/KeymapPage";
import { LedPage } from "./led/LedPage";
import { AppShell, type TabId } from "./shared/components/AppShell";
import { LogPanel } from "./shared/components/LogPanel";
import { useLedDevice } from "./shared/hooks/useLedDevice";
import { useStudioDevice } from "./shared/hooks/useStudioDevice";

export default function App() {
  const [tab, setTab] = useState<TabId>("led");
  const led = useLedDevice();
  const studio = useStudioDevice();
  const hint = browserHint();

  return (
    <AppShell tab={tab} onTab={setTab} led={led} studio={studio} hint={hint}>
      <div className="page">
        {tab === "led" ? <LedPage led={led} /> : <KeymapPage studio={studio} />}
      </div>
      <LogPanel />
    </AppShell>
  );
}
