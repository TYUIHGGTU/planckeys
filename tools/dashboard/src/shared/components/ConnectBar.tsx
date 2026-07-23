import { Button, Tooltip } from "@mantine/core";

interface Props {
  label: string;
  connected: boolean;
  detail: string | null;
  busy?: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
}

export function ConnectBar({
  label,
  connected,
  detail,
  busy,
  onConnect,
  onDisconnect,
}: Props) {
  const status = connected ? detail ?? "已连接" : busy ? "连接中…" : "未连接";
  return (
    <div className="ws-connect">
      <Tooltip label={status} withArrow disabled={!connected}>
        <span className={"ws-conn" + (connected ? " on" : "")}>
          <span className="ws-conn-dot" />
          {label}
        </span>
      </Tooltip>
      {connected ? (
        <Button size="compact-xs" variant="default" radius="sm" onClick={onDisconnect}>
          断开
        </Button>
      ) : (
        <Button size="compact-xs" radius="sm" loading={busy} onClick={onConnect}>
          连接
        </Button>
      )}
    </div>
  );
}
