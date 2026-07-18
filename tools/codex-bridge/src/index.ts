import { loadConfig } from "./config.js";
import { log, setLogLevel } from "./logger.js";
import { LedMode } from "./protocol.js";
import { ThreadStore } from "./threadStore.js";
import { HidDevice } from "./hidDevice.js";
import { CodexSource } from "./source.js";
import { MockSource } from "./mockSource.js";
import { HooksSource } from "./hooksSource.js";
import { HookTargetName, installHooks, uninstallHooks } from "./installHooks.js";
import { ThreadStatus } from "./types.js";

const STATUS_GLYPH: Record<ThreadStatus, string> = {
  [ThreadStatus.Offline]: "·",
  [ThreadStatus.Idle]: "○",
  [ThreadStatus.Working]: "▶",
  [ThreadStatus.CompleteUnread]: "✓",
  [ThreadStatus.RequiresInput]: "!",
  [ThreadStatus.Error]: "✗",
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

  const renderAndPush = (): void => {
    const targets = store.render();
    const ok = hid.pushFrame(targets);
    const line = store
      .snapshot()
      .map((s, i) =>
        s.threadId ? `${i + 1}${STATUS_GLYPH[s.status]}` : `${i + 1}·`,
      )
      .join(" ");
    log.info(`frame [${line}]${ok ? "" : " (no HID)"}`);
  };

  hid.start();
  // Ensure the firmware is in solid mode at our brightness before we paint.
  setTimeout(() => hid.setConfig(LedMode.Solid, config.brightness, 1), 500);

  source.events.on("open", () => log.info("Codex source connected."));

  // Failsafe is connection-based, not silence-based: normal idle periods have
  // no events but the states (e.g. unread green) must persist. We only release
  // the takeover when the source actually shuts down.
  source.events.on("close", () => {
    log.warn("Codex source closed; releasing takeover (clearing owned LEDs).");
    hid.fill({ r: 0, g: 0, b: 0 });
  });

  source.events.on("status", (e) => {
    const applied = store.setStatus(e.threadId, e.status);
    if (!applied) {
      log.warn(`No free slot for thread ${e.threadId} (${e.status}); dropped.`);
      return;
    }
    renderAndPush();
  });

  source.start();

  const shutdown = (sig: string): void => {
    log.info(`Received ${sig}; shutting down.`);
    source.stop();
    hid.close();
    process.exit(0);
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
};

main();
