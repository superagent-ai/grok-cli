import semverGt from "semver/functions/gt.js";
import semverValid from "semver/functions/valid.js";
import {
  fetchLatestReleaseVersion,
  getScriptInstallContext,
  isCurrentScriptManagedInstall,
  runScriptManagedUpdate,
} from "./install-manager";

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
    if (!canUseScriptManagedUpdate(currentVersion)) return null;

    const latestVersion = await fetchLatestReleaseVersion();
    if (!latestVersion || !semverValid(latestVersion)) return null;

    const normalizedCurrent = semverValid(currentVersion);
    if (!normalizedCurrent) return null;

    const hasUpdate = semverGt(latestVersion, normalizedCurrent);
    return { currentVersion: normalizedCurrent, latestVersion, hasUpdate };
  } catch {
    return null;
  }
}

export function runUpdate(currentVersion: string): Promise<UpdateRunResult> {
  if (!canUseScriptManagedUpdate(currentVersion)) {
    return Promise.resolve({
      success: false,
      output:
        "This Grok command is not the active script-managed release install, so `grok update` was skipped to avoid replacing a different binary. Use the package manager or source checkout you launched Grok from.",
    });
  }

  return runScriptManagedUpdate(currentVersion);
}

function canUseScriptManagedUpdate(currentVersion: string): boolean {
  if (!isCurrentScriptManagedInstall()) return false;

  const context = getScriptInstallContext();
  const normalizedCurrent = semverValid(currentVersion);
  const normalizedMetadata = context?.metadata.version ? semverValid(context.metadata.version) : null;
  if (normalizedCurrent && normalizedMetadata && normalizedCurrent !== normalizedMetadata) return false;

  return true;
}
