import { useState, useEffect, useCallback, useRef } from "react";
import { useKeyboard, useTerminalDimensions } from "@opentui/react";
import type { InputRenderable, ScrollBoxRenderable } from "@opentui/core";
import type { Agent } from "../agent/agent.js";
import type { ChatEntry, ToolCall, AgentMode } from "../types/index.js";
import { MODES } from "../types/index.js";
import { getModelInfo, MODEL_GROUPS, MODELS } from "../grok/models.js";
import { saveProjectSettings } from "../utils/settings.js";
import { dark, type Theme } from "./theme.js";

const SPLIT_BORDER = {
  topLeft: "", bottomLeft: "", vertical: "┃", topRight: "",
  bottomRight: "", horizontal: " ", bottomT: "", topT: "",
  cross: "", leftT: "", rightT: "",
};
const SPLIT_BORDER_END = { ...SPLIT_BORDER, bottomLeft: "╹" };
const EMPTY_BORDER = {
  topLeft: "", bottomLeft: "", vertical: "", topRight: "",
  bottomRight: "", horizontal: " ", bottomT: "", topT: "",
  cross: "", leftT: "", rightT: "",
};

interface AppProps {
  agent: Agent;
  initialMessage?: string;
}

export function App({ agent, initialMessage }: AppProps) {
  const t = dark;
  const [messages, setMessages] = useState<ChatEntry[]>([]);
  const [streamContent, setStreamContent] = useState("");
  const [streamReasoning, setStreamReasoning] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [model, setModel] = useState(agent.getModel());
  const [mode, setModeState] = useState<AgentMode>(agent.getMode());
  const [showModelPicker, setShowModelPicker] = useState(false);
  const [modelPickerIndex, setModelPickerIndex] = useState(0);
  const [activeToolCalls, setActiveToolCalls] = useState<ToolCall[]>([]);
  const inputRef = useRef<InputRenderable>(null);
  const scrollRef = useRef<ScrollBoxRenderable>(null);
  const { width, height } = useTerminalDimensions();
  const processedInitial = useRef(false);
  const contentAccRef = useRef("");

  const setMode = useCallback((m: AgentMode) => { agent.setMode(m); setModeState(m); }, [agent]);
  const cycleMode = useCallback(() => {
    const idx = MODES.findIndex((m) => m.id === mode);
    setMode(MODES[(idx + 1) % MODES.length].id);
  }, [mode, setMode]);

  const modeInfo = MODES.find((m) => m.id === mode)!;
  const modelInfo = getModelInfo(model);
  const flatModels = MODELS.map((m) => m.id);

  const scrollToBottom = useCallback(() => {
    try { scrollRef.current?.scrollTo(scrollRef.current?.scrollHeight ?? 99999); } catch { /* */ }
  }, []);

  const processMessage = useCallback(async (text: string) => {
    if (!text.trim() || isProcessing) return;
    setIsProcessing(true); setStreamContent(""); setStreamReasoning(""); setActiveToolCalls([]); contentAccRef.current = "";
    setMessages((prev) => [...prev, { type: "user", content: text.trim(), timestamp: new Date() }]);
    setTimeout(scrollToBottom, 50);
    try {
      for await (const chunk of agent.processMessage(text.trim())) {
        switch (chunk.type) {
          case "content": contentAccRef.current += chunk.content || ""; setStreamContent(contentAccRef.current); setTimeout(scrollToBottom, 10); break;
          case "reasoning": setStreamReasoning((p) => p + (chunk.content || "")); break;
          case "tool_calls":
            if (chunk.toolCalls) {
              if (contentAccRef.current.trim()) { const s = contentAccRef.current; setMessages((p) => [...p, { type: "assistant", content: s, timestamp: new Date() }]); contentAccRef.current = ""; setStreamContent(""); }
              setActiveToolCalls(chunk.toolCalls);
            } break;
          case "tool_result":
            if (chunk.toolCall && chunk.toolResult) {
              setMessages((p) => [...p, { type: "tool_result", content: chunk.toolResult!.success ? (chunk.toolResult!.output || "Success") : (chunk.toolResult!.error || "Error"), timestamp: new Date(), toolCall: chunk.toolCall, toolResult: chunk.toolResult }]);
              setActiveToolCalls([]); setTimeout(scrollToBottom, 10);
            } break;
          case "error": contentAccRef.current += `\n${chunk.content || "Unknown error"}`; setStreamContent(contentAccRef.current); break;
          case "done": break;
        }
      }
    } catch { contentAccRef.current += "\nAn unexpected error occurred."; setStreamContent(contentAccRef.current); }
    if (contentAccRef.current.trim()) { const f = contentAccRef.current; setMessages((p) => [...p, { type: "assistant", content: f, timestamp: new Date() }]); }
    contentAccRef.current = ""; setStreamContent(""); setStreamReasoning(""); setActiveToolCalls([]); setIsProcessing(false); setTimeout(scrollToBottom, 50);
  }, [agent, isProcessing, scrollToBottom]);

  useEffect(() => { if (initialMessage && !processedInitial.current) { processedInitial.current = true; processMessage(initialMessage); } }, [initialMessage, processMessage]);

  const handleCommand = useCallback((cmd: string): boolean => {
    const c = cmd.trim().toLowerCase();
    if (c === "/clear") { agent.clearHistory(); setMessages([]); setStreamContent(""); return true; }
    if (c === "/model" || c === "/models") { setShowModelPicker(true); setModelPickerIndex(Math.max(0, flatModels.indexOf(model))); return true; }
    if (c === "/quit" || c === "/exit" || c === "/q") { process.exit(0); }
    return false;
  }, [agent, model, flatModels]);

  useKeyboard((key) => {
    if (showModelPicker) {
      if (key.name === "escape") { setShowModelPicker(false); return; }
      if (key.name === "up") { setModelPickerIndex((i) => Math.max(0, i - 1)); return; }
      if (key.name === "down") { setModelPickerIndex((i) => Math.min(flatModels.length - 1, i + 1)); return; }
      if (key.name === "return") {
        const sel = flatModels[modelPickerIndex];
        if (sel) { agent.setModel(sel); setModel(sel); saveProjectSettings({ model: sel }); }
        setShowModelPicker(false); return;
      }
      return;
    }
    if (isProcessing && key.name === "escape") { agent.abort(); return; }
    if (key.name === "tab" && !isProcessing) { cycleMode(); return; }
  });

  const handleSubmit = useCallback(() => {
    const v = inputRef.current?.value || "";
    if (!v.trim()) return;
    if (inputRef.current) inputRef.current.value = "";
    if (handleCommand(v)) return;
    processMessage(v);
  }, [handleCommand, processMessage]);

  const hasMessages = messages.length > 0 || streamContent || isProcessing;

  return (
    <box width={width} height={height} backgroundColor={t.background} flexDirection="column">
      {hasMessages ? (
        <box flexGrow={1} paddingLeft={2} paddingRight={2} paddingTop={1} paddingBottom={1} gap={1}>
          {/* Top bar */}
          <box flexDirection="row" justifyContent="space-between" flexShrink={0}>
            <text fg={t.textMuted}>{modelInfo?.name || model}{isProcessing ? "  working..." : ""}</text>
            <text fg={modeInfo.color}>{modeInfo.label}</text>
          </box>
          <box height={1} flexShrink={0}><text fg={t.border}>{"─".repeat(Math.max(1, width - 4))}</text></box>
          {/* Messages */}
          <scrollbox ref={scrollRef} flexGrow={1} stickyScroll={true} stickyStart={"bottom" as any}>
            {messages.map((msg, i) => <MessageView key={i} entry={msg} index={i} t={t} modeColor={modeInfo.color} />)}
            {activeToolCalls.map((tc, i) => (
              <box key={i} paddingLeft={2} marginTop={1}>
                <text fg={t.textMuted}>{"› "}{tc.function.name === "bash" ? toolArgs(tc) : `${tc.function.name} ${toolArgs(tc)}`}</text>
              </box>
            ))}
            {streamReasoning && (
              <box paddingLeft={2} marginTop={1}><text fg={t.textDim}><i>{"thinking: "}{trunc(streamReasoning, 200)}</i></text></box>
            )}
            {streamContent && <box paddingLeft={2} marginTop={1}><text fg={t.text}>{streamContent}</text></box>}
            {isProcessing && !streamContent && activeToolCalls.length === 0 && (
              <box paddingLeft={2} marginTop={1}><text fg={t.textMuted}>{"..."}</text></box>
            )}
          </scrollbox>
          {/* Prompt box */}
          <box flexShrink={0}>
            <PromptBox t={t} inputRef={inputRef} isProcessing={isProcessing} showModelPicker={showModelPicker}
              onSubmit={handleSubmit} mode={mode} modeInfo={modeInfo} model={model} modelInfo={modelInfo} />
          </box>
          <box flexDirection="row" justifyContent="space-between" flexShrink={0}>
            <text fg={t.textDim}>{agent.getCwd()}</text>
            <text fg={t.textDim}>{model}</text>
          </box>
        </box>
      ) : (
        /* ── Home Screen ──────────────────────────────────── */
        <>
          <box flexGrow={1} alignItems="center" paddingLeft={2} paddingRight={2}>
            <box flexGrow={1} minHeight={0} />
            {/* Logo */}
            <box flexShrink={0} alignItems="center">
              <text fg={t.primary}><b>{"  ✦  G R O K"}</b></text>
              <box height={1} />
              <text fg={t.textMuted}>{"AI coding agent for the terminal"}</text>
            </box>
            <box height={3} minHeight={0} flexShrink={1} />
            {/* Prompt box */}
            <box width="100%" maxWidth={75} flexShrink={0}>
              <PromptBox t={t} inputRef={inputRef} isProcessing={isProcessing} showModelPicker={showModelPicker}
                onSubmit={handleSubmit} mode={mode} modeInfo={modeInfo} model={model} modelInfo={modelInfo}
                placeholder={'Ask anything... "Fix broken tests"'} />
            </box>
            <box height={2} minHeight={0} flexShrink={1} />
            {/* Hints */}
            <box flexDirection="row" gap={3}>
              <text fg={t.textDim}>{"tab"}<span style={{ fg: t.textMuted }}>{" cycle modes"}</span></text>
              <text fg={t.textDim}>{"/model"}<span style={{ fg: t.textMuted }}>{" switch"}</span></text>
              <text fg={t.textDim}>{"/quit"}<span style={{ fg: t.textMuted }}>{" exit"}</span></text>
            </box>
            <box flexGrow={1} minHeight={0} />
          </box>
          <box paddingLeft={2} paddingRight={2} paddingBottom={1} flexDirection="row" flexShrink={0}>
            <text fg={t.textDim}>{agent.getCwd()}</text>
            <box flexGrow={1} />
            <text fg={t.textDim}>{"grok-cli v1.0"}</text>
          </box>
        </>
      )}
      {showModelPicker && <ModelPickerModal t={t} currentModel={model} selectedIndex={modelPickerIndex} width={width} height={height} />}
    </box>
  );
}

/* ── Prompt Box (┃ left-border with mode/model inside) ───────── */

function PromptBox({ t, inputRef, isProcessing, showModelPicker, onSubmit, mode, modeInfo, model, modelInfo, placeholder }: {
  t: Theme; inputRef: React.RefObject<InputRenderable | null>;
  isProcessing: boolean; showModelPicker: boolean; onSubmit: () => void;
  mode: AgentMode; modeInfo: typeof MODES[number]; model: string;
  modelInfo: ReturnType<typeof getModelInfo>; placeholder?: string;
}) {
  return (
    <box>
      <box border={["left"]} customBorderChars={SPLIT_BORDER_END} borderColor={modeInfo.color}>
        <box paddingLeft={2} paddingRight={2} paddingTop={1} backgroundColor={t.backgroundElement} flexShrink={0}>
          <input
            ref={inputRef} focused={!isProcessing && !showModelPicker}
            placeholder={isProcessing ? "Working... (esc to stop)" : (placeholder || "Message Grok...")}
            textColor={t.text} backgroundColor={t.backgroundElement} placeholderColor={t.textMuted}
            onSubmit={onSubmit as any}
          />
          <box flexDirection="row" flexShrink={0} paddingTop={1} gap={1}>
            <text fg={modeInfo.color}><b>{modeInfo.label}</b>{" "}</text>
            <text fg={t.text}>{modelInfo?.name || model}</text>
          </box>
        </box>
      </box>
      {/* Shadow edge */}
      <box height={1} border={["left"]} borderColor={modeInfo.color} customBorderChars={{ ...EMPTY_BORDER, vertical: "╹" }}>
        <box height={1} border={["bottom"]} borderColor={t.backgroundElement} customBorderChars={{ ...EMPTY_BORDER, horizontal: "▀" }} />
      </box>
      {/* Hints */}
      <box flexDirection="row" justifyContent="flex-end" gap={3}>
        {isProcessing ? (
          <text fg={t.text}>{"esc "}<span style={{ fg: t.textMuted }}>{"interrupt"}</span></text>
        ) : (
          <>
            <text fg={t.text}>{"tab "}<span style={{ fg: t.textMuted }}>{"modes"}</span></text>
            <text fg={t.text}>{"ctrl+p "}<span style={{ fg: t.textMuted }}>{"commands"}</span></text>
          </>
        )}
      </box>
    </box>
  );
}

/* ── Messages ────────────────────────────────────────────────── */

function MessageView({ entry, index, t, modeColor }: { entry: ChatEntry; index: number; t: Theme; modeColor: string }) {
  switch (entry.type) {
    case "user":
      return (
        <box marginTop={index === 0 ? 0 : 2} paddingLeft={2}>
          <text fg={modeColor}>{"▸ "}<span style={{ fg: t.text }}>{entry.content}</span></text>
        </box>
      );
    case "assistant":
      return <box paddingLeft={2} marginTop={1}><text fg={t.text}>{entry.content}</text></box>;
    case "tool_result": {
      const name = entry.toolCall?.function.name || "tool";
      const ok = entry.toolResult?.success ?? true;
      const args = toolArgs(entry.toolCall);
      const output = entry.content;
      if (name === "bash" && output && output.split("\n").length > 3) {
        const lines = output.split("\n");
        const preview = lines.slice(0, 8).join("\n") + (lines.length > 8 ? "\n  ..." : "");
        return (
          <box marginTop={1} paddingLeft={2} paddingTop={1} paddingBottom={1} backgroundColor={t.backgroundPanel}>
            <text fg={t.textMuted}>{"$ "}{args}</text>
            <text fg={t.text}>{preview}</text>
          </box>
        );
      }
      return (
        <box paddingLeft={2}>
          <text fg={ok ? t.textMuted : t.primary}>{ok ? "$ " : "✗ "}{name === "bash" ? args : `${name} ${args}`}</text>
        </box>
      );
    }
    default: return <text fg={t.textMuted}>{entry.content}</text>;
  }
}

/* ── Model Picker Modal ──────────────────────────────────────── */

function ModelPickerModal({ t, currentModel, selectedIndex, width, height }: {
  t: Theme; currentModel: string; selectedIndex: number; width: number; height: number;
}) {
  let flatIdx = 0;
  return (
    <box position="absolute" left={0} top={0} width={width} height={height}
      alignItems="center" paddingTop={Math.max(2, Math.floor(height / 6))}
      backgroundColor={"#000000cc" as any}>
      <box width={Math.min(60, width - 6)} backgroundColor={t.backgroundPanel}
        paddingTop={1} paddingBottom={1} maxHeight={Math.floor(height * 0.7)}
        border borderStyle="single" borderColor={t.border}>
        <box flexDirection="row" justifyContent="space-between" paddingLeft={2} paddingRight={2}>
          <text fg={t.primary}><b>{"Select model"}</b></text>
          <text fg={t.textMuted}>{"esc"}</text>
        </box>
        <scrollbox flexGrow={1} paddingTop={1}>
          {MODEL_GROUPS.map((group) => {
            const items = group.models.map((mid) => {
              const info = getModelInfo(mid);
              const idx = flatIdx++;
              return { mid, info, idx, selected: idx === selectedIndex, current: mid === currentModel };
            });
            return (
              <box key={group.category}>
                <box paddingLeft={2} paddingTop={1}><text fg={t.textMuted}>{group.category}</text></box>
                {items.map(({ mid, info, selected, current }) => (
                  <box key={mid} backgroundColor={selected ? t.selectedBg : undefined} paddingLeft={2} paddingRight={2}>
                    <box flexDirection="row" justifyContent="space-between">
                      <text fg={selected ? t.selected : t.text}>
                        {current ? "● " : "  "}{info?.name || mid}
                      </text>
                      {info && info.inputPrice < 1 && (
                        <text fg={t.textMuted}>{`$${info.inputPrice}/$${info.outputPrice}`}</text>
                      )}
                    </box>
                  </box>
                ))}
              </box>
            );
          })}
        </scrollbox>
      </box>
    </box>
  );
}

/* ── Helpers ──────────────────────────────────────────────────── */

function toolArgs(tc?: ToolCall): string {
  if (!tc) return "";
  try { const a = JSON.parse(tc.function.arguments); return tc.function.name === "bash" ? a.command || "" : a.query || ""; } catch { return ""; }
}
function trunc(s: string, n: number): string { return s.length <= n ? s : s.slice(0, n) + "…"; }
