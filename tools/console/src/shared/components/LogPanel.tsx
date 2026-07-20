import { clearLog, useLog } from "../log";

export function LogPanel() {
  const entries = useLog();
  return (
    <div className="card log-card">
      <div className="log-head">
        <h2>日志</h2>
        <button onClick={clearLog}>清空</button>
      </div>
      <div className="log">
        {entries.map((e, i) => (
          <div key={i}>
            [{e.time}] {e.msg}
          </div>
        ))}
      </div>
    </div>
  );
}
