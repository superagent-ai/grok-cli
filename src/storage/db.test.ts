import fs from "fs";
import { createRequire } from "module";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { closeDatabase, getDatabase, withTransaction } from "./db";

const require = createRequire(import.meta.url);
const originalHome = process.env.HOME;

function isBunSqliteAvailable(): boolean {
  try {
    require("bun:sqlite");
    return true;
  } catch {
    return false;
  }
}

describe("storage database", () => {
  const tempRoot = path.join(process.cwd(), ".tmp-db-tests");
  let tempHome = "";

  beforeEach(() => {
    fs.mkdirSync(tempRoot, { recursive: true });
    tempHome = fs.mkdtempSync(path.join(tempRoot, "grok-db-home-"));
    process.env.HOME = tempHome;
    vi.spyOn(os, "homedir").mockReturnValue(tempHome);
    closeDatabase();
  });

  afterEach(() => {
    closeDatabase();
    vi.restoreAllMocks();
    process.env.HOME = originalHome;
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it("initializes and round-trips a write/read", () => {
    const db = getDatabase();

    db.exec(`
      CREATE TABLE IF NOT EXISTS storage_smoke_test (
        id INTEGER PRIMARY KEY,
        value TEXT NOT NULL
      ) STRICT;
    `);

    db.prepare("INSERT INTO storage_smoke_test (id, value) VALUES (?, ?)").run(1, "hello world");

    const row = db.prepare("SELECT value FROM storage_smoke_test WHERE id = ?").get(1) as {
      value: string;
    };

    expect(row.value).toBe("hello world");
  });

  it("binds bare named parameters (e.g. { id } against @id) and persists the value", () => {
    const db = getDatabase();

    db.exec(`
      CREATE TABLE IF NOT EXISTS storage_named_param_test (
        id INTEGER PRIMARY KEY,
        value TEXT NOT NULL
      ) STRICT;
    `);

    db.prepare("INSERT INTO storage_named_param_test (id, value) VALUES (@id, @value)").run({
      id: 3,
      value: "named param value",
    });

    const row = db.prepare("SELECT value FROM storage_named_param_test WHERE id = @id").get({ id: 3 }) as {
      value: string | null;
    };

    expect(row).toBeDefined();
    expect(row.value).not.toBeNull();
    expect(row.value).toBe("named param value");
  });

  it("enables bare named parameters on node:sqlite prepared statements", async () => {
    if (isBunSqliteAvailable()) {
      // bun:sqlite is opened with strict: true and never goes through the
      // node:sqlite fallback, so there is nothing to spy on in this runtime.
      return;
    }

    const { StatementSync } = (await import("node:sqlite")) as typeof import("node:sqlite");
    const spy = vi.spyOn(StatementSync.prototype, "setAllowBareNamedParameters");

    const db = getDatabase();
    db.exec(`
      CREATE TABLE IF NOT EXISTS storage_named_param_spy_test (
        id INTEGER PRIMARY KEY,
        value TEXT NOT NULL
      ) STRICT;
    `);

    db.prepare("INSERT INTO storage_named_param_spy_test (id, value) VALUES (@id, @value)").run({
      id: 1,
      value: "spied value",
    });

    expect(spy).toHaveBeenCalledWith(true);
  });

  it("commits writes made inside a transaction", () => {
    getDatabase().exec(`
      CREATE TABLE IF NOT EXISTS storage_smoke_test (
        id INTEGER PRIMARY KEY,
        value TEXT NOT NULL
      ) STRICT;
    `);

    withTransaction((db) => {
      db.prepare("INSERT INTO storage_smoke_test (id, value) VALUES (?, ?)").run(2, "in transaction");
    });

    const row = getDatabase().prepare("SELECT value FROM storage_smoke_test WHERE id = ?").get(2) as {
      value: string;
    };

    expect(row.value).toBe("in transaction");
  });
});
