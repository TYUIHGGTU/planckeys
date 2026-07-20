import { useSyncExternalStore } from "react";

export interface LogEntry {
  time: string;
  msg: string;
}

const MAX_ENTRIES = 200;
let entries: LogEntry[] = [];
const listeners = new Set<() => void>();

const emit = () => {
  for (const l of listeners) l();
};

export const pushLog = (msg: string): void => {
  const time = new Date().toLocaleTimeString();
  entries = [{ time, msg }, ...entries].slice(0, MAX_ENTRIES);
  emit();
};

export const clearLog = (): void => {
  entries = [];
  emit();
};

const subscribe = (cb: () => void): (() => void) => {
  listeners.add(cb);
  return () => listeners.delete(cb);
};

export const useLog = (): LogEntry[] =>
  useSyncExternalStore(
    subscribe,
    () => entries,
    () => entries,
  );
