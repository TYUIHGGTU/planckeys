export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_RANK: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

let threshold: number = LEVEL_RANK.info;

export const setLogLevel = (level: LogLevel): void => {
  threshold = LEVEL_RANK[level];
};

const ts = (): string => new Date().toISOString();

const emit = (level: LogLevel, args: unknown[]): void => {
  if (LEVEL_RANK[level] < threshold) return;
  const line = `${ts()} [${level.toUpperCase()}]`;
  // Logs go to stderr so stdout can stay clean for future machine-readable use.
  if (level === "error" || level === "warn") {
    console.error(line, ...args);
  } else {
    console.error(line, ...args);
  }
};

export const log = {
  debug: (...args: unknown[]) => emit("debug", args),
  info: (...args: unknown[]) => emit("info", args),
  warn: (...args: unknown[]) => emit("warn", args),
  error: (...args: unknown[]) => emit("error", args),
};
