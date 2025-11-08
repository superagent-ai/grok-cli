import { spawnSync } from "child_process";
import path from "path";
import { describe, it } from "node:test";
import assert from "node:assert/strict";

const cliPath = path.resolve(__dirname, "../src/index.ts");

describe("🧠 Grok CLI — run command safety", () => {
  it("should show the command without executing in dry-run mode", () => {
    const result = spawnSync("bun", ["run", cliPath, "run", "echo Hello", "--dry-run"], {
      encoding: "utf-8"
    });

    assert.ok(String(result.stdout).includes("🧠 Suggested command:"), "Expected suggested command in stdout");
    assert.ok(String(result.stdout).includes("✅ Dry-run mode"), "Expected dry-run indicator in stdout");
    assert.strictEqual(result.status, 0);
  });

  it("should ask for confirmation when --confirm is used", () => {
    const result = spawnSync("bun", ["run", cliPath, "run", "echo Hi", "--confirm"], {
      encoding: "utf-8",
      input: "n\n"
    });

    assert.ok(String(result.stdout).includes("⚠️  Do you want to run this command?"), "Expected confirmation prompt");
    assert.ok(String(result.stdout).includes("❌ Command aborted by user."), "Expected abort message");
  });

  it("should execute command when confirmed", () => {
    const result = spawnSync("bun", ["run", cliPath, "run", "echo Confirmed", "--confirm"], {
      encoding: "utf-8",
      input: "y\n"
    });

    assert.ok(String(result.stdout).includes("🚀 Running command..."), "Expected running message");
    assert.ok(String(result.stdout).includes("Confirmed"), "Expected command output");
  });

  it("should execute command directly without flags", () => {
    const result = spawnSync("bun", ["run", cliPath, "run", "echo DirectRun"], {
      encoding: "utf-8"
    });

    assert.ok(String(result.stdout).includes("DirectRun"), "Expected DirectRun output");
  });

  it("should handle errors gracefully", () => {
    const result = spawnSync("bun", ["run", cliPath, "run", "nonexistentcommand"], {
      encoding: "utf-8"
    });

    assert.ok(String(result.stderr).includes("❌ Command failed"), "Expected failure message in stderr");
  });
});
