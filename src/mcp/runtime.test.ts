import { beforeEach, describe, expect, it, vi } from "vitest";
import type { McpServerConfig } from "../utils/settings";

const { createMCPClientMock, StdioClientTransportMock } = vi.hoisted(() => ({
  createMCPClientMock: vi.fn(),
  StdioClientTransportMock: vi.fn().mockImplementation(function (this: unknown, options: unknown) {
    return {
      kind: "stdio-transport",
      options,
    };
  }),
}));

vi.mock("@ai-sdk/mcp", () => ({
  createMCPClient: createMCPClientMock,
}));

vi.mock("@modelcontextprotocol/sdk/client/stdio.js", () => ({
  StdioClientTransport: StdioClientTransportMock,
}));

import { buildMcpToolSet } from "./runtime";

function createServer(overrides: Partial<McpServerConfig> = {}): McpServerConfig {
  return {
    id: "docs/server",
    label: "Docs Server",
    enabled: true,
    transport: "stdio",
    command: "node",
    args: ["server.js"],
    env: { API_KEY: "secret" },
    cwd: "/tmp/docs",
    ...overrides,
  };
}

describe("buildMcpToolSet", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("builds prefixed tools and decorates descriptions for stdio servers", async () => {
    const close = vi.fn().mockResolvedValue(undefined);
    createMCPClientMock.mockResolvedValue({
      tools: vi.fn().mockResolvedValue({
        search: { description: "Search docs" },
        ping: {},
      }),
      close,
    });

    const bundle = await buildMcpToolSet([createServer()]);

    expect(bundle.errors).toEqual([]);
    expect(StdioClientTransportMock).toHaveBeenCalledWith({
      command: "node",
      args: ["server.js"],
      env: { API_KEY: "secret" },
      cwd: "/tmp/docs",
    });
    expect(createMCPClientMock).toHaveBeenCalledWith({
      transport: {
        kind: "stdio-transport",
        options: {
          command: "node",
          args: ["server.js"],
          env: { API_KEY: "secret" },
          cwd: "/tmp/docs",
        },
      },
      name: "grok-cli-docs/server",
      version: "1.0.0",
    });
    expect(bundle.tools).toMatchObject({
      mcp_docs_server__search: {
        description: "[MCP Docs Server] Search docs",
      },
      mcp_docs_server__ping: {
        description: "[MCP Docs Server] ping",
      },
    });

    await bundle.close();
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("reports validation and client errors while skipping disabled servers", async () => {
    createMCPClientMock.mockRejectedValue(new Error("connection failed"));

    const bundle = await buildMcpToolSet([
      createServer({ enabled: false, label: "Disabled Server" }),
      createServer({ label: "Invalid Server", transport: "http", url: "   " }),
      createServer({
        id: "remote-http",
        label: "Remote Server",
        transport: "http",
        command: undefined,
        url: "https://example.com/mcp",
        headers: { Authorization: "Bearer token" },
      }),
    ]);

    expect(createMCPClientMock).toHaveBeenCalledTimes(1);
    expect(createMCPClientMock).toHaveBeenCalledWith({
      transport: {
        type: "http",
        url: "https://example.com/mcp",
        headers: { Authorization: "Bearer token" },
      },
      name: "grok-cli-remote-http",
      version: "1.0.0",
    });
    expect(bundle.tools).toEqual({});
    expect(bundle.errors).toEqual([
      "Invalid Server: URL is required for HTTP/SSE MCP servers.",
      "Remote Server: connection failed",
    ]);
  });

  it("swallows client close failures", async () => {
    createMCPClientMock
      .mockResolvedValueOnce({
        tools: vi.fn().mockResolvedValue({ first: {} }),
        close: vi.fn().mockRejectedValue(new Error("close failed")),
      })
      .mockResolvedValueOnce({
        tools: vi.fn().mockResolvedValue({ second: {} }),
        close: vi.fn().mockResolvedValue(undefined),
      });

    const bundle = await buildMcpToolSet([createServer({ id: "first-server" }), createServer({ id: "second-server" })]);

    await expect(bundle.close()).resolves.toBeUndefined();
  });
});
