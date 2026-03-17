import { useState, useEffect, useCallback, useRef } from "react";
import { useKeyboard } from "@opentui/react";
import type { InputRenderable, ScrollBoxRenderable } from "@opentui/core";
import type { Agent } from "../agent/agent.js";
import type { ChatEntry, ToolCall, StreamChunk } from "../types/index.js";
import { getModelInfo } from "../grok/models.js";
import { getAvailableModels, saveProjectSettings } from "../utils/settings.js";

interface AppProps {
  agent: Agent;
  initialMessage?: string;
}

export function App({ agent, initialMessage }: AppProps) {
  const [messages, setMessages] = useState<ChatEntry[]>([]);
  const [streamContent, setStreamContent] = useState("");
  const [streamReasoning, setStreamReasoning] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [model, setModel] = useState(agent.getModel());
  const [showModelPicker, setShowModelPicker] = useState(false);
  const [modelPickerIndex, setModelPickerIndex] = useState(0);
  const [showHelp, setShowHelp] = useState(false);
  const [activeToolCalls, setActiveToolCalls] = useState<ToolCall[]>([]);
  const inputRef = useRef<InputRenderable>(null);
  const scrollRef = useRef<ScrollBoxRenderable>(null);
  const processedInitial = useRef(false);
  const contentAccRef = useRef("");

  const scrollToBottom = useCallback(() => {
    try {
      scrollRef.current?.scrollTo({ y: "end" } as any);
    } catch {
      // ignore scroll errors
    }
  }, []);

  const processMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || isProcessing) return;

      setIsProcessing(true);
      setStreamContent("");
      setStreamReasoning("");
      setActiveToolCalls([]);
      contentAccRef.current = "";

      setMessages((prev) => [
        ...prev,
        { type: "user", content: text.trim(), timestamp: new Date() },
      ]);

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
                  const savedContent = contentAccRef.current;
                  setMessages((prev) => [
                    ...prev,
                    { type: "assistant", content: savedContent, timestamp: new Date() },
                  ]);
                  contentAccRef.current = "";
                  setStreamContent("");
                }
                setActiveToolCalls(chunk.toolCalls);
              }
              break;
            case "tool_result":
              if (chunk.toolCall && chunk.toolResult) {
                setMessages((prev) => [
                  ...prev,
                  {
                    type: "tool_result",
                    content: chunk.toolResult!.success
                      ? chunk.toolResult!.output || "Success"
                      : chunk.toolResult!.error || "Error",
                    timestamp: new Date(),
                    toolCall: chunk.toolCall,
                    toolResult: chunk.toolResult,
                  },
                ]);
                setActiveToolCalls([]);
                setTimeout(scrollToBottom, 10);
              }
              break;
            case "error":
              contentAccRef.current += `\n${chunk.content || "Unknown error"}`;
              setStreamContent(contentAccRef.current);
              break;
            case "done":
              break;
          }
        }
      } catch {
        contentAccRef.current += "\nAn unexpected error occurred.";
        setStreamContent(contentAccRef.current);
      }

      if (contentAccRef.current.trim()) {
        const finalContent = contentAccRef.current;
        setMessages((prev) => [
          ...prev,
          { type: "assistant", content: finalContent, timestamp: new Date() },
        ]);
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
      if (c === "/help" || c === "/?") {
        setShowHelp((v) => !v);
        return true;
      }
      if (c === "/clear") {
        agent.clearHistory();
        setMessages([]);
        setStreamContent("");
        return true;
      }
      if (c === "/model" || c === "/models") {
        setShowModelPicker(true);
        setModelPickerIndex(0);
        return true;
      }
      if (c === "/quit" || c === "/exit" || c === "/q") {
        process.exit(0);
      }
      return false;
    },
    [agent],
  );

  useKeyboard((key) => {
    if (showModelPicker) {
      const models = getAvailableModels();
      if (key.name === "escape") {
        setShowModelPicker(false);
        return;
      }
      if (key.name === "up") {
        setModelPickerIndex((i) => Math.max(0, i - 1));
        return;
      }
      if (key.name === "down") {
        setModelPickerIndex((i) => Math.min(models.length - 1, i + 1));
        return;
      }
      if (key.name === "return") {
        const selected = models[modelPickerIndex];
        if (selected) {
          agent.setModel(selected);
          setModel(selected);
          saveProjectSettings({ model: selected });
        }
        setShowModelPicker(false);
        return;
      }
      return;
    }

    if (showHelp && key.name === "escape") {
      setShowHelp(false);
      return;
    }

    if (isProcessing && key.name === "escape") {
      agent.abort();
      return;
    }
  });

  const handleSubmit = useCallback(
    () => {
      const value = inputRef.current?.value || "";
      if (!value.trim()) return;
      if (inputRef.current) inputRef.current.value = "";
      if (handleCommand(value)) return;
      processMessage(value);
    },
    [handleCommand, processMessage],
  );

  if (showModelPicker) {
    return <ModelPicker currentModel={model} selectedIndex={modelPickerIndex} />;
  }

  return (
    <box flexDirection="column" width="100%" height="100%" backgroundColor="#0f172a">
      <StatusBar model={model} cwd={agent.getCwd()} isProcessing={isProcessing} />
      <scrollbox
        ref={scrollRef}
        flexGrow={1}
        flexShrink={1}
      >
        <box flexDirection="column" gap={1} padding={1}>
          {showHelp && <HelpPanel />}
          {messages.map((msg, i) => (
            <MessageView key={i} entry={msg} />
          ))}
          {activeToolCalls.length > 0 && (
            <box flexDirection="column">
              {activeToolCalls.map((tc, i) => (
                <text key={i} fg="#facc15">
                  {`⚙ ${tc.function.name}(${truncate(getToolArgs(tc), 120)})`}
                </text>
              ))}
            </box>
          )}
          {streamReasoning && (
            <box>
              <text fg="#8b5cf6">{`💭 ${truncate(streamReasoning, 200)}`}</text>
            </box>
          )}
          {streamContent && (
            <box flexDirection="column">
              <text fg="#34d399"><b>{"✦ Grok"}</b></text>
              <text fg="#e2e8f0" wrapMode="word">{streamContent}</text>
            </box>
          )}
          {isProcessing && !streamContent && activeToolCalls.length === 0 && (
            <text fg="#a78bfa">{"⏳ Thinking..."}</text>
          )}
        </box>
      </scrollbox>
      <box
        border
        borderStyle="rounded"
        borderColor={isProcessing ? "#6b7280" : "#3b82f6"}
        padding={0}
      >
        <input
          ref={inputRef}
          focused={!isProcessing && !showModelPicker}
          placeholder={isProcessing ? "Processing... (Esc to cancel)" : "Type a message... (/help for commands)"}
          textColor="#e2e8f0"
          backgroundColor="#0f172a"
          placeholderColor="#6b7280"
          onSubmit={handleSubmit as any}
        />
      </box>
    </box>
  );
}

function StatusBar({ model, cwd, isProcessing }: { model: string; cwd: string; isProcessing: boolean }) {
  const info = getModelInfo(model);
  const modelName = info?.name || model;

  return (
    <box
      flexDirection="row"
      justifyContent="space-between"
      backgroundColor="#1e293b"
      padding={0}
    >
      <text fg="#60a5fa">
        <b>{" GROK CLI "}</b>
      </text>
      <text fg="#94a3b8">{` ${cwd} `}</text>
      <text fg={isProcessing ? "#facc15" : "#34d399"}>
        {` ${modelName} ${isProcessing ? "⏳" : "●"} `}
      </text>
    </box>
  );
}

function MessageView({ entry }: { entry: ChatEntry }) {
  switch (entry.type) {
    case "user":
      return (
        <box flexDirection="column">
          <text fg="#60a5fa"><b>{"❯ You"}</b></text>
          <text fg="#cbd5e1" wrapMode="word">{entry.content}</text>
        </box>
      );

    case "assistant":
      return (
        <box flexDirection="column">
          <text fg="#34d399"><b>{"✦ Grok"}</b></text>
          <text fg="#e2e8f0" wrapMode="word">{entry.content}</text>
        </box>
      );

    case "tool_result": {
      const name = entry.toolCall?.function.name || "tool";
      const success = entry.toolResult?.success ?? true;
      const icon = success ? "✓" : "✗";
      const color = success ? "#34d399" : "#ef4444";
      const output = truncate(entry.content, 500);

      return (
        <box flexDirection="column">
          <text fg={color}>{`${icon} ${name}`}</text>
          {output && (
            <box>
              <text fg="#9ca3af" wrapMode="word">{output}</text>
            </box>
          )}
        </box>
      );
    }

    default:
      return <text fg="#6b7280">{entry.content}</text>;
  }
}

function HelpPanel() {
  return (
    <box
      border
      borderStyle="rounded"
      borderColor="#6366f1"
      flexDirection="column"
      padding={1}
      title=" Help "
      titleAlignment="center"
    >
      <text fg="#e2e8f0"><b>{"Commands"}</b></text>
      <text fg="#94a3b8">{"/model    — Switch model"}</text>
      <text fg="#94a3b8">{"/clear    — Clear chat history"}</text>
      <text fg="#94a3b8">{"/help     — Toggle this help"}</text>
      <text fg="#94a3b8">{"/quit     — Exit"}</text>
      <text>{" "}</text>
      <text fg="#e2e8f0"><b>{"Shortcuts"}</b></text>
      <text fg="#94a3b8">{"Esc       — Cancel current operation"}</text>
      <text fg="#94a3b8">{"Enter     — Send message"}</text>
    </box>
  );
}

function ModelPicker({ currentModel, selectedIndex }: { currentModel: string; selectedIndex: number }) {
  const models = getAvailableModels();

  return (
    <box flexDirection="column" width="100%" height="100%" backgroundColor="#0f172a">
      <box
        border
        borderStyle="rounded"
        borderColor="#6366f1"
        flexDirection="column"
        padding={1}
        title=" Select Model "
        titleAlignment="center"
        flexGrow={1}
      >
        <text fg="#94a3b8">{"Use ↑/↓ to select, Enter to confirm, Esc to cancel\n"}</text>
        {models.map((m, i) => {
          const isSelected = i === selectedIndex;
          const isCurrent = m === currentModel;
          const info = getModelInfo(m);
          const prefix = isSelected ? "❯ " : "  ";
          const suffix = isCurrent ? " (current)" : "";
          const desc = info ? ` — ${info.description}` : "";

          return (
            <text
              key={i}
              fg={isSelected ? "#60a5fa" : isCurrent ? "#34d399" : "#e2e8f0"}
            >
              {`${prefix}${m}${suffix}${desc}`}
            </text>
          );
        })}
      </box>
    </box>
  );
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max) + "…";
}

function getToolArgs(tc: ToolCall): string {
  try {
    const args = JSON.parse(tc.function.arguments);
    if (tc.function.name === "bash") return args.command || "";
    return args.query || JSON.stringify(args);
  } catch {
    return tc.function.arguments;
  }
}
