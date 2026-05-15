import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { readFileSyncMock, existsSyncMock, writeFileSyncMock, mkdirSyncMock } = vi.hoisted(() => ({
  readFileSyncMock: vi.fn(),
  existsSyncMock: vi.fn(),
  writeFileSyncMock: vi.fn(),
  mkdirSyncMock: vi.fn(),
}));

vi.mock("fs", () => ({
  readFileSync: readFileSyncMock,
  existsSync: existsSyncMock,
  writeFileSync: writeFileSyncMock,
  mkdirSync: mkdirSyncMock,
}));

const ENV_KEYS = [
  "GROK_PROVIDER",
  "GROK_VERTEX_PROJECT_ID",
  "GROK_VERTEX_LOCATION",
  "GROK_VERTEX_BASE_URL",
  "GROK_VERTEX_AUTH_MODE",
  "GCP_PROJECT_ID",
  "GCP_VERTEX_LOCATION",
] as const;

function clearVertexEnv() {
  for (const key of ENV_KEYS) {
    delete process.env[key];
  }
}

function stubSettingsFile(payload: unknown) {
  existsSyncMock.mockReturnValue(true);
  readFileSyncMock.mockReturnValue(JSON.stringify(payload));
}

function stubMissingSettingsFile() {
  existsSyncMock.mockReturnValue(false);
  readFileSyncMock.mockReturnValue("");
}

beforeEach(() => {
  vi.resetModules();
  readFileSyncMock.mockReset();
  existsSyncMock.mockReset();
  writeFileSyncMock.mockReset();
  mkdirSyncMock.mockReset();
  clearVertexEnv();
});

afterEach(() => {
  clearVertexEnv();
});

describe("provider selection", () => {
  it("defaults to xai when nothing is configured", async () => {
    stubMissingSettingsFile();
    const settings = await import("./settings");
    expect(settings.getActiveProvider()).toBe("xai");
    expect(settings.isVertexProviderActive()).toBe(false);
  });

  it("reads provider from user settings", async () => {
    stubSettingsFile({ provider: "vertex" });
    const settings = await import("./settings");
    expect(settings.getActiveProvider()).toBe("vertex");
    expect(settings.isVertexProviderActive()).toBe(true);
  });

  it("lets GROK_PROVIDER env override saved settings", async () => {
    stubSettingsFile({ provider: "vertex" });
    process.env.GROK_PROVIDER = "xai";
    const settings = await import("./settings");
    expect(settings.getActiveProvider()).toBe("xai");
  });

  it("ignores unknown provider values from settings", async () => {
    stubSettingsFile({ provider: "anthropic" });
    const settings = await import("./settings");
    expect(settings.getActiveProvider()).toBe("xai");
  });

  it("normalizes case and whitespace from env", async () => {
    stubMissingSettingsFile();
    process.env.GROK_PROVIDER = "  Vertex  ";
    const settings = await import("./settings");
    expect(settings.getActiveProvider()).toBe("vertex");
  });
});

describe("resolveVertexSettings", () => {
  it("falls back to defaults when nothing is set", async () => {
    stubMissingSettingsFile();
    const settings = await import("./settings");
    const resolved = settings.resolveVertexSettings();
    expect(resolved).toEqual({
      projectId: undefined,
      location: settings.DEFAULT_VERTEX_LOCATION,
      baseURL: settings.DEFAULT_VERTEX_BASE_URL,
      authMode: settings.DEFAULT_VERTEX_AUTH_MODE,
    });
  });

  it("loads saved Vertex settings from user-settings.json", async () => {
    stubSettingsFile({
      provider: "vertex",
      vertex: { projectId: "my-proj", location: "us-central1", authMode: "adc" },
    });
    const settings = await import("./settings");
    const resolved = settings.resolveVertexSettings();
    expect(resolved.projectId).toBe("my-proj");
    expect(resolved.location).toBe("us-central1");
    expect(resolved.authMode).toBe("adc");
    expect(resolved.baseURL).toBe(settings.DEFAULT_VERTEX_BASE_URL);
  });

  it("normalizes a saved unsupported authMode back to the adc default", async () => {
    stubSettingsFile({
      provider: "vertex",
      // The user (or a future-version of the CLI) wrote a value the
      // current build does not support. We want to fall back to the
      // safe default rather than honor a mode the auth module would
      // reject at request time.
      vertex: { projectId: "my-proj", authMode: "oauth_token" as never },
    });
    const settings = await import("./settings");
    expect(settings.resolveVertexSettings().authMode).toBe(settings.DEFAULT_VERTEX_AUTH_MODE);
  });

  it("env overrides saved settings", async () => {
    stubSettingsFile({
      vertex: { projectId: "saved-proj", location: "us-central1" },
    });
    process.env.GROK_VERTEX_PROJECT_ID = "env-proj";
    process.env.GROK_VERTEX_LOCATION = "europe-west4";
    const settings = await import("./settings");
    const resolved = settings.resolveVertexSettings();
    expect(resolved.projectId).toBe("env-proj");
    expect(resolved.location).toBe("europe-west4");
  });

  it("falls back to GCP_PROJECT_ID when GROK_VERTEX_PROJECT_ID is unset", async () => {
    stubMissingSettingsFile();
    process.env.GCP_PROJECT_ID = "gcp-proj";
    const settings = await import("./settings");
    expect(settings.resolveVertexSettings().projectId).toBe("gcp-proj");
  });

  it("strips trailing slashes from baseURL", async () => {
    stubMissingSettingsFile();
    process.env.GROK_VERTEX_BASE_URL = "https://aiplatform.googleapis.com//";
    const settings = await import("./settings");
    expect(settings.resolveVertexSettings().baseURL).toBe("https://aiplatform.googleapis.com");
  });

  it("ignores blank string values from settings and env", async () => {
    stubSettingsFile({ vertex: { projectId: "  ", location: "" } });
    process.env.GROK_VERTEX_LOCATION = "   ";
    const settings = await import("./settings");
    const resolved = settings.resolveVertexSettings();
    expect(resolved.projectId).toBeUndefined();
    expect(resolved.location).toBe("global");
  });
});

describe("requireVertexSettings", () => {
  it("returns the resolved tuple when projectId is present", async () => {
    stubSettingsFile({ vertex: { projectId: "my-proj" } });
    const settings = await import("./settings");
    expect(settings.requireVertexSettings()).toEqual({
      projectId: "my-proj",
      location: settings.DEFAULT_VERTEX_LOCATION,
      baseURL: settings.DEFAULT_VERTEX_BASE_URL,
      authMode: settings.DEFAULT_VERTEX_AUTH_MODE,
    });
  });

  it("throws a descriptive error when projectId is missing", async () => {
    stubMissingSettingsFile();
    const settings = await import("./settings");
    expect(() => settings.requireVertexSettings()).toThrow(/no project id is configured/);
  });
});

describe("saveUserSettings vertex normalization", () => {
  it("persists provider and vertex fields together", async () => {
    stubMissingSettingsFile();
    const settings = await import("./settings");
    settings.saveUserSettings({
      provider: "vertex",
      vertex: { projectId: "  my-proj  ", location: "us-central1" },
    });

    expect(writeFileSyncMock).toHaveBeenCalledTimes(1);
    const written = JSON.parse(writeFileSyncMock.mock.calls[0]?.[1] as string);
    expect(written.provider).toBe("vertex");
    expect(written.vertex).toEqual({ projectId: "my-proj", location: "us-central1" });
  });

  it("merges new vertex fields over existing saved fields", async () => {
    stubSettingsFile({
      provider: "vertex",
      vertex: { projectId: "old-proj", location: "us-east1", authMode: "adc" },
    });
    const settings = await import("./settings");
    settings.saveUserSettings({ vertex: { projectId: "new-proj" } });

    const written = JSON.parse(writeFileSyncMock.mock.calls[0]?.[1] as string);
    expect(written.vertex).toEqual({
      projectId: "new-proj",
      location: "us-east1",
      authMode: "adc",
    });
  });

  it("rejects invalid provider values silently", async () => {
    stubMissingSettingsFile();
    const settings = await import("./settings");
    settings.saveUserSettings({ provider: "anthropic" as never });

    const written = JSON.parse(writeFileSyncMock.mock.calls[0]?.[1] as string);
    expect(written.provider).toBeUndefined();
  });

  it("rejects invalid authMode values silently", async () => {
    stubMissingSettingsFile();
    const settings = await import("./settings");
    settings.saveUserSettings({ vertex: { authMode: "weird-mode" as never } });

    const written = JSON.parse(writeFileSyncMock.mock.calls[0]?.[1] as string);
    expect(written.vertex).toEqual({});
  });
});
