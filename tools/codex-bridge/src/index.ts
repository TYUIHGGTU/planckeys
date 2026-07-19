import { loadConfig } from "./config.js";
import { log, setLogLevel } from "./logger.js";
import { LedMode } from "./protocol.js";
import { ThreadStore } from "./threadStore.js";
import { HidDevice } from "./hidDevice.js";
import { CodexSource } from "./source.js";
import { MockSource } from "./mockSource.js";
import { HooksSource } from "./hooksSource.js";
import { HookTargetName, installHooks, uninstallHooks } from "./installHooks.js";
import { AgentPlatform, ThreadStatus } from "./types.js";

const STATUS_GLYPH: Record<ThreadStatus, string> = {
  [ThreadStatus.Offline]: "·",
  [ThreadStatus.Idle]: "○",
  [ThreadStatus.Working]: "▶",
  [ThreadStatus.CompleteUnread]: "✓",
  [ThreadStatus.RequiresInput]: "!",
  [ThreadStatus.Error]: "✗",
};

const PLATFORM_TAG: Record<AgentPlatform, string> = {
  cursor: "Cu",
  codebuddy: "Cb",
  workbuddy: "Wb",
  codex: "Cx",
  claude: "Cl",
  unknown: "??",
};

const main = (): void => {
  const argv = process.argv.slice(2);

  // Subcommands (install/uninstall the hooks) run and exit.
  const positionals = argv.filter((a) => !a.startsWith("-"));
  const subcommand = positionals[0];
  if (subcommand === "install-hooks" || subcommand === "uninstall-hooks") {
    setLogLevel("info");
    const targetIdx = argv.indexOf("--target");
    const target = (targetIdx >= 0
      ? argv[targetIdx + 1]
      : (positionals[1] ?? "codex")) as HookTargetName;
    if (subcommand === "install-hooks") {
      const sockIdx = argv.indexOf("--sock");
      installHooks(target, sockIdx >= 0 ? argv[sockIdx + 1] : undefined);
    } else {
      uninstallHooks(target);
    }
    return;
  }

  const config = loadConfig(argv);
  setLogLevel(config.logLevel);

  log.info(
    `Planckeys Codex bridge starting (source=${config.source}, binding=${config.binding}).`,
  );

  const store = new ThreadStore(config);
  const hid = new HidDevice(config.hidReconnectMs, config.dryRun);
  const source: CodexSource =
    config.source === "mock"
      ? new MockSource()
      : new HooksSource(config.socketPath);

  let animTimer: NodeJS.Timeout | null = null;
  let sleepTimer: NodeJS.Timeout | null = null;
  let lastLoggedLine = "";

  const stopAnim = (): void => {
    if (animTimer) {
      clearInterval(animTimer);
      animTimer = null;
    }
  };

  // Schedule a one-shot render at the auto-off deadline so the board blanks
  // itself after idleOffMs of no activity (Codex Micro style). Rescheduled on
  // every event; any new event wakes the board back up.
  const scheduleSleep = (): void => {
    if (sleepTimer) {
      clearTimeout(sleepTimer);
      sleepTimer = null;
    }
    const ms = store.msUntilSleep();
    if (ms === null) return;
    sleepTimer = setTimeout(() => {
      sleepTimer = null;
      renderAndPush({ quiet: true });
    }, ms + 50);
  };

  const renderAndPush = (opts?: { quiet?: boolean }): void => {
    const now = Date.now();
    const targets = store.render(now);
    const ok = hid.pushFrame(targets);
    const line = store
      .snapshot()
      .map((s, i) => {
        if (!s.threadId) return `${i + 1}·`;
        return `${i + 1}${STATUS_GLYPH[s.status]}${PLATFORM_TAG[s.platform]}`;
      })
      .join(" ");
    if (!opts?.quiet || line !== lastLoggedLine) {
      log.info(`frame [${line}]${ok ? "" : " (no HID)"}`);
      lastLoggedLine = line;
    }
  };

  const syncAnim = (): void => {
    const need = store.needsAnimation();
    if (need && !animTimer) {
      const interval = Math.max(16, Math.round(1000 / config.animFps));
      animTimer = setInterval(() => {
        renderAndPush({ quiet: true });
        if (!store.needsAnimation()) stopAnim();
      }, interval);
    } else if (!need && animTimer) {
      stopAnim();
    }
  };

  hid.start();
  // Firmware stays in Solid; breathe/blink are host-side per-pixel brightness.
  setTimeout(() => hid.setConfig(LedMode.Solid, config.brightness, 1), 500);

  source.events.on("open", () => log.info("Codex source connected."));

  // Failsafe is connection-based, not silence-based: normal idle periods have
  // no events but soft-unread must persist. We only release the takeover when
  // the source actually shuts down.
  source.events.on("close", () => {
    log.warn("Codex source closed; releasing takeover (clearing owned LEDs).");
    stopAnim();
    if (sleepTimer) {
      clearTimeout(sleepTimer);
      sleepTimer = null;
    }
    hid.fill({ r: 0, g: 0, b: 0 });
  });

  source.events.on("status", (e) => {
    const applied = store.setStatus(e.threadId, e.status, e.platform);
    if (!applied) {
      log.warn(
        `No free slot for ${e.platform}/${e.threadId} (${e.status}); dropped.`,
      );
      return;
    }
    renderAndPush();
    syncAnim();
    scheduleSleep();
  });

  source.start();

  const shutdown = (sig: string): void => {
    log.info(`Received ${sig}; shutting down.`);
    stopAnim();
    if (sleepTimer) clearTimeout(sleepTimer);
    source.stop();
    hid.close();
    process.exit(0);
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
};

main();
