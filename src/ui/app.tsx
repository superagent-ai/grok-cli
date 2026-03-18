import { useState, useEffect, useCallback, useRef } from "react";
import { useKeyboard, useTerminalDimensions } from "@opentui/react";
import type { InputRenderable, ScrollBoxRenderable } from "@opentui/core";
import type { Agent } from "../agent/agent.js";
import type { ChatEntry, ToolCall, AgentMode } from "../types/index.js";
import { MODES } from "../types/index.js";
import { getModelInfo } from "../grok/models.js";
import { getAvailableModels, saveProjectSettings } from "../utils/settings.js";
import { dark, type Theme } from "./theme.js";

const SPLIT_BORDER = {
  topLeft: "", bottomLeft: "", vertical: "┃", topRight: "",
  bottomRight: "", horizontal: " ", bottomT: "", topT: "",
  cross: "", leftT: "", rightT: "",
};

const SPLIT_BORDER_END = {
  ...SPLIT_BORDER,
  bottomLeft: "╹",
};

const LOGO_LEFT  = ["                   ", "█▀▀▀ █▀▀█ █▀▀█ █▀▀▄", "█ __ █__█ █  █ █__█", "▀▀▀▀ █   ▀▀▀▀ ▀  ▀"];
const LOGO_RIGHT = ["         ", "█▀▀▀ █  █", "█    █  █", "▀▀▀▀ ▀▀▀▀"];

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

  const setMode = useCallback((m: AgentMode) => {
    agent.setMode(m);
    setModeState(m);
  }, [agent]);

  const cycleMode = useCallback(() => {
    const idx = MODES.findIndex((m) => m.id === mode);
    const next = MODES[(idx + 1) % MODES.length];
    setMode(next.id);
  }, [mode, setMode]);

  const modeInfo = MODES.find((m) => m.id === mode)!;
  const modelInfo = getModelInfo(model);

  const scrollToBottom = useCallback(() => {
    try { scrollRef.current?.scrollTo(scrollRef.current?.scrollHeight ?? 99999); } catch { /* */ }
  }, []);

  const processMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || isProcessing) return;
      setIsProcessing(true);
      setStreamContent("");
      setStreamReasoning("");
      setActiveToolCalls([]);
      contentAccRef.current = "";

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
              setStreamReasoning((prev) => prev + (chunk.content || ""));
              break;
            case "tool_calls":
              if (chunk.toolCalls) {
                if (contentAccRef.current.trim()) {
                  const saved = contentAccRef.current;
                  setMessages((prev) => [...prev, { type: "assistant", content: saved, timestamp: new Date() }]);
                  contentAccRef.current = "";
                  setStreamContent("");
                }
                setActiveToolCalls(chunk.toolCalls);
              }
              break;
            case "tool_result":
              if (chunk.toolCall && chunk.toolResult) {
                setMessages((prev) => [...prev, {
                  type: "tool_result",
                  content: chunk.toolResult!.success ? (chunk.toolResult!.output || "Success") : (chunk.toolResult!.error || "Error"),
                  timestamp: new Date(), toolCall: chunk.toolCall, toolResult: chunk.toolResult,
                }]);
                setActiveToolCalls([]);
                setTimeout(scrollToBottom, 10);
              }
              break;
            case "error":
              contentAccRef.current += `\n${chunk.content || "Unknown error"}`;
              setStreamContent(contentAccRef.current);
              break;
            case "done": break;
          }
        }
      } catch {
        contentAccRef.current += "\nAn unexpected error occurred.";
        setStreamContent(contentAccRef.current);
      }

      if (contentAccRef.current.trim()) {
        const final = contentAccRef.current;
        setMessages((prev) => [...prev, { type: "assistant", content: final, timestamp: new Date() }]);
      }

      contentAccRef.current = "";
      setStreamContent("");
      setStreamReasoning("");
      setActiveToolCalls([]);
      setIsProcessing(false);
      setTimeout(scrollToBottom, 50);
    },
    [agent, isProcessing, scrollToBottom],
  );

  useEffect(() => {
    if (initialMessage && !processedInitial.current) {
      processedInitial.current = true;
      processMessage(initialMessage);
    }
  }, [initialMessage, processMessage]);

  const handleCommand = useCallback(
    (cmd: string): boolean => {
      const c = cmd.trim().toLowerCase();
      if (c === "/help") { return true; }
      if (c === "/clear") { agent.clearHistory(); setMessages([]); setStreamContent(""); return true; }
      if (c === "/model" || c === "/models") { setShowModelPicker(true); setModelPickerIndex(0); return true; }
      if (c === "/quit" || c === "/exit" || c === "/q") { process.exit(0); }
      return false;
    },
    [agent],
  );

  useKeyboard((key) => {
    if (showModelPicker) {
      const models = getAvailableModels();
      if (key.name === "escape") { setShowModelPicker(false); return; }
      if (key.name === "up") { setModelPickerIndex((i) => Math.max(0, i - 1)); return; }
      if (key.name === "down") { setModelPickerIndex((i) => Math.min(models.length - 1, i + 1)); return; }
      if (key.name === "return") {
        const sel = models[modelPickerIndex];
        if (sel) { agent.setModel(sel); setModel(sel); saveProjectSettings({ model: sel }); }
        setShowModelPicker(false);
        return;
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

  if (showModelPicker) {
    return <ModelPickerView t={t} currentModel={model} selectedIndex={modelPickerIndex} width={width} height={height} />;
  }

  const hasMessages = messages.length > 0 || streamContent || isProcessing;

  return (
    <box width={width} height={height} backgroundColor={t.background} flexDirection="column">
      {hasMessages ? (
        <SessionView
          t={t} agent={agent} model={model} mode={mode} modeInfo={modeInfo} modelInfo={modelInfo}
          messages={messages} streamContent={streamContent} streamReasoning={streamReasoning}
          isProcessing={isProcessing} activeToolCalls={activeToolCalls}
          scrollRef={scrollRef} inputRef={inputRef} showModelPicker={showModelPicker}
          handleSubmit={handleSubmit} scrollToBottom={scrollToBottom}
        />
      ) : (
        <HomeView
          t={t} agent={agent} model={model} mode={mode} modeInfo={modeInfo} modelInfo={modelInfo}
          inputRef={inputRef} isProcessing={isProcessing} showModelPicker={showModelPicker}
          handleSubmit={handleSubmit}
        />
      )}
    </box>
  );
}

/* ── Home Screen ─────────────────────────────────────────────────── */

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
        <box height={4} minHeight={0} flexShrink={1} />
        {/* Logo */}
        <box flexShrink={0}>
          {LOGO_LEFT.map((line, i) => (
            <box key={i} flexDirection="row" gap={1}>
              <text fg={t.textMuted}>{line}</text>
              <text fg={t.text}><b>{LOGO_RIGHT[i]}</b></text>
            </box>
          ))}
        </box>
        <box height={1} minHeight={0} flexShrink={1} />
        {/* Prompt box */}
        <box width="100%" maxWidth={75} paddingTop={1} flexShrink={0}>
          <PromptBox
            t={t} inputRef={inputRef} isProcessing={isProcessing}
            showModelPicker={showModelPicker} onSubmit={handleSubmit}
            mode={mode} modeInfo={modeInfo} model={model} modelInfo={modelInfo}
            placeholder={`Ask anything... "Fix broken tests"`}
          />
        </box>
        {/* Keyboard hints */}
        <box height={4} minHeight={0} width="100%" maxWidth={75} alignItems="center" paddingTop={2} flexShrink={1}>
          <box flexDirection="row" gap={2}>
            <text fg={t.text}>{"tab "}<span style={{ fg: t.textMuted }}>{"modes"}</span></text>
            <text fg={t.text}>{"ctrl+p "}<span style={{ fg: t.textMuted }}>{"commands"}</span></text>
          </box>
        </box>
        <box flexGrow={1} minHeight={0} />
      </box>
      {/* Footer */}
      <box paddingTop={1} paddingBottom={1} paddingLeft={2} paddingRight={2} flexDirection="row" flexShrink={0} gap={2}>
        <text fg={t.textMuted}>{agent.getCwd()}</text>
        <box flexGrow={1} />
        <text fg={t.textMuted}>{"v1.0.0"}</text>
      </box>
    </>
  );
}

/* ── Session View ────────────────────────────────────────────────── */

function SessionView({ t, agent, model, mode, modeInfo, modelInfo, messages, streamContent, streamReasoning, isProcessing, activeToolCalls, scrollRef, inputRef, showModelPicker, handleSubmit, scrollToBottom }: {
  t: Theme; agent: Agent; model: string; mode: AgentMode;
  modeInfo: typeof MODES[number]; modelInfo: ReturnType<typeof getModelInfo>;
  messages: ChatEntry[]; streamContent: string; streamReasoning: string;
  isProcessing: boolean; activeToolCalls: ToolCall[];
  scrollRef: React.RefObject<ScrollBoxRenderable | null>;
  inputRef: React.RefObject<InputRenderable | null>;
  showModelPicker: boolean; handleSubmit: () => void; scrollToBottom: () => void;
}) {
  return (
    <box flexGrow={1} paddingBottom={1} paddingTop={1} paddingLeft={2} paddingRight={2} gap={1}>
      <Header t={t} model={model} modelInfo={modelInfo} isProcessing={isProcessing} />
      <scrollbox ref={scrollRef} flexGrow={1} stickyScroll={true} stickyStart={"bottom" as any}>
        {messages.map((msg, i) => (
          <MessageView key={i} entry={msg} index={i} t={t} modeColor={modeInfo.color} />
        ))}
        {activeToolCalls.length > 0 && activeToolCalls.map((tc, i) => (
          <ToolCallPending key={i} tc={tc} t={t} />
        ))}
        {streamReasoning && (
          <box paddingLeft={2} marginTop={1} border={["left"]} customBorderChars={SPLIT_BORDER} borderColor={t.backgroundElement}>
            <text fg={t.textMuted}><i>{"Thinking: "}{truncate(streamReasoning, 300)}</i></text>
          </box>
        )}
        {streamContent && (
          <box paddingLeft={3} marginTop={1} flexShrink={0}>
            <text fg={t.text}>{streamContent}</text>
          </box>
        )}
        {isProcessing && !streamContent && activeToolCalls.length === 0 && (
          <box paddingLeft={3} marginTop={1}>
            <text fg={t.textMuted}>{"~ Thinking..."}</text>
          </box>
        )}
      </scrollbox>
      <box flexShrink={0}>
        <PromptBox
          t={t} inputRef={inputRef} isProcessing={isProcessing}
          showModelPicker={showModelPicker} onSubmit={handleSubmit}
          mode={mode} modeInfo={modeInfo} model={model} modelInfo={modelInfo}
        />
      </box>
      <Footer t={t} cwd={agent.getCwd()} model={model} isProcessing={isProcessing} />
    </box>
  );
}

/* ── Prompt Box (OpenCode-style: input + mode/model line below) ── */

function PromptBox({ t, inputRef, isProcessing, showModelPicker, onSubmit, mode, modeInfo, model, modelInfo, placeholder }: {
  t: Theme;
  inputRef: React.RefObject<InputRenderable | null>;
  isProcessing: boolean; showModelPicker: boolean; onSubmit: () => void;
  mode: AgentMode; modeInfo: typeof MODES[number]; model: string;
  modelInfo: ReturnType<typeof getModelInfo>;
  placeholder?: string;
}) {
  const modelDisplay = modelInfo?.name || model;
  const providerDisplay = "xAI";

  return (
    <box>
      <box
        border={["left"]}
        customBorderChars={SPLIT_BORDER_END}
        borderColor={modeInfo.color}
      >
        <box
          paddingLeft={2}
          paddingRight={2}
          paddingTop={1}
          backgroundColor={t.backgroundElement}
          flexShrink={0}
        >
          <input
            ref={inputRef}
            focused={!isProcessing && !showModelPicker}
            placeholder={isProcessing ? "Processing... (Esc to cancel)" : (placeholder || "Ask anything...")}
            textColor={t.text}
            backgroundColor={t.backgroundElement}
            placeholderColor={t.textMuted}
            onSubmit={onSubmit as any}
          />
          {/* Mode + Model line below input */}
          <box flexDirection="row" flexShrink={0} paddingTop={1} gap={1}>
            <text fg={modeInfo.color}>{modeInfo.label}{" "}</text>
            <text fg={t.text}>{modelDisplay}</text>
            <text fg={t.textMuted}>{providerDisplay}</text>
          </box>
        </box>
      </box>
      {/* Shadow/bottom edge like OpenCode */}
      <box height={1} border={["left"]} borderColor={modeInfo.color} customBorderChars={{ ...SPLIT_BORDER, vertical: "╹" }}>
        <box height={1} border={["bottom"]} borderColor={t.backgroundElement} customBorderChars={{ ...SPLIT_BORDER, horizontal: "▀" }} />
      </box>
      {/* Hints row */}
      <box flexDirection="row" justifyContent="flex-end" gap={2}>
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

/* ── Header ──────────────────────────────────────────────────────── */

function Header({ t, model, modelInfo, isProcessing }: { t: Theme; model: string; modelInfo: ReturnType<typeof getModelInfo>; isProcessing: boolean }) {
  const label = modelInfo ? `${modelInfo.name} · ${model}` : model;
  return (
    <box flexShrink={0}>
      <box
        paddingTop={1} paddingBottom={1} paddingLeft={2} paddingRight={1}
        border={["left"]} customBorderChars={SPLIT_BORDER} borderColor={t.border}
        backgroundColor={t.backgroundPanel} flexDirection="row" justifyContent="space-between"
      >
        <text fg={t.text}><b>{"# Grok CLI"}</b></text>
        <text fg={t.textMuted}>{label}{isProcessing ? " ⏳" : ""}</text>
      </box>
    </box>
  );
}

/* ── Message Rendering ───────────────────────────────────────────── */

function MessageView({ entry, index, t, modeColor }: { entry: ChatEntry; index: number; t: Theme; modeColor: string }) {
  switch (entry.type) {
    case "user":
      return (
        <box border={["left"]} customBorderChars={SPLIT_BORDER} borderColor={modeColor} marginTop={index === 0 ? 0 : 1}>
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
            <text fg={t.textMuted}>{"# "}{getToolTitle(name, args)}</text>
            <box gap={1}>
              <text fg={t.text}>{"$ "}{args}</text>
              <text fg={t.text}>{preview}</text>
            </box>
          </box>
        );
      }

      const icon = success ? getToolIcon(name) : "✗";
      const fg = success ? t.textMuted : t.error;
      return (
        <box paddingLeft={3} marginTop={0}>
          <text fg={fg}>{icon}{" "}{getToolLabel(name, args, success)}</text>
        </box>
      );
    }
    default:
      return <text fg={t.textMuted}>{entry.content}</text>;
  }
}

function ToolCallPending({ tc, t }: { tc: ToolCall; t: Theme }) {
  const args = getToolArgs(tc);
  return (
    <box paddingLeft={3} marginTop={0}>
      <text fg={t.text}>{"~ "}{tc.function.name === "bash" ? args : `${tc.function.name} ${args}`}</text>
    </box>
  );
}

/* ── Footer ──────────────────────────────────────────────────────── */

function Footer({ t, cwd, model, isProcessing }: { t: Theme; cwd: string; model: string; isProcessing?: boolean }) {
  return (
    <box flexDirection="row" justifyContent="space-between" gap={1} flexShrink={0}>
      <text fg={t.textMuted}>{cwd}</text>
      <text fg={t.textMuted}>{model}</text>
    </box>
  );
}

/* ── Model Picker ────────────────────────────────────────────────── */

function ModelPickerView({ t, currentModel, selectedIndex, width, height }: {
  t: Theme; currentModel: string; selectedIndex: number; width: number; height: number;
}) {
  const models = getAvailableModels();
  return (
    <box width={width} height={height} backgroundColor={t.background} flexDirection="column">
      <box flexGrow={1} paddingLeft={2} paddingRight={2} paddingTop={1} paddingBottom={1}>
        <box border={["left"]} customBorderChars={SPLIT_BORDER} borderColor={t.primary}
          paddingTop={1} paddingBottom={1} paddingLeft={2} backgroundColor={t.backgroundPanel} gap={1} flexGrow={1}>
          <text fg={t.text}><b>{"# Switch Model"}</b></text>
          <text fg={t.textMuted}>{"↑/↓ select · Enter confirm · Esc cancel"}</text>
          <box marginTop={1}>
            {models.map((m, i) => {
              const selected = i === selectedIndex;
              const current = m === currentModel;
              const info = getModelInfo(m);
              return (
                <box key={i} backgroundColor={selected ? t.backgroundElement : undefined}>
                  <text fg={selected ? t.primary : current ? t.success : t.text}>
                    {selected ? " ❯ " : "   "}{m}{current ? " (current)" : ""}{info ? ` — ${info.description}` : ""}
                  </text>
                </box>
              );
            })}
          </box>
        </box>
      </box>
      <box paddingLeft={2} paddingRight={2} paddingBottom={1} flexShrink={0}>
        <text fg={t.textMuted}>{"/models"}</text>
      </box>
    </box>
  );
}

/* ── Helpers ──────────────────────────────────────────────────────── */

function getToolIcon(name: string): string {
  switch (name) { case "bash": return "$"; case "search_web": return "◈"; case "search_x": return "◇"; default: return "⚙"; }
}
function getToolTitle(name: string, args: string): string {
  if (name === "bash") return "Shell";
  if (name === "search_web") return `Web Search "${args}"`;
  if (name === "search_x") return `X Search "${args}"`;
  return name;
}
function getToolLabel(name: string, args: string, success: boolean): string {
  if (!success) return `${name} failed`;
  if (name === "bash") return args;
  if (name === "search_web") return `Web Search "${args}"`;
  if (name === "search_x") return `X Search "${args}"`;
  return `${name} ${args}`;
}
function getToolArgs(tc?: ToolCall): string {
  if (!tc) return "";
  try {
    const args = JSON.parse(tc.function.arguments);
    if (tc.function.name === "bash") return args.command || "";
    return args.query || "";
  } catch { return ""; }
}
function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max) + "…";
}
