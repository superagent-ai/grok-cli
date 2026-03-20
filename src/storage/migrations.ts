import type { SQLiteDatabase } from "./db";

const LATEST_DB_VERSION = 2;

export function applyMigrations(db: SQLiteDatabase): void {
  const version = Number(db.pragma("user_version", { simple: true })) || 0;
  if (version >= LATEST_DB_VERSION) return;

  const migrate = db.transaction(() => {
    if (version < 1) {
      createInitialSchema(db);
      db.pragma("user_version = 1");
    }
    if (version < 2) {
      createCompactionSchema(db);
      db.pragma("user_version = 2");
    }
  });

  migrate();
}

function createInitialSchema(db: SQLiteDatabase): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS workspaces (
      id TEXT PRIMARY KEY,
      scope_key TEXT NOT NULL UNIQUE,
      canonical_path TEXT NOT NULL,
      git_root TEXT,
      display_name TEXT NOT NULL,
      last_seen_at TEXT NOT NULL
    ) STRICT;

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      title TEXT,
      model TEXT NOT NULL,
      mode TEXT NOT NULL,
      cwd_at_start TEXT NOT NULL,
      cwd_last TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    ) STRICT;

    CREATE TABLE IF NOT EXISTS messages (
      session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      seq INTEGER NOT NULL,
      role TEXT NOT NULL,
      message_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (session_id, seq)
    ) STRICT;

    CREATE TABLE IF NOT EXISTS tool_calls (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      message_seq INTEGER NOT NULL,
      tool_call_id TEXT NOT NULL,
      tool_name TEXT NOT NULL,
      args_json TEXT NOT NULL,
      status TEXT NOT NULL,
      started_at TEXT NOT NULL,
      completed_at TEXT,
      UNIQUE(session_id, tool_call_id)
    ) STRICT;

    CREATE TABLE IF NOT EXISTS tool_results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tool_call_row_id INTEGER NOT NULL REFERENCES tool_calls(id) ON DELETE CASCADE,
      output_kind TEXT NOT NULL,
      output_json TEXT NOT NULL,
      success INTEGER NOT NULL,
      created_at TEXT NOT NULL
    ) STRICT;

    CREATE TABLE IF NOT EXISTS usage_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      message_seq INTEGER,
      source TEXT NOT NULL,
      model TEXT NOT NULL,
      input_tokens INTEGER NOT NULL DEFAULT 0,
      output_tokens INTEGER NOT NULL DEFAULT 0,
      total_tokens INTEGER NOT NULL DEFAULT 0,
      cost_micros INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    ) STRICT;

    CREATE TABLE IF NOT EXISTS compactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      first_kept_seq INTEGER NOT NULL,
      summary TEXT NOT NULL,
      tokens_before INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    ) STRICT;

    CREATE INDEX IF NOT EXISTS idx_sessions_workspace_updated
      ON sessions(workspace_id, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_messages_session_seq
      ON messages(session_id, seq);
    CREATE INDEX IF NOT EXISTS idx_tool_calls_session_seq
      ON tool_calls(session_id, message_seq);
    CREATE INDEX IF NOT EXISTS idx_usage_events_session_created
      ON usage_events(session_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_compactions_session_created
      ON compactions(session_id, created_at DESC);
  `);
}

function createCompactionSchema(db: SQLiteDatabase): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS compactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      first_kept_seq INTEGER NOT NULL,
      summary TEXT NOT NULL,
      tokens_before INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    ) STRICT;

    CREATE INDEX IF NOT EXISTS idx_compactions_session_created
      ON compactions(session_id, created_at DESC);
  `);
}
