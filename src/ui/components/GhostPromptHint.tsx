import type { Theme } from "../theme.js";

export function GhostPromptHint({ t, visible }: { t: Theme; visible: boolean }) {
  if (!visible) return null;

  return (
    <box flexDirection="row" gap={1}>
      <text fg={t.text}>
        {"space "}
        <span style={{ fg: t.textMuted }}>{"accept"}</span>
      </text>
      <text fg={t.text}>
        {"esc "}
        <span style={{ fg: t.textMuted }}>{"dismiss"}</span>
      </text>
    </box>
  );
}
