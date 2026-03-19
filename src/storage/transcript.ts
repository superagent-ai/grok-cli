import type { ModelMessage } from "ai";
import type { ChatEntry, ToolCall, ToolResult } from "../types/index";
import { getDatabase, withTransaction } from "./db";

interface MessageRow {
  session_id: string;
  seq: number;
  role: string;
  message_json: string;
  created_at: string;
}

interface StoredToolCallRow {
  id: number;
  tool_call_id: string;
  tool_name: string;
  args_json: string;
}

interface StoredToolResultRow {
  tool_call_id: string;
  output_json: string;
}

export function loadTranscript(sessionId: string): ModelMessage[] {
  const rows = getDatabase()
    .prepare(`
    SELECT session_id, seq, role, message_json, created_at
    FROM messages
    WHERE session_id = ?
    ORDER BY seq ASC
  `)
    .all(sessionId) as MessageRow[];

  return rows.map((row) => JSON.parse(row.message_json) as ModelMessage);
}

export function appendMessages(sessionId: string, messages: ModelMessage[]): void {
  if (messages.length === 0) return;

  withTransaction((db) => {
    const nextSeq = getNextSequence(db, sessionId);
    const insertMessage = db.prepare(`
      INSERT INTO messages (session_id, seq, role, message_json, created_at)
      VALUES (?, ?, ?, ?, ?)
    `);
    const insertToolCall = db.prepare(`
      INSERT OR IGNORE INTO tool_calls (
        session_id, message_seq, tool_call_id, tool_name, args_json, status, started_at, completed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const updateToolCall = db.prepare(`
      UPDATE tool_calls
      SET tool_name = ?, args_json = ?, status = ?, completed_at = ?
      WHERE session_id = ? AND tool_call_id = ?
    `);
    const selectToolCall = db.prepare(`
      SELECT id, tool_call_id, tool_name, args_json
      FROM tool_calls
      WHERE session_id = ? AND tool_call_id = ?
    `);
    const insertToolResult = db.prepare(`
      INSERT INTO tool_results (tool_call_row_id, output_kind, output_json, success, created_at)
      VALUES (?, ?, ?, ?, ?)
    `);
    const updateSession = db.prepare(`
      UPDATE sessions
      SET updated_at = ?
      WHERE id = ?
    `);

    messages.forEach((message, index) => {
      const seq = nextSeq + index;
      const createdAt = new Date().toISOString();
      insertMessage.run(sessionId, seq, message.role, JSON.stringify(message), createdAt);

      if (message.role === "assistant" && Array.isArray(message.content)) {
        for (const part of message.content) {
          if (part.type !== "tool-call") continue;
          insertToolCall.run(
            sessionId,
            seq,
            part.toolCallId,
            part.toolName,
            JSON.stringify(part.input ?? {}),
            "completed",
            createdAt,
            createdAt,
          );
          updateToolCall.run(
            part.toolName,
            JSON.stringify(part.input ?? {}),
            "completed",
            createdAt,
            sessionId,
            part.toolCallId,
          );
        }
      }

      if (message.role === "tool" && Array.isArray(message.content)) {
        for (const part of message.content) {
          if (part.type !== "tool-result") continue;
          let toolCall = selectToolCall.get(sessionId, part.toolCallId) as StoredToolCallRow | undefined;
          if (!toolCall) {
            insertToolCall.run(sessionId, seq, part.toolCallId, part.toolName, "{}", "completed", createdAt, createdAt);
            toolCall = selectToolCall.get(sessionId, part.toolCallId) as StoredToolCallRow | undefined;
          }
          if (!toolCall) continue;

          const extracted = extractToolResultFromOutput(part.output);
          insertToolResult.run(
            toolCall.id,
            getOutputKind(part.output),
            JSON.stringify(extracted ?? part.output),
            extracted ? Number(extracted.success) : Number(isOutputSuccess(part.output)),
            createdAt,
          );
        }
      }
    });

    updateSession.run(new Date().toISOString(), sessionId);
  });
}

export function appendSystemMessage(sessionId: string, content: string): void {
  appendMessages(sessionId, [{ role: "system", content }]);
}

export function buildChatEntries(sessionId: string): ChatEntry[] {
  const db = getDatabase();
  const messageRows = db
    .prepare(`
    SELECT session_id, seq, role, message_json, created_at
    FROM messages
    WHERE session_id = ?
    ORDER BY seq ASC
  `)
    .all(sessionId) as MessageRow[];
  const toolResults = loadStoredToolResults(sessionId);
  const callMap = new Map<string, ToolCall>();
  const entries: ChatEntry[] = [];

  for (const row of messageRows) {
    const message = JSON.parse(row.message_json) as ModelMessage;
    const timestamp = new Date(row.created_at);

    if (message.role === "user") {
      const content = renderUserContent(message.content);
      if (content) {
        entries.push({ type: "user", content, timestamp });
      }
      continue;
    }

    if (message.role === "system") {
      const content = typeof message.content === "string" ? message.content.trim() : "";
      if (content) {
        entries.push({ type: "assistant", content, timestamp });
      }
      continue;
    }

    if (message.role === "assistant") {
      const text = renderAssistantContent(message.content, callMap);
      if (text) {
        entries.push({ type: "assistant", content: text, timestamp });
      }
      continue;
    }

    if (message.role === "tool" && Array.isArray(message.content)) {
      for (const part of message.content) {
        if (part.type !== "tool-result") continue;
        const toolCall = callMap.get(part.toolCallId) ?? toFallbackToolCall(part.toolCallId, part.toolName);
        const toolResult = toolResults.get(part.toolCallId) ??
          extractToolResultFromOutput(part.output) ?? {
            success: isOutputSuccess(part.output),
            output: JSON.stringify(part.output),
          };
        entries.push({
          type: "tool_result",
          content: toolResult.success ? toolResult.output || "Success" : toolResult.error || "Error",
          timestamp,
          toolCall,
          toolResult,
        });
      }
    }
  }

  return entries;
}

function getNextSequence(db: ReturnType<typeof getDatabase>, sessionId: string): number {
  const row = db
    .prepare(`
    SELECT COALESCE(MAX(seq), 0) AS max_seq
    FROM messages
    WHERE session_id = ?
  `)
    .get(sessionId) as { max_seq: number } | undefined;

  return (row?.max_seq ?? 0) + 1;
}

function renderUserContent(content: ModelMessage["content"]): string {
  if (typeof content === "string") return content.trim();
  if (!Array.isArray(content)) return "";

  return content
    .map((part) => {
      if (part.type === "text") return part.text;
      if (part.type === "image") return "[Image]";
      if (part.type === "file") return part.filename ? `[File: ${part.filename}]` : "[File]";
      return "";
    })
    .filter(Boolean)
    .join("\n")
    .trim();
}

function renderAssistantContent(content: ModelMessage["content"], callMap: Map<string, ToolCall>): string {
  if (typeof content === "string") return content.trim();
  if (!Array.isArray(content)) return "";

  const textParts: string[] = [];
  for (const part of content) {
    if (part.type === "text") {
      textParts.push(part.text);
      continue;
    }

    if (part.type === "tool-call") {
      callMap.set(part.toolCallId, {
        id: part.toolCallId,
        type: "function",
        function: {
          name: part.toolName,
          arguments: JSON.stringify(part.input ?? {}),
        },
      });
    }
  }

  return textParts.join("").trim();
}

function loadStoredToolResults(sessionId: string): Map<string, ToolResult> {
  const rows = getDatabase()
    .prepare(`
    SELECT tc.tool_call_id, tr.output_json
    FROM tool_results tr
    JOIN tool_calls tc ON tc.id = tr.tool_call_row_id
    WHERE tc.session_id = ?
    ORDER BY tr.id ASC
  `)
    .all(sessionId) as StoredToolResultRow[];

  return new Map(rows.map((row) => [row.tool_call_id, JSON.parse(row.output_json) as ToolResult]));
}

function toFallbackToolCall(toolCallId: string, toolName: string): ToolCall {
  return {
    id: toolCallId,
    type: "function",
    function: {
      name: toolName,
      arguments: "{}",
    },
  };
}

function extractToolResultFromOutput(output: unknown): ToolResult | null {
  if (!output || typeof output !== "object") return null;

  if ("success" in output) {
    const result = output as ToolResult;
    return {
      success: Boolean(result.success),
      output: result.output,
      error: result.error,
      diff: result.diff,
      plan: result.plan,
      task: result.task,
      delegation: result.delegation,
      backgroundProcess: result.backgroundProcess,
    };
  }

  if ("type" in output && output.type === "json" && "value" in output) {
    return extractToolResultFromOutput((output as { value: unknown }).value);
  }

  if ("type" in output && output.type === "error-text" && "value" in output) {
    return {
      success: false,
      error: String((output as { value: unknown }).value),
    };
  }

  if ("type" in output && output.type === "text" && "value" in output) {
    return {
      success: true,
      output: String((output as { value: unknown }).value),
    };
  }

  return null;
}

function getOutputKind(output: unknown): string {
  if (output && typeof output === "object" && "type" in output && typeof output.type === "string") {
    return output.type;
  }
  return "json";
}

function isOutputSuccess(output: unknown): boolean {
  if (!output || typeof output !== "object") return true;
  if ("type" in output) {
    return !String(output.type).startsWith("error");
  }
  return true;
}
