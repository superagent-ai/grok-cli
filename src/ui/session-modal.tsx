import type { ScrollBoxRenderable } from "@opentui/core";
import { useEffect, useRef } from "react";
import type { SessionInfo } from "../types/index";
import type { Theme } from "./theme";

export type SessionBrowseRow = { kind: "session"; session: SessionInfo };

export function buildSessionBrowseRows(sessions: SessionInfo[], query: string): SessionBrowseRow[] {
  const q = query.trim().toLowerCase();
  const filtered = q
    ? sessions.filter((session) => {
        const title = (session.title ?? "").toLowerCase();
        const recap = (session.recap?.text ?? "").toLowerCase();
        return (
          title.includes(q) ||
          recap.includes(q) ||
          session.id.toLowerCase().includes(q) ||
          session.model.toLowerCase().includes(q) ||
          session.mode.toLowerCase().includes(q)
        );
      })
    : sessions;

  return filtered.map((session) => ({ kind: "session" as const, session }));
}

export function formatSessionUpdatedAt(updatedAt: Date, now = new Date()): string {
  const deltaMs = Math.max(0, now.getTime() - updatedAt.getTime());
  const minutes = Math.floor(deltaMs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return updatedAt.toISOString().slice(0, 10);
}

export function formatSessionRowTitle(session: SessionInfo): string {
  const title = session.title?.trim();
  return title || "Untitled";
}

export function formatSessionRowMeta(session: SessionInfo): string {
  return `${session.id} · ${session.mode} · ${session.model}`;
}

function bottomAlignedModalTop(height: number, panelHeight: number): number {
  return Math.max(2, Math.floor((height - panelHeight) / 2));
}

export function SessionBrowserModal({
  t,
  width,
  height,
  selectedIndex,
  searchQuery,
  rows,
  currentSessionId,
}: {
  t: Theme;
  width: number;
  height: number;
  selectedIndex: number;
  searchQuery: string;
  rows: SessionBrowseRow[];
  currentSessionId: string | null;
}) {
  const listRef = useRef<ScrollBoxRenderable>(null);

  useEffect(() => {
    const selected = rows[selectedIndex];
    if (!selected) return;
    listRef.current?.scrollChildIntoView(`session-${selected.session.id}`);
  }, [rows, selectedIndex]);

  const itemCount = Math.max(rows.length, 1);
  const contentHeight = itemCount * 2 + 10;
  const panelHeight = Math.min(contentHeight, Math.floor(height * 0.6));
  const panelWidth = Math.min(72, width - 6);
  const overlayBg = "#000000cc" as string;

  return (
    <box
      position="absolute"
      left={0}
      top={0}
      width={width}
      height={height}
      alignItems="center"
      paddingTop={bottomAlignedModalTop(height, panelHeight)}
      backgroundColor={overlayBg}
    >
      <box
        width={panelWidth}
        height={panelHeight}
        backgroundColor={t.backgroundPanel}
        paddingTop={1}
        paddingBottom={1}
        flexDirection="column"
      >
        <box flexShrink={0} flexDirection="row" justifyContent="space-between" paddingLeft={2} paddingRight={2}>
          <text fg={t.primary}>
            <b>{"Resume session"}</b>
          </text>
          <text fg={t.textMuted}>{"esc"}</text>
        </box>
        <box flexShrink={0} paddingLeft={2} paddingRight={2} paddingTop={1} paddingBottom={1}>
          <text fg={t.text}>
            {searchQuery || <span style={{ fg: t.textMuted }}>{"Search by title, id, recap..."}</span>}
          </text>
        </box>
        <scrollbox ref={listRef} flexGrow={1} minHeight={0}>
          {rows.map((row, idx) => {
            const selected = idx === selectedIndex;
            const session = row.session;
            const current = session.id === currentSessionId;
            const recap = session.recap?.text?.replace(/\s+/g, " ").trim();
            return (
              <box
                key={`session-${session.id}`}
                id={`session-${session.id}`}
                width="100%"
                backgroundColor={selected ? t.selectedBg : undefined}
                paddingLeft={2}
                paddingRight={2}
              >
                <box width="100%" flexDirection="row" justifyContent="space-between">
                  <text fg={current ? t.accent : selected ? t.selected : t.text}>
                    <b>{formatSessionRowTitle(session)}</b>
                    {current ? " (current)" : ""}
                  </text>
                  <text fg={selected ? t.primary : t.textMuted}>{formatSessionUpdatedAt(session.updatedAt)}</text>
                </box>
                <text fg={t.textMuted}>{formatSessionRowMeta(session)}</text>
                {recap ? <text fg={t.textDim}>{recap}</text> : null}
              </box>
            );
          })}
          {rows.length === 0 ? (
            <box paddingLeft={2} paddingRight={2}>
              <text fg={t.textMuted}>{"No saved sessions yet"}</text>
            </box>
          ) : null}
        </scrollbox>
        <box flexShrink={0} paddingLeft={2} paddingRight={2} paddingTop={2} paddingBottom={1}>
          <text>
            <span style={{ fg: t.primary }}>{"enter "}</span>
            <span style={{ fg: t.textMuted }}>{"resume · "}</span>
            <span style={{ fg: t.primary }}>{"esc "}</span>
            <span style={{ fg: t.textMuted }}>{"close"}</span>
          </text>
        </box>
      </box>
    </box>
  );
}
