import type { StreamChunk } from "../types";

export type HeadlessOutputFormat = "text" | "json";

export interface HeadlessWrites {
  stdout?: string;
  stderr?: string;
}

export function isHeadlessOutputFormat(value: string): value is HeadlessOutputFormat {
  return value === "text" || value === "json";
}

export function renderHeadlessPrelude(format: HeadlessOutputFormat, sessionId?: string): HeadlessWrites {
  if (format === "json") {
    return {};
  }

  return {
    stdout: "\x1b[36m⏳ Processing...\x1b[0m\n",
    stderr: sessionId ? `\x1b[2mSession: ${sessionId}\x1b[0m\n` : undefined,
  };
}

export function renderHeadlessChunk(chunk: StreamChunk, format: HeadlessOutputFormat): HeadlessWrites {
  if (format === "json") {
    return { stdout: `${JSON.stringify(chunk)}\n` };
  }

  switch (chunk.type) {
    case "content":
      return chunk.content ? { stdout: chunk.content } : {};

    case "tool_calls":
      return chunk.toolCalls?.length
        ? {
            stderr: chunk.toolCalls.map((tc) => `\x1b[33m⚙ ${tc.function.name}\x1b[0m\n`).join(""),
          }
        : {};

    case "tool_result": {
      if (!chunk.toolResult) {
        return {};
      }

      const icon = chunk.toolResult.success ? "✓" : "✗";
      const color = chunk.toolResult.success ? "\x1b[32m" : "\x1b[31m";
      const name = chunk.toolCall?.function.name || "tool";
      return { stderr: `${color}${icon} ${name}\x1b[0m\n` };
    }

    case "error":
      return chunk.content ? { stderr: `\x1b[31m${chunk.content}\x1b[0m\n` } : {};

    case "done":
      return { stdout: "\n" };

    case "reasoning":
      return {};

    default:
      return {};
  }
}
