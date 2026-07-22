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
    </div>
  );
}
