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
  return (
    <div className="connect-bar">
      <span className={"status" + (connected ? " ok" : "")}>
        {label}: {connected ? detail ?? "已连接" : busy ? "连接中…" : "未连接"}
      </span>
      {connected ? (
        <button onClick={onDisconnect}>断开</button>
      ) : (
        <button className="primary" disabled={busy} onClick={onConnect}>
          连接 {label}
        </button>
      )}
    </div>
  );
}
