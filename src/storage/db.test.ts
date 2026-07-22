import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { closeDatabase, getDatabase, withTransaction } from "./db";

const originalHome = process.env.HOME;

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
