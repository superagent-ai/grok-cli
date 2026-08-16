import type { KeyEvent, TextareaRenderable } from "@opentui/core";
import type { RefObject } from "react";
import type { ChatEntry } from "../types/index.js";

export type PluginTurnStatus = "success" | "error" | "aborted";

export interface PluginSlashCommand {
  id: string;
  description: string;
  aliases?: string[];
}

export interface PluginCommandContext {
  reply: (text: string) => void;
}

export interface PluginSessionContext {
  cwd: string;
  sessionId: string | null;
  baseURL: string;
  inputRef: RefObject<TextareaRenderable | null>;
}

export interface GrokPlugin {
  id: string;
  slashCommands?: PluginSlashCommand[];
  handleCommand?(cmd: string, ctx: PluginCommandContext): boolean;
  requestAfterTurn?(entries: ChatEntry[], status: PluginTurnStatus, abortNote?: string): void;
  recordSubmit?(userPrompt: string): void;
  ensureSeed?(): void;
  cancel?(): void;
  dismiss?(): void;
  handleKey?(key: KeyEvent, blocked: boolean): boolean;
  ghostSuggestion?: string | null;
  ghostVisible?: boolean;
}

export interface PluginHostState {
  installed: string[];
  slashCommands: PluginSlashCommand[];
  ghostSuggestion: string | null;
  ghostVisible: boolean;
  handleCommand: (cmd: string, reply: (text: string) => void) => boolean;
  requestAfterTurn: (entries: ChatEntry[], status: PluginTurnStatus, abortNote?: string) => void;
  recordSubmit: (userPrompt: string) => void;
  ensureSeed: () => void;
  cancel: () => void;
  dismiss: () => void;
  handleKey: (key: KeyEvent, blocked: boolean) => boolean;
  install: (id: string) => string;
  uninstall: (id: string) => string;
  formatList: () => string;
}
