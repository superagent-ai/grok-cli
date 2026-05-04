import { rmSync } from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getModelAuthStatus,
  getVertexSettings,
  hasModelAuthConfigured,
  isTruthyEnv,
  isVertexModeEnabled,
  requireVertexSettings,
} from "./settings";

const originalEnv = {
  GROK_USE_VERTEX: process.env.GROK_USE_VERTEX,
  GROK_USER_SETTINGS_PATH: process.env.GROK_USER_SETTINGS_PATH,
  GROK_VERTEX_PROJECT_ID: process.env.GROK_VERTEX_PROJECT_ID,
  GROK_VERTEX_LOCATION: process.env.GROK_VERTEX_LOCATION,
  GROK_VERTEX_BASE_URL: process.env.GROK_VERTEX_BASE_URL,
  GCP_PROJECT_ID: process.env.GCP_PROJECT_ID,
  GOOGLE_CLOUD_PROJECT: process.env.GOOGLE_CLOUD_PROJECT,
  GCLOUD_PROJECT: process.env.GCLOUD_PROJECT,
  GCP_REGION: process.env.GCP_REGION,
  GCP_VERTEX_LOCATION: process.env.GCP_VERTEX_LOCATION,
  GOOGLE_CLOUD_LOCATION: process.env.GOOGLE_CLOUD_LOCATION,
  GCP_VERTEX_BASE_URL: process.env.GCP_VERTEX_BASE_URL,
  GROK_API_KEY: process.env.GROK_API_KEY,
};

const testUserSettingsPath = path.join(os.tmpdir(), `grok-settings-vertex-${process.pid}.json`);
const require = createRequire(import.meta.url);
const nodeFs = require("node:fs") as typeof import("node:fs");

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

describe("Vertex settings", () => {
  beforeEach(() => {
    process.env.GROK_USER_SETTINGS_PATH = testUserSettingsPath;
    rmSync(testUserSettingsPath, { force: true });
  });

  afterEach(() => {
    restoreEnv();
  });

  it("detects truthy Vertex env values", () => {
    expect(isTruthyEnv("1")).toBe(true);
    expect(isTruthyEnv("true")).toBe(true);
    expect(isTruthyEnv("yes")).toBe(true);
    expect(isTruthyEnv("on")).toBe(true);
    expect(isTruthyEnv("0")).toBe(false);

    process.env.GROK_USE_VERTEX = "1";
    expect(isVertexModeEnabled()).toBe(true);
  });

  it("defaults to the global host and us-central1 location path", () => {
    process.env.GROK_VERTEX_PROJECT_ID = "project-1";

    expect(getVertexSettings()).toEqual({
      projectId: "project-1",
      location: "us-central1",
      baseURL: "https://aiplatform.googleapis.com",
    });
  });

  it("allows an explicit location path while keeping the host configurable", () => {
    process.env.GROK_VERTEX_PROJECT_ID = "project-2";
    process.env.GROK_VERTEX_LOCATION = "europe-west1";
    process.env.GROK_VERTEX_BASE_URL = "https://aiplatform.googleapis.com/";

    expect(getVertexSettings()).toEqual({
      projectId: "project-2",
      location: "europe-west1",
      baseURL: "https://aiplatform.googleapis.com",
    });
  });

  it("prefers Grok-specific Vertex env vars over broad Google Cloud fallbacks", () => {
    process.env.GROK_VERTEX_PROJECT_ID = "preferred-project";
    process.env.GROK_VERTEX_LOCATION = "europe-west1";
    process.env.GROK_VERTEX_BASE_URL = "https://vertex.example.test/";
    process.env.GCP_PROJECT_ID = "legacy-project";
    process.env.GCP_REGION = "us-central1";
    process.env.GCP_VERTEX_LOCATION = "asia-northeast1";
    process.env.GCP_VERTEX_BASE_URL = "https://legacy.example.test/";

    expect(getVertexSettings()).toEqual({
      projectId: "preferred-project",
      location: "europe-west1",
      baseURL: "https://vertex.example.test",
    });
  });

  it("treats global as a host-only value, not a Vertex location path", () => {
    process.env.GROK_VERTEX_PROJECT_ID = "project-1";
    process.env.GROK_VERTEX_LOCATION = "global";

    expect(getVertexSettings()).toMatchObject({
      projectId: "project-1",
      location: "us-central1",
    });
  });

  it("requires a Google Cloud project id", () => {
    expect(() => requireVertexSettings()).toThrow("Vertex AI is enabled, but no Google Cloud project is configured.");
  });

  it("reports missing auth when neither xAI nor Vertex is configured", () => {
    expect(hasModelAuthConfigured()).toBe(false);
    expect(getModelAuthStatus()).toMatchObject({
      configured: false,
      activeMode: "xai",
      xaiConfigured: false,
      vertex: {
        enabled: false,
        configured: false,
        location: "us-central1",
      },
    });
  });

  it("reports native xAI auth when an API key is configured", () => {
    process.env.GROK_API_KEY = "xai-test";

    expect(hasModelAuthConfigured()).toBe(true);
    expect(getModelAuthStatus()).toMatchObject({
      configured: true,
      activeMode: "xai",
      xaiConfigured: true,
    });
  });

  it("reports incomplete Vertex auth when GROK_USE_VERTEX is set without a project", () => {
    process.env.GROK_API_KEY = "xai-test";
    process.env.GROK_USE_VERTEX = "1";

    expect(hasModelAuthConfigured()).toBe(false);
    expect(getModelAuthStatus()).toMatchObject({
      configured: false,
      activeMode: "vertex",
      xaiConfigured: true,
      vertex: {
        enabled: true,
        configured: false,
        missing: ["GROK_VERTEX_PROJECT_ID"],
      },
    });
  });

  it("reports complete Vertex auth with default location", () => {
    process.env.GROK_USE_VERTEX = "1";
    process.env.GROK_VERTEX_PROJECT_ID = "project-1";

    expect(hasModelAuthConfigured()).toBe(true);
    expect(getModelAuthStatus()).toMatchObject({
      configured: true,
      activeMode: "vertex",
      vertex: {
        enabled: true,
        configured: true,
        projectId: "project-1",
        location: "us-central1",
        missing: [],
      },
    });
  });

  it("loads saved user settings once when reporting auth status", async () => {
    nodeFs.writeFileSync(
      testUserSettingsPath,
      JSON.stringify({
        apiKey: "saved-xai-key",
        vertex: {
          enabled: true,
          projectId: "saved-project",
        },
      }),
    );

    vi.resetModules();
    const readFileSync = vi.fn(nodeFs.readFileSync as typeof nodeFs.readFileSync);
    vi.doMock("fs", () => ({
      ...nodeFs,
      default: nodeFs,
      readFileSync,
    }));
    try {
      const { getModelAuthStatus: getFreshModelAuthStatus } = await import("./settings");
      expect(getFreshModelAuthStatus()).toMatchObject({
        configured: true,
        activeMode: "vertex",
        xaiConfigured: true,
        vertex: {
          enabled: true,
          configured: true,
          projectId: "saved-project",
        },
      });
      const settingsReads = readFileSync.mock.calls.filter(([filePath]) => filePath === testUserSettingsPath);
      expect(settingsReads).toHaveLength(1);
    } finally {
      vi.doUnmock("fs");
      vi.resetModules();
    }
  });
});
