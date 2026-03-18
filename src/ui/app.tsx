import os from "os";
import { useState, useEffect, useCallback, useRef } from "react";
import { useKeyboard, useTerminalDimensions } from "@opentui/react";
import type { ScrollBoxRenderable, TextareaRenderable, KeyBinding } from "@opentui/core";
import { decodePasteBytes, PasteEvent } from "@opentui/core";
import type { Agent } from "../agent/agent.js";
import type { ChatEntry, ToolCall, AgentMode, ModelInfo, FileDiff, Plan, PlanQuestion } from "../types/index.js";
import { MODES } from "../types/index.js";
import { getModelInfo, MODELS } from "../grok/models.js";
import { saveProjectSettings } from "../utils/settings.js";
import { dark, type Theme } from "./theme.js";
import { Markdown } from "./markdown.js";
import { PlanView, PlanQuestionsPanel, formatPlanAnswers, initialPlanQuestionsState, type PlanAnswers, type PlanQuestionsState } from "./plan.js";

const STAR_PALETTE = ["#777777", "#666666", "#4a4a4a", "#333333", "#222222"];

type Star = { col: number; ch: string };
type Row = { stars: Star[]; grok?: number };

const HERO_ROWS: Row[] = [
  { stars: [{ col: 0, ch: "·" }, { col: 13, ch: "*" }, { col: 21, ch: "·" }, { col: 34, ch: "·" }] },
  { stars: [{ col: 3, ch: "*" }, { col: 11, ch: "·" }, { col: 17, ch: "·" }, { col: 25, ch: "*" }] },
  { stars: [{ col: 6, ch: "·" }, { col: 12, ch: "·" }, { col: 15, ch: "·" }, { col: 18, ch: "·" }, { col: 24, ch: "·" }] },
  { stars: [{ col: 2, ch: "·" }, { col: 10, ch: "·" }, { col: 19, ch: "·" }, { col: 27, ch: "·" }], grok: 13 },
  { stars: [{ col: 6, ch: "·" }, { col: 12, ch: "·" }, { col: 15, ch: "·" }, { col: 18, ch: "·" }, { col: 24, ch: "·" }] },
  { stars: [{ col: 3, ch: "·" }, { col: 11, ch: "*" }, { col: 17, ch: "·" }, { col: 25, ch: "·" }] },
  { stars: [{ col: 0, ch: "*" }, { col: 13, ch: "·" }, { col: 21, ch: "*" }, { col: 34, ch: "·" }] },
];

function HeroLogo({ t }: { t: Theme }) {
  const [tick, setTick] = useState(0);
  const starIdx = useRef(0);

  useEffect(() => {
    const id = setInterval(() => setTick(n => n + 1), 900);
    return () => clearInterval(id);
  }, []);

  starIdx.current = 0;
  const nextColor = () => {
    const i = starIdx.current++;
    return STAR_PALETTE[(i * 7 + tick * 3 + i * tick) % STAR_PALETTE.length];
  };

  return (
    <box flexDirection="column" alignItems="center">
      {HERO_ROWS.map((row, r) => {
        const els: React.ReactNode[] = [];
        let cursor = 0;

        for (const star of row.stars) {
          if (row.grok !== undefined && cursor <= row.grok && star.col > row.grok) {
            els.push(" ".repeat(row.grok - cursor));
            els.push(<span key={`g${r}`} style={{ fg: t.primary }}>{"Grok"}</span>);
            cursor = row.grok + 4;
          }
          const gap = star.col - cursor;
          if (gap > 0) els.push(" ".repeat(gap));
          els.push(<span key={`s${r}-${star.col}`} style={{ fg: nextColor() }}>{star.ch}</span>);
          cursor = star.col + 1;
        }

        if (row.grok !== undefined && cursor <= row.grok) {
          els.push(" ".repeat(row.grok - cursor));
          els.push(<span key={`g${r}`} style={{ fg: t.primary }}>{"Grok"}</span>);
          cursor = row.grok + 4;
        }

        els.push(" ".repeat(Math.max(0, 35 - cursor)));
        return <text key={r}>{els}</text>;
      })}
    </box>
  );
}

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
const LINE = {
  topLeft: "━", bottomLeft: "━", vertical: "", topRight: "━",
  bottomRight: "━", horizontal: "━", bottomT: "━", topT: "━",
  cross: "━", leftT: "━", rightT: "━",
};

interface SlashMenuItem {
  id: string;
  label: string;
  description: string;
}

const SLASH_MENU_ITEMS: SlashMenuItem[] = [
  { id: "exit", label: "exit", description: "Quit the CLI" },
  { id: "help", label: "help", description: "Show available commands" },
  { id: "mcps", label: "mcps", description: "Manage MCP servers" },
  { id: "models", label: "models", description: "Select a model" },
  { id: "new", label: "new session", description: "Start a new session" },
  { id: "review", label: "review", description: "Review recent changes" },
  { id: "skills", label: "skills", description: "Manage skills" },
];

interface AppProps { agent: Agent; initialMessage?: string; onExit?: () => void }

export function App({ agent, initialMessage, onExit }: AppProps) {
  const t = dark;
  const [messages, setMessages] = useState<ChatEntry[]>([]);
  const [streamContent, setStreamContent] = useState("");
  const [streamReasoning, setStreamReasoning] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [model, setModel] = useState(agent.getModel());
  const [mode, setModeState] = useState<AgentMode>(agent.getMode());
  const [showModelPicker, setShowModelPicker] = useState(false);
  const [modelPickerIndex, setModelPickerIndex] = useState(0);
  const [modelSearchQuery, setModelSearchQuery] = useState("");
  const [activeToolCalls, setActiveToolCalls] = useState<ToolCall[]>([]);
  const [sessionTitle, setSessionTitle] = useState<string | null>(null);
  const [showSlashMenu, setShowSlashMenu] = useState(false);
  const [slashMenuIndex, setSlashMenuIndex] = useState(0);
  const [slashSearchQuery, setSlashSearchQuery] = useState("");
  const [pasteBlocks, setPasteBlocks] = useState<{ id: number; content: string; lines: number; isImage?: boolean }[]>([]);
  const [activePlan, setActivePlan] = useState<Plan | null>(null);
  const [pqs, setPqs] = useState<PlanQuestionsState>(initialPlanQuestionsState());
  const imageCounterRef = useRef(0);
  const pasteCounterRef = useRef(0);
  const inputRef = useRef<TextareaRenderable>(null);
  const scrollRef = useRef<ScrollBoxRenderable>(null);
  const { width, height } = useTerminalDimensions();
  const processedInitial = useRef(false);
  const contentAccRef = useRef("");
  const startTimeRef = useRef(0);
  const isProcessingRef = useRef(false);

  const setMode = useCallback((m: AgentMode) => { agent.setMode(m); setModeState(m); }, [agent]);
  const cycleMode = useCallback(() => {
    const idx = MODES.findIndex((m) => m.id === mode);
    setMode(MODES[(idx + 1) % MODES.length].id);
  }, [mode, setMode]);

  const modeInfo = MODES.find((m) => m.id === mode)!;
  const modelInfo = getModelInfo(model);
  const flatModels = MODELS.map((m) => m.id);
  const filteredModels = modelSearchQuery
    ? MODELS.filter((m) =>
        m.name.toLowerCase().includes(modelSearchQuery.toLowerCase()) ||
        m.id.toLowerCase().includes(modelSearchQuery.toLowerCase())
      )
    : MODELS;
  const filteredModelIds = filteredModels.map((m) => m.id);
  const filteredSlashItems = slashSearchQuery
    ? SLASH_MENU_ITEMS.filter((item) =>
        item.label.toLowerCase().includes(slashSearchQuery.toLowerCase()) ||
        item.description.toLowerCase().includes(slashSearchQuery.toLowerCase())
      )
    : SLASH_MENU_ITEMS;

  const scrollToBottom = useCallback(() => {
    try { scrollRef.current?.scrollTo(scrollRef.current?.scrollHeight ?? 99999); } catch { /* */ }
  }, []);

  const processMessage = useCallback(async (text: string) => {
    if (!text.trim() || isProcessingRef.current) return;
    isProcessingRef.current = true;
    setIsProcessing(true); setStreamContent(""); setStreamReasoning(""); setActiveToolCalls([]); contentAccRef.current = "";
    startTimeRef.current = Date.now();
    if (!sessionTitle) agent.generateTitle(text.trim()).then(setSessionTitle).catch(() => {});
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
            }
            break;
          case "tool_result":
            if (chunk.toolCall && chunk.toolResult) {
              setMessages((p) => [...p, {
                type: "tool_result",
                content: chunk.toolResult!.success ? (chunk.toolResult!.output || "Success") : (chunk.toolResult!.error || "Error"),
                timestamp: new Date(), toolCall: chunk.toolCall, toolResult: chunk.toolResult,
              }]);
              if (chunk.toolResult.plan?.questions?.length) {
                setActivePlan(chunk.toolResult.plan);
                setPqs(initialPlanQuestionsState());
              }
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
    
    contentAccRef.current = ""; setStreamContent(""); setStreamReasoning(""); setActiveToolCalls([]);
    isProcessingRef.current = false;
    setIsProcessing(false); setTimeout(scrollToBottom, 50);
  }, [agent, scrollToBottom, modeInfo, model]);

  useEffect(() => { if (initialMessage && !processedInitial.current) { processedInitial.current = true; processMessage(initialMessage); } }, [initialMessage, processMessage]);

  const handleCommand = useCallback((cmd: string): boolean => {
    const c = cmd.trim().toLowerCase();
    if (c === "/clear") { agent.clearHistory(); setMessages([]); setStreamContent(""); setSessionTitle(null); setPasteBlocks([]); setActivePlan(null); setPqs(initialPlanQuestionsState()); imageCounterRef.current = 0; return true; }
    if (c === "/model" || c === "/models") { setShowModelPicker(true); setModelPickerIndex(0); setModelSearchQuery(""); return true; }
    if (c === "/quit" || c === "/exit" || c === "/q") { onExit ? onExit() : process.exit(0); }
    return false;
  }, [agent, model, flatModels]);

  const handleSlashMenuSelect = useCallback((item: SlashMenuItem) => {
    setShowSlashMenu(false);
    inputRef.current?.clear();
    switch (item.id) {
      case "new":
        agent.clearHistory(); setMessages([]); setStreamContent(""); setSessionTitle(null); setPasteBlocks([]); setActivePlan(null); setPqs(initialPlanQuestionsState());
        break;
      case "models":
        setShowModelPicker(true); setModelPickerIndex(0); setModelSearchQuery("");
        break;
      case "exit":
        onExit ? onExit() : process.exit(0);
        break;
      case "help":
        setMessages((p) => [...p, { type: "assistant", content: SLASH_MENU_ITEMS.map((i) => `/${i.label} — ${i.description}`).join("\n"), timestamp: new Date() }]);
        break;
      case "skills":
        setMessages((p) => [...p, { type: "assistant", content: "Skills management coming soon.", timestamp: new Date() }]);
        break;
      case "mcps":
        setMessages((p) => [...p, { type: "assistant", content: "MCP server management coming soon.", timestamp: new Date() }]);
        break;
      case "review":
        setMessages((p) => [...p, { type: "assistant", content: "Review feature coming soon.", timestamp: new Date() }]);
        break;
    }
  }, [agent, flatModels, model]);

  const showPlanPanel = !!(activePlan?.questions?.length);
  const planQuestions = activePlan?.questions ?? [];
  const isSinglePlan = planQuestions.length === 1 && planQuestions[0]?.type !== "multiselect";
  const planTabCount = isSinglePlan ? 1 : planQuestions.length + 1;
  const isPlanConfirmTab = !isSinglePlan && pqs.tab === planQuestions.length;

  const dismissPlan = useCallback(() => {
    setActivePlan(null);
    setPqs(initialPlanQuestionsState());
  }, []);

  const submitPlanAnswers = useCallback(() => {
    if (!activePlan?.questions?.length) return;
    const text = formatPlanAnswers(activePlan.questions, pqs.answers);
    setActivePlan(null);
    setPqs(initialPlanQuestionsState());
    processMessage(text);
  }, [activePlan, pqs.answers, processMessage]);

  const handlePlanSelect = useCallback((q: PlanQuestion, idx: number, options: { id: string; label: string }[], showCustom: boolean) => {
    const isCustom = showCustom && idx === options.length;
    if (isCustom) {
      if (q.type === "multiselect") {
        const customVal = pqs.customInputs[q.id] ?? "";
        if (customVal) {
          const existing = (pqs.answers[q.id] as string[] | undefined) ?? [];
          if (existing.includes(customVal)) {
            setPqs((s) => ({ ...s, answers: { ...s.answers, [q.id]: existing.filter((x) => x !== customVal) } }));
          } else {
            setPqs((s) => ({ ...s, editing: true }));
          }
        } else {
          setPqs((s) => ({ ...s, editing: true }));
        }
      } else {
        setPqs((s) => ({ ...s, editing: true }));
      }
      return;
    }
    const opt = options[idx];
    if (!opt) return;

    if (q.type === "multiselect") {
      setPqs((s) => {
        const existing = (s.answers[q.id] as string[] | undefined) ?? [];
        const next = existing.includes(opt.id) ? existing.filter((x) => x !== opt.id) : [...existing, opt.id];
        return { ...s, answers: { ...s.answers, [q.id]: next } };
      });
    } else {
      setPqs((s) => ({ ...s, answers: { ...s.answers, [q.id]: opt.id } }));
      if (isSinglePlan) { submitPlanAnswers(); return; }
      setPqs((s) => ({ ...s, tab: s.tab + 1, selected: 0 }));
    }
  }, [pqs, isSinglePlan, submitPlanAnswers]);

  useKeyboard((key) => {
    if (showPlanPanel) {
      const q = planQuestions[pqs.tab];

      // Escape always dismisses
      if (key.name === "escape") { dismissPlan(); return; }

      // When editing custom text input
      if (pqs.editing && !isPlanConfirmTab) {
        if (key.name === "return") {
          const qId = q?.id;
          if (qId) {
            const text = (pqs.customInputs[qId] ?? "").trim();
            if (text) {
              if (q.type === "multiselect") {
                const existing = (pqs.answers[qId] as string[] | undefined) ?? [];
                const next = existing.includes(text) ? existing : [...existing, text];
                setPqs((s) => ({ ...s, editing: false, answers: { ...s.answers, [qId]: next } }));
              } else if (q.type === "text") {
                setPqs((s) => ({ ...s, editing: false, answers: { ...s.answers, [qId]: text } }));
                if (isSinglePlan) { submitPlanAnswers(); return; }
                setPqs((s) => ({ ...s, tab: s.tab + 1, selected: 0 }));
              } else {
                setPqs((s) => ({ ...s, editing: false, answers: { ...s.answers, [qId]: text } }));
                if (isSinglePlan) { submitPlanAnswers(); return; }
                setPqs((s) => ({ ...s, tab: s.tab + 1, selected: 0 }));
              }
            } else {
              setPqs((s) => ({ ...s, editing: false }));
            }
          }
          return;
        }
        if (key.name === "backspace") {
          const qId = q?.id;
          if (qId) setPqs((s) => ({ ...s, customInputs: { ...s.customInputs, [qId]: (s.customInputs[qId] ?? "").slice(0, -1) } }));
          return;
        }
        if (key.sequence && key.sequence.length === 1 && !key.ctrl && !key.meta) {
          const qId = q?.id;
          if (qId) setPqs((s) => ({ ...s, customInputs: { ...s.customInputs, [qId]: (s.customInputs[qId] ?? "") + key.sequence } }));
          return;
        }
        return;
      }

      // Tab / left / right — switch between question tabs
      if (key.name === "tab") {
        const dir = key.shift ? -1 : 1;
        setPqs((s) => ({ ...s, tab: (s.tab + dir + planTabCount) % planTabCount, selected: 0 }));
        return;
      }
      if (key.name === "left" || key.name === "h") {
        setPqs((s) => ({ ...s, tab: (s.tab - 1 + planTabCount) % planTabCount, selected: 0 }));
        return;
      }
      if (key.name === "right" || key.name === "l") {
        setPqs((s) => ({ ...s, tab: (s.tab + 1) % planTabCount, selected: 0 }));
        return;
      }

      // Confirm tab
      if (isPlanConfirmTab) {
        if (key.name === "return") { submitPlanAnswers(); return; }
        return;
      }

      if (!q) return;

      // Text-only question (no options)
      if (q.type === "text") {
        setPqs((s) => ({ ...s, editing: true }));
        return;
      }

      // Up/down — navigate options
      const options = q.options ?? [];
      const showCustom = true;
      const totalItems = options.length + 1;

      if (key.name === "up" || key.name === "k") {
        setPqs((s) => ({ ...s, selected: (s.selected - 1 + totalItems) % totalItems }));
        return;
      }
      if (key.name === "down" || key.name === "j") {
        setPqs((s) => ({ ...s, selected: (s.selected + 1) % totalItems }));
        return;
      }

      // Number keys 1-9 for quick selection
      const digit = Number(key.name);
      if (!Number.isNaN(digit) && digit >= 1 && digit <= Math.min(totalItems, 9)) {
        const idx = digit - 1;
        setPqs((s) => ({ ...s, selected: idx }));
        handlePlanSelect(q, idx, options, showCustom);
        return;
      }

      // Enter — select current option
      if (key.name === "return") {
        handlePlanSelect(q, pqs.selected, options, showCustom);
        return;
      }

      return;
    }
    if (showSlashMenu) {
      if (key.name === "escape") { setShowSlashMenu(false); setSlashSearchQuery(""); inputRef.current?.clear(); return; }
      if (key.name === "up") { setSlashMenuIndex((i) => Math.max(0, i - 1)); return; }
      if (key.name === "down") { setSlashMenuIndex((i) => Math.min(filteredSlashItems.length - 1, i + 1)); return; }
      if (key.name === "return") {
        const item = filteredSlashItems[slashMenuIndex];
        if (item) handleSlashMenuSelect(item);
        setSlashSearchQuery("");
        return;
      }
      if (key.name === "backspace") {
        setSlashSearchQuery((q) => q.slice(0, -1));
        setSlashMenuIndex(0);
        return;
      }
      if (key.sequence && key.sequence.length === 1 && !key.ctrl && !key.meta) {
        setSlashSearchQuery((q) => q + key.sequence);
        setSlashMenuIndex(0);
        return;
      }
      return;
    }
    if (showModelPicker) {
      if (key.name === "escape") { setShowModelPicker(false); setModelSearchQuery(""); return; }
      if (key.name === "up") { setModelPickerIndex((i) => Math.max(0, i - 1)); return; }
      if (key.name === "down") { setModelPickerIndex((i) => Math.min(filteredModelIds.length - 1, i + 1)); return; }
      if (key.name === "return") {
        const sel = filteredModelIds[modelPickerIndex];
        if (sel) { agent.setModel(sel); setModel(sel); saveProjectSettings({ model: sel }); }
        setShowModelPicker(false); setModelSearchQuery(""); return;
      }
      if (key.name === "backspace") {
        setModelSearchQuery((q) => q.slice(0, -1));
        setModelPickerIndex(0);
        return;
      }
      if (key.sequence && key.sequence.length === 1 && !key.ctrl && !key.meta) {
        setModelSearchQuery((q) => q + key.sequence);
        setModelPickerIndex(0);
        return;
      }
      return;
    }
    if (isProcessing && key.name === "escape") { agent.abort(); return; }
    if (key.sequence === "/" && !isProcessing) {
      const text = inputRef.current?.plainText || "";
      if (!text.trim()) { setShowSlashMenu(true); setSlashMenuIndex(0); setSlashSearchQuery(""); return; }
    }
    if (key.name === "c" && key.ctrl) {
      const text = inputRef.current?.plainText || "";
      if (text.trim()) { inputRef.current?.clear(); setPasteBlocks([]); } else { onExit ? onExit() : process.exit(0); }
      return;
    }
    if (key.name === "tab" && !isProcessing) { cycleMode(); return; }
  });

  const handlePaste = useCallback((event: PasteEvent) => {
    const text = decodePasteBytes(event.bytes);
    const trimmed = text.trim();
    const imageExts = /\.(png|jpe?g|gif|webp|svg|bmp|ico|tiff?)$/i;
    if (imageExts.test(trimmed) && !trimmed.includes("\n")) {
      event.preventDefault();
      const id = ++pasteCounterRef.current;
      const imgNum = ++imageCounterRef.current;
      setPasteBlocks((prev) => [...prev, { id, content: trimmed, lines: 1, isImage: true }]);
      inputRef.current?.insertText(`[Image ${imgNum}]`);
      return;
    }
    const lineCount = text.split("\n").length;
    if (lineCount < 2) return;
    event.preventDefault();
    const id = ++pasteCounterRef.current;
    setPasteBlocks((prev) => [...prev, { id, content: text, lines: lineCount }]);
    inputRef.current?.insertText(`[Pasted ~${lineCount} lines]`);
  }, []);

  const handleSubmit = useCallback(() => {
    const raw = inputRef.current?.plainText || "";
    if (!raw.trim() && pasteBlocks.length === 0) return;
    inputRef.current?.clear();
    let message = raw;
    const blocks = [...pasteBlocks];
    let imgIdx = 0;
    setPasteBlocks([]);
    for (const block of blocks) {
      if (block.isImage) {
        imgIdx++;
        message = message.replace(`[Image ${imgIdx}]`, block.content);
      } else {
        message = message.replace(`[Pasted ~${block.lines} lines]`, block.content);
      }
    }
    if (!message.trim()) return;
    if (handleCommand(message)) return;
    processMessage(message);
  }, [handleCommand, processMessage, pasteBlocks]);

  const hasMessages = messages.length > 0 || streamContent || isProcessing;

  return (
    <box width={width} height={height} backgroundColor={t.background} flexDirection="column">
      {hasMessages ? (
        <box flexGrow={1} paddingBottom={1} paddingTop={1} paddingLeft={2} paddingRight={2} gap={1}>
          {/* Session header — ┃ left-border panel like OpenCode's Header */}
          <SessionHeader t={t} modeInfo={modeInfo} sessionTitle={sessionTitle} />
          {/* Scrollable messages */}
          <scrollbox ref={scrollRef} flexGrow={1} stickyScroll={true} stickyStart={"bottom" as any}>
            {messages.map((msg, i) => (
              <MessageView key={i} entry={msg} index={i} t={t} modeColor={modeInfo.color} />
            ))}
            {/* Active tool calls — pending inline */}
            {activeToolCalls.map((tc, i) => (
              <InlineTool key={i} t={t} pending>{toolLabel(tc)}</InlineTool>
            ))}
            {/* Streaming assistant content */}
            {streamContent && (
              <box paddingLeft={3} marginTop={1} flexShrink={0}>
                <Markdown content={streamContent} t={t} />
              </box>
            )}
            {/* Waiting indicator */}
            {isProcessing && !streamContent && activeToolCalls.length === 0 && (
              <ShimmerText t={t} text="Planning next moves" />
            )}
            {/* Plan questions panel — inline, OpenCode-style */}
            {showPlanPanel && (
              <PlanQuestionsPanel
                t={t}
                questions={planQuestions}
                state={pqs}
              />
            )}
          </scrollbox>
          {/* Prompt */}
          <box flexShrink={0}>
            <PromptBox t={t} inputRef={inputRef} isProcessing={isProcessing} showModelPicker={showModelPicker} showSlashMenu={showSlashMenu} showPlanQuestions={showPlanPanel}
              onSubmit={handleSubmit} onPaste={handlePaste} pasteBlocks={pasteBlocks}
              modeInfo={modeInfo} model={model} modelInfo={modelInfo} />
          </box>
        </box>
      ) : (
        /* ── Home ───────────────────────────────────────── */
        <>
          <box flexGrow={1} alignItems="center" paddingLeft={2} paddingRight={2}>
            <box flexGrow={1} minHeight={0} />
            <box flexShrink={0} alignItems="center">
              <HeroLogo t={t} />
            </box>
            <box height={1} minHeight={0} flexShrink={1} />
            <box width="100%" maxWidth={75} flexShrink={0}>
              <PromptBox t={t} inputRef={inputRef} isProcessing={isProcessing} showModelPicker={showModelPicker} showSlashMenu={showSlashMenu} showPlanQuestions={showPlanPanel}
                onSubmit={handleSubmit} onPaste={handlePaste} pasteBlocks={pasteBlocks}
                modeInfo={modeInfo} model={model} modelInfo={modelInfo}
                placeholder={"What are we building?"} />
            </box>
            <box height={2} minHeight={0} flexShrink={1} />
            <box flexGrow={1} minHeight={0} />
          </box>
          <box paddingLeft={2} paddingRight={2} paddingBottom={1} flexDirection="row" flexShrink={0}>
            <text fg={t.textDim}>{agent.getCwd().replace(os.homedir(), "~")}</text>
            <box flexGrow={1} />
            <text fg={t.textDim}>{"v1.0.0"}</text>
          </box>
        </>
      )}
      {showSlashMenu && <SlashMenuModal t={t} selectedIndex={slashMenuIndex} width={width} height={height} searchQuery={slashSearchQuery} filteredItems={filteredSlashItems} />}
      {showModelPicker && <ModelPickerModal t={t} currentModel={model} selectedIndex={modelPickerIndex} width={width} height={height} searchQuery={modelSearchQuery} filteredModels={filteredModels} />}
    </box>
  );
}

/* ── Session Header ──────────────────────────────────────────── */

function SessionHeader({ t, modeInfo, sessionTitle }: {
  t: Theme; modeInfo: typeof MODES[number]; sessionTitle: string | null;
}) {
  return (
    <box flexShrink={0}>
      <box
        paddingTop={1} paddingBottom={1} paddingLeft={2} paddingRight={1}
        border={["left"]} customBorderChars={SPLIT} borderColor={t.border}
        backgroundColor={t.backgroundPanel}
      >
        <text>
          <span style={{ fg: modeInfo.color }}><b>{modeInfo.label}</b></span>
          {sessionTitle ? <span style={{ fg: t.text }}><b>{": "}{sessionTitle}</b></span> : null}
        </text>
      </box>
    </box>
  );
}

/* ── Prompt Box ──────────────────────────────────────────────── */

const TEXTAREA_KEYBINDINGS: KeyBinding[] = [
  { name: "return", action: "submit" },
  { name: "return", shift: true, action: "newline" },
];

function PromptBox({ t, inputRef, isProcessing, showModelPicker, showSlashMenu, showPlanQuestions, onSubmit, onPaste, pasteBlocks, modeInfo, model, modelInfo, placeholder }: {
  t: Theme; inputRef: React.RefObject<TextareaRenderable | null>;
  isProcessing: boolean; showModelPicker: boolean; showSlashMenu: boolean; showPlanQuestions: boolean; onSubmit: () => void;
  onPaste: (event: PasteEvent) => void; pasteBlocks: { id: number; content: string; lines: number }[];
  modeInfo: typeof MODES[number]; model: string;
  modelInfo: ReturnType<typeof getModelInfo>; placeholder?: string;
}) {
  return (
    <box backgroundColor={t.backgroundPanel}>
      <box>
        <box paddingLeft={2} paddingRight={2} paddingTop={1} paddingBottom={1} backgroundColor={t.backgroundElement} flexShrink={0}>
          <textarea
            ref={inputRef} focused={!isProcessing && !showModelPicker && !showSlashMenu && !showPlanQuestions}
            placeholder={isProcessing ? "Working... (esc to stop)" : (placeholder || "Message Grok...")}
            textColor={t.text} backgroundColor={t.backgroundElement} placeholderColor={t.textMuted}
            minHeight={1} maxHeight={10} wrapMode="word"
            keyBindings={TEXTAREA_KEYBINDINGS}
            onSubmit={onSubmit as any}
            onPaste={onPaste as any}
          />
        </box>
      </box>
      <box flexDirection="row" justifyContent="space-between" alignItems="center" backgroundColor={t.backgroundPanel} paddingLeft={2} paddingRight={2} paddingTop={1} paddingBottom={1}>
        <box flexDirection="row" gap={2} alignItems="center">
          <text fg={modeInfo.color}><b>{modeInfo.label}</b>{" "}</text>
          <text fg={t.text}>{modelInfo?.name || model}</text>
        </box>
        <box flexDirection="row" gap={3} alignItems="center">
          {isProcessing ? (
            <text fg={t.text}>{"esc "}<span style={{ fg: t.textMuted }}>{"interrupt"}</span></text>
          ) : (
            <>
              <text fg={t.text}>{"shift+enter "}<span style={{ fg: t.textMuted }}>{"new line"}</span></text>
              <text fg={t.text}>{"tab "}<span style={{ fg: t.textMuted }}>{"modes"}</span></text>
            </>
          )}
        </box>
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
          marginTop={index === 0 ? 0 : 1} marginBottom={1}
        >
          <box paddingTop={1} paddingBottom={1} paddingLeft={2} backgroundColor={t.backgroundPanel} flexShrink={0}>
            <text fg={t.text}>{entry.content}</text>
          </box>
        </box>
      );

    case "assistant":
      return (
        <box paddingLeft={3} marginTop={1} flexShrink={0}>
          <Markdown content={entry.content} t={t} />
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
      const args = toolArgs(entry.toolCall);
      const diff = entry.toolResult?.diff;
      const plan = entry.toolResult?.plan;

      if (name === "generate_plan" && plan) {
        return <PlanView plan={plan} t={t} />;
      }

      if ((name === "write_file" || name === "edit_file") && diff) {
        const label = name === "write_file"
          ? `Write ${diff.filePath}`
          : `Edit ${diff.filePath}`;
        return (
          <box gap={0}>
            <InlineTool t={t} pending={false}>{label}</InlineTool>
            <DiffView t={t} diff={diff} />
          </box>
        );
      }

      if (name === "read_file") return <InlineTool t={t} pending={false}>{`Read ${tryParseArg(entry.toolCall, "path") || args}`}</InlineTool>;
      if (name === "search_web" || name === "search_x") return <InlineTool t={t} pending={false}>{name === "search_web" ? "Web" : "X"}{` Search "${args}"`}</InlineTool>;

      return <InlineTool t={t} pending={false}>{name === "bash" ? args : `${name} ${args}`}</InlineTool>;
    }

    default:
      return <text fg={t.textMuted}>{entry.content}</text>;
  }
}

/* ── Diff View ────────────────────────────────────────────────── */

type DiffRow =
  | { kind: "context"; oldNum: number; newNum: number; text: string }
  | { kind: "added"; newNum: number; text: string }
  | { kind: "removed"; oldNum: number; text: string }
  | { kind: "separator"; count: number };

const MAX_DIFF_ROWS = 20;
const LINE_NUM_WIDTH = 4;

function parsePatch(patch: string): DiffRow[] {
  const lines = patch.split("\n");
  const rows: DiffRow[] = [];
  let oldLine = 0;
  let newLine = 0;
  let prevOldEnd = 0;

  for (const line of lines) {
    const hunkMatch = line.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunkMatch) {
      oldLine = parseInt(hunkMatch[1], 10);
      newLine = parseInt(hunkMatch[2], 10);
      const skipped = oldLine - prevOldEnd - 1;
      if (skipped > 0) {
        rows.push({ kind: "separator", count: skipped });
      }
      continue;
    }

    if (line.startsWith("---") || line.startsWith("+++") || line.startsWith("\\")) continue;
    if (line.startsWith("Index:") || line.startsWith("====")) continue;

    if (line.startsWith("-")) {
      rows.push({ kind: "removed", oldNum: oldLine, text: line.slice(1) });
      oldLine++;
      prevOldEnd = oldLine - 1;
    } else if (line.startsWith("+")) {
      rows.push({ kind: "added", newNum: newLine, text: line.slice(1) });
      newLine++;
    } else if (line.length > 0 || (oldLine > 0 && newLine > 0)) {
      const content = line.startsWith(" ") ? line.slice(1) : line;
      rows.push({ kind: "context", oldNum: oldLine, newNum: newLine, text: content });
      oldLine++;
      newLine++;
      prevOldEnd = oldLine - 1;
    }
  }

  return rows;
}

function DiffView({ t, diff }: { t: Theme; diff: FileDiff }) {
  const rows = parsePatch(diff.patch);
  if (rows.length === 0) return null;

  const truncated = rows.length > MAX_DIFF_ROWS;
  const visible = truncated ? rows.slice(0, MAX_DIFF_ROWS) : rows;

  const pad = (n: number | undefined) =>
    n !== undefined ? String(n).padStart(LINE_NUM_WIDTH) : " ".repeat(LINE_NUM_WIDTH);

  return (
    <box paddingLeft={5} marginTop={0} flexShrink={0}>
      <box flexDirection="column">
        {/* Header */}
        <box backgroundColor={t.diffHeader} paddingLeft={1} paddingRight={1}>
          <text>
            <span style={{ fg: t.diffHeaderFg }}>{diff.filePath}</span>
            <span style={{ fg: t.textDim }}>{"  "}</span>
            <span style={{ fg: t.diffRemovedFg }}>{`-${diff.removals}`}</span>
            <span style={{ fg: t.textDim }}>{" "}</span>
            <span style={{ fg: t.diffAddedFg }}>{`+${diff.additions}`}</span>
          </text>
        </box>

        {/* Rows */}
        {visible.map((row, i) => {
          if (row.kind === "separator") {
            return (
              <box key={i} backgroundColor={t.diffSeparator} paddingLeft={1}>
                <text fg={t.diffSeparatorFg}>{"⌃  "}{row.count}{" unmodified lines"}</text>
              </box>
            );
          }
          if (row.kind === "removed") {
            return (
              <box key={i} backgroundColor={t.diffRemoved} flexDirection="row">
                <text fg={t.diffRemovedLineNum}>{pad(row.oldNum)}</text>
                <text fg={t.diffRemovedFg}>{" " + row.text}</text>
              </box>
            );
          }
          if (row.kind === "added") {
            return (
              <box key={i} backgroundColor={t.diffAdded} flexDirection="row">
                <text fg={t.diffAddedLineNum}>{pad(row.newNum)}</text>
                <text fg={t.diffAddedFg}>{" " + row.text}</text>
              </box>
            );
          }
          return (
            <box key={i} backgroundColor={t.diffContext} flexDirection="row">
              <text fg={t.diffLineNumber}>{pad(row.oldNum)}</text>
              <text fg={t.diffContextFg}>{" " + row.text}</text>
            </box>
          );
        })}

        {truncated && (
          <box backgroundColor={t.diffSeparator} paddingLeft={1}>
            <text fg={t.diffSeparatorFg}>{"⌃  "}{rows.length - MAX_DIFF_ROWS}{" more lines"}</text>
          </box>
        )}
      </box>
    </box>
  );
}

function ShimmerText({ t, text }: { t: Theme; text: string }) {
  const [pos, setPos] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setPos(p => (p + 1) % (text.length + 4)), 60);
    return () => clearInterval(id);
  }, [text]);

  const dim = "#333333";
  const mid = "#555555";
  const bright = "#888888";

  return (
    <box paddingLeft={3}>
      <text>
        <span style={{ fg: "#555555" }}>{"◇ "}</span>
        {text.split("").map((ch, i) => {
          const dist = Math.abs(i - pos);
          const fg = dist === 0 ? bright : dist === 1 ? mid : dim;
          return <span key={i} style={{ fg }}>{ch}</span>;
        })}
      </text>
    </box>
  );
}

function InlineTool({ t, pending, children }: { t: Theme; pending: boolean; children: React.ReactNode }) {
  return (
    <box paddingLeft={3}>
      <text fg={t.textMuted}>
        {"→ "}{children}
      </text>
    </box>
  );
}

/* ── Slash Menu ──────────────────────────────────────────────── */

function SlashMenuModal({ t, selectedIndex, width, height, searchQuery, filteredItems }: {
  t: Theme; selectedIndex: number; width: number; height: number;
  searchQuery: string; filteredItems: SlashMenuItem[];
}) {
  const listRef = useRef<ScrollBoxRenderable>(null);
  useEffect(() => {
    const item = filteredItems[selectedIndex];
    if (item) listRef.current?.scrollChildIntoView(`slash-${item.id}`);
  }, [selectedIndex, filteredItems]);

  const itemCount = Math.max(filteredItems.length, 1);
  const contentHeight = itemCount + 5;
  const maxH = Math.floor(height * 0.6);
  const panelHeight = Math.min(contentHeight, maxH);
  const top = Math.max(2, Math.floor((height - panelHeight) / 2));
  return (
    <box position="absolute" left={0} top={0} width={width} height={height}
      alignItems="center" paddingTop={top}
      backgroundColor={"#000000cc" as any}>
      <box width={Math.min(50, width - 6)} height={panelHeight} backgroundColor={t.backgroundPanel}
        paddingTop={1} paddingBottom={1}>
        <box flexShrink={0} flexDirection="row" justifyContent="space-between" paddingLeft={2} paddingRight={2}>
          <text fg={t.primary}><b>{"Commands"}</b></text>
          <text fg={t.textMuted}>{"esc"}</text>
        </box>
        <box flexShrink={0} paddingLeft={2} paddingRight={2} paddingTop={1} paddingBottom={1}>
          <text fg={t.text}>{searchQuery || <span style={{ fg: t.textMuted }}>{"Search..."}</span>}</text>
        </box>
        <scrollbox ref={listRef} flexGrow={1}>
          {filteredItems.map((item, idx) => (
            <box key={item.id} id={`slash-${item.id}`} backgroundColor={idx === selectedIndex ? t.selectedBg : undefined} paddingLeft={2} paddingRight={2}>
              <box flexDirection="row" justifyContent="space-between">
                <text fg={idx === selectedIndex ? t.selected : t.text}>{"/"}{item.label}</text>
                <text fg={t.textMuted}>{item.description}</text>
              </box>
            </box>
          ))}
          {filteredItems.length === 0 && (
            <box paddingLeft={2}><text fg={t.textMuted}>{"No commands match your search"}</text></box>
          )}
        </scrollbox>
      </box>
    </box>
  );
}

/* ── Model Picker ────────────────────────────────────────────── */

function ModelPickerModal({ t, currentModel, selectedIndex, width, height, searchQuery, filteredModels }: {
  t: Theme; currentModel: string; selectedIndex: number; width: number; height: number;
  searchQuery: string; filteredModels: ModelInfo[];
}) {
  const listRef = useRef<ScrollBoxRenderable>(null);
  useEffect(() => {
    const m = filteredModels[selectedIndex];
    if (m) listRef.current?.scrollChildIntoView(`model-${m.id}`);
  }, [selectedIndex, filteredModels]);

  const itemCount = Math.max(filteredModels.length, 1);
  const contentHeight = itemCount + 5;
  const maxH = Math.floor(height * 0.6);
  const panelHeight = Math.min(contentHeight, maxH);
  const top = Math.max(2, Math.floor((height - panelHeight) / 2));
  return (
    <box position="absolute" left={0} top={0} width={width} height={height}
      alignItems="center" paddingTop={top}
      backgroundColor={"#000000cc" as any}>
      <box width={Math.min(60, width - 6)} height={panelHeight} backgroundColor={t.backgroundPanel}
        paddingTop={1} paddingBottom={1}>
        <box flexShrink={0} flexDirection="row" justifyContent="space-between" paddingLeft={2} paddingRight={2}>
          <text fg={t.primary}><b>{"Select model"}</b></text>
          <text fg={t.textMuted}>{"esc"}</text>
        </box>
        <box flexShrink={0} paddingLeft={2} paddingRight={2} paddingTop={1} paddingBottom={1}>
          <text fg={t.text}>{searchQuery || <span style={{ fg: t.textMuted }}>{"Search..."}</span>}</text>
        </box>
        <scrollbox ref={listRef} flexGrow={1}>
          {filteredModels.map((m, idx) => {
            const selected = idx === selectedIndex;
            const current = m.id === currentModel;
            return (
              <box key={m.id} id={`model-${m.id}`} backgroundColor={selected ? t.selectedBg : undefined} paddingLeft={2} paddingRight={2}>
                <text fg={current ? t.accent : selected ? t.selected : t.text}>
                  {m.name}
                </text>
              </box>
            );
          })}
          {filteredModels.length === 0 && (
            <box paddingLeft={2}><text fg={t.textMuted}>{"No models match your search"}</text></box>
          )}
        </scrollbox>
      </box>
    </box>
  );
}

/* ── Helpers ──────────────────────────────────────────────────── */

function toolArgs(tc?: ToolCall): string {
  if (!tc) return "";
  try {
    const a = JSON.parse(tc.function.arguments);
    if (tc.function.name === "bash") return a.command || "";
    if (tc.function.name === "read_file" || tc.function.name === "write_file" || tc.function.name === "edit_file") return a.path || "";
    return a.query || "";
  } catch { return ""; }
}
function tryParseArg(tc: ToolCall | undefined, key: string): string {
  if (!tc) return "";
  try { return JSON.parse(tc.function.arguments)[key] || ""; } catch { return ""; }
}
function toolLabel(tc: ToolCall): string {
  const args = toolArgs(tc);
  if (tc.function.name === "bash") return args || "Running command...";
  if (tc.function.name === "read_file") return `Read ${args}`;
  if (tc.function.name === "write_file") return `Write ${args}`;
  if (tc.function.name === "edit_file") return `Edit ${args}`;
  if (tc.function.name === "search_web") return `Web Search "${args}"`;
  if (tc.function.name === "search_x") return `X Search "${args}"`;
  if (tc.function.name === "generate_plan") return "Generating plan...";
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
