import { useState, useEffect, useCallback, useRef } from "react";
import { useKeyboard, useTerminalDimensions } from "@opentui/react";
import type { InputRenderable, ScrollBoxRenderable } from "@opentui/core";
import type { Agent } from "../agent/agent.js";
import type { ChatEntry, ToolCall, AgentMode } from "../types/index.js";
import { MODES } from "../types/index.js";
import { getModelInfo, MODEL_GROUPS, MODELS } from "../grok/models.js";
import { getAvailableModels, saveProjectSettings } from "../utils/settings.js";
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

const GROK_LOGO = [
  "    ⢀⣴⣶⣦⡀    ",
  "   ⣰⣿⠟⠁⢹⣷   ",
  "  ⣰⣿⠋  ⢀⣿⡇  ",
  "  ⣿⣿  ⢀⣾⡿⠁  ",
  "  ⠹⣿⣦⣴⣿⠟⠁   ",
  "   ⠈⠛⠛⠋⠁     ",
];

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

  const scrollToBottom = useCallback(() => {
    try { scrollRef.current?.scrollTo(scrollRef.current?.scrollHeight ?? 99999); } catch { /* */ }
  }, []);

  // Flat model list for picker navigation
  const flatModels = MODELS.map((m) => m.id);

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
    if (c === "/model" || c === "/models") { setShowModelPicker(true); setModelPickerIndex(flatModels.indexOf(model)); return true; }
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
    const value = inputRef.current?.value || "";
    if (!value.trim()) return;
    if (inputRef.current) inputRef.current.value = "";
    if (handleCommand(value)) return;
    processMessage(value);
  }, [handleCommand, processMessage]);

  const hasMessages = messages.length > 0 || streamContent || isProcessing;

  return (
    <box width={width} height={height} backgroundColor={t.background} flexDirection="column">
      {hasMessages ? (
        <SessionView
          t={t} agent={agent} model={model} mode={mode} modeInfo={modeInfo} modelInfo={modelInfo}
          messages={messages} streamContent={streamContent} streamReasoning={streamReasoning}
          isProcessing={isProcessing} activeToolCalls={activeToolCalls}
          scrollRef={scrollRef} inputRef={inputRef} showModelPicker={showModelPicker}
          handleSubmit={handleSubmit}
        />
      ) : (
        <HomeView
          t={t} agent={agent} model={model} mode={mode} modeInfo={modeInfo} modelInfo={modelInfo}
          inputRef={inputRef} isProcessing={isProcessing} showModelPicker={showModelPicker}
          handleSubmit={handleSubmit}
        />
      )}
      {/* Model picker modal overlay */}
      {showModelPicker && (
        <ModelPickerModal t={t} currentModel={model} selectedIndex={modelPickerIndex} width={width} height={height} />
      )}
    </box>
  );
}

/* ── Home Screen ─────────────────────────────────────────────── */

function HomeView({ t, agent, model, mode, modeInfo, modelInfo, inputRef, isProcessing, showModelPicker, handleSubmit }: {
  t: Theme; agent: Agent; model: string; mode: AgentMode;
  modeInfo: typeof MODES[number]; modelInfo: ReturnType<typeof getModelInfo>;
  inputRef: React.RefObject<InputRenderable | null>;
  isProcessing: boolean; showModelPicker: boolean; handleSubmit: () => void;
}) {
  return (
    <>
      <box flexGrow={1} alignItems="center" paddingLeft={2} paddingRight={2}>
        <box flexGrow={1} minHeight={0} />
        <box height={3} minHeight={0} flexShrink={1} />
        {/* Grok Logo */}
        <box flexShrink={0} alignItems="center">
          <box flexDirection="row" gap={2} alignItems="center">
            <box>
              {GROK_LOGO.map((line, i) => (
                <text key={i} fg={t.text}>{line}</text>
              ))}
            </box>
            <text fg={t.text}><b>{"Grok"}</b></text>
          </box>
        </box>
        <box height={2} minHeight={0} flexShrink={1} />
        {/* Prompt box */}
        <box width="100%" maxWidth={75} flexShrink={0}>
          <PromptBox
            t={t} inputRef={inputRef} isProcessing={isProcessing}
            showModelPicker={showModelPicker} onSubmit={handleSubmit}
            mode={mode} modeInfo={modeInfo} model={model} modelInfo={modelInfo}
            placeholder={`Ask anything... "Fix broken tests"`}
          />
        </box>
        {/* Keyboard hints */}
        <box height={3} minHeight={0} width="100%" maxWidth={75} alignItems="center" paddingTop={2} flexShrink={1}>
          <box flexDirection="row" gap={3}>
            <text fg={t.text}>{"tab "}<span style={{ fg: t.textMuted }}>{"modes"}</span></text>
            <text fg={t.text}>{"ctrl+p "}<span style={{ fg: t.textMuted }}>{"commands"}</span></text>
          </box>
        </box>
        <box flexGrow={1} minHeight={0} />
      </box>
      <box paddingTop={1} paddingBottom={1} paddingLeft={2} paddingRight={2} flexDirection="row" flexShrink={0} gap={2}>
        <text fg={t.textMuted}>{agent.getCwd()}</text>
        <box flexGrow={1} />
        <text fg={t.textMuted}>{"v1.0.0"}</text>
      </box>
    </>
  );
}

/* ── Session View ────────────────────────────────────────────── */

function SessionView({ t, agent, model, mode, modeInfo, modelInfo, messages, streamContent, streamReasoning, isProcessing, activeToolCalls, scrollRef, inputRef, showModelPicker, handleSubmit }: {
  t: Theme; agent: Agent; model: string; mode: AgentMode;
  modeInfo: typeof MODES[number]; modelInfo: ReturnType<typeof getModelInfo>;
  messages: ChatEntry[]; streamContent: string; streamReasoning: string;
  isProcessing: boolean; activeToolCalls: ToolCall[];
  scrollRef: React.RefObject<ScrollBoxRenderable | null>;
  inputRef: React.RefObject<InputRenderable | null>;
  showModelPicker: boolean; handleSubmit: () => void;
}) {
  return (
    <box flexGrow={1} paddingBottom={1} paddingTop={1} paddingLeft={2} paddingRight={2} gap={1}>
      <Header t={t} model={model} modelInfo={modelInfo} isProcessing={isProcessing} />
      <scrollbox ref={scrollRef} flexGrow={1} stickyScroll={true} stickyStart={"bottom" as any}>
        {messages.map((msg, i) => <MessageView key={i} entry={msg} index={i} t={t} />)}
        {activeToolCalls.length > 0 && activeToolCalls.map((tc, i) => <ToolCallPending key={i} tc={tc} t={t} />)}
        {streamReasoning && (
          <box paddingLeft={2} marginTop={1} border={["left"]} customBorderChars={SPLIT_BORDER} borderColor={t.backgroundElement}>
            <text fg={t.textMuted}><i>{"Thinking: "}{truncate(streamReasoning, 300)}</i></text>
          </box>
        )}
        {streamContent && <box paddingLeft={3} marginTop={1} flexShrink={0}><text fg={t.text}>{streamContent}</text></box>}
        {isProcessing && !streamContent && activeToolCalls.length === 0 && (
          <box paddingLeft={3} marginTop={1}><text fg={t.textMuted}>{"~ Thinking..."}</text></box>
        )}
      </scrollbox>
      <box flexShrink={0}>
        <PromptBox
          t={t} inputRef={inputRef} isProcessing={isProcessing} showModelPicker={showModelPicker}
          onSubmit={handleSubmit} mode={mode} modeInfo={modeInfo} model={model} modelInfo={modelInfo}
        />
      </box>
      <box flexDirection="row" justifyContent="space-between" gap={1} flexShrink={0}>
        <text fg={t.textMuted}>{agent.getCwd()}</text>
        <text fg={t.textMuted}>{model}</text>
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
      <box border={["left"]} customBorderChars={SPLIT_BORDER_END} borderColor={t.text}>
        <box paddingLeft={2} paddingRight={2} paddingTop={1} backgroundColor={t.backgroundElement} flexShrink={0}>
          <input
            ref={inputRef} focused={!isProcessing && !showModelPicker}
            placeholder={isProcessing ? "Processing... (Esc to cancel)" : (placeholder || "Ask anything...")}
            textColor={t.text} backgroundColor={t.backgroundElement} placeholderColor={t.textMuted}
            onSubmit={onSubmit as any}
          />
          <box flexDirection="row" flexShrink={0} paddingTop={1} gap={1}>
            <text fg={t.text}><b>{modeInfo.label}</b>{" "}</text>
            <text fg={t.text}>{modelInfo?.name || model}</text>
            <text fg={t.textMuted}>{"xAI"}</text>
          </box>
        </box>
      </box>
      <box height={1} border={["left"]} borderColor={t.text} customBorderChars={{ ...EMPTY_BORDER, vertical: "╹" }}>
        <box height={1} border={["bottom"]} borderColor={t.backgroundElement} customBorderChars={{ ...EMPTY_BORDER, horizontal: "▀" }} />
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

/* ── Header ──────────────────────────────────────────────────── */

function Header({ t, model, modelInfo, isProcessing }: { t: Theme; model: string; modelInfo: ReturnType<typeof getModelInfo>; isProcessing: boolean }) {
  return (
    <box flexShrink={0}>
      <box paddingTop={1} paddingBottom={1} paddingLeft={2} paddingRight={1}
        border={["left"]} customBorderChars={SPLIT_BORDER} borderColor={t.border}
        backgroundColor={t.backgroundPanel} flexDirection="row" justifyContent="space-between">
        <text fg={t.text}><b>{"# Grok CLI"}</b></text>
        <text fg={t.textMuted}>{modelInfo ? `${modelInfo.name} · ${model}` : model}{isProcessing ? " ⏳" : ""}</text>
      </box>
    </box>
  );
}

/* ── Messages ────────────────────────────────────────────────── */

function MessageView({ entry, index, t }: { entry: ChatEntry; index: number; t: Theme }) {
  switch (entry.type) {
    case "user":
      return (
        <box border={["left"]} customBorderChars={SPLIT_BORDER} borderColor={t.text} marginTop={index === 0 ? 0 : 1}>
          <box paddingTop={1} paddingBottom={1} paddingLeft={2} backgroundColor={t.backgroundPanel} flexShrink={0}>
            <text fg={t.text}>{entry.content}</text>
          </box>
        </box>
      );
    case "assistant":
      return <box paddingLeft={3} marginTop={1} flexShrink={0}><text fg={t.text}>{entry.content}</text></box>;
    case "tool_result": {
      const name = entry.toolCall?.function.name || "tool";
      const success = entry.toolResult?.success ?? true;
      const args = getToolArgs(entry.toolCall);
      const output = entry.content;
      if (name === "bash" && output && output.split("\n").length > 3) {
        const lines = output.split("\n");
        const preview = lines.slice(0, 10).join("\n") + (lines.length > 10 ? "\n…" : "");
        return (
          <box border={["left"]} customBorderChars={SPLIT_BORDER} borderColor={t.background}
            paddingTop={1} paddingBottom={1} paddingLeft={2} marginTop={1} gap={1} backgroundColor={t.backgroundPanel}>
            <text fg={t.textMuted}>{"# Shell"}</text>
            <box gap={1}>
              <text fg={t.text}>{"$ "}{args}</text>
              <text fg={t.text}>{preview}</text>
            </box>
          </box>
        );
      }
      return (
        <box paddingLeft={3} marginTop={0}>
          <text fg={success ? t.textMuted : t.text}>{success ? "$" : "✗"}{" "}{name === "bash" ? args : `${name} ${args}`}</text>
        </box>
      );
    }
    default: return <text fg={t.textMuted}>{entry.content}</text>;
  }
}

function ToolCallPending({ tc, t }: { tc: ToolCall; t: Theme }) {
  const args = getToolArgs(tc);
  return <box paddingLeft={3} marginTop={0}><text fg={t.text}>{"~ "}{tc.function.name === "bash" ? args : `${tc.function.name} ${args}`}</text></box>;
}

/* ── Model Picker Modal (OpenCode-style floating dialog) ─────── */

function ModelPickerModal({ t, currentModel, selectedIndex, width, height }: {
  t: Theme; currentModel: string; selectedIndex: number; width: number; height: number;
}) {
  let flatIdx = 0;

  return (
    <box
      position="absolute" left={0} top={0}
      width={width} height={height}
      alignItems="center"
      paddingTop={Math.floor(height / 6)}
      backgroundColor={"#000000c0" as any}
    >
      <box
        width={Math.min(65, width - 4)}
        backgroundColor={t.backgroundPanel}
        paddingTop={1}
        paddingBottom={1}
        maxHeight={Math.floor(height * 0.75)}
      >
        {/* Title row */}
        <box flexDirection="row" justifyContent="space-between" paddingLeft={2} paddingRight={2}>
          <text fg={t.text}><b>{"Select model"}</b></text>
          <text fg={t.textMuted}>{"esc"}</text>
        </box>
        {/* Search placeholder */}
        <box paddingLeft={2} paddingRight={2} paddingTop={1}>
          <text fg={t.textMuted}>{"Search"}</text>
        </box>
        {/* Grouped model list */}
        <scrollbox flexGrow={1} paddingTop={1}>
          {MODEL_GROUPS.map((group) => {
            const groupItems = group.models.map((mid) => {
              const info = getModelInfo(mid);
              const idx = flatIdx++;
              const selected = idx === selectedIndex;
              const isCurrent = mid === currentModel;
              return { mid, info, idx, selected, isCurrent };
            });
            return (
              <box key={group.category}>
                <box paddingLeft={2} paddingTop={1}>
                  <text fg={t.text}><b>{group.category}</b></text>
                </box>
                {groupItems.map(({ mid, info, selected, isCurrent }) => (
                  <box key={mid} backgroundColor={selected ? t.selectedBg : undefined} paddingLeft={2} paddingRight={2}>
                    <box flexDirection="row" justifyContent="space-between">
                      <text fg={selected ? t.selected : t.text}>
                        {isCurrent ? "● " : "  "}{info?.name || mid}{" "}
                        <span style={{ fg: t.textMuted }}>{"xAI"}</span>
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

function getToolArgs(tc?: ToolCall): string {
  if (!tc) return "";
  try { const a = JSON.parse(tc.function.arguments); return tc.function.name === "bash" ? a.command || "" : a.query || ""; } catch { return ""; }
}
function truncate(s: string, max: number): string { return s.length <= max ? s : s.slice(0, max) + "…"; }
