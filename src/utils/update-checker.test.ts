import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const RELEASE_URL = "https://api.github.com/repos/superagent-ai/grok-cli/releases/latest";
const isCurrentScriptManagedInstallMock = vi.hoisted(() => vi.fn(() => true));
const getScriptInstallContextMock = vi.hoisted(() =>
  vi.fn(() => ({
    metadata: { version: "1.0.0" },
  })),
);

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
  isCurrentScriptManagedInstallMock.mockReset();
  isCurrentScriptManagedInstallMock.mockReturnValue(true);
  getScriptInstallContextMock.mockReset();
  getScriptInstallContextMock.mockReturnValue({
    metadata: { version: "1.0.0" },
  });
  vi.doMock("./install-manager", async () => {
    const actual = await vi.importActual<typeof import("./install-manager")>("./install-manager");
    return {
      ...actual,
      getScriptInstallContext: getScriptInstallContextMock,
      isCurrentScriptManagedInstall: isCurrentScriptManagedInstallMock,
    };
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
});

async function importModule() {
  return import("./update-checker");
}

describe("checkForUpdate", () => {
  it("returns null without fetching when the current process is not the script-managed install", async () => {
    isCurrentScriptManagedInstallMock.mockReturnValue(false);
    const mockFetch = vi.fn();
    vi.stubGlobal("fetch", mockFetch);

    const { checkForUpdate } = await importModule();
    const result = await checkForUpdate("1.0.0");

    expect(result).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("returns null without fetching when the running version does not match script metadata", async () => {
    getScriptInstallContextMock.mockReturnValue({
      metadata: { version: "1.1.6" },
    });
    const mockFetch = vi.fn();
    vi.stubGlobal("fetch", mockFetch);

    const { checkForUpdate } = await importModule();
    const result = await checkForUpdate("1.1.5");

    expect(result).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("returns hasUpdate=true when release version is newer", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ tag_name: "v2.0.0", assets: [] }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const { checkForUpdate } = await importModule();
    const result = await checkForUpdate("1.0.0");

    expect(result).not.toBeNull();
    expect(result!.hasUpdate).toBe(true);
    expect(result!.latestVersion).toBe("2.0.0");
    expect(result!.currentVersion).toBe("1.0.0");
    expect(mockFetch).toHaveBeenCalledWith(
      RELEASE_URL,
      expect.objectContaining({ headers: { Accept: "application/vnd.github+json" } }),
    );
  });

  it("returns hasUpdate=false when current version matches latest", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ tag_name: "v1.0.0", assets: [] }),
      }),
    );

    const { checkForUpdate } = await importModule();
    const result = await checkForUpdate("1.0.0");

    expect(result).not.toBeNull();
    expect(result!.hasUpdate).toBe(false);
  });

  it("detects update from prerelease to stable release", async () => {
    getScriptInstallContextMock.mockReturnValue({
      metadata: { version: "1.0.0-rc7" },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ tag_name: "v1.0.0", assets: [] }),
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
    getScriptInstallContextMock.mockReturnValue({
      metadata: { version: "1.0.0-rc7" },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ tag_name: "v0.9.0", assets: [] }),
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

  it("returns null when the release API returns a non-ok response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 404 }));

    const { checkForUpdate } = await importModule();
    const result = await checkForUpdate("1.0.0");

    expect(result).toBeNull();
  });

  it("returns null when the release API returns an invalid version", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ tag_name: "not-a-version", assets: [] }),
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
        json: () => Promise.resolve({ tag_name: "v2.0.0", assets: [] }),
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
  it("returns failure when the current process is not the script-managed install", async () => {
    isCurrentScriptManagedInstallMock.mockReturnValue(false);

    const { runUpdate } = await importModule();
    const result = await runUpdate("1.0.0");

    expect(result.success).toBe(false);
    expect(result.output).toContain("not the active script-managed release install");
  });

  it("returns failure when the running version does not match script metadata", async () => {
    getScriptInstallContextMock.mockReturnValue({
      metadata: { version: "1.1.6" },
    });

    const { runUpdate } = await importModule();
    const result = await runUpdate("1.1.5");

    expect(result.success).toBe(false);
    expect(result.output).toContain("not the active script-managed release install");
  });

  it("returns success when the script-managed updater succeeds", async () => {
    vi.doMock("./install-manager", async () => {
      const actual = await vi.importActual<typeof import("./install-manager")>("./install-manager");
      return {
        ...actual,
        getScriptInstallContext: getScriptInstallContextMock,
        isCurrentScriptManagedInstall: isCurrentScriptManagedInstallMock,
        runScriptManagedUpdate: vi.fn().mockResolvedValue({ success: true, output: "Updated to Grok 2.0.0." }),
      };
    });

    const { runUpdate } = await importModule();
    const result = await runUpdate("1.0.0");

    expect(result.success).toBe(true);
    expect(result.output).toContain("Updated");
  });

  it("returns failure when the script-managed updater fails", async () => {
    vi.doMock("./install-manager", async () => {
      const actual = await vi.importActual<typeof import("./install-manager")>("./install-manager");
      return {
        ...actual,
        getScriptInstallContext: getScriptInstallContextMock,
        isCurrentScriptManagedInstall: isCurrentScriptManagedInstallMock,
        runScriptManagedUpdate: vi.fn().mockResolvedValue({ success: false, output: "permission denied" }),
      };
    });

    const { runUpdate } = await importModule();
    const result = await runUpdate("1.0.0");

    expect(result.success).toBe(false);
    expect(result.output).toContain("permission denied");
  });
});
