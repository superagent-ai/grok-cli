import { describe, expect, it } from "vitest";
import type { McpServerConfig } from "../utils/settings";
import { isRemoteTransport, toMcpServerId, validateMcpServerConfig } from "./validate";

function createServer(overrides: Partial<McpServerConfig> = {}): McpServerConfig {
  return {
    id: "test-server",
    label: "Test Server",
    enabled: true,
    transport: "stdio",
    command: "node",
    ...overrides,
  };
}

describe("isRemoteTransport", () => {
  it("accepts the supported remote transports", () => {
    expect(isRemoteTransport("http")).toBe(true);
    expect(isRemoteTransport("sse")).toBe(true);
  });

  it("rejects stdio and unknown transport values", () => {
    expect(isRemoteTransport("stdio")).toBe(false);
    expect(isRemoteTransport("websocket")).toBe(false);
  });
});

describe("toMcpServerId", () => {
  it("normalizes labels to lowercase kebab-case ids", () => {
    expect(toMcpServerId("  My Cool MCP Server!  ")).toBe("my-cool-mcp-server");
  });

  it("falls back to a default id when the label has no alphanumeric characters", () => {
    expect(toMcpServerId("!!!")).toBe("mcp-server");
  });
});

describe("validateMcpServerConfig", () => {
  it("requires an id and a label", () => {
    expect(validateMcpServerConfig(createServer({ id: "   " }))).toEqual({
      ok: false,
      error: "Server id is required.",
    });
    expect(validateMcpServerConfig(createServer({ label: "   " }))).toEqual({
      ok: false,
      error: "Server label is required.",
    });
  });

  it("validates remote servers have a usable http or https url", () => {
    expect(validateMcpServerConfig(createServer({ transport: "http", url: "   " }))).toEqual({
      ok: false,
      error: "URL is required for HTTP/SSE MCP servers.",
    });
    expect(validateMcpServerConfig(createServer({ transport: "sse", url: "notaurl" }))).toEqual({
      ok: false,
      error: "URL is invalid.",
    });
    expect(validateMcpServerConfig(createServer({ transport: "http", url: "ftp://example.com" }))).toEqual({
      ok: false,
      error: "URL must start with http:// or https://.",
    });
    expect(validateMcpServerConfig(createServer({ transport: "http", url: "https://example.com/mcp" }))).toEqual({
      ok: true,
    });
  });

  it("requires a command for stdio servers", () => {
    expect(validateMcpServerConfig(createServer({ command: "   " }))).toEqual({
      ok: false,
      error: "Command is required for stdio MCP servers.",
    });
    expect(validateMcpServerConfig(createServer())).toEqual({ ok: true });
  });
});
