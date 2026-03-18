import { useState, useEffect, useCallback, useRef } from "react";
import { useKeyboard, useTerminalDimensions } from "@opentui/react";
import type { InputRenderable, ScrollBoxRenderable } from "@opentui/core";
import type { Agent } from "../agent/agent.js";
import type { ChatEntry, ToolCall, AgentMode } from "../types/index.js";
import { MODES } from "../types/index.js";
import { getModelInfo, MODEL_GROUPS, MODELS } from "../grok/models.js";
import { saveProjectSettings } from "../utils/settings.js";
import { dark, type Theme } from "./theme.js";

const SPLIT = {
  topLeft: "", bottomLeft: "", vertical: "┃", topRight: "",
  bottomRight: "", horizontal: " ", bottomT: "", topT: "",
  cross: "", leftT: "", rightT: "",
};
const SPLIT_END = { ...SPLIT, bottomLeft: "╹" };
const EMPTY = {
  topLeft: "", bottomLeft: "", vertical: "", topRight: "",
  bottomRight: "", horizontal: " ", bottomT: "", topT: "",
  cross: "", leftT: "", rightT: "",
};

interface AppProps { agent: Agent; initialMessage?: string }

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
  const [toolCallCount, setToolCallCount] = useState(0);
  const inputRef = useRef<InputRenderable>(null);
  const scrollRef = useRef<ScrollBoxRenderable>(null);
  const { width, height } = useTerminalDimensions();
  const processedInitial = useRef(false);
  const contentAccRef = useRef("");
  const startTimeRef = useRef(0);

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
    setToolCallCount(0); startTimeRef.current = Date.now();
    setMessages((prev) => [...prev, { type: "user", content: text.trim(), timestamp: new Date() }]);
    setTimeout(scrollToBottom, 50);
    try {
      for await (const chunk of agent.processMessage(text.trim())) {
        switch (chunk.type) {
          case "content":
            contentAccRef.current += chunk.content || "";
            setStreamContent(contentAccRef.current);
            setTimeout(scrollToBottom, 10);
            break;
          case "reasoning":
            setStreamReasoning((p) => p + (chunk.content || ""));
            break;
          case "tool_calls":
            if (chunk.toolCalls) {
              if (contentAccRef.current.trim()) {
                const s = contentAccRef.current;
                setMessages((p) => [...p, { type: "assistant", content: s, timestamp: new Date() }]);
                contentAccRef.current = ""; setStreamContent("");
              }
              setActiveToolCalls(chunk.toolCalls);
              setToolCallCount((c) => c + chunk.toolCalls!.length);
            }
            break;
          case "tool_result":
            if (chunk.toolCall && chunk.toolResult) {
              setMessages((p) => [...p, {
                type: "tool_result",
                content: chunk.toolResult!.success ? (chunk.toolResult!.output || "Success") : (chunk.toolResult!.error || "Error"),
                timestamp: new Date(), toolCall: chunk.toolCall, toolResult: chunk.toolResult,
              }]);
              setActiveToolCalls([]); setTimeout(scrollToBottom, 10);
            }
            break;
          case "error":
            contentAccRef.current += `\n${chunk.content || "Unknown error"}`;
            setStreamContent(contentAccRef.current);
            break;
          case "done": break;
        }
      }
    } catch { contentAccRef.current += "\nAn unexpected error occurred."; setStreamContent(contentAccRef.current); }
    if (contentAccRef.current.trim()) {
      const f = contentAccRef.current;
      setMessages((p) => [...p, { type: "assistant", content: f, timestamp: new Date() }]);
    }
    const elapsed = Date.now() - startTimeRef.current;
    const dur = formatDuration(elapsed);
    setMessages((p) => [...p, {
      type: "tool_call" as const, content: `▣  ${modeInfo.label} · ${model}${dur ? ` · ${dur}` : ""}`,
      timestamp: new Date(),
    }]);
    contentAccRef.current = ""; setStreamContent(""); setStreamReasoning(""); setActiveToolCalls([]);
    setIsProcessing(false); setTimeout(scrollToBottom, 50);
  }, [agent, isProcessing, scrollToBottom, modeInfo, model]);

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
        <box flexGrow={1} paddingBottom={1} paddingTop={1} paddingLeft={2} paddingRight={2} gap={1}>
          {/* Session header — ┃ left-border panel like OpenCode's Header */}
          <SessionHeader t={t} model={model} modelInfo={modelInfo} modeInfo={modeInfo} />
          {/* Scrollable messages */}
          <scrollbox ref={scrollRef} flexGrow={1} stickyScroll={true} stickyStart={"bottom" as any}>
            {messages.map((msg, i) => (
              <MessageView key={i} entry={msg} index={i} t={t} modeColor={modeInfo.color} />
            ))}
            {/* Active tool calls — pending inline */}
            {activeToolCalls.map((tc, i) => (
              <InlineTool key={i} t={t} icon="~" pending>{toolLabel(tc)}</InlineTool>
            ))}
            {/* Reasoning */}
            {streamReasoning && (
              <box paddingLeft={2} marginTop={1} border={["left"]} customBorderChars={SPLIT} borderColor={t.backgroundElement}>
                <text fg={t.textDim}><i>{"Thinking: "}{trunc(streamReasoning, 300)}</i></text>
              </box>
            )}
            {/* Streaming assistant content */}
            {streamContent && (
              <box paddingLeft={3} marginTop={1} flexShrink={0}>
                <text fg={t.text}>{streamContent}</text>
              </box>
            )}
            {/* Waiting indicator */}
            {isProcessing && !streamContent && activeToolCalls.length === 0 && (
              <InlineTool t={t} icon="~" pending>{"Thinking..."}</InlineTool>
            )}
          </scrollbox>
          {/* Prompt */}
          <box flexShrink={0}>
            <PromptBox t={t} inputRef={inputRef} isProcessing={isProcessing} showModelPicker={showModelPicker}
              onSubmit={handleSubmit} mode={mode} modeInfo={modeInfo} model={model} modelInfo={modelInfo} />
          </box>
        </box>
      ) : (
        /* ── Home ───────────────────────────────────────── */
        <>
          <box flexGrow={1} alignItems="center" paddingLeft={2} paddingRight={2}>
            <box flexGrow={1} minHeight={0} />
            <box flexShrink={0} alignItems="center">
              <text fg={t.primary}><b>{"  ✦  G R O K"}</b></text>
              <box height={1} />
              <text fg={t.textMuted}>{"AI coding agent for the terminal"}</text>
            </box>
            <box height={3} minHeight={0} flexShrink={1} />
            <box width="100%" maxWidth={75} flexShrink={0}>
              <PromptBox t={t} inputRef={inputRef} isProcessing={isProcessing} showModelPicker={showModelPicker}
                onSubmit={handleSubmit} mode={mode} modeInfo={modeInfo} model={model} modelInfo={modelInfo}
                placeholder={'Ask anything... "Fix broken tests"'} />
            </box>
            <box height={2} minHeight={0} flexShrink={1} />
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

/* ── Session Header ──────────────────────────────────────────── */

function SessionHeader({ t, model, modelInfo, modeInfo }: {
  t: Theme; model: string; modelInfo: ReturnType<typeof getModelInfo>;
  modeInfo: typeof MODES[number];
}) {
  return (
    <box flexShrink={0}>
      <box
        paddingTop={1} paddingBottom={1} paddingLeft={2} paddingRight={1}
        border={["left"]} customBorderChars={SPLIT} borderColor={t.border}
        backgroundColor={t.backgroundPanel}
      >
        <text fg={t.text}><b>{"# "}{modelInfo?.name || model}</b></text>
      </box>
    </box>
  );
}

/* ── Prompt Box ──────────────────────────────────────────────── */

function PromptBox({ t, inputRef, isProcessing, showModelPicker, onSubmit, mode, modeInfo, model, modelInfo, placeholder }: {
  t: Theme; inputRef: React.RefObject<InputRenderable | null>;
  isProcessing: boolean; showModelPicker: boolean; onSubmit: () => void;
  mode: AgentMode; modeInfo: typeof MODES[number]; model: string;
  modelInfo: ReturnType<typeof getModelInfo>; placeholder?: string;
}) {
  return (
    <box>
      <box border={["left"]} customBorderChars={SPLIT_END} borderColor={modeInfo.color}>
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
      <box height={1} border={["left"]} borderColor={modeInfo.color} customBorderChars={{ ...EMPTY, vertical: "╹" }}>
        <box height={1} border={["bottom"]} borderColor={t.backgroundElement} customBorderChars={{ ...EMPTY, horizontal: "▀" }} />
      </box>
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
        <box
          border={["left"]} customBorderChars={SPLIT} borderColor={modeColor}
          marginTop={index === 0 ? 0 : 1}
        >
          <box paddingTop={1} paddingBottom={1} paddingLeft={2} backgroundColor={t.backgroundPanel} flexShrink={0}>
            <text fg={t.text}>{entry.content}</text>
          </box>
        </box>
      );

    case "assistant":
      return (
        <box paddingLeft={3} marginTop={1} flexShrink={0}>
          <text fg={t.text}>{entry.content}</text>
        </box>
      );

    case "tool_call":
      return (
        <box paddingLeft={3} marginTop={1}>
          <text>
            <span style={{ fg: modeColor }}>{"▣ "}</span>
            <span style={{ fg: t.textMuted }}>{entry.content.replace("▣  ", "")}</span>
          </text>
        </box>
      );

    case "tool_result": {
      const name = entry.toolCall?.function.name || "tool";
      const ok = entry.toolResult?.success ?? true;
      const args = toolArgs(entry.toolCall);
      const output = entry.content;

      if (name === "bash" && output && output.split("\n").length > 3) {
        const lines = output.split("\n");
        const preview = lines.slice(0, 10).join("\n") + (lines.length > 10 ? "\n…" : "");
        return (
          <box
            border={["left"]} customBorderChars={SPLIT} borderColor={t.background}
            paddingTop={1} paddingBottom={1} paddingLeft={2} marginTop={1} gap={1}
            backgroundColor={t.backgroundPanel}
          >
            <text fg={t.textMuted}>{"# Shell"}</text>
            <box gap={1}>
              <text fg={t.text}>{"$ "}{args}</text>
              <text fg={t.text}>{preview}</text>
            </box>
          </box>
        );
      }

      if (name === "search_web" || name === "search_x") {
        if (output && output.length > 100) {
          return (
            <box
              border={["left"]} customBorderChars={SPLIT} borderColor={t.background}
              paddingTop={1} paddingBottom={1} paddingLeft={2} marginTop={1} gap={1}
              backgroundColor={t.backgroundPanel}
            >
              <text fg={t.textMuted}>{"# "}{name === "search_web" ? "Web Search" : "X Search"}{` "${args}"`}</text>
              <text fg={t.text}>{trunc(output, 500)}</text>
            </box>
          );
        }
        return <InlineTool t={t} icon="◈" pending={false}>{name === "search_web" ? "Web" : "X"}{` Search "${args}"`}</InlineTool>;
      }

      return <InlineTool t={t} icon={ok ? "$" : "✗"} pending={false}>{name === "bash" ? args : `${name} ${args}`}</InlineTool>;
    }

    default:
      return <text fg={t.textMuted}>{entry.content}</text>;
  }
}

function InlineTool({ t, icon, pending, children }: { t: Theme; icon: string; pending: boolean; children: React.ReactNode }) {
  return (
    <box paddingLeft={3} marginTop={0}>
      <text fg={pending ? t.text : t.textMuted}>
        {pending ? `~ ` : `${icon} `}{children}
      </text>
    </box>
  );
}

/* ── Model Picker ────────────────────────────────────────────── */

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
function toolLabel(tc: ToolCall): string {
  const args = toolArgs(tc);
  if (tc.function.name === "bash") return args || "Running command...";
  if (tc.function.name === "search_web") return `Web Search "${args}"`;
  if (tc.function.name === "search_x") return `X Search "${args}"`;
  return `${tc.function.name} ${args}`;
}
function trunc(s: string, n: number): string { return s.length <= n ? s : s.slice(0, n) + "…"; }
function formatDuration(ms: number): string {
  if (ms < 1000) return "";
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${s % 60}s`;
}
