import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { VerifyRecipe } from "../types/index";
import {
  buildVerifyDetectPrompt,
  buildVerifyTaskPrompt,
  createVerifyRuntimeConfig,
  getVerifyCliError,
  inferVerifyProjectProfile,
  inferVerifySmokeUrl,
  VERIFY_PROMPT,
} from "./entrypoint";

const tempDirs: string[] = [];

function makeTempDir(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("verify entrypoint helpers", () => {
  it("infers a localhost smoke URL from a single forwarded port", () => {
    expect(inferVerifySmokeUrl({ ports: ["3000:3000"] })).toBe("http://127.0.0.1:3000");
  });

  it("does not infer a smoke URL when multiple ports are configured", () => {
    expect(inferVerifySmokeUrl({ ports: ["3000:3000", "4173:4173"] })).toBeNull();
  });

  it("detects a nextjs app and infers a default port", () => {
    const dir = makeTempDir("grok-verify-next-");
    fs.writeFileSync(
      path.join(dir, "package.json"),
      JSON.stringify(
        {
          dependencies: { next: "15.0.0", react: "19.0.0" },
          scripts: { dev: "next dev", build: "next build", lint: "next lint" },
        },
        null,
        2,
      ),
    );
    fs.writeFileSync(path.join(dir, "package-lock.json"), "");

    const profile = inferVerifyProjectProfile(dir);
    expect(profile.appKind).toBe("nextjs");
    expect(profile.packageManager).toBe("npm");
    expect(profile.sandboxSettings.ports).toEqual(["3000:3000"]);
    expect(profile.availableScripts).toEqual(["dev", "build", "lint"]);
    expect(profile.recipe.bootstrapCommands[0]).toContain("node");
    expect(profile.recipe.startCommand).toBe("npm run dev");
    expect(profile.recipe.testCommands).toContain("npm run lint");
  });

  it("adds bun bootstrap commands for bun-based node apps", () => {
    const dir = makeTempDir("grok-verify-bun-");
    fs.writeFileSync(
      path.join(dir, "package.json"),
      JSON.stringify({ dependencies: { next: "15.0.0" }, scripts: { dev: "next dev" } }, null, 2),
    );
    fs.writeFileSync(path.join(dir, "bun.lock"), "");

    const profile = inferVerifyProjectProfile(dir);
    expect(profile.packageManager).toBe("bun");
    expect(profile.recipe.shellInitCommands.join(" ")).toContain("$HOME/.bun/bin");
    expect(profile.recipe.bootstrapCommands.join(" ")).toContain("bun.sh/install");
    expect(profile.recipe.installCommands).toContain("bun install");
  });

  it("enables ephemeral installs in the verify runtime config", () => {
    const dir = makeTempDir("grok-verify-runtime-");
    fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ scripts: { test: "vitest run" } }, null, 2));

    const runtime = createVerifyRuntimeConfig(dir);
    expect(runtime.sandboxMode).toBe("shuru");
    expect(runtime.sandboxSettings.allowEphemeralInstall).toBe(true);
    expect(runtime.sandboxSettings.allowNet).toBe(true);
  });

  it("forces full network in verify mode and ignores inherited allowlists", () => {
    const dir = makeTempDir("grok-verify-network-");
    fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ scripts: { dev: "next dev" } }, null, 2));

    const runtime = createVerifyRuntimeConfig(dir, {
      allowNet: false,
      allowedHosts: ["registry.npmjs.org"],
      ports: ["3000:3000"],
    });

    expect(runtime.sandboxSettings.allowNet).toBe(true);
    expect(runtime.sandboxSettings.allowedHosts).toBeUndefined();
    expect(runtime.sandboxSettings.ports).toEqual(["3000:3000"]);
  });

  it("preserves explicit sandbox ports over inferred defaults", () => {
    const dir = makeTempDir("grok-verify-override-");
    fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ dependencies: { next: "15.0.0" } }, null, 2));

    const profile = inferVerifyProjectProfile(dir, { ports: ["4444:4444"], from: "web-env" });
    expect(profile.sandboxSettings.ports).toEqual(["4444:4444"]);
    expect(profile.sandboxSettings.from).toBe("web-env");
  });

  it("uses an override recipe as the primary source of truth", () => {
    const dir = makeTempDir("grok-verify-override-recipe-");
    fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ dependencies: { next: "15.0.0" } }, null, 2));
    const overrideRecipe: VerifyRecipe = {
      ecosystem: "custom",
      appKind: "node",
      appLabel: "Custom app",
      shellInitCommands: ["export FOO=bar"],
      bootstrapCommands: ["echo bootstrap"],
      installCommands: ["echo install"],
      buildCommands: ["echo build"],
      testCommands: ["echo test"],
      startCommand: "echo start",
      startPort: "9999",
      smokeKind: "http",
      smokeTarget: "http://127.0.0.1:9999",
      evidence: ["custom detector"],
      notes: ["override"],
    };

    const profile = inferVerifyProjectProfile(dir, {}, overrideRecipe);
    expect(profile.recipe.ecosystem).toBe("custom");
    expect(profile.appLabel).toBe("Custom app");
    expect(profile.sandboxSettings.ports).toEqual(["9999:9999"]);
  });

  it("builds a generic python recipe", () => {
    const dir = makeTempDir("grok-verify-python-");
    fs.writeFileSync(path.join(dir, "pyproject.toml"), "[project]\nname = 'demo'\n");
    fs.mkdirSync(path.join(dir, "tests"));

    const profile = inferVerifyProjectProfile(dir);
    expect(profile.recipe.ecosystem).toBe("python");
    expect(profile.recipe.installCommands[0]).toContain("pip");
    expect(profile.recipe.testCommands[0]).toBe("pytest");
    expect(profile.recipe.smokeKind).toBe("none");
  });

  it("builds a go recipe from go.mod", () => {
    const dir = makeTempDir("grok-verify-go-");
    fs.writeFileSync(path.join(dir, "go.mod"), "module example.com/demo\n");
    fs.writeFileSync(path.join(dir, "main.go"), "package main\nfunc main() {}\n");

    const profile = inferVerifyProjectProfile(dir);
    expect(profile.recipe.ecosystem).toBe("go");
    expect(profile.recipe.buildCommands).toEqual(["go build ./..."]);
    expect(profile.recipe.testCommands).toEqual(["go test ./..."]);
    expect(profile.recipe.startCommand).toBe("go run .");
  });

  it("builds a task prompt with detected project context and browser guidance", () => {
    const dir = makeTempDir("grok-verify-prompt-");
    fs.writeFileSync(
      path.join(dir, "package.json"),
      JSON.stringify(
        {
          dependencies: { next: "15.0.0" },
          scripts: { dev: "next dev", build: "next build" },
        },
        null,
        2,
      ),
    );

    const prompt = buildVerifyTaskPrompt(dir, {
      from: "web-env",
      allowNet: true,
      allowedHosts: ["registry.npmjs.org"],
    });

    expect(prompt).toContain("Detected app type: Next.js.");
    expect(prompt).toContain("Recipe ecosystem: node.");
    expect(prompt).toContain("web-env");
    expect(prompt).toContain("registry.npmjs.org");
    expect(prompt).toContain("http://127.0.0.1:3000");
    expect(prompt).toContain("Available package.json scripts: dev, build.");
    expect(prompt).toContain("Bootstrap commands:");
    expect(prompt).toContain("Install commands:");
    expect(prompt).toContain("MUST run browser smoke tests");
    expect(prompt).toContain("--screenshot-dir .grok/verify-artifacts");
    expect(prompt).toContain("record start .grok/verify-artifacts/verify-smoke.webm");
    expect(prompt).toContain("record stop");
    expect(prompt).toContain("Browser Checks");
    expect(prompt).toContain("Evidence");
    expect(prompt).toContain("Recipe");
    expect(prompt).toContain("ephemeral dependency installs are allowed inside the sandbox");
    expect(prompt).toContain("prefer chaining install + build/test/start");
    expect(prompt).toContain(".grok/verify-artifacts");
    expect(prompt).toContain("markdown links");
  });

  it("builds a detector prompt that requests JSON output", () => {
    const dir = makeTempDir("grok-verify-detect-");
    fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ scripts: { dev: "next dev" } }, null, 2));
    const prompt = buildVerifyDetectPrompt(dir);
    expect(prompt).toContain("Return ONLY valid JSON");
    expect(prompt).toContain('"bootstrapCommands": string[]');
    expect(prompt).toContain("Fallback hints from static detection");
  });

  it("explains ambiguous browser setup when multiple ports exist", () => {
    const dir = makeTempDir("grok-verify-ambiguous-");
    fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ scripts: { dev: "node server.js" } }, null, 2));
    const prompt = buildVerifyTaskPrompt(dir, { ports: ["3000:3000", "8080:8080"] });
    expect(prompt).toContain("Multiple forwarded ports are configured");
    expect(prompt).toContain("Skip browser checks unless the user clearly identifies");
  });

  it("VERIFY_PROMPT drives both sub-agents", () => {
    expect(VERIFY_PROMPT).toContain("verify-detect");
    expect(VERIFY_PROMPT).toContain("Step 1");
    expect(VERIFY_PROMPT).toContain("Step 2");
    expect(VERIFY_PROMPT).toContain("task");
  });

  it("uses an override recipe when creating the runtime config", () => {
    const dir = makeTempDir("grok-verify-runtime-override-");
    const overrideRecipe: VerifyRecipe = {
      ecosystem: "custom",
      appKind: "node",
      appLabel: "Custom app",
      shellInitCommands: ["export FOO=bar"],
      bootstrapCommands: [],
      installCommands: [],
      buildCommands: [],
      testCommands: [],
      startCommand: undefined,
      startPort: undefined,
      smokeKind: "none",
      evidence: ["custom detector"],
      notes: [],
    };
    const runtime = createVerifyRuntimeConfig(dir, {}, overrideRecipe);
    expect(runtime.profile.recipe.ecosystem).toBe("custom");
    expect(runtime.sandboxSettings.shellInit).toEqual(["export FOO=bar"]);
  });

  it("adds notes for unknown projects instead of pretending it knows the recipe", () => {
    const dir = makeTempDir("grok-verify-unknown-");
    const profile = inferVerifyProjectProfile(dir);
    const recipe: VerifyRecipe = profile.recipe;
    expect(recipe.appKind).toBe("unknown");
    expect(recipe.notes[0]).toContain("inspect the repo directly");
  });

  it("validates CLI conflicts", () => {
    expect(getVerifyCliError({})).toBeNull();
    expect(getVerifyCliError({ hasPrompt: true })).toBe("Cannot combine --verify with --prompt.");
    expect(getVerifyCliError({ hasMessageArgs: true })).toBe("Cannot combine --verify with an opening message.");
  });
});
