import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { afterEach, describe, expect, it } from "vitest";
import { parseOfficialSessionKey, readOfficialSessionKey } from "./session-auth";

const tmpFiles: string[] = [];

afterEach(() => {
  for (const file of tmpFiles.splice(0)) {
    fs.rmSync(file, { force: true });
  }
});

function writeTempAuth(data: unknown): string {
  const file = path.join(os.tmpdir(), `grok-auth-test-${Date.now()}-${Math.random().toString(16).slice(2)}.json`);
  fs.writeFileSync(file, JSON.stringify(data), { mode: 0o600 });
  tmpFiles.push(file);
  return file;
}

describe("parseOfficialSessionKey", () => {
  it("returns undefined for missing or invalid payloads", () => {
    expect(parseOfficialSessionKey(undefined)).toBeUndefined();
    expect(parseOfficialSessionKey(null)).toBeUndefined();
    expect(parseOfficialSessionKey([])).toBeUndefined();
    expect(parseOfficialSessionKey({ foo: { email: "a@b.c" } })).toBeUndefined();
  });

  it("reads the official Grok Build session key", () => {
    expect(
      parseOfficialSessionKey({
        "https://auth.x.ai::client": {
          auth_mode: "oidc",
          key: "session-token-1",
          expires_at: "2099-01-01T00:00:00.000Z",
        },
      }),
    ).toBe("session-token-1");
  });

  it("prefers a still-valid session over an expired one", () => {
    expect(
      parseOfficialSessionKey({
        expired: { key: "old-token", expires_at: "2000-01-01T00:00:00.000Z" },
        live: { key: "live-token", expires_at: "2099-01-01T00:00:00.000Z" },
      }),
    ).toBe("live-token");
  });

  it("falls back to an expired key when nothing else is available", () => {
    expect(
      parseOfficialSessionKey({
        expired: { key: "  stale-token  ", expires_at: "2000-01-01T00:00:00.000Z" },
      }),
    ).toBe("stale-token");
  });
});

describe("readOfficialSessionKey", () => {
  it("returns undefined when the file is missing or unreadable", () => {
    expect(readOfficialSessionKey(path.join(os.tmpdir(), "grok-auth-missing.json"))).toBeUndefined();
    const bad = writeTempAuth("not-json");
    fs.writeFileSync(bad, "{");
    expect(readOfficialSessionKey(bad)).toBeUndefined();
  });

  it("reads a session key from disk", () => {
    const file = writeTempAuth({
      "https://auth.x.ai::client": { key: "disk-token", expires_at: "2099-01-01T00:00:00.000Z" },
    });
    expect(readOfficialSessionKey(file)).toBe("disk-token");
  });
});
