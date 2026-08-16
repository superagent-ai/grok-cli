import * as fs from "fs";
import * as os from "os";
import * as path from "path";

const AUTH_JSON_PATH = path.join(os.homedir(), ".grok", "auth.json");

/**
 * Read the official Grok Build session token from ~/.grok/auth.json.
 * grok-kev can use this as a Bearer token against api.x.ai, so a console
 * API key is not required when the official CLI is already signed in.
 */
export function parseOfficialSessionKey(data: unknown): string | undefined {
  if (!data || typeof data !== "object" || Array.isArray(data)) return undefined;

  const now = Date.now();
  let fallback: string | undefined;
  let bestLive: { key: string; expiresAt: number } | undefined;

  for (const value of Object.values(data as Record<string, unknown>)) {
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;

    const entry = value as Record<string, unknown>;
    const key = typeof entry.key === "string" ? entry.key.trim() : "";
    if (!key) continue;

    fallback ??= key;

    const expiresAt = typeof entry.expires_at === "string" ? Date.parse(entry.expires_at) : Number.NaN;
    if (!Number.isFinite(expiresAt) || expiresAt <= now) continue;
    if (!bestLive || expiresAt >= bestLive.expiresAt) {
      bestLive = { key, expiresAt };
    }
  }

  return bestLive?.key ?? fallback;
}

export function readOfficialSessionKey(filePath = AUTH_JSON_PATH): string | undefined {
  try {
    if (!fs.existsSync(filePath)) return undefined;
    return parseOfficialSessionKey(JSON.parse(fs.readFileSync(filePath, "utf-8")));
  } catch {
    return undefined;
  }
}
