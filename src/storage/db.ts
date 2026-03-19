import { Database } from "bun:sqlite";
import fs from "fs";
import os from "os";
import path from "path";
import { applyMigrations } from "./migrations";

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
    this.db = new Database(filename, { create: true, strict: true });
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

function normalizeBinding(params: unknown[]): unknown {
  if (params.length === 0) return undefined;
  return params.length === 1 ? params[0] : params;
}
