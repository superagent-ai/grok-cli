import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import type { SandboxMode } from "./settings";

interface WorkspaceTrustEntry {
  sandboxMode: SandboxMode;
  updatedAt: string;
}

interface WorkspaceTrustStore {
  version: 1;
  workspaces: Record<string, WorkspaceTrustEntry>;
}

export const WORKSPACE_TRUST_FILENAME = "workspace-trust.json";

export function isShuruSandboxSupported(platform = process.platform, arch = process.arch): boolean {
  return platform === "darwin" && arch === "arm64";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeTrustEntry(value: unknown): WorkspaceTrustEntry | null {
  if (!isRecord(value)) return null;
  const sandboxMode = value.sandboxMode === "shuru" ? "shuru" : value.sandboxMode === "off" ? "off" : null;
  if (!sandboxMode) return null;
  return {
    sandboxMode,
    updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : "",
  };
}

export function getWorkspaceTrustPath(homeDir = os.homedir()): string {
  return path.join(homeDir, ".grok", WORKSPACE_TRUST_FILENAME);
}

export function getWorkspaceTrustKey(cwd = process.cwd()): string {
  try {
    return fs.realpathSync.native(cwd);
  } catch {
    return path.resolve(cwd);
  }
}

export function loadWorkspaceTrustStore(trustPath = getWorkspaceTrustPath()): WorkspaceTrustStore {
  try {
    if (!fs.existsSync(trustPath)) return { version: 1, workspaces: {} };
    const parsed = JSON.parse(fs.readFileSync(trustPath, "utf-8")) as unknown;
    const rawWorkspaces = isRecord(parsed) && isRecord(parsed.workspaces) ? parsed.workspaces : {};
    const workspaces: Record<string, WorkspaceTrustEntry> = {};
    for (const [workspace, entry] of Object.entries(rawWorkspaces)) {
      const normalized = normalizeTrustEntry(entry);
      if (normalized) workspaces[workspace] = normalized;
    }
    return { version: 1, workspaces };
  } catch {
    return { version: 1, workspaces: {} };
  }
}

export function getWorkspaceTrustDecision(
  cwd = process.cwd(),
  trustPath = getWorkspaceTrustPath(),
): SandboxMode | null {
  const store = loadWorkspaceTrustStore(trustPath);
  return store.workspaces[getWorkspaceTrustKey(cwd)]?.sandboxMode ?? null;
}

export function saveWorkspaceTrustDecision(
  cwd: string,
  sandboxMode: SandboxMode,
  trustPath = getWorkspaceTrustPath(),
): void {
  const store = loadWorkspaceTrustStore(trustPath);
  store.workspaces[getWorkspaceTrustKey(cwd)] = {
    sandboxMode,
    updatedAt: new Date().toISOString(),
  };
  fs.mkdirSync(path.dirname(trustPath), { recursive: true, mode: 0o700 });
  fs.writeFileSync(trustPath, JSON.stringify(store, null, 2), { mode: 0o600 });
}
