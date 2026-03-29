import { describe, expect, it, vi } from "vitest";
import { BashTool } from "../tools/bash";
import { createTools } from "./tools";

function createScheduleToolSet(overrides?: {
  getDaemonStatus?: () => Promise<{ running: boolean; pid: number | null }>;
  startDaemon?: () => Promise<{
    status: { running: boolean; pid: number | null };
    pid: number | null;
    alreadyRunning: boolean;
  }>;
  stopDaemon?: () => Promise<{
    status: { running: boolean; pid: number | null };
    pid: number | null;
    wasRunning: boolean;
  }>;
}) {
  const scheduleManager = {
    getDaemonStatus: overrides?.getDaemonStatus ?? vi.fn(async () => ({ running: false, pid: null })),
    startDaemon:
      overrides?.startDaemon ??
      vi.fn(async () => ({ status: { running: true, pid: 1234 }, pid: 1234, alreadyRunning: false })),
    stopDaemon:
      overrides?.stopDaemon ??
      vi.fn(async () => ({ status: { running: false, pid: null }, pid: 1234, wasRunning: true })),
  };

  const tools = createTools(new BashTool("/tmp"), {} as never, "agent", {
    scheduleManager: scheduleManager as never,
  });

  return {
    tools: tools as Record<string, { execute: (input: unknown, context?: unknown) => Promise<unknown> }>,
    scheduleManager,
  };
}

describe("schedule daemon tools", () => {
  it("describes bash sandbox constraints when shuru mode is enabled", () => {
    const tools = createTools(new BashTool("/tmp", { sandboxMode: "shuru" }), {} as never, "agent");
    const bashTool = tools.bash as { description?: string };

    expect(bashTool.description).toContain("Shuru sandbox");
    expect(bashTool.description).toContain("do not persist back to the host");
  });

  it("reflects network enabled in sandbox tool description", () => {
    const tools = createTools(
      new BashTool("/tmp", { sandboxMode: "shuru", sandboxSettings: { allowNet: true } }),
      {} as never,
      "agent",
    );
    const bashTool = tools.bash as { description?: string };
    expect(bashTool.description).toContain("network access is enabled");
  });

  it("reflects restricted hosts in sandbox tool description", () => {
    const tools = createTools(
      new BashTool("/tmp", {
        sandboxMode: "shuru",
        sandboxSettings: { allowNet: true, allowedHosts: ["api.openai.com"] },
      }),
      {} as never,
      "agent",
    );
    const bashTool = tools.bash as { description?: string };
    expect(bashTool.description).toContain("network is restricted to: api.openai.com");
  });

  it("mentions host-side browser automation when enabled", () => {
    const tools = createTools(
      new BashTool("/tmp", {
        sandboxMode: "shuru",
        sandboxSettings: { allowNet: true, hostBrowserCommandsOnHost: true },
      }),
      {} as never,
      "agent",
    );
    const bashTool = tools.bash as { description?: string };
    expect(bashTool.description).toContain("agent-browser run on the host");
  });

  it("routes verify task requests through the task tool", async () => {
    const runTask = vi.fn(async () => ({ success: true, output: "verified" }));
    const tools = createTools(new BashTool("/tmp"), {} as never, "agent", {
      runTask,
      subagents: [],
    }) as Record<string, { execute: (input: unknown, context?: unknown) => Promise<unknown>; description?: string }>;

    const taskTool = tools.task;
    expect(taskTool.description).toContain("`verify`");

    const result = (await taskTool.execute(
      {
        agent: "verify",
        description: "Run local verification",
        prompt: "Verify the current workspace.",
      },
      { abortSignal: undefined },
    )) as { success: boolean; output: string };

    expect(runTask).toHaveBeenCalledWith(
      {
        agent: "verify",
        description: "Run local verification",
        prompt: "Verify the current workspace.",
      },
      undefined,
    );
    expect(result).toEqual({ success: true, output: "verified" });
  });

  it("reports daemon status", async () => {
    const { tools } = createScheduleToolSet({
      getDaemonStatus: async () => ({ running: true, pid: 4321 }),
    });

    const result = (await tools.schedule_daemon_status.execute({}, {})) as { success: boolean; output: string };

    expect(result.success).toBe(true);
    expect(result.output).toContain("Daemon status: running");
    expect(result.output).toContain("4321");
  });

  it("formats daemon start output for a fresh start", async () => {
    const { tools } = createScheduleToolSet({
      startDaemon: async () => ({ status: { running: true, pid: 5555 }, pid: 5555, alreadyRunning: false }),
    });

    const result = (await tools.schedule_daemon_start.execute({}, {})) as { success: boolean; output: string };

    expect(result.success).toBe(true);
    expect(result.output).toBe("Schedule daemon started (pid 5555).");
  });

  it("formats daemon start output when already running", async () => {
    const { tools } = createScheduleToolSet({
      startDaemon: async () => ({ status: { running: true, pid: 7777 }, pid: 7777, alreadyRunning: true }),
    });

    const result = (await tools.schedule_daemon_start.execute({}, {})) as { success: boolean; output: string };

    expect(result.success).toBe(true);
    expect(result.output).toBe("Schedule daemon already running (pid 7777).");
  });

  it("formats daemon stop output", async () => {
    const { tools } = createScheduleToolSet({
      stopDaemon: async () => ({ status: { running: false, pid: null }, pid: 8888, wasRunning: true }),
    });

    const result = (await tools.schedule_daemon_stop.execute({}, {})) as { success: boolean; output: string };

    expect(result.success).toBe(true);
    expect(result.output).toBe("Schedule daemon stopped (pid 8888).");
  });
});
