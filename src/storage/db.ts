import type { DatabaseSync } from "node:sqlite";
import fs from "fs";
import { createRequire } from "module";
import os from "os";
import path from "path";
import { applyMigrations } from "./migrations";

const require = createRequire(import.meta.url);

export interface SQLiteStatement {
  run(...params: unknown[]): unknown;
  get(...params: unknown[]): unknown;
  all(...params: unknown[]): unknown[];
}

export interface SQLiteDatabase {
  exec(sql: string): void;
  prepare(sql: string): SQLiteStatement;
  pragma(query: string, options?: { simple?: boolean }): unknown;
  transaction<T>(fn: () => T): () => T;
  close(): void;
}

let db: SQLiteDatabase | null = null;

export function getDatabasePath(): string {
  const dir = path.join(os.homedir(), ".grok");
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  return path.join(dir, "grok.db");
}

export function getDatabase(): SQLiteDatabase {
  if (db) return db;

  const database = new BunSqliteDatabase(getDatabasePath());
  database.pragma("journal_mode = WAL");
  database.pragma("foreign_keys = ON");
  database.pragma("busy_timeout = 5000");
  database.pragma("synchronous = NORMAL");
  applyMigrations(database);
  db = database;
  return database;
}

export function withTransaction<T>(fn: (database: SQLiteDatabase) => T): T {
  const database = getDatabase();
  return database.transaction(() => fn(database))();
}

export function closeDatabase(): void {
  db?.close();
  db = null;
}

class BunSqliteDatabase implements SQLiteDatabase {
  private readonly db: Database;

  constructor(filename: string) {
    const BunDatabase = loadBunDatabase();
    this.db = BunDatabase
      ? new BunDatabase(filename, { create: true, strict: true })
      : new NodeSqliteDatabase(filename);
  }

  exec(sql: string): void {
    this.db.exec(sql);
  }

  prepare(sql: string): SQLiteStatement {
    return {
      run: (...params: unknown[]) => this.db.run(sql, normalizeBinding(params)),
      get: (...params: unknown[]) => this.db.query(sql).get(normalizeBinding(params)),
      all: (...params: unknown[]) => this.db.query(sql).all(normalizeBinding(params)),
    };
  }

  pragma(query: string, options?: { simple?: boolean }): unknown {
    if (query.includes("=")) {
      this.db.exec(`PRAGMA ${query}`);
      return undefined;
    }

    const row = this.db.query(`PRAGMA ${query}`).get() as Record<string, unknown> | undefined;
    if (!options?.simple) return row;
    if (!row) return undefined;
    return Object.values(row)[0];
  }

  transaction<T>(fn: () => T): () => T {
    return this.db.transaction(fn);
  }

  close(): void {
    this.db.close();
  }
}

type Database = {
  exec(sql: string): void;
  run(sql: string, params?: unknown): unknown;
  query(sql: string): { get(params?: unknown): unknown; all(params?: unknown): unknown[] };
  transaction<T>(fn: () => T): () => T;
  close(): void;
};

function loadBunDatabase(): (new (filename: string, options: { create: boolean; strict: boolean }) => Database) | null {
  try {
    return require("bun:sqlite").Database as new (
      filename: string,
      options: { create: boolean; strict: boolean },
    ) => Database;
  } catch {
    return null;
  }
}

class NodeSqliteDatabase implements Database {
  private readonly db: DatabaseSync;

  constructor(filename: string) {
    const { DatabaseSync } = require("node:sqlite") as typeof import("node:sqlite");
    this.db = new DatabaseSync(filename);
  }

  exec(sql: string): void {
    this.db.exec(sql);
  }

  run(sql: string, params?: unknown): unknown {
    const statement = this.db.prepare(sql);
    if (params === undefined) return statement.run();
    return Array.isArray(params) ? statement.run(...(params as never[])) : statement.run(params as never);
  }

  query(sql: string): { get(params?: unknown): unknown; all(params?: unknown): unknown[] } {
    const statement = this.db.prepare(sql);
    return {
      get: (params?: unknown) => {
        if (params === undefined) return statement.get();
        return Array.isArray(params) ? statement.get(...(params as never[])) : statement.get(params as never);
      },
      all: (params?: unknown) => {
        if (params === undefined) return statement.all();
        return Array.isArray(params) ? statement.all(...(params as never[])) : statement.all(params as never);
      },
    };
  }

  transaction<T>(fn: () => T): () => T {
    return () => {
      this.db.exec("BEGIN");
      try {
        const result = fn();
        this.db.exec("COMMIT");
        return result;
      } catch (error) {
        this.db.exec("ROLLBACK");
        throw error;
      }
    };
  }

  close(): void {
    this.db.close();
  }
}

function normalizeBinding(params: unknown[]): unknown {
  if (params.length === 0) return undefined;
  return params.length === 1 ? params[0] : params;
}
