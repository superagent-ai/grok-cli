import { describe, expect, it } from "vitest";
import type { StreamChunk, ToolCall } from "../types";
import { isHeadlessOutputFormat, renderHeadlessChunk, renderHeadlessPrelude } from "./output";

function toolCall(name: string): ToolCall {
  return {
    id: "tc-1",
    type: "function",
    function: {
      name,
      arguments: "{}",
    },
  };
}

describe("headless output helpers", () => {
  it("recognizes supported output formats", () => {
    expect(isHeadlessOutputFormat("text")).toBe(true);
    expect(isHeadlessOutputFormat("json")).toBe(true);
    expect(isHeadlessOutputFormat("xml")).toBe(false);
  });

  it("renders the text prelude with session metadata", () => {
    expect(renderHeadlessPrelude("text", "session-123")).toEqual({
      stdout: "\u001b[36m⏳ Processing...\u001b[0m\n",
      stderr: "\u001b[2mSession: session-123\u001b[0m\n",
    });
  });

  it("suppresses the prelude in json mode", () => {
    expect(renderHeadlessPrelude("json", "session-123")).toEqual({});
  });

  it("renders tool calls for text mode", () => {
    const chunk: StreamChunk = {
      type: "tool_calls",
      toolCalls: [toolCall("bash"), toolCall("read_file")],
    };

    expect(renderHeadlessChunk(chunk, "text")).toEqual({
      stderr: "\u001b[33m⚙ bash\u001b[0m\n\u001b[33m⚙ read_file\u001b[0m\n",
    });
  });

  it("renders tool results for text mode", () => {
    const chunk: StreamChunk = {
      type: "tool_result",
      toolCall: toolCall("bash"),
      toolResult: {
        success: false,
        output: "failed",
      },
    };

    expect(renderHeadlessChunk(chunk, "text")).toEqual({
      stderr: "\u001b[31m✗ bash\u001b[0m\n",
    });
  });

  it("renders newline-delimited json chunks in json mode", () => {
    const chunk: StreamChunk = {
      type: "content",
      content: "hello",
    };

    expect(renderHeadlessChunk(chunk, "json")).toEqual({
      stdout: `${JSON.stringify(chunk)}\n`,
    });
  });

  it("preserves nested tool payloads in json mode", () => {
    const chunk: StreamChunk = {
      type: "tool_result",
      toolCall: toolCall("delegate"),
      toolResult: {
        success: true,
        delegation: {
          id: "calm-blue-fox",
          agent: "explore",
          description: "Read docs",
          summary: "Running in the background.",
          status: "running",
        },
      },
    };

    expect(renderHeadlessChunk(chunk, "json")).toEqual({
      stdout: `${JSON.stringify(chunk)}\n`,
    });
  });
});
