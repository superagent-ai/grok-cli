import { exec } from "child_process";
import semverGt from "semver/functions/gt.js";
import semverValid from "semver/functions/valid.js";

const PACKAGE_NAME = "grok-dev";
const REGISTRY_URL = `https://registry.npmjs.org/${PACKAGE_NAME}/latest`;
const FETCH_TIMEOUT_MS = 3_000;

export interface UpdateCheckResult {
  currentVersion: string;
  latestVersion: string;
  hasUpdate: boolean;
}

export interface UpdateRunResult {
  success: boolean;
  output: string;
}

export async function checkForUpdate(currentVersion: string): Promise<UpdateCheckResult | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    const response = await fetch(REGISTRY_URL, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    clearTimeout(timer);

    if (!response.ok) return null;

    const data = (await response.json()) as { version?: string };
    const latestVersion = data.version;
    if (!latestVersion || !semverValid(latestVersion)) return null;

    const normalizedCurrent = semverValid(currentVersion);
    if (!normalizedCurrent) return null;

    const hasUpdate = semverGt(latestVersion, normalizedCurrent);
    return { currentVersion: normalizedCurrent, latestVersion, hasUpdate };
  } catch {
    return null;
  }
}

export function runUpdate(): Promise<UpdateRunResult> {
  return new Promise((resolve) => {
    const command = `npm install -g ${PACKAGE_NAME}@latest`;
    exec(command, { timeout: 60_000 }, (error, stdout, stderr) => {
      const output = (stdout || "").trim() + (stderr ? `\n${stderr.trim()}` : "");
      if (error) {
        resolve({ success: false, output: output || error.message });
      } else {
        resolve({ success: true, output: output || "Update complete." });
      }
    });
  });
}
