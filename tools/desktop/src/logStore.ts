import { app } from "electron";
import { EventEmitter } from "node:events";
import { createWriteStream, mkdirSync, type WriteStream } from "node:fs";
import { join } from "node:path";

const MAX_LINES = 1000;

/**
 * 进程内环形日志缓冲 + 落盘。tray、日志窗口都从这里取数据；
 * bridge 子进程的 stdout/stderr 也统一汇到这里。
 */
class LogStore extends EventEmitter {
  private lines: string[] = [];
  private stream: WriteStream | null = null;

  private ensureStream(): void {
    if (this.stream) return;
    try {
      const dir = app.getPath("userData");
      mkdirSync(dir, { recursive: true });
      this.stream = createWriteStream(this.filePath(), { flags: "a" });
    } catch {
      /* 落盘失败不影响内存缓冲 */
    }
  }

  append(line: string): void {
    const stamped = `[${new Date().toLocaleTimeString()}] ${line}`;
    this.lines.push(stamped);
    if (this.lines.length > MAX_LINES) this.lines.shift();
    this.ensureStream();
    this.stream?.write(stamped + "\n");
    this.emit("line", stamped);
  }

  recent(): string[] {
    return [...this.lines];
  }

  filePath(): string {
    return join(app.getPath("userData"), "bridge.log");
  }
}

export const logStore = new LogStore();
