import { rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const originalEnv = {
  GROK_API_KEY: process.env.GROK_API_KEY,
  GROK_USE_VERTEX: process.env.GROK_USE_VERTEX,
  GROK_USER_SETTINGS_PATH: process.env.GROK_USER_SETTINGS_PATH,
  GROK_VERTEX_PROJECT_ID: process.env.GROK_VERTEX_PROJECT_ID,
  GCP_PROJECT_ID: process.env.GCP_PROJECT_ID,
  GOOGLE_CLOUD_PROJECT: process.env.GOOGLE_CLOUD_PROJECT,
  GCLOUD_PROJECT: process.env.GCLOUD_PROJECT,
};

const testUserSettingsPath = path.join(os.tmpdir(), `grok-agent-auth-${process.pid}.json`);

function restoreEnv(): void {
  rmSync(testUserSettingsPath, { force: true });
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

async function importAgentWithStorageMock() {
  vi.resetModules();
  vi.doMock("../storage/index", () => ({
    appendCompaction: vi.fn(),
    appendMessages: vi.fn(() => []),
    appendSystemMessage: vi.fn(() => 0),
    buildChatEntries: vi.fn(() => []),
    getNextMessageSequence: vi.fn(() => 0),
    getSessionTotalTokens: vi.fn(() => 0),
    loadTranscript: vi.fn(() => []),
    loadTranscriptState: vi.fn(() => ({ messages: [], seqs: [] })),
    recordUsageEvent: vi.fn(),
    SessionStore: class {
      getWorkspace() {
        return null;
      }
      openSession() {
        return null;
      }
      createSession() {
        return null;
      }
      setModel() {}
      getRequiredSession() {
        return null;
      }
      setMode() {}
      touchSession() {}
    },
  }));

  return import("./agent");
}

describe("Agent auth state", () => {
  afterEach(() => {
    restoreEnv();
    vi.restoreAllMocks();
    vi.resetModules();
    vi.doUnmock("../storage/index");
  });

  it("does not treat incomplete Vertex environment as configured auth", async () => {
    const { Agent } = await importAgentWithStorageMock();
    process.env.GROK_USER_SETTINGS_PATH = testUserSettingsPath;
    process.env.GROK_USE_VERTEX = "1";
    delete process.env.GROK_VERTEX_PROJECT_ID;
    delete process.env.GCP_PROJECT_ID;
    delete process.env.GOOGLE_CLOUD_PROJECT;
    delete process.env.GCLOUD_PROJECT;

    const agent = new Agent(undefined, undefined, undefined, undefined, { persistSession: false });

    expect(agent.hasApiKey()).toBe(false);
  });

  it("treats complete Vertex environment as configured auth without an xAI key", async () => {
    const { Agent } = await importAgentWithStorageMock();
    process.env.GROK_USER_SETTINGS_PATH = testUserSettingsPath;
    process.env.GROK_USE_VERTEX = "1";
    process.env.GROK_VERTEX_PROJECT_ID = "project-1";

    const agent = new Agent(undefined, undefined, undefined, undefined, { persistSession: false });

    expect(agent.hasApiKey()).toBe(true);
  });
});
