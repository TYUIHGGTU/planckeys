import { EventEmitter } from "node:events";
import { AgentPlatform, ThreadStatus } from "./types.js";

export interface StatusEvent {
  threadId: string;
  status: ThreadStatus;
  platform: AgentPlatform;
}

/**
 * Abstracts wherever thread state comes from (codex hooks or the built-in mock).
 * Emits normalized bridge events.
 */
export interface CodexSource {
  readonly events: CodexSourceEmitter;
  start(): void;
  stop(): void;
}

export interface CodexSourceEventMap {
  status: (e: StatusEvent) => void;
  open: () => void;
  close: () => void;
}

export class CodexSourceEmitter extends EventEmitter {
  override on<K extends keyof CodexSourceEventMap>(
    event: K,
    listener: CodexSourceEventMap[K],
  ): this {
    return super.on(event, listener);
  }

  override emit<K extends keyof CodexSourceEventMap>(
    event: K,
    ...args: Parameters<CodexSourceEventMap[K]>
  ): boolean {
    return super.emit(event, ...args);
  }
}
