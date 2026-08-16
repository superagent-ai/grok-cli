import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import { ensureBuilt, findLocalTsc, isSourceCheckout, shouldRebuild } from "../../bin/ensure-built.js";

let tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs) fs.rmSync(dir, { recursive: true, force: true });
  tempDirs = [];
});

function createTempDir(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

function writeFile(filePath: string, contents: string, mtimeMs: number): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, contents);
  fs.utimesSync(filePath, mtimeMs / 1000, mtimeMs / 1000);
}

function createCheckout(options?: { withDist?: boolean; withTsc?: boolean }): string {
  const root = createTempDir("grok-rebuild-");
  const now = Date.UTC(2026, 3, 1, 12, 0, 0);
  writeFile(path.join(root, "package.json"), '{"name":"grok-kev"}', now);
  writeFile(path.join(root, "tsconfig.json"), "{}", now);
  writeFile(path.join(root, "src", "index.ts"), "export const ready = true;\n", now);
  if (options?.withDist) {
    writeFile(path.join(root, "dist", "index.js"), "export {};\n", now + 60_000);
  }
  if (options?.withTsc) {
    writeFile(path.join(root, "node_modules", "typescript", "bin", "tsc"), "#!/usr/bin/env node\n", now);
  }
  return root;
}

describe("isSourceCheckout", () => {
  it("is true only when both src/index.ts and tsconfig.json exist", () => {
    const root = createCheckout();
    expect(isSourceCheckout(root)).toBe(true);

    fs.rmSync(path.join(root, "src", "index.ts"));
    expect(isSourceCheckout(root)).toBe(false);
  });

  it("is false for an installed package without sources", () => {
    const root = createTempDir("grok-pkg-");
    writeFile(path.join(root, "package.json"), "{}", Date.now());
    writeFile(path.join(root, "dist", "index.js"), "export {};\n", Date.now());
    expect(isSourceCheckout(root)).toBe(false);
  });
});

describe("shouldRebuild", () => {
  it("does not rebuild published installs", () => {
    const root = createTempDir("grok-published-");
    writeFile(path.join(root, "package.json"), "{}", Date.now());
    writeFile(path.join(root, "dist", "index.js"), "export {};\n", Date.now());
    expect(shouldRebuild(root)).toEqual({ needed: false, reason: "not a source checkout" });
  });

  it("rebuilds when dist/index.js is missing", () => {
    const root = createCheckout();
    expect(shouldRebuild(root)).toEqual({ needed: true, reason: "dist/index.js is missing" });
  });

  it("rebuilds when a source file is newer than dist", () => {
    const root = createCheckout({ withDist: true });
    const newer = Date.UTC(2026, 3, 1, 13, 0, 0);
    writeFile(path.join(root, "src", "utils", "session-auth.ts"), "export {};\n", newer);

    expect(shouldRebuild(root)).toEqual({ needed: true, reason: "src/utils/session-auth.ts is newer than dist" });
  });

  it("does not rebuild when dist is newer than sources", () => {
    const root = createCheckout({ withDist: true });
    expect(shouldRebuild(root)).toEqual({ needed: false, reason: "dist is up to date" });
  });

  it("ignores newer test files", () => {
    const root = createCheckout({ withDist: true });
    writeFile(path.join(root, "src", "utils", "session-auth.test.ts"), "export {};\n", Date.UTC(2026, 3, 1, 14, 0, 0));
    expect(shouldRebuild(root)).toEqual({ needed: false, reason: "dist is up to date" });
  });

  it("rebuilds when package.json is newer than dist", () => {
    const root = createCheckout({ withDist: true });
    writeFile(path.join(root, "package.json"), '{"name":"grok-kev","version":"9.9.9"}', Date.UTC(2026, 3, 1, 15, 0, 0));
    expect(shouldRebuild(root)).toEqual({ needed: true, reason: "package.json is newer than dist" });
  });

  it("skips rebuild when GROK_SKIP_REBUILD is set", () => {
    const root = createCheckout();
    expect(shouldRebuild(root, { env: { GROK_SKIP_REBUILD: "1" } })).toEqual({
      needed: false,
      reason: "GROK_SKIP_REBUILD is set",
    });
  });
});

describe("findLocalTsc", () => {
  it("returns the checkout typescript binary when present", () => {
    const root = createCheckout({ withTsc: true });
    expect(findLocalTsc(root)).toBe(path.join(root, "node_modules", "typescript", "bin", "tsc"));
  });

  it("returns null when typescript is not installed", () => {
    expect(findLocalTsc(createCheckout())).toBeNull();
  });
});

describe("ensureBuilt", () => {
  it("does not invoke the builder when dist is current", () => {
    const root = createCheckout({ withDist: true });
    const calls: string[] = [];
    const result = ensureBuilt(root, {
      runBuild: () => {
        calls.push("build");
        return { status: 0 };
      },
    });
    expect(result).toEqual({ rebuilt: false, reason: "dist is up to date", status: 0 });
    expect(calls).toEqual([]);
  });

  it("invokes the builder when sources are newer", () => {
    const root = createCheckout();
    const result = ensureBuilt(root, {
      runBuild: () => ({ status: 0 }),
    });
    expect(result).toEqual({ rebuilt: true, reason: "dist/index.js is missing", status: 0 });
  });

  it("hard-fails when compilation fails and dist is missing", () => {
    const root = createCheckout();
    const result = ensureBuilt(root, {
      runBuild: () => ({ status: 2 }),
    });
    expect(result).toEqual({ rebuilt: false, reason: "dist/index.js is missing", status: 2 });
  });

  it("keeps the last good dist when compilation fails", () => {
    const root = createCheckout({ withDist: true });
    writeFile(path.join(root, "src", "index.ts"), "export const ready = false;\n", Date.UTC(2026, 3, 1, 16, 0, 0));
    const result = ensureBuilt(root, {
      runBuild: () => ({ status: 2 }),
    });
    expect(result).toEqual({ rebuilt: false, reason: "src/index.ts is newer than dist", status: 0 });
  });
});
