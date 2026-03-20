import { describe, expect, it } from "vitest";
import type { SQLiteDatabase, SQLiteStatement } from "./db";
import { applyMigrations } from "./migrations";

function createStatement(): SQLiteStatement {
  return {
    run: () => undefined,
    get: () => undefined,
    all: () => [],
  };
}

function createTestDatabase(initialVersion = 0): SQLiteDatabase & { executedSql: string[]; pragmaWrites: string[] } {
  let version = initialVersion;
  const executedSql: string[] = [];
  const pragmaWrites: string[] = [];

  return {
    executedSql,
    pragmaWrites,
    exec(sql: string) {
      executedSql.push(sql);
    },
    prepare() {
      return createStatement();
    },
    pragma(query: string, options?: { simple?: boolean }) {
      if (query.includes("=")) {
        pragmaWrites.push(query);
        const match = query.match(/^user_version\s*=\s*(\d+)$/);
        if (match) {
          version = Number(match[1]);
        }
        return undefined;
      }

      if (query === "user_version" && options?.simple) {
        return version;
      }
      return { user_version: version };
    },
    transaction<T>(fn: () => T): () => T {
      return fn;
    },
    close() {},
  };
}

describe("applyMigrations", () => {
  it("creates the full schema on a fresh database", () => {
    const database = createTestDatabase();

    applyMigrations(database);

    expect(database.pragma("user_version", { simple: true })).toBe(2);
    expect(database.executedSql).toHaveLength(2);
    expect(database.executedSql[0]).toContain("CREATE TABLE IF NOT EXISTS workspaces");
    expect(database.executedSql[0]).toContain("CREATE TABLE IF NOT EXISTS sessions");
    expect(database.executedSql[0]).toContain("CREATE TABLE IF NOT EXISTS messages");
    expect(database.executedSql[0]).toContain("CREATE TABLE IF NOT EXISTS tool_calls");
    expect(database.executedSql[0]).toContain("CREATE TABLE IF NOT EXISTS tool_results");
    expect(database.executedSql[0]).toContain("CREATE TABLE IF NOT EXISTS usage_events");
    expect(database.executedSql[0]).toContain("CREATE TABLE IF NOT EXISTS compactions");
    expect(database.executedSql[0]).toContain("CREATE INDEX IF NOT EXISTS idx_compactions_session_created");
    expect(database.executedSql[1]).toContain("CREATE TABLE IF NOT EXISTS compactions");
    expect(database.pragmaWrites).toEqual(["user_version = 1", "user_version = 2"]);
  });

  it("upgrades a version 1 database by adding the compactions schema", () => {
    const database = createTestDatabase(1);

    applyMigrations(database);

    expect(database.pragma("user_version", { simple: true })).toBe(2);
    expect(database.executedSql).toHaveLength(1);
    expect(database.executedSql[0]).toContain("CREATE TABLE IF NOT EXISTS compactions");
    expect(database.executedSql[0]).toContain("CREATE INDEX IF NOT EXISTS idx_compactions_session_created");
    expect(database.pragmaWrites).toEqual(["user_version = 2"]);
  });

  it("is idempotent when run multiple times", () => {
    const database = createTestDatabase();

    applyMigrations(database);
    const firstRunSql = [...database.executedSql];
    const firstRunPragmas = [...database.pragmaWrites];
    applyMigrations(database);

    expect(database.pragma("user_version", { simple: true })).toBe(2);
    expect(database.executedSql).toEqual(firstRunSql);
    expect(database.pragmaWrites).toEqual(firstRunPragmas);
  });
});
