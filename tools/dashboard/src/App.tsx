import { browserHint } from "./device/browser";
import { useLedDevice } from "./shared/hooks/useLedDevice";
import { useStudioDevice } from "./shared/hooks/useStudioDevice";
import { Workspace } from "./workspace/Workspace";
import { useTheme } from "./workspace/useTheme";

export default function App() {
  const led = useLedDevice();
  const studio = useStudioDevice();
  const theme = useTheme();
  const hint = browserHint();

  return <Workspace led={led} studio={studio} theme={theme} hint={hint} />;
}
