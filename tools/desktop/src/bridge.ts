import { spawn, type ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { logStore } from "./logStore";
import { loadSettings } from "./settings";

export type BridgeState =
  | "stopped"
  | "starting"
  | "running"
  | "listening"
  | "error";

export type HookAction = "install-hooks" | "uninstall-hooks";
export const HOOK_TARGETS = [
  "codex",
  "codebuddy",
  "workbuddy",
  "claude",
  "cursor",
] as const;
export type HookTarget = (typeof HOOK_TARGETS)[number];

/** GUI 应用（尤其从 Finder / 登录项启动）拿不到 shell PATH，补上常见目录。 */
const PATH_EXTRA = ["/opt/homebrew/bin", "/usr/local/bin", "/usr/bin", "/bin"];

const MAX_RESTART_DELAY = 30_000;

/**
 * 监管现有 codex-bridge 守护进程：以子进程方式 spawn `node dist/index.js`，
 * 汇聚日志、解析状态、崩溃自动重启（指数退避）；并提供一次性的 build /
 * install-hooks / uninstall-hooks 调用。第一阶段完全不改动 codex-bridge 本身。
 */
export class BridgeController extends EventEmitter {
  private child: ChildProcess | null = null;
  private state: BridgeState = "stopped";
  private intentionalStop = false;
  private restartTimer: NodeJS.Timeout | null = null;
  private restartDelay = 1000;
  private hidConnected = false;

  getState(): BridgeState {
    return this.state;
  }

  isHidConnected(): boolean {
    return this.hidConnected;
  }

  isRunning(): boolean {
    return this.child !== null;
  }

  bridgeDir(): string {
    const s = loadSettings();
    if (s.bridgeDir) return s.bridgeDir;
    if (process.env.PLANCKEYS_BRIDGE_DIR) return process.env.PLANCKEYS_BRIDGE_DIR;
    // dist/bridge.js -> tools/desktop/dist -> tools/desktop -> tools -> tools/codex-bridge
    return resolve(__dirname, "..", "..", "codex-bridge");
  }

  private entry(): string {
    return join(this.bridgeDir(), "dist", "index.js");
  }

  private nodeBin(): string {
    return loadSettings().nodePath || "node";
  }

  private childEnv(): NodeJS.ProcessEnv {
    const s = loadSettings();
    const pathValue = [process.env.PATH ?? "", ...PATH_EXTRA]
      .filter(Boolean)
      .join(":");
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      PATH: pathValue,
      CODEX_BRIDGE_WORKING_EFFECT: s.workingEffect,
      CODEX_BRIDGE_BRIGHTNESS: String(s.brightness),
      CODEX_BRIDGE_LOG: s.logLevel,
    };
    // 子进程是真正的 node，别把 Electron/Cursor 注入的这个变量带下去。
    delete env.ELECTRON_RUN_AS_NODE;
    return env;
  }

  private setState(next: BridgeState): void {
    if (next !== this.state) {
      this.state = next;
      this.emit("state", next);
    }
  }

  async start(): Promise<void> {
    if (this.child) return;
    this.intentionalStop = false;
    if (!existsSync(this.entry())) {
      logStore.append(
        `[desktop] 未找到 ${this.entry()}，尝试自动构建 codex-bridge…`,
      );
      const built = await this.build();
      if (!built || !existsSync(this.entry())) {
        logStore.append(
          "[desktop] 构建失败或产物缺失。请先在 tools/codex-bridge 执行 `npm install && npm run build`。",
        );
        this.setState("error");
        return;
      }
    }
    this.spawnChild();
  }

  private spawnChild(): void {
    const args = ["dist/index.js"];
    if (loadSettings().dryRun) args.push("--no-hid");

    this.setState("starting");
    logStore.append(
      `[desktop] 启动 bridge：${this.nodeBin()} ${args.join(" ")}（cwd=${this.bridgeDir()}）`,
    );

    let child: ChildProcess;
    try {
      child = spawn(this.nodeBin(), args, {
        cwd: this.bridgeDir(),
        env: this.childEnv(),
      });
    } catch (e) {
      logStore.append(`[desktop] 启动失败：${(e as Error).message}`);
      this.setState("error");
      this.scheduleRestart();
      return;
    }

    this.child = child;
    this.setState("running");

    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");
    const onData = (chunk: string): void => {
      for (const line of chunk.split(/\r?\n/)) {
        if (line.trim()) this.handleLine(line);
      }
    };
    child.stdout?.on("data", onData);
    child.stderr?.on("data", onData);

    child.on("error", (e) => {
      logStore.append(`[desktop] 进程错误：${e.message}`);
    });

    child.on("exit", (code, signal) => {
      logStore.append(
        `[desktop] bridge 退出（code=${code ?? "?"} signal=${signal ?? "-"}）`,
      );
      this.child = null;
      this.hidConnected = false;
      this.emit("hid", false);
      if (this.intentionalStop) {
        this.setState("stopped");
        return;
      }
      this.setState("error");
      this.scheduleRestart();
    });
  }

  private handleLine(line: string): void {
    logStore.append(line);
    if (line.includes("Listening for agent hooks")) this.setState("listening");
    if (line.includes("HID connected")) {
      this.hidConnected = true;
      this.emit("hid", true);
    }
    if (line.includes("HID disconnected") || line.includes("releasing takeover")) {
      this.hidConnected = false;
      this.emit("hid", false);
    }
    // 只要子进程能正常吐日志，就把退避重置回初始值。
    this.restartDelay = 1000;
  }

  private scheduleRestart(): void {
    if (this.intentionalStop || this.restartTimer) return;
    const delay = this.restartDelay;
    this.restartDelay = Math.min(this.restartDelay * 2, MAX_RESTART_DELAY);
    logStore.append(`[desktop] ${delay}ms 后自动重启 bridge…`);
    this.restartTimer = setTimeout(() => {
      this.restartTimer = null;
      if (!this.intentionalStop) this.spawnChild();
    }, delay);
  }

  stop(): void {
    this.intentionalStop = true;
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
    if (this.child) {
      logStore.append("[desktop] 停止 bridge…");
      this.child.kill("SIGTERM");
    } else {
      this.setState("stopped");
    }
  }

  async restart(): Promise<void> {
    if (this.child) {
      this.intentionalStop = true;
      const child = this.child;
      await new Promise<void>((res) => {
        const done = setTimeout(res, 3000);
        child.once("exit", () => {
          clearTimeout(done);
          res();
        });
        child.kill("SIGTERM");
      });
    }
    this.intentionalStop = false;
    this.restartDelay = 1000;
    await this.start();
  }

  /** 一次性构建 codex-bridge（tsc）。需要其 devDependencies 已安装。 */
  build(): Promise<boolean> {
    return new Promise((res) => {
      logStore.append("[desktop] 运行 npm run build（codex-bridge）…");
      const npm = process.platform === "win32" ? "npm.cmd" : "npm";
      let child: ChildProcess;
      try {
        child = spawn(npm, ["run", "build"], {
          cwd: this.bridgeDir(),
          env: this.childEnv(),
        });
      } catch (e) {
        logStore.append(`[desktop] 无法启动 build：${(e as Error).message}`);
        res(false);
        return;
      }
      child.stdout?.setEncoding("utf8");
      child.stderr?.setEncoding("utf8");
      child.stdout?.on("data", (c: string) => logStore.append(`[build] ${c.trimEnd()}`));
      child.stderr?.on("data", (c: string) => logStore.append(`[build] ${c.trimEnd()}`));
      child.on("error", (e) => {
        logStore.append(`[desktop] build 无法启动：${e.message}`);
        res(false);
      });
      child.on("exit", (code) => {
        const ok = code === 0;
        logStore.append(`[desktop] build ${ok ? "成功" : `失败（code=${code}）`}`);
        res(ok);
      });
    });
  }

  /** 一次性运行 install-hooks / uninstall-hooks <target>。 */
  runHooks(action: HookAction, target: HookTarget): Promise<boolean> {
    return new Promise((res) => {
      if (!existsSync(this.entry())) {
        logStore.append(
          `[desktop] ${action} 前需要先构建 codex-bridge（${this.entry()} 不存在）。`,
        );
        res(false);
        return;
      }
      logStore.append(`[desktop] ${action} ${target} …`);
      let child: ChildProcess;
      try {
        child = spawn(this.nodeBin(), ["dist/index.js", action, target], {
          cwd: this.bridgeDir(),
          env: this.childEnv(),
        });
      } catch (e) {
        logStore.append(`[desktop] ${action} 无法启动：${(e as Error).message}`);
        res(false);
        return;
      }
      child.stdout?.setEncoding("utf8");
      child.stderr?.setEncoding("utf8");
      child.stdout?.on("data", (c: string) => logStore.append(c.trimEnd()));
      child.stderr?.on("data", (c: string) => logStore.append(c.trimEnd()));
      child.on("error", (e) => {
        logStore.append(`[desktop] ${action} 无法启动：${e.message}`);
        res(false);
      });
      child.on("exit", (code) => {
        const ok = code === 0;
        logStore.append(`[desktop] ${action} ${target} ${ok ? "完成" : "失败"}`);
        res(ok);
      });
    });
  }
}

export const bridge = new BridgeController();
