import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { BashTool, getSandboxMutationBlockReason, wrapCommandForShuru } from "./bash";

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

describe("wrapCommandForShuru", () => {
  it("wraps a simple command with mount and workspace cd", () => {
    const result = wrapCommandForShuru("/repo", "echo hi");
    expect(result).toBe("shuru run --mount '/repo:/workspace' -- sh -lc 'cd /workspace && echo hi'");
  });

  it("handles paths with spaces", () => {
    const result = wrapCommandForShuru("/my repo", "ls");
    expect(result).toBe("shuru run --mount '/my repo:/workspace' -- sh -lc 'cd /workspace && ls'");
  });

  it("escapes single quotes in the command", () => {
    const result = wrapCommandForShuru("/repo", "echo 'hello world'");
    expect(result).toContain("'\\''hello world'\\''");
  });

  it("includes --allow-net when allowNet is true", () => {
    const result = wrapCommandForShuru("/repo", "curl example.com", { allowNet: true });
    expect(result).toContain("--allow-net");
    expect(result).toContain("--mount '/repo:/workspace'");
  });

  it("includes --allow-host flags for each allowed host", () => {
    const result = wrapCommandForShuru("/repo", "curl api.openai.com", {
      allowNet: true,
      allowedHosts: ["api.openai.com", "registry.npmjs.org"],
    });
    expect(result).toContain("--allow-net");
    expect(result).toContain("--allow-host api.openai.com");
    expect(result).toContain("--allow-host registry.npmjs.org");
  });

  it("includes port forwards", () => {
    const result = wrapCommandForShuru("/repo", "python -m http.server", { ports: ["8080:8000", "8443:443"] });
    expect(result).toContain("-p 8080:8000");
    expect(result).toContain("-p 8443:443");
  });

  it("includes resource limits", () => {
    const result = wrapCommandForShuru("/repo", "make -j4", { cpus: 4, memory: 4096, diskSize: 8192 });
    expect(result).toContain("--cpus 4");
    expect(result).toContain("--memory 4096");
    expect(result).toContain("--disk-size 8192");
  });

  it("includes --from checkpoint flag", () => {
    const result = wrapCommandForShuru("/repo", "python script.py", { from: "py-env" });
    expect(result).toContain("--from py-env");
  });

  it("includes --secret flags", () => {
    const result = wrapCommandForShuru("/repo", "curl https://api.openai.com", {
      allowNet: true,
      secrets: [{ name: "API_KEY", fromEnv: "OPENAI_API_KEY", hosts: ["api.openai.com"] }],
    });
    expect(result).toContain("--secret API_KEY=OPENAI_API_KEY@api.openai.com");
  });

  it("combines multiple settings correctly", () => {
    const result = wrapCommandForShuru("/repo", "echo hi", {
      allowNet: true,
      allowedHosts: ["example.com"],
      cpus: 2,
      from: "base",
    });
    expect(result).toMatch(/^shuru run --cpus 2 --allow-net --allow-host example\.com --from base --mount/);
  });

  it("uses default empty settings when none provided", () => {
    const result = wrapCommandForShuru("/repo", "echo hi", {});
    expect(result).toBe("shuru run --mount '/repo:/workspace' -- sh -lc 'cd /workspace && echo hi'");
  });
});

describe("getSandboxMutationBlockReason", () => {
  it("returns null for read-only git commands", () => {
    expect(getSandboxMutationBlockReason("git status")).toBeNull();
    expect(getSandboxMutationBlockReason("git diff")).toBeNull();
    expect(getSandboxMutationBlockReason("git log --oneline")).toBeNull();
    expect(getSandboxMutationBlockReason("git show HEAD")).toBeNull();
    expect(getSandboxMutationBlockReason("git rev-parse HEAD")).toBeNull();
    expect(getSandboxMutationBlockReason("git grep foo")).toBeNull();
    expect(getSandboxMutationBlockReason("git ls-files")).toBeNull();
  });

  it("blocks mutating git commands", () => {
    expect(getSandboxMutationBlockReason("git add .")).toContain("Sandbox mode blocks git commands");
    expect(getSandboxMutationBlockReason("git commit -m 'test'")).toContain("Sandbox mode blocks git commands");
    expect(getSandboxMutationBlockReason("git push")).toContain("Sandbox mode blocks git commands");
    expect(getSandboxMutationBlockReason("git checkout -b new")).toContain("Sandbox mode blocks git commands");
  });

  it("blocks git inside compound shell expressions", () => {
    expect(getSandboxMutationBlockReason('echo foo && git commit -m "test"')).toContain(
      "Sandbox mode blocks git commands",
    );
    expect(getSandboxMutationBlockReason('bash -c "git push"')).toContain("Sandbox mode blocks git commands");
  });

  it("blocks git branch since it can mutate", () => {
    expect(getSandboxMutationBlockReason("git branch -D feature")).toContain("Sandbox mode blocks git commands");
    expect(getSandboxMutationBlockReason("git branch new-name")).toContain("Sandbox mode blocks git commands");
  });

  it("blocks package-manager installs", () => {
    expect(getSandboxMutationBlockReason("npm install express")).toContain("Package-manager installs");
    expect(getSandboxMutationBlockReason("yarn add lodash")).toContain("Package-manager installs");
    expect(getSandboxMutationBlockReason("pnpm install")).toContain("Package-manager installs");
    expect(getSandboxMutationBlockReason("bun add zod")).toContain("Package-manager installs");
  });

  it("blocks package-manager installs in compound commands", () => {
    expect(getSandboxMutationBlockReason("echo foo && npm install express")).toContain("Package-manager installs");
  });

  it("blocks formatters that rewrite files", () => {
    expect(getSandboxMutationBlockReason("prettier --write src/")).toContain("formatters");
    expect(getSandboxMutationBlockReason("biome check --write src/")).toContain("formatters");
  });

  it("allows safe non-mutating commands", () => {
    expect(getSandboxMutationBlockReason("ls -la")).toBeNull();
    expect(getSandboxMutationBlockReason("cat README.md")).toBeNull();
    expect(getSandboxMutationBlockReason("grep -r foo src/")).toBeNull();
    expect(getSandboxMutationBlockReason("uname -a")).toBeNull();
    expect(getSandboxMutationBlockReason("npm run test")).toBeNull();
    expect(getSandboxMutationBlockReason("node -e 'console.log(1)'")).toBeNull();
  });

  it("returns null for empty commands", () => {
    expect(getSandboxMutationBlockReason("")).toBeNull();
    expect(getSandboxMutationBlockReason("   ")).toBeNull();
  });
});

describe("BashTool sandbox state", () => {
  it("tracks cwd changes independently of sandbox mode", () => {
    const root = makeTempDir("grok-bash-test-");
    const nested = path.join(root, "nested");
    fs.mkdirSync(nested);
    const bash = new BashTool(root, { sandboxMode: "shuru" });

    expect(bash.getCwd()).toBe(root);
    expect(bash.getSandboxMode()).toBe("shuru");
  });

  it("can switch sandbox mode at runtime", () => {
    const bash = new BashTool("/repo", { sandboxMode: "off" });

    expect(bash.getSandboxMode()).toBe("off");

    bash.setSandboxMode("shuru");

    expect(bash.getSandboxMode()).toBe("shuru");
  });

  it("returns sandbox-aware tool description", () => {
    const off = new BashTool("/repo", { sandboxMode: "off" });
    const on = new BashTool("/repo", { sandboxMode: "shuru" });

    expect(off.getToolDescription()).not.toContain("Shuru");
    expect(on.getToolDescription()).toContain("Shuru sandbox");
    expect(on.getToolDescription()).toContain("do not persist back to the host");
  });

  it("stores and returns sandbox settings", () => {
    const bash = new BashTool("/repo", {
      sandboxMode: "shuru",
      sandboxSettings: { allowNet: true, cpus: 4 },
    });

    expect(bash.getSandboxSettings()).toEqual({ allowNet: true, cpus: 4 });
  });

  it("can update sandbox settings at runtime", () => {
    const bash = new BashTool("/repo", { sandboxMode: "shuru" });

    expect(bash.getSandboxSettings()).toEqual({});

    bash.setSandboxSettings({ allowNet: true, allowedHosts: ["api.openai.com"] });

    expect(bash.getSandboxSettings()).toEqual({ allowNet: true, allowedHosts: ["api.openai.com"] });
  });

  it("includes network status in tool description when allowNet is set", () => {
    const netOn = new BashTool("/repo", {
      sandboxMode: "shuru",
      sandboxSettings: { allowNet: true },
    });
    expect(netOn.getToolDescription()).toContain("network access is enabled");

    const netRestricted = new BashTool("/repo", {
      sandboxMode: "shuru",
      sandboxSettings: { allowNet: true, allowedHosts: ["api.openai.com"] },
    });
    expect(netRestricted.getToolDescription()).toContain("network is restricted to: api.openai.com");

    const netOff = new BashTool("/repo", {
      sandboxMode: "shuru",
      sandboxSettings: { allowNet: false },
    });
    expect(netOff.getToolDescription()).toContain("network is disabled");
  });
});
