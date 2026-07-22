import { browserHint } from "./device/browser";
import { useLedDevice } from "./shared/hooks/useLedDevice";
import { useStudioDevice } from "./shared/hooks/useStudioDevice";
import { Workspace } from "./workspace/Workspace";
import { useTheme } from "./workspace/useTheme";

export default function App() {
  const studio = useStudioDevice();
  const led = useLedDevice(studio.keyboardProfile);
  const theme = useTheme();
  const hint = browserHint();

  return <Workspace led={led} studio={studio} theme={theme} hint={hint} />;
}
