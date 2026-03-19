import os from "os";
import { useState, useEffect, useCallback, useRef } from "react";
import { useKeyboard, useTerminalDimensions } from "@opentui/react";
import type { ScrollBoxRenderable, TextareaRenderable, KeyBinding } from "@opentui/core";
import { decodePasteBytes, type PasteEvent } from "@opentui/core";
import type { Agent } from "../agent/agent";
import type {
  ChatEntry,
  ToolCall,
  AgentMode,
  ModelInfo,
  FileDiff,
  Plan,
  PlanQuestion,
  SubagentStatus,
} from "../types/index";
import { MODES } from "../types/index";
import { getModelInfo, MODELS } from "../grok/models";
import { saveProjectSettings, saveUserSettings } from "../utils/settings";
import { dark, type Theme } from "./theme";
import { Markdown } from "./markdown";
import { PlanView, PlanQuestionsPanel, formatPlanAnswers, initialPlanQuestionsState, type PlanQuestionsState } from "./plan";

const STAR_PALETTE = ["#777777", "#666666", "#4a4a4a", "#333333", "#222222"];
const LOADING_SPINNER_FRAMES = ["⬒", "⬔", "⬓", "⬕"];

type Star = { col: number; ch: string };
type Row = { stars: Star[]; grok?: number };
type ContextStats = {
  contextWindow: number;
  usedTokens: number;
  remainingTokens: number;
  ratioUsed: number;
  ratioRemaining: number;
};

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
            els.push(<span key="grok" style={{ fg: t.primary }}>{"Grok"}</span>);
            cursor = row.grok + 4;
          }
          const gap = star.col - cursor;
          if (gap > 0) els.push(" ".repeat(gap));
          els.push(<span key={`s-${star.col}`} style={{ fg: nextColor() }}>{star.ch}</span>);
          cursor = star.col + 1;
        }

        if (row.grok !== undefined && cursor <= row.grok) {
          els.push(" ".repeat(row.grok - cursor));
          els.push(<span key="grok" style={{ fg: t.primary }}>{"Grok"}</span>);
          cursor = row.grok + 4;
        }

        els.push(" ".repeat(Math.max(0, 35 - cursor)));
        // biome-ignore lint/suspicious/noArrayIndexKey: static constant array that never reorders
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
const _SPLIT_END = { ...SPLIT, bottomLeft: "╹" };
const _EMPTY = {
  topLeft: "", bottomLeft: "", vertical: "", topRight: "",
  bottomRight: "", horizontal: " ", bottomT: "", topT: "",
  cross: "", leftT: "", rightT: "",
};
const _LINE = {
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
  const initialHasApiKey = agent.hasApiKey();
  const [hasApiKey, setHasApiKey] = useState(initialHasApiKey);
  const [messages, setMessages] = useState<ChatEntry[]>(() => agent.getChatEntries());
  const [streamContent, setStreamContent] = useState("");
  const [_streamReasoning, setStreamReasoning] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [model, setModel] = useState(agent.getModel());
  const [mode, setModeState] = useState<AgentMode>(agent.getMode());
  const [showModelPicker, setShowModelPicker] = useState(false);
  const [modelPickerIndex, setModelPickerIndex] = useState(0);
  const [modelSearchQuery, setModelSearchQuery] = useState("");
  const [activeToolCalls, setActiveToolCalls] = useState<ToolCall[]>([]);
  const [sessionTitle, setSessionTitle] = useState<string | null>(() => agent.getSessionTitle());
  const [sessionId, setSessionId] = useState<string | null>(() => agent.getSessionId());
  const [showApiKeyModal, setShowApiKeyModal] = useState(() => !initialHasApiKey);
  const [apiKeyError, setApiKeyError] = useState<string | null>(null);
  const [showSlashMenu, setShowSlashMenu] = useState(false);
  const [slashMenuIndex, setSlashMenuIndex] = useState(0);
  const [slashSearchQuery, setSlashSearchQuery] = useState("");
  const [pasteBlocks, setPasteBlocks] = useState<{ id: number; content: string; lines: number; isImage?: boolean }[]>([]);
  const [activePlan, setActivePlan] = useState<Plan | null>(null);
  const [activeSubagent, setActiveSubagent] = useState<SubagentStatus | null>(null);
  const [pqs, setPqs] = useState<PlanQuestionsState>(initialPlanQuestionsState());
  const imageCounterRef = useRef(0);
  const pasteCounterRef = useRef(0);
  const apiKeyInputRef = useRef<TextareaRenderable>(null);
  const inputRef = useRef<TextareaRenderable>(null);
  const scrollRef = useRef<ScrollBoxRenderable>(null);
  const { width, height } = useTerminalDimensions();
  const processedInitial = useRef(false);
  const contentAccRef = useRef("");
  const startTimeRef = useRef(0);
  const isProcessingRef = useRef(false);
  const hasApiKeyRef = useRef(initialHasApiKey);
  const showApiKeyModalRef = useRef(!initialHasApiKey);
  const queuedMessagesRef = useRef<string[]>([]);
  const [queuedMessages, setQueuedMessages] = useState<string[]>([]);
  const modeInfoRef = useRef<typeof MODES[number]>(MODES[0]);
  const activeRunIdRef = useRef(0);
  const interruptedRunIdRef = useRef<number | null>(null);

  const setMode = useCallback((m: AgentMode) => {
    if (m === "agent" && mode === "plan" && activePlan) {
      const planText = [`# ${activePlan.title}`, activePlan.summary, "",
        ...activePlan.steps.map((s, i) => `${i + 1}. ${s.title}: ${s.description}${s.filePaths?.length ? ` (${s.filePaths.join(", ")})` : ""}`),
      ].join("\n");
      agent.setPlanContext(planText);
    }
    agent.setMode(m);
    setModeState(m);
  }, [agent, mode, activePlan]);
  const cycleMode = useCallback(() => {
    const idx = MODES.findIndex((m) => m.id === mode);
    setMode(MODES[(idx + 1) % MODES.length].id);
  }, [mode, setMode]);

  const modeInfo = MODES.find((m) => m.id === mode)!;
  modeInfoRef.current = modeInfo;
  const modelInfo = getModelInfo(model);
  const contextStats = modelInfo ? agent.getContextStats(modelInfo.contextWindow, streamContent) : null;
  const _flatModels = MODELS.map((m) => m.id);
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

  const openApiKeyModal = useCallback(() => {
    showApiKeyModalRef.current = true;
    setApiKeyError(null);
    setShowApiKeyModal(true);
  }, []);

  const closeApiKeyModal = useCallback(() => {
    showApiKeyModalRef.current = false;
    setApiKeyError(null);
    setShowApiKeyModal(false);
  }, []);

  const submitApiKey = useCallback(() => {
    const apiKey = (apiKeyInputRef.current?.plainText || "").trim();
    if (!apiKey) {
      setApiKeyError("Enter an API key to continue.");
      return;
    }
    if (!apiKey.startsWith("xai-")) {
      setApiKeyError("API keys should start with xai-.");
      return;
    }

    saveUserSettings({ apiKey });
    agent.setApiKey(apiKey);
    hasApiKeyRef.current = true;
    showApiKeyModalRef.current = false;
    setHasApiKey(true);
    setApiKeyError(null);
    setShowApiKeyModal(false);
    apiKeyInputRef.current?.clear();
  }, [agent]);

  useEffect(() => {
    hasApiKeyRef.current = hasApiKey;
  }, [hasApiKey]);

  useEffect(() => {
    showApiKeyModalRef.current = showApiKeyModal;
  }, [showApiKeyModal]);

  const invalidateActiveRun = useCallback(() => {
    activeRunIdRef.current += 1;
    setActiveToolCalls([]);
    setActiveSubagent(null);
    setStreamContent("");
    setStreamReasoning("");
  }, []);

  const resetToNewSession = useCallback(() => {
    const snapshot = agent.startNewSession();
    setMessages(snapshot?.entries ?? []);
    setStreamContent("");
    setStreamReasoning("");
    setSessionTitle(snapshot?.session.title ?? null);
    setSessionId(snapshot?.session.id ?? agent.getSessionId());
    setActiveToolCalls([]);
    setActiveSubagent(null);
    setActivePlan(null);
    setPqs(initialPlanQuestionsState());
    setPasteBlocks([]);
    queuedMessagesRef.current = [];
    setQueuedMessages([]);
    imageCounterRef.current = 0;
  }, [agent]);

  const processMessage = useCallback(async (text: string) => {
    if (!text.trim() || isProcessingRef.current) return;
    const runId = ++activeRunIdRef.current;
    const isStale = () => activeRunIdRef.current !== runId;
    isProcessingRef.current = true;
    setIsProcessing(true); setStreamContent(""); setStreamReasoning(""); setActiveToolCalls([]); setActiveSubagent(null); contentAccRef.current = "";
    startTimeRef.current = Date.now();
    if (!sessionTitle) agent.generateTitle(text.trim()).then(setSessionTitle).catch(() => {});
    const color = modeInfoRef.current.color;
    setMessages((prev) => [...prev, { type: "user", content: text.trim(), timestamp: new Date(), modeColor: color }]);
    setTimeout(scrollToBottom, 50);
    try {
      for await (const chunk of agent.processMessage(text.trim())) {
        if (isStale()) {
          break;
        }

        switch (chunk.type) {
          case "content":
            contentAccRef.current += chunk.content || "";
            setStreamContent(sanitizeContent(contentAccRef.current));
            setTimeout(scrollToBottom, 10);
            break;
          case "reasoning":
            setStreamReasoning((p) => p + (chunk.content || ""));
            break;
          case "tool_calls":
            if (chunk.toolCalls) {
              const cleaned = sanitizeContent(contentAccRef.current);
              if (cleaned) {
                setMessages((p) => [...p, { type: "assistant", content: cleaned, timestamp: new Date(), modeColor: modeInfoRef.current.color }]);
              }
              contentAccRef.current = ""; setStreamContent("");
              setActiveToolCalls(chunk.toolCalls);
            }
            break;
          case "tool_result":
            if (chunk.toolCall && chunk.toolResult) {
              setMessages((p) => [...p, {
                type: "tool_result",
                content: chunk.toolResult!.success ? (chunk.toolResult!.output || "Success") : (chunk.toolResult!.error || "Error"),
                timestamp: new Date(), modeColor: modeInfoRef.current.color, toolCall: chunk.toolCall, toolResult: chunk.toolResult,
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
    } catch {
      if (!isStale()) {
        contentAccRef.current += "\nAn unexpected error occurred.";
        setStreamContent(contentAccRef.current);
      }
    }
    const wasInterrupted = interruptedRunIdRef.current === runId;
    const finalContent = sanitizeContent(contentAccRef.current);
    if (isStale()) {
      contentAccRef.current = "";
      return;
    }

    if (!wasInterrupted && finalContent) {
      setMessages((p) => [...p, { type: "assistant", content: finalContent, timestamp: new Date(), modeColor: modeInfoRef.current.color }]);
    }
    
    contentAccRef.current = "";
    if (!isStale()) {
      setStreamContent("");
      setStreamReasoning("");
      setActiveToolCalls([]);
      setActiveSubagent(null);
    }
    if (wasInterrupted) {
      interruptedRunIdRef.current = null;
    }
    const nextQueued = queuedMessagesRef.current.shift();
    if (nextQueued) {
      setQueuedMessages([...queuedMessagesRef.current]);
      isProcessingRef.current = false;
      processMessage(nextQueued);
    } else {
      isProcessingRef.current = false;
      if (!isStale()) {
        setIsProcessing(false);
      }
    }
    setTimeout(scrollToBottom, 50);
  }, [agent, scrollToBottom, sessionTitle]);

  useEffect(() => {
    if (initialMessage && hasApiKey && !processedInitial.current) {
      processedInitial.current = true;
      processMessage(initialMessage);
    }
  }, [hasApiKey, initialMessage, processMessage]);
  useEffect(() => agent.onSubagentStatus(setActiveSubagent), [agent]);
  useEffect(() => {
    let active = true;
    const id = setInterval(() => {
      agent
        .consumeBackgroundNotifications()
        .then((notifications) => {
          if (!active || notifications.length === 0) return;
          setMessages((prev) => [
            ...prev,
            ...notifications.map((message) => ({
              type: "assistant" as const,
              content: message,
              timestamp: new Date(),
            })),
          ]);
          setTimeout(scrollToBottom, 10);
        })
        .catch(() => {});
    }, 2000);

    return () => {
      active = false;
      clearInterval(id);
    };
  }, [agent, scrollToBottom]);

  const handleCommand = useCallback((cmd: string): boolean => {
    const c = cmd.trim().toLowerCase();
    if (c === "/clear") { resetToNewSession(); return true; }
    if (c === "/model" || c === "/models") { setShowModelPicker(true); setModelPickerIndex(0); setModelSearchQuery(""); return true; }
    if (c === "/quit" || c === "/exit" || c === "/q") { onExit ? onExit() : process.exit(0); }
    return false;
  }, [onExit, resetToNewSession]);

  const handleSlashMenuSelect = useCallback((item: SlashMenuItem) => {
    setShowSlashMenu(false);
    inputRef.current?.clear();
    switch (item.id) {
      case "new":
        resetToNewSession();
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
  }, [onExit, resetToNewSession]);

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

  const handleKey = useCallback((key: { name?: string; sequence?: string; ctrl?: boolean; meta?: boolean; shift?: boolean }) => {
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
    if (showApiKeyModalRef.current) {
      if (key.name === "escape") {
        closeApiKeyModal();
        return;
      }
      if (key.name === "return") {
        submitApiKey();
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
        if (sel) { agent.setModel(sel); setModel(sel); saveProjectSettings({ model: sel }); saveUserSettings({ defaultModel: sel }); }
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
    if (!hasApiKeyRef.current && shouldOpenApiKeyModalForKey(key)) {
      openApiKeyModal();
      return;
    }
    if (isProcessing && key.name === "escape") {
      invalidateActiveRun();
      if (queuedMessagesRef.current.length > 0) {
        queuedMessagesRef.current = [];
        setQueuedMessages([]);
      } else {
        agent.abort();
      }
      return;
    }
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
  }, [
    agent,
    closeApiKeyModal,
    cycleMode,
    dismissPlan,
    filteredModelIds,
    filteredSlashItems,
    handlePlanSelect,
    handleSlashMenuSelect,
    hasApiKey,
    invalidateActiveRun,
    isPlanConfirmTab,
    isProcessing,
    openApiKeyModal,
    planQuestions,
    planTabCount,
    pqs,
    showApiKeyModal,
    showModelPicker,
    showPlanPanel,
    showSlashMenu,
    submitApiKey,
    submitPlanAnswers,
  ]);
  useKeyboard(handleKey);

  const handlePaste = useCallback((event: PasteEvent) => {
    if (!hasApiKeyRef.current) {
      event.preventDefault();
      openApiKeyModal();
      return;
    }

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
  }, [openApiKeyModal]);

  const handleSubmit = useCallback(() => {
    const raw = inputRef.current?.plainText || "";
    if (!raw.trim() && pasteBlocks.length === 0) {
      if (queuedMessagesRef.current.length > 0 && isProcessingRef.current) {
        interruptedRunIdRef.current = activeRunIdRef.current;
        setStreamContent("");
        setStreamReasoning("");
        setActiveToolCalls([]);
        setActiveSubagent(null);
        agent.abort();
      }
      return;
    }
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
    if (!hasApiKeyRef.current) {
      openApiKeyModal();
      return;
    }
    if (handleCommand(message)) return;
    if (isProcessingRef.current) {
      queuedMessagesRef.current.push(message.trim());
      setQueuedMessages([...queuedMessagesRef.current]);
      setTimeout(scrollToBottom, 10);
      return;
    }
    processMessage(message);
  }, [agent, handleCommand, openApiKeyModal, processMessage, pasteBlocks, scrollToBottom]);

  const hasMessages = messages.length > 0 || streamContent || isProcessing;

  return (
    <box width={width} height={height} backgroundColor={t.background} flexDirection="column">
      {hasMessages ? (
        <box flexGrow={1} paddingBottom={1} paddingTop={1} paddingLeft={2} paddingRight={2} gap={1}>
          {/* Session header — ┃ left-border panel like OpenCode's Header */}
          <SessionHeader t={t} modeInfo={modeInfo} sessionTitle={sessionTitle} sessionId={sessionId} />
          {/* Scrollable messages */}
          {/* biome-ignore lint/suspicious/noExplicitAny: OpenTUI type mismatch for stickyStart */}
          <scrollbox ref={scrollRef} flexGrow={1} stickyScroll={true} stickyStart={"bottom" as any}>
            {messages.map((msg, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: append-only message list without stable IDs
              <MessageView key={i} entry={msg} index={i} t={t} modeColor={modeInfo.color} />
            ))}
            {/* Active tool calls — pending inline */}
            {activeToolCalls.map((tc) => (
              tc.function.name === "task"
                ? <SubagentTaskLine key={tc.id} t={t} label={toolArgs(tc) || "Working"} pending />
                : tc.function.name === "delegate"
                  ? <DelegationTaskLine key={tc.id} t={t} label={toolArgs(tc) || "Background research"} pending id={undefined} />
                : <InlineTool key={tc.id} t={t} pending>{toolLabel(tc)}</InlineTool>
            ))}
            {activeSubagent && <SubagentActivity t={t} status={activeSubagent} />}
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
                showApiKeyModal={showApiKeyModal}
                onSubmit={handleSubmit} onPaste={handlePaste} pasteBlocks={pasteBlocks}
                modeInfo={modeInfo} model={model} modelInfo={modelInfo} contextStats={contextStats}
                queuedCount={queuedMessages.length} queuedMessages={queuedMessages} />
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
                showApiKeyModal={showApiKeyModal}
                onSubmit={handleSubmit} onPaste={handlePaste} pasteBlocks={pasteBlocks}
                modeInfo={modeInfo} model={model} modelInfo={modelInfo} contextStats={contextStats}
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
      {showApiKeyModal && (
        <ApiKeyModal
          t={t}
          width={width}
          height={height}
          inputRef={apiKeyInputRef}
          error={apiKeyError}
          onSubmit={submitApiKey}
        />
      )}
      {showSlashMenu && <SlashMenuModal t={t} selectedIndex={slashMenuIndex} width={width} height={height} searchQuery={slashSearchQuery} filteredItems={filteredSlashItems} />}
      {showModelPicker && <ModelPickerModal t={t} currentModel={model} selectedIndex={modelPickerIndex} width={width} height={height} searchQuery={modelSearchQuery} filteredModels={filteredModels} />}
    </box>
  );
}

/* ── Session Header ──────────────────────────────────────────── */

function SessionHeader({ t, modeInfo, sessionTitle, sessionId }: {
  t: Theme; modeInfo: typeof MODES[number]; sessionTitle: string | null; sessionId: string | null;
}) {
  return (
    <box flexShrink={0}>
      <box
        paddingTop={1} paddingBottom={1} paddingLeft={2} paddingRight={1}
        border={["left"]} customBorderChars={SPLIT} borderColor={t.border}
        backgroundColor={t.backgroundPanel}
      >
        <box flexDirection="row" width="100%">
          <text>
            <span style={{ fg: modeInfo.color }}><b>{modeInfo.label}</b></span>
            {sessionTitle ? <span style={{ fg: t.text }}><b>{": "}{sessionTitle}</b></span> : null}
          </text>
          <box flexGrow={1} />
          {sessionId ? <text fg={t.textDim}>{sessionId}</text> : null}
        </box>
      </box>
    </box>
  );
}

/* ── Prompt Box ──────────────────────────────────────────────── */

const TEXTAREA_KEYBINDINGS: KeyBinding[] = [
  { name: "return", action: "submit" },
  { name: "return", shift: true, action: "newline" },
];

function formatTokenCount(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (tokens >= 1_000) return `${Math.round(tokens / 1_000)}K`;
  return String(tokens);
}

function ContextMeter({ t, stats }: { t: Theme; stats: ContextStats }) {
  return (
    <text>
      <span style={{ fg: t.textMuted }}>{`${Math.round(stats.ratioRemaining * 100)}%`}</span>
      <span style={{ fg: t.textDim }}>{` ${formatTokenCount(stats.remainingTokens)}`}</span>
    </text>
  );
}

function PromptBox({ t, inputRef, isProcessing, showModelPicker, showSlashMenu, showPlanQuestions, showApiKeyModal, onSubmit, onPaste, pasteBlocks: _pasteBlocks, modeInfo, model, modelInfo, contextStats, placeholder, queuedCount, queuedMessages }: {
  t: Theme; inputRef: React.RefObject<TextareaRenderable | null>;
  isProcessing: boolean; showModelPicker: boolean; showSlashMenu: boolean; showPlanQuestions: boolean; showApiKeyModal: boolean; onSubmit: () => void;
  onPaste: (event: PasteEvent) => void; pasteBlocks: { id: number; content: string; lines: number }[];
  modeInfo: typeof MODES[number]; model: string;
  modelInfo: ReturnType<typeof getModelInfo>; contextStats?: ContextStats | null; placeholder?: string; queuedCount?: number; queuedMessages?: string[];
}) {
  const hasQueue = (queuedMessages?.length ?? 0) > 0;

  return (
    <box backgroundColor={t.backgroundPanel}>
      <box>
        {hasQueue && (
          <box paddingLeft={2} paddingRight={2} paddingTop={1} paddingBottom={1} backgroundColor={t.queueBg} flexShrink={0}>
            {queuedMessages!.map((msg, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: append-only queue of plain strings
              <text key={i} fg={t.text}>{"→ "}{msg}</text>
            ))}
            <box height={1} />
            <text>
              <span style={{ fg: t.primary }}>{"enter "}</span>
              <span style={{ fg: t.textMuted }}>{"send now"}</span>
              <span style={{ fg: t.textDim }}>{" · "}</span>
              <span style={{ fg: t.primary }}>{"↑ "}</span>
              <span style={{ fg: t.textMuted }}>{"edit"}</span>
              <span style={{ fg: t.textDim }}>{" · "}</span>
              <span style={{ fg: t.primary }}>{"esc "}</span>
              <span style={{ fg: t.textMuted }}>{"cancel"}</span>
            </text>
          </box>
        )}
        <box
          paddingLeft={2}
          paddingRight={2}
          paddingTop={1}
          paddingBottom={1}
          backgroundColor={t.backgroundElement}
          flexDirection="row"
          gap={2}
          alignItems="flex-start"
          flexShrink={0}
        >
          <text fg={modeInfo.color}>
            <b>{modeInfo.label}</b>
          </text>
          <box flexGrow={1}>
            <textarea
              ref={inputRef}
              focused={!showModelPicker && !showSlashMenu && !showPlanQuestions && !showApiKeyModal}
              placeholder={isProcessing ? "Queue a follow-up... (esc to interrupt)" : placeholder || "Message Grok..."}
              textColor={t.text}
              backgroundColor={t.backgroundElement}
              placeholderColor={t.textMuted}
              minHeight={1}
              maxHeight={10}
              wrapMode="word"
              keyBindings={TEXTAREA_KEYBINDINGS}
              onSubmit={onSubmit as unknown as () => void}
              onPaste={onPaste as unknown as (event: PasteEvent) => void}
            />
          </box>
        </box>
      </box>
      <box
        flexDirection="row"
        justifyContent="space-between"
        alignItems="center"
        paddingLeft={2}
        paddingRight={2}
        height={1}
        flexShrink={0}
      >
        <box flexDirection="row" gap={1} alignItems="center" height={1}>
          <text fg={t.text}>{modelInfo?.name || model}</text>
          {contextStats ? <ContextMeter t={t} stats={contextStats} /> : null}
        </box>
        <box flexDirection="row" gap={3} alignItems="center" height={1}>
          {isProcessing ? (
            <box flexDirection="row" gap={3}>
              <text fg={t.text}>
                {"enter "}
                <span style={{ fg: t.textMuted }}>{"queue"}</span>
              </text>
              <text fg={t.text}>
                {"esc "}
                <span style={{ fg: t.textMuted }}>{(queuedCount ?? 0) > 0 ? "clear queue" : "interrupt"}</span>
              </text>
            </box>
          ) : (
            <>
              <text fg={t.text}>
                {"shift+enter "}
                <span style={{ fg: t.textMuted }}>{"new line"}</span>
              </text>
              <text fg={t.text}>
                {"tab "}
                <span style={{ fg: t.textMuted }}>{"modes"}</span>
              </text>
            </>
          )}
        </box>
      </box>
    </box>
  );
}

function ApiKeyModal({ t, width, height, inputRef, error, onSubmit }: {
  t: Theme;
  width: number;
  height: number;
  inputRef: React.RefObject<TextareaRenderable | null>;
  error: string | null;
  onSubmit: () => void;
}) {
  const overlayBg = "#000000cc" as string;
  const panelWidth = Math.min(68, width - 6);
  const panelHeight = 11;
  const top = Math.max(2, Math.floor((height - panelHeight) / 2));

  return (
    <box
      position="absolute"
      left={0}
      top={0}
      width={width}
      height={height}
      alignItems="center"
      paddingTop={top}
      backgroundColor={overlayBg}
    >
      <box
        width={panelWidth}
        height={panelHeight}
        backgroundColor={t.backgroundPanel}
        paddingTop={1}
        paddingBottom={1}
      >
        <box flexShrink={0} flexDirection="row" justifyContent="space-between" paddingLeft={2} paddingRight={2}>
          <text fg={t.primary}><b>{"Add API key"}</b></text>
          <text fg={t.textMuted}>{"esc"}</text>
        </box>
        <box paddingLeft={2} paddingRight={2} paddingTop={1}>
          <text fg={t.text}>
            {"Paste your xAI API key to unlock chat. You can hide this prompt with esc."}
          </text>
        </box>
        <box paddingLeft={2} paddingRight={2} paddingTop={1}>
          <box backgroundColor={t.backgroundElement} paddingLeft={1} paddingRight={1} width="100%">
            <textarea
              ref={inputRef}
              focused={true}
              placeholder="xai-..."
              textColor={t.text}
              backgroundColor={t.backgroundElement}
              placeholderColor={t.textMuted}
              minHeight={1}
              maxHeight={3}
              wrapMode="word"
              keyBindings={TEXTAREA_KEYBINDINGS}
              onSubmit={onSubmit as unknown as () => void}
            />
          </box>
        </box>
        <box paddingLeft={2} paddingRight={2} paddingTop={1}>
          {error ? (
            <text fg={t.diffRemovedFg}>{error}</text>
          ) : (
            <text>
              <span style={{ fg: t.primary }}>{"enter "}</span>
              <span style={{ fg: t.textMuted }}>{"save key  ·  "}</span>
              <span style={{ fg: t.primary }}>{"esc "}</span>
              <span style={{ fg: t.textMuted }}>{"hide"}</span>
            </text>
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
          border={["left"]} customBorderChars={SPLIT} borderColor={entry.modeColor || modeColor}
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
            <span style={{ fg: entry.modeColor || modeColor }}>{"▣ "}</span>
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

      if (name === "task" && entry.toolResult?.task) {
        return <TaskResultView t={t} entry={entry} />;
      }

      if (name === "delegate" && entry.toolResult?.delegation) {
        return <DelegationResultView t={t} entry={entry} />;
      }

      if (name === "delegation_list") {
        return <DelegationListView t={t} content={entry.content} />;
      }

      if (name === "delegation_read") {
        return <ToolTextOutputView t={t} label={toolLabel(entry.toolCall!)} content={entry.content} />;
      }

      if (name === "write_file" || name === "edit_file") {
        const filePath = diff?.filePath || tryParseArg(entry.toolCall, "path") || args;
        const label = name === "write_file" ? `Write ${filePath}` : `Edit ${filePath}`;
        return (
          <box gap={0}>
            <InlineTool t={t} pending={false}>{label}</InlineTool>
            {diff && <DiffView t={t} diff={diff} />}
          </box>
        );
      }

      if (name === "bash" && entry.toolResult?.backgroundProcess) {
        const bp = entry.toolResult.backgroundProcess;
        return <BackgroundProcessLine t={t} id={bp.id} pid={bp.pid} command={bp.command} />;
      }

      if (name === "process_logs") {
        return <ProcessLogsView t={t} content={entry.content} />;
      }

      if (name === "process_stop" || name === "process_list") {
        return <InlineTool t={t} pending={false}>{entry.content}</InlineTool>;
      }

      if (name === "read_file") return <InlineTool t={t} pending={false}>{`Read ${trunc(tryParseArg(entry.toolCall, "path") || args, 60)}`}</InlineTool>;
      if (name === "search_web" || name === "search_x") return <InlineTool t={t} pending={false}>{name === "search_web" ? "Web" : "X"}{` Search "${trunc(args, 60)}"`}</InlineTool>;

      return <InlineTool t={t} pending={false}>{trunc(name === "bash" ? args : `${name} ${args}`, 80)}</InlineTool>;
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
              // biome-ignore lint/suspicious/noArrayIndexKey: separator rows lack unique identifiers
              <box key={`sep-${i}`} backgroundColor={t.diffSeparator} paddingLeft={1}>
                <text fg={t.diffSeparatorFg}>{"⌃  "}{row.count}{" unmodified lines"}</text>
              </box>
            );
          }
          if (row.kind === "removed") {
            return (
              <box key={`rm-${row.oldNum}`} backgroundColor={t.diffRemoved} flexDirection="row">
                <text fg={t.diffRemovedLineNum}>{pad(row.oldNum)}</text>
                <text fg={t.diffRemovedFg}>{` ${row.text}`}</text>
              </box>
            );
          }
          if (row.kind === "added") {
            return (
              <box key={`add-${row.newNum}`} backgroundColor={t.diffAdded} flexDirection="row">
                <text fg={t.diffAddedLineNum}>{pad(row.newNum)}</text>
                <text fg={t.diffAddedFg}>{` ${row.text}`}</text>
              </box>
            );
          }
          return (
            <box key={`ctx-${row.oldNum}`} backgroundColor={t.diffContext} flexDirection="row">
              <text fg={t.diffLineNumber}>{pad(row.oldNum)}</text>
              <text fg={t.diffContextFg}>{` ${row.text}`}</text>
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
  return (
    <box paddingLeft={3}>
      <text>
        <span style={{ fg: t.textMuted }}>
          <LoadingSpinner />
        </span>
        <span style={{ fg: t.textMuted }}>{" "}{text}</span>
      </text>
    </box>
  );
}

function InlineTool({ t, pending: _pending, children }: { t: Theme; pending: boolean; children: React.ReactNode }) {
  return (
    <box paddingLeft={3}>
      <text fg={t.textMuted}>
        {"→ "}{children}
      </text>
    </box>
  );
}

function SubagentTaskLine({ t, label, pending }: { t: Theme; label: string; pending: boolean }) {
  const displayLabel = compactTaskLabel(label);

  return (
    <box paddingLeft={3}>
      <text>
        {pending ? (
          <span style={{ fg: t.subagentAccent }}>
            <LoadingSpinner />
          </span>
        ) : null}
        {pending ? " " : ""}
        <span style={{ fg: t.subagentAccent }}>
          <b>{`Sub-agent: ${displayLabel}`}</b>
        </span>
      </text>
    </box>
  );
}

function DelegationTaskLine({ t, label, pending, id }: { t: Theme; label: string; pending: boolean; id?: string }) {
  const displayLabel = compactTaskLabel(label);

  return (
    <box paddingLeft={3}>
      <text>
        {pending ? (
          <span style={{ fg: t.subagentAccent }}>
            <LoadingSpinner />
          </span>
        ) : (
          <span style={{ fg: t.subagentAccent }}>{"◆"}</span>
        )}
        {" "}
        <span style={{ fg: t.subagentAccent }}>
          <b>{"Background"}</b>
        </span>
        <span style={{ fg: t.textMuted }}>{" — "}{displayLabel}</span>
        {id ? <span style={{ fg: t.textDim }}>{`  (${id})`}</span> : null}
      </text>
    </box>
  );
}

function LoadingSpinner() {
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setFrame((n) => (n + 1) % LOADING_SPINNER_FRAMES.length), 120);
    return () => clearInterval(id);
  }, []);

  return <>{LOADING_SPINNER_FRAMES[frame]}</>;
}

function SubagentActivity({ t, status }: { t: Theme; status: SubagentStatus }) {
  return (
    <box paddingLeft={5}>
      <text fg={t.textMuted}>
        {"→ "}{truncateLine(status.detail, 100)}
      </text>
    </box>
  );
}

function TaskResultView({ t, entry }: { t: Theme; entry: ChatEntry }) {
  const task = entry.toolResult?.task;
  if (!task) return null;

  return (
    <box gap={0}>
      <SubagentTaskLine t={t} label={task.description} pending={false} />
      <box paddingLeft={5}>
        <text fg={t.text}>
          {task.agent}
          {": "}
          {truncateLine(task.summary, 90)}
        </text>
      </box>
    </box>
  );
}

function DelegationResultView({ t, entry }: { t: Theme; entry: ChatEntry }) {
  const delegation = entry.toolResult?.delegation;
  if (!delegation) return null;

  return (
    <DelegationTaskLine t={t} label={delegation.description} pending={false} id={delegation.id} />
  );
}

function DelegationListView({ t, content }: { t: Theme; content: string }) {
  const items = parseDelegationList(content);

  if (items.length === 0) {
    return <InlineTool t={t} pending={false}>{"No background delegations"}</InlineTool>;
  }

  return (
    <box paddingLeft={3} gap={0}>
      {items.map((item) => {
        const statusColor = item.status === "complete" ? "#8adf8a"
          : item.status === "running" ? t.subagentAccent
          : item.status === "error" ? "#df8a8a"
          : t.textMuted;

        return (
          <box key={item.id}>
            <text>
              <span style={{ fg: statusColor }}>{"◆ "}</span>
              <span style={{ fg: t.text }}>{item.id}</span>
              <span style={{ fg: statusColor }}>{` ${item.status}`}</span>
              <span style={{ fg: t.textMuted }}>{" — "}{truncateLine(item.label, 60)}</span>
            </text>
          </box>
        );
      })}
    </box>
  );
}

function parseDelegationList(content: string): { id: string; status: string; label: string }[] {
  const items: { id: string; status: string; label: string }[] = [];
  for (const line of content.split("\n")) {
    const match = line.match(/`([^`]+)`\s+\[(\w+)]\s+(.*)/);
    if (match) {
      items.push({ id: match[1], status: match[2], label: match[3].trim() });
    }
  }
  return items;
}

function BackgroundProcessLine({ t, id, pid, command }: { t: Theme; id: number; pid: number; command: string }) {
  return (
    <box paddingLeft={3}>
      <text>
        <span style={{ fg: t.subagentAccent }}>{"◆ "}</span>
        <span style={{ fg: t.subagentAccent }}><b>{"Background process"}</b></span>
        <span style={{ fg: t.textMuted }}>{` id:${id} pid:${pid}`}</span>
        <span style={{ fg: t.textDim }}>{" — "}{truncateLine(command, 60)}</span>
      </text>
    </box>
  );
}

function ProcessLogsView({ t, content }: { t: Theme; content: string }) {
  const lines = content.split("\n");
  const header = lines[0] || "";
  const body = lines.slice(1).join("\n").trim();

  return (
    <box paddingLeft={3} gap={0}>
      <text fg={t.textMuted}>{"→ "}{header}</text>
      {body ? (
        <box paddingLeft={2} marginTop={0}>
          <box backgroundColor={t.mdCodeBlockBg} paddingLeft={1} paddingRight={1}>
            <text fg={t.mdCodeBlockFg}>{truncateBlock(body, 15)}</text>
          </box>
        </box>
      ) : null}
    </box>
  );
}

function truncateBlock(text: string, maxLines: number): string {
  const lines = text.split("\n");
  if (lines.length <= maxLines) return text;
  return [...lines.slice(0, maxLines), `… ${lines.length - maxLines} more lines`].join("\n");
}

function ToolTextOutputView({ t, label, content }: { t: Theme; label: string; content: string }) {
  return (
    <box gap={0}>
      <InlineTool t={t} pending={false}>{label}</InlineTool>
      <box paddingLeft={5} marginTop={1} flexShrink={0}>
        <Markdown content={content} t={t} />
      </box>
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
  const overlayBg = "#000000cc" as string;
  return (
    <box position="absolute" left={0} top={0} width={width} height={height}
      alignItems="center" paddingTop={top}
      backgroundColor={overlayBg}>
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
  const overlayBg = "#000000cc" as string;
  return (
    <box position="absolute" left={0} top={0} width={width} height={height}
      alignItems="center" paddingTop={top}
      backgroundColor={overlayBg}>
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
    if (tc.function.name === "task") return a.description || "";
    if (tc.function.name === "delegate") return a.description || "";
    if (tc.function.name === "delegation_read") return a.id || "";
    if (tc.function.name === "process_logs" || tc.function.name === "process_stop") return a.id != null ? String(a.id) : "";
    return a.query || "";
  } catch { return ""; }
}
function tryParseArg(tc: ToolCall | undefined, key: string): string {
  if (!tc) return "";
  try { return JSON.parse(tc.function.arguments)[key] || ""; } catch { return ""; }
}
function toolLabel(tc: ToolCall): string {
  const args = toolArgs(tc);
  if (tc.function.name === "bash") {
    try {
      const parsed = JSON.parse(tc.function.arguments);
      if (parsed.background) return `Background: ${trunc(args || "Starting process...", 70)}`;
    } catch { /* */ }
    return trunc(args || "Running command...", 80);
  }
  if (tc.function.name === "read_file") return `Read ${trunc(args, 60)}`;
  if (tc.function.name === "write_file") return `Write ${trunc(args, 60)}`;
  if (tc.function.name === "edit_file") return `Edit ${trunc(args, 60)}`;
  if (tc.function.name === "search_web") return `Web Search "${trunc(args, 60)}"`;
  if (tc.function.name === "search_x") return `X Search "${trunc(args, 60)}"`;
  if (tc.function.name === "task") return `Task ${trunc(args, 60)}`;
  if (tc.function.name === "delegate") return `Background ${trunc(args, 60)}`;
  if (tc.function.name === "delegation_read") return `Read delegation ${trunc(args, 60)}`;
  if (tc.function.name === "delegation_list") return "List delegations";
  if (tc.function.name === "process_logs") return `Logs for process ${args}`;
  if (tc.function.name === "process_stop") return `Stop process ${args}`;
  if (tc.function.name === "process_list") return "List processes";
  if (tc.function.name === "generate_plan") return "Generating plan...";
  return trunc(`${tc.function.name} ${args}`, 80);
}
function sanitizeContent(raw: string): string {
  let s = raw.replace(/^[\s\n]*assistant:\s*/gi, "");
  s = s.replace(/\{"success"\s*:\s*(true|false)\s*,\s*"output"\s*:\s*"[\s\S]*$/m, "");
  return s.trim();
}
function shouldOpenApiKeyModalForKey(key: { name?: string; sequence?: string; ctrl?: boolean; meta?: boolean }): boolean {
  if (key.ctrl || key.meta) return false;
  if (key.name === "return" || key.name === "backspace") return true;
  return !!(key.sequence && key.sequence.length === 1);
}
function compactTaskLabel(label: string): string {
  const words = label.trim().split(/\s+/).filter(Boolean);
  if (words.length <= 3) return label.trim() || "Working";
  return `${words.slice(0, 3).join(" ")}...`;
}
function trunc(s: string, n: number): string { return s.length <= n ? s : `${s.slice(0, n)}…`; }
function truncateLine(s: string, n: number): string { return trunc(s.replace(/\s+/g, " ").trim(), n); }
