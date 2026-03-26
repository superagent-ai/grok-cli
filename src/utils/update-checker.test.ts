import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const REGISTRY_URL = "https://registry.npmjs.org/grok-dev/latest";

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
});

async function importModule() {
  return import("./update-checker");
}

describe("checkForUpdate", () => {
  it("returns hasUpdate=true when registry version is newer", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ version: "2.0.0" }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const { checkForUpdate } = await importModule();
    const result = await checkForUpdate("1.0.0");

    expect(result).not.toBeNull();
    expect(result!.hasUpdate).toBe(true);
    expect(result!.latestVersion).toBe("2.0.0");
    expect(result!.currentVersion).toBe("1.0.0");
    expect(mockFetch).toHaveBeenCalledWith(
      REGISTRY_URL,
      expect.objectContaining({ headers: { Accept: "application/json" } }),
    );
  });

  it("returns hasUpdate=false when current version matches latest", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ version: "1.0.0" }),
      }),
    );

    const { checkForUpdate } = await importModule();
    const result = await checkForUpdate("1.0.0");

    expect(result).not.toBeNull();
    expect(result!.hasUpdate).toBe(false);
  });

  it("detects update from prerelease to stable release", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ version: "1.0.0" }),
      }),
    );

    const { checkForUpdate } = await importModule();
    const result = await checkForUpdate("1.0.0-rc7");

    expect(result).not.toBeNull();
    expect(result!.hasUpdate).toBe(true);
    expect(result!.latestVersion).toBe("1.0.0");
    expect(result!.currentVersion).toBe("1.0.0-rc7");
  });

  it("returns hasUpdate=false when prerelease is newer than registry", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ version: "0.9.0" }),
      }),
    );

    const { checkForUpdate } = await importModule();
    const result = await checkForUpdate("1.0.0-rc7");

    expect(result).not.toBeNull();
    expect(result!.hasUpdate).toBe(false);
  });

  it("returns null when the fetch fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network error")));

    const { checkForUpdate } = await importModule();
    const result = await checkForUpdate("1.0.0");

    expect(result).toBeNull();
  });

  it("returns null when the registry returns a non-ok response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 404 }));

    const { checkForUpdate } = await importModule();
    const result = await checkForUpdate("1.0.0");

    expect(result).toBeNull();
  });

  it("returns null when the registry returns an invalid version", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ version: "not-a-version" }),
      }),
    );

    const { checkForUpdate } = await importModule();
    const result = await checkForUpdate("1.0.0");

    expect(result).toBeNull();
  });

  it("returns null when the current version is invalid", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ version: "2.0.0" }),
      }),
    );

    const { checkForUpdate } = await importModule();
    const result = await checkForUpdate("garbage");

    expect(result).toBeNull();
  });

  it("handles fetch timeout gracefully", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(() => new Promise((_, reject) => setTimeout(() => reject(new Error("aborted")), 10))),
    );

    const { checkForUpdate } = await importModule();
    const result = await checkForUpdate("1.0.0");

    expect(result).toBeNull();
  });
});

describe("runUpdate", () => {
  it("calls npm install and returns success on zero exit", async () => {
    vi.doMock("child_process", async () => {
      const actual = await vi.importActual<typeof import("child_process")>("child_process");
      return {
        ...actual,
        exec: (_cmd: string, _opts: unknown, cb: (err: Error | null, stdout: string, stderr: string) => void) => {
          cb(null, "added 1 package", "");
        },
      };
    });

    const { runUpdate } = await importModule();
    const result = await runUpdate();

    expect(result.success).toBe(true);
    expect(result.output).toContain("added 1 package");
  });

  it("returns failure when the command errors", async () => {
    vi.doMock("child_process", async () => {
      const actual = await vi.importActual<typeof import("child_process")>("child_process");
      return {
        ...actual,
        exec: (_cmd: string, _opts: unknown, cb: (err: Error | null, stdout: string, stderr: string) => void) => {
          cb(new Error("permission denied"), "", "permission denied");
        },
      };
    });

    const { runUpdate } = await importModule();
    const result = await runUpdate();

    expect(result.success).toBe(false);
    expect(result.output).toContain("permission denied");
  });
});
