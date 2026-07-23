import { useState, type CSSProperties } from "react";
import { Alert } from "@mantine/core";
import type { Binding } from "../device/studio/rpc";
import type { LedController } from "../shared/hooks/useLedDevice";
import type { StudioController } from "../shared/hooks/useStudioDevice";
import { CandidatePanel } from "./CandidatePanel";
import { KeyboardStage } from "./KeyboardStage";
import { LayerRail } from "./LayerRail";
import { LightingPanel } from "./LightingPanel";
import { TopBar } from "./TopBar";
import { useCandidateHeight } from "./useCandidateHeight";
import type { ThemeController } from "./useTheme";

interface Props {
  led: LedController;
  studio: StudioController;
  theme: ThemeController;
  hint: string | null;
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
        {hint && (
          <Alert color="red" radius={0} p="xs">
            {hint}
          </Alert>
        )}
        <main
          className={
            "workspace" + (studio.supportsLighting ? "" : " no-lighting")
          }
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
          {studio.supportsLighting && studio.keyboardProfile && (
            <LightingPanel
              led={led}
              profile={studio.keyboardProfile}
              selectedKey={selectedKey}
            />
          )}
        </main>
      </div>
      <footer className="ws-statusbar">
        <span className={"ws-status-item" + (studio.connected ? " on" : "")}>
          <span className="ws-conn-dot" />
          studio <b>{studio.connected ? "connected" : "offline"}</b>
        </span>
        {studio.supportsLighting && (
          <span className={"ws-status-item" + (led.connected ? " on" : "")}>
            <span className="ws-conn-dot" />
            led <b>{led.connected ? "connected" : "offline"}</b>
          </span>
        )}
        <span className="ws-status-right">
          {studio.supportsLighting && (
            <span>underglow · bright {led.underglow.brightness}</span>
          )}
          <span>zmk studio · web serial + webhid</span>
        </span>
      </footer>
    </div>
  );
}
