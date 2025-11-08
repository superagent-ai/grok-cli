import { spawnSync } from "child_process";
import path from "path";
import { describe, it, expect } from "bun:test";

const cliPath = path.resolve(__dirname, "../src/index.ts");

describe("🧠 Grok CLI — run command safety", () => {
  it("should show the command without executing in dry-run mode", () => {
    const result = spawnSync("bun", ["run", cliPath, "run", "echo Hello", "--dry-run"], {
      encoding: "utf-8"
    });

    expect(result.stdout).toContain("🧠 Suggested command:");
    expect(result.stdout).toContain("✅ Dry-run mode");
    expect(result.status).toBe(0);
  });

  it("should ask for confirmation when --confirm is used", () => {
    const result = spawnSync("bun", ["run", cliPath, "run", "echo Hi", "--confirm"], {
      encoding: "utf-8",
      input: "n\n"
    });

    expect(result.stdout).toContain("⚠️  Do you want to run this command?");
    expect(result.stdout).toContain("❌ Command aborted by user.");
  });

  it("should execute command when confirmed", () => {
    const result = spawnSync("bun", ["run", cliPath, "run", "echo Confirmed", "--confirm"], {
      encoding: "utf-8",
      input: "y\n"
    });

    expect(result.stdout).toContain("🚀 Running command...");
    expect(result.stdout).toContain("Confirmed");
  });

  it("should execute command directly without flags", () => {
    const result = spawnSync("bun", ["run", cliPath, "run", "echo DirectRun"], {
      encoding: "utf-8"
    });

    expect(result.stdout).toContain("DirectRun");
  });

  it("should handle errors gracefully", () => {
    const result = spawnSync("bun", ["run", cliPath, "run", "nonexistentcommand"], {
      encoding: "utf-8"
    });

    expect(result.stderr).toContain("❌ Command failed");
  });
});
