import { spawn } from "child_process";
import { createHash } from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import readline from "readline";
import semverGt from "semver/functions/gt.js";
import semverValid from "semver/functions/valid.js";

export const GROK_GITHUB_REPO = "superagent-ai/grok-cli";
export const GROK_RELEASES_API = `https://api.github.com/repos/${GROK_GITHUB_REPO}/releases`;
export const SCRIPT_INSTALL_METHOD = "script";

const FETCH_TIMEOUT_MS = 5_000;
const INSTALL_SCHEMA_VERSION = 1;
const PATH_MARKER = "# grok";
const CONFIG_FILENAMES = ["user-settings.json", "AGENTS.md"];
const DATA_ENTRIES = ["daemon.pid", "delegations", "grok.db", "models", "schedules"];

export interface ReleaseTarget {
  key: "darwin-arm64" | "linux-x64" | "windows-x64";
  assetName: string;
  binaryName: string;
}

export interface ScriptInstallMetadata {
  schemaVersion: number;
  installMethod: typeof SCRIPT_INSTALL_METHOD;
  version: string;
  repo: string;
  binaryPath: string;
  installDir: string;
  assetName: string;
  target: ReleaseTarget["key"];
  installedAt: string;
  shellConfigPath?: string;
  pathCommand?: string;
}

export interface ScriptInstallContext {
  metadata: ScriptInstallMetadata;
  target: ReleaseTarget;
  binaryPath: string;
}

export interface ScriptUpdateRunResult {
  success: boolean;
  output: string;
}

export interface ScriptUninstallOptions {
  dryRun?: boolean;
  force?: boolean;
  keepConfig?: boolean;
  keepData?: boolean;
}

export interface ScriptUninstallPlan {
  removePaths: string[];
  pruneDirs: string[];
  pathCleanup?: { configFile: string; command: string };
}

interface GitHubReleaseAsset {
  name: string;
  browser_download_url: string;
}

interface GitHubRelease {
  tag_name: string;
  assets: GitHubReleaseAsset[];
}

interface ReleaseDownload {
  version: string;
  asset: GitHubReleaseAsset;
  checksums: GitHubReleaseAsset;
}

export function getGrokUserDir(homeDir = os.homedir()): string {
  return path.join(homeDir, ".grok");
}

export function getScriptInstallDir(homeDir = os.homedir()): string {
  return path.join(getGrokUserDir(homeDir), "bin");
}

export function getInstallMetadataPath(homeDir = os.homedir()): string {
  return path.join(getGrokUserDir(homeDir), "install.json");
}

export function getReleaseTargetForPlatform(platform = process.platform, arch = process.arch): ReleaseTarget | null {
  if (platform === "darwin" && (arch === "arm64" || arch === "x64"))
    return { key: "darwin-arm64", assetName: "grok-darwin-arm64", binaryName: "grok" };
  if (platform === "linux" && arch === "x64")
    return { key: "linux-x64", assetName: "grok-linux-x64", binaryName: "grok" };
  if (platform === "win32" && arch === "x64")
    return { key: "windows-x64", assetName: "grok-windows-x64.exe", binaryName: "grok.exe" };
  return null;
}

export function loadScriptInstallMetadata(homeDir = os.homedir()): ScriptInstallMetadata | null {
  const metadataPath = getInstallMetadataPath(homeDir);
  try {
    if (!fs.existsSync(metadataPath)) return null;
    const parsed = JSON.parse(fs.readFileSync(metadataPath, "utf8")) as Partial<ScriptInstallMetadata>;
    if (parsed.installMethod !== SCRIPT_INSTALL_METHOD) return null;
    if (
      typeof parsed.binaryPath !== "string" ||
      typeof parsed.installDir !== "string" ||
      typeof parsed.assetName !== "string" ||
      typeof parsed.target !== "string"
    )
      return null;
    return {
      schemaVersion: INSTALL_SCHEMA_VERSION,
      installMethod: SCRIPT_INSTALL_METHOD,
      version: typeof parsed.version === "string" ? parsed.version : "unknown",
      repo: typeof parsed.repo === "string" ? parsed.repo : GROK_GITHUB_REPO,
      binaryPath: parsed.binaryPath,
      installDir: parsed.installDir,
      assetName: parsed.assetName,
      target: parsed.target as ReleaseTarget["key"],
      installedAt: typeof parsed.installedAt === "string" ? parsed.installedAt : new Date(0).toISOString(),
      shellConfigPath: typeof parsed.shellConfigPath === "string" ? parsed.shellConfigPath : undefined,
      pathCommand: typeof parsed.pathCommand === "string" ? parsed.pathCommand : undefined,
    };
  } catch {
    return null;
  }
}

export function saveScriptInstallMetadata(metadata: ScriptInstallMetadata, homeDir = os.homedir()): void {
  const metadataPath = getInstallMetadataPath(homeDir);
  fs.mkdirSync(path.dirname(metadataPath), { recursive: true, mode: 0o700 });
  fs.writeFileSync(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`, { mode: 0o600 });
}

export function getScriptInstallContext(homeDir = os.homedir()): ScriptInstallContext | null {
  const target = getReleaseTargetForPlatform();
  if (!target) return null;

  const metadata = loadScriptInstallMetadata(homeDir);
  if (metadata) {
    return {
      metadata,
      target: getReleaseTargetForPlatformKey(metadata.target) ?? target,
      binaryPath: metadata.binaryPath,
    };
  }

  return null;
}

export async function fetchLatestReleaseVersion(): Promise<string | null> {
  const release = await fetchReleaseJson(`${GROK_RELEASES_API}/latest`);
  return release ? normalizeReleaseVersion(release.tag_name) : null;
}

export function parseChecksumsFile(contents: string): Map<string, string> {
  const result = new Map<string, string>();
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const match = line.match(/^([a-fA-F0-9]{64})\s+\*?(.+)$/);
    if (!match) continue;
    result.set(match[2], match[1].toLowerCase());
  }
  return result;
}

export async function runScriptManagedUpdate(currentVersion: string): Promise<ScriptUpdateRunResult> {
  const context = getScriptInstallContext();
  if (!context) return notScriptManaged("update");

  const normalizedCurrent = semverValid(currentVersion);
  if (!normalizedCurrent) {
    return { success: false, output: `Cannot update: current version "${currentVersion}" is invalid.` };
  }

  const release = await resolveReleaseDownload(context.target);
  if (!release) {
    return { success: false, output: "No matching release found for this platform." };
  }

  if (!semverGt(release.version, normalizedCurrent)) {
    return { success: true, output: `Already on the latest version (${normalizedCurrent}).` };
  }

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "grok-update-"));
  try {
    const downloadedPath = path.join(tempDir, release.asset.name);
    await downloadBinary(release.asset.browser_download_url, downloadedPath);

    const checksumsText = await downloadText(release.checksums.browser_download_url);
    const expectedHash = parseChecksumsFile(checksumsText).get(release.asset.name);
    if (!expectedHash) return { success: false, output: `Missing checksum for ${release.asset.name}.` };

    if (sha256File(downloadedPath) !== expectedHash) {
      return { success: false, output: `Checksum mismatch for ${release.asset.name}; aborting.` };
    }

    fs.mkdirSync(path.dirname(context.binaryPath), { recursive: true, mode: 0o700 });

    if (process.platform === "win32") {
      return applyWindowsUpdate(tempDir, downloadedPath, context, release);
    }

    const staging = `${context.binaryPath}.new`;
    fs.copyFileSync(downloadedPath, staging);
    fs.chmodSync(staging, 0o755);
    fs.renameSync(staging, context.binaryPath);

    saveScriptInstallMetadata({
      ...context.metadata,
      version: release.version,
      installedAt: new Date().toISOString(),
    });

    return { success: true, output: `Updated to Grok ${release.version}.` };
  } catch (error) {
    return { success: false, output: error instanceof Error ? error.message : String(error) };
  } finally {
    if (process.platform !== "win32") fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

export function buildScriptUninstallPlan(
  options: ScriptUninstallOptions = {},
  homeDir = os.homedir(),
): ScriptUninstallPlan | null {
  const context = getScriptInstallContext(homeDir);
  if (!context) return null;

  const userDir = getGrokUserDir(homeDir);
  const removePaths = new Set<string>();
  const pruneDirs = new Set<string>();

  if (!options.keepConfig && !options.keepData) {
    removePaths.add(userDir);
  } else {
    removePaths.add(context.binaryPath);
    removePaths.add(getInstallMetadataPath(homeDir));
    if (!options.keepConfig) for (const f of CONFIG_FILENAMES) removePaths.add(path.join(userDir, f));
    if (!options.keepData) for (const e of DATA_ENTRIES) removePaths.add(path.join(userDir, e));
    pruneDirs.add(getScriptInstallDir(homeDir));
    pruneDirs.add(userDir);
  }

  return {
    removePaths: sortForRemoval([...removePaths]),
    pruneDirs: sortForRemoval([...pruneDirs]),
    pathCleanup:
      context.metadata.shellConfigPath && context.metadata.pathCommand
        ? { configFile: context.metadata.shellConfigPath, command: context.metadata.pathCommand }
        : undefined,
  };
}

export async function runScriptManagedUninstall(options: ScriptUninstallOptions = {}): Promise<ScriptUpdateRunResult> {
  const plan = buildScriptUninstallPlan(options);
  if (!plan) return notScriptManaged("uninstall");

  if (options.dryRun) return { success: true, output: formatDryRun(plan, options) };

  if (!options.force) {
    if (!process.stdin.isTTY || !process.stdout.isTTY) {
      return { success: false, output: "Non-interactive terminal. Re-run with --force." };
    }
    if (!(await confirm("Remove Grok from this machine?"))) {
      return { success: false, output: "Uninstall cancelled." };
    }
  }

  try {
    if (plan.pathCleanup) removePathLine(plan.pathCleanup.configFile, plan.pathCleanup.command);
    for (const p of plan.removePaths) fs.rmSync(p, { recursive: true, force: true });
    for (const d of plan.pruneDirs) removeDirIfEmpty(d);
    return { success: true, output: "Grok uninstall complete." };
  } catch (error) {
    return { success: false, output: error instanceof Error ? error.message : String(error) };
  }
}

function notScriptManaged(action: string): ScriptUpdateRunResult {
  return {
    success: false,
    output: `This install is not script-managed, so \`grok ${action}\` cannot proceed. Use the package manager you installed with, or reinstall via install.sh.`,
  };
}

function getReleaseTargetForPlatformKey(key: string): ReleaseTarget | null {
  switch (key) {
    case "darwin-arm64":
      return { key, assetName: "grok-darwin-arm64", binaryName: "grok" };
    case "darwin-x64":
      return { key: "darwin-arm64", assetName: "grok-darwin-arm64", binaryName: "grok" };
    case "linux-x64":
      return { key, assetName: "grok-linux-x64", binaryName: "grok" };
    case "windows-x64":
      return { key, assetName: "grok-windows-x64.exe", binaryName: "grok.exe" };
    default:
      return null;
  }
}

async function resolveReleaseDownload(target: ReleaseTarget): Promise<ReleaseDownload | null> {
  const release = await fetchReleaseJson(`${GROK_RELEASES_API}/latest`);
  if (!release) return null;
  const version = normalizeReleaseVersion(release.tag_name);
  if (!version) return null;

  const asset = release.assets.find((a) => a.name === target.assetName);
  const checksums = release.assets.find((a) => a.name === "checksums.txt");
  if (!asset || !checksums) return null;

  return { version, asset, checksums };
}

async function fetchReleaseJson(url: string): Promise<GitHubRelease | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    const res = await fetch(url, { signal: controller.signal, headers: { Accept: "application/vnd.github+json" } });
    clearTimeout(timer);
    return res.ok ? ((await res.json()) as GitHubRelease) : null;
  } catch {
    return null;
  }
}

function normalizeReleaseVersion(tagName: string): string | null {
  let version = tagName;
  if (version.startsWith("grok-dev@")) version = version.slice("grok-dev@".length);
  if (version.startsWith("v")) version = version.slice(1);
  return semverValid(version);
}

async function downloadBinary(url: string, dest: string): Promise<void> {
  const res = await fetch(url, { headers: { Accept: "application/octet-stream" } });
  if (!res.ok) throw new Error(`Download failed (${res.status}) for ${url}`);
  fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
}

async function downloadText(url: string): Promise<string> {
  const res = await fetch(url, { headers: { Accept: "text/plain" } });
  if (!res.ok) throw new Error(`Download failed (${res.status}) for ${url}`);
  return await res.text();
}

function sha256File(filePath: string): string {
  return createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function sortForRemoval(paths: string[]): string[] {
  return [...new Set(paths)].sort((a, b) => b.length - a.length);
}

function removeDirIfEmpty(dir: string): void {
  try {
    if (fs.existsSync(dir) && fs.readdirSync(dir).length === 0) fs.rmdirSync(dir);
  } catch {
    /* best effort */
  }
}

function removePathLine(configFile: string, command: string): void {
  if (!fs.existsSync(configFile)) return;
  const lines = fs.readFileSync(configFile, "utf8").split(/\r?\n/);
  fs.writeFileSync(
    configFile,
    `${lines
      .filter((l) => l !== PATH_MARKER && l !== command)
      .join("\n")
      .replace(/\n+$/, "")}\n`,
  );
}

function formatDryRun(plan: ScriptUninstallPlan, options: ScriptUninstallOptions): string {
  const lines = ["Dry run — would perform:"];
  if (plan.pathCleanup) lines.push(`  remove PATH entry from ${plan.pathCleanup.configFile}`);
  for (const p of plan.removePaths) lines.push(`  remove ${p}`);
  if (options.keepConfig) lines.push("  keep config files");
  if (options.keepData) lines.push("  keep data files");
  return lines.join("\n");
}

async function confirm(prompt: string): Promise<boolean> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(`${prompt} [y/N] `, (answer) => {
      rl.close();
      resolve(/^y(es)?$/i.test(answer.trim()));
    });
  });
}

function applyWindowsUpdate(
  tempDir: string,
  downloadedPath: string,
  context: ScriptInstallContext,
  release: ReleaseDownload,
): ScriptUpdateRunResult {
  const script = [
    "$ErrorActionPreference = 'Stop'",
    "Start-Sleep -Seconds 2",
    `Move-Item -LiteralPath '${esc(downloadedPath)}' -Destination '${esc(context.binaryPath)}' -Force`,
  ].join("\n");

  const scriptPath = path.join(tempDir, "apply-update.ps1");
  fs.writeFileSync(scriptPath, script);

  saveScriptInstallMetadata({ ...context.metadata, version: release.version, installedAt: new Date().toISOString() });

  const child = spawn("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", scriptPath], {
    detached: true,
    stdio: "ignore",
  });
  child.unref();

  return { success: true, output: `Updated to Grok ${release.version}. Restart the CLI to use the new version.` };
}

function esc(s: string): string {
  return s.replace(/'/g, "''");
}
