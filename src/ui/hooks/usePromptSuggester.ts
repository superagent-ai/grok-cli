import type { KeyEvent, TextareaRenderable } from "@opentui/core";
import { useCallback, useEffect, useRef, useState } from "react";
import { createProvider } from "../../grok/client.js";
import { buildSuggestionContext } from "../../suggester/context.js";
import { fastPathContinueResult, finalizeSuggestionResult, shouldFastPathContinue } from "../../suggester/engine.js";
import { generatePromptSuggestion } from "../../suggester/generate.js";
import { formatSuggesterStatus, loadSuggesterSettings, saveSuggesterSettings } from "../../suggester/index.js";
import { isGhostAcceptKey } from "../../suggester/keys.js";
import { renderSuggestionPrompt } from "../../suggester/prompt.js";
import { compactSeedForPrompt, loadSeed, type ReseedTrigger } from "../../suggester/seed.js";
import { generateProjectSeed } from "../../suggester/seeder.js";
import { checkSeedStaleness } from "../../suggester/staleness.js";
import {
  appendSteeringEvent,
  classifySteering,
  isRepeatedRejected,
  recentChangedExamples,
} from "../../suggester/steering.js";
import {
  addUsage,
  emptySessionState,
  loadSuggesterSessionState,
  saveSuggesterSessionState,
} from "../../suggester/store.js";
import type { ResolvedSuggesterSettings, SuggesterSessionState, TurnStatus } from "../../suggester/types.js";
import type { ChatEntry } from "../../types/index.js";
import { getApiKey } from "../../utils/settings.js";

export interface PromptSuggesterState {
  suggestion: string | null;
  visible: boolean;
  enabled: boolean;
  requestAfterTurn: (entries: ChatEntry[], status: TurnStatus, abortNote?: string) => void;
  recordSubmit: (userPrompt: string) => void;
  ensureSeed: () => void;
  requestReseed: () => void;
  cancel: () => void;
  accept: () => boolean;
  dismiss: () => void;
  setEnabled: (enabled: boolean) => void;
  setAutoAccept: (autoAccept: boolean) => void;
  setCustomInstruction: (instruction: string) => void;
  setSuggesterModel: (model: string) => void;
  setSeederModel: (model: string) => void;
  formatStatus: () => string;
  handleKey: (key: KeyEvent, blocked: boolean) => boolean;
}

export function usePromptSuggester(
  inputRef: React.RefObject<TextareaRenderable | null>,
  cwd: string,
  sessionId: string | null,
  baseURL: string,
  active = true,
): PromptSuggesterState {
  const [settings, setSettings] = useState<ResolvedSuggesterSettings>(() => loadSuggesterSettings());
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [editorEmpty, setEditorEmpty] = useState(true);
  const [sessionState, setSessionState] = useState<SuggesterSessionState>(() => emptySessionState());

  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const suggestionRef = useRef(suggestion);
  suggestionRef.current = suggestion;
  const dismissedRef = useRef(dismissed);
  dismissedRef.current = dismissed;
  const sessionStateRef = useRef(sessionState);
  sessionStateRef.current = sessionState;
  const epochRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const seedRunningRef = useRef(false);
  const seedPendingRef = useRef<ReseedTrigger | null>(null);
  const seedAbortRef = useRef<AbortController | null>(null);

  const persistState = useCallback(
    (next: SuggesterSessionState) => {
      sessionStateRef.current = next;
      setSessionState(next);
      if (sessionId) saveSuggesterSessionState(cwd, sessionId, next);
    },
    [cwd, sessionId],
  );

  useEffect(() => {
    if (!sessionId) {
      const empty = emptySessionState();
      sessionStateRef.current = empty;
      setSessionState(empty);
      return;
    }
    const loaded = loadSuggesterSessionState(cwd, sessionId);
    sessionStateRef.current = loaded;
    setSessionState(loaded);
  }, [cwd, sessionId]);

  useEffect(() => {
    if (active) return;
    abortRef.current?.abort();
    abortRef.current = null;
    seedAbortRef.current?.abort();
    seedAbortRef.current = null;
    seedPendingRef.current = null;
    epochRef.current += 1;
    setSuggestion(null);
    suggestionRef.current = null;
    setDismissed(true);
  }, [active]);

  useEffect(() => {
    const poll = () => {
      const empty = !(inputRef.current?.plainText ?? "");
      setEditorEmpty(empty);
    };
    poll();
    const id = setInterval(poll, 100);
    return () => clearInterval(id);
  }, [inputRef]);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    seedAbortRef.current?.abort();
    seedAbortRef.current = null;
    seedPendingRef.current = null;
    epochRef.current += 1;
    setSuggestion(null);
    suggestionRef.current = null;
  }, []);

  const dismiss = useCallback(() => {
    setDismissed(true);
  }, []);

  const insertSuggestion = useCallback(
    (text: string, requireEmpty: boolean): boolean => {
      const ta = inputRef.current;
      if (!ta) return false;
      if (requireEmpty && ta.plainText) return false;
      ta.setText(text);
      ta.cursorOffset = text.length;
      return true;
    },
    [inputRef],
  );

  const accept = useCallback(() => {
    const text = suggestionRef.current;
    if (!text) return false;
    if (!insertSuggestion(text, true)) return false;
    setDismissed(true);
    dismissedRef.current = true;
    return true;
  }, [insertSuggestion]);

  const runReseed = useCallback(
    async (trigger: ReseedTrigger) => {
      if (seedRunningRef.current) {
        seedPendingRef.current = trigger;
        return;
      }
      const current = settingsRef.current;
      if (!current.enabled || !current.reseedEnabled) return;
      const apiKey = getApiKey();
      if (!apiKey) return;

      seedRunningRef.current = true;
      const ac = new AbortController();
      seedAbortRef.current = ac;
      try {
        const result = await generateProjectSeed(
          createProvider(apiKey, baseURL),
          cwd,
          trigger,
          loadSeed(cwd),
          current.seederModel,
          ac.signal,
        );
        if (result.usage) {
          persistState({
            ...sessionStateRef.current,
            seederUsage: addUsage(sessionStateRef.current.seederUsage, result.usage, result.modelId),
          });
        }
      } catch {
        /* seeder failures stay silent */
      } finally {
        seedRunningRef.current = false;
        seedAbortRef.current = null;
        const pending = seedPendingRef.current;
        seedPendingRef.current = null;
        if (pending) void runReseed(pending);
      }
    },
    [baseURL, cwd, persistState],
  );

  const ensureSeed = useCallback(() => {
    if (!active) return;
    const stale = checkSeedStaleness(cwd);
    if (stale.stale && stale.trigger) void runReseed(stale.trigger);
  }, [active, cwd, runReseed]);

  const requestReseed = useCallback(() => {
    void runReseed({ reason: "manual", changedFiles: [] });
  }, [runReseed]);

  const recordSubmit = useCallback(
    (userPrompt: string) => {
      const last = sessionStateRef.current.lastSuggestion;
      if (!last?.text || !userPrompt.trim()) return;
      const classified = classifySteering(last.text, userPrompt);
      persistState({
        ...sessionStateRef.current,
        steeringHistory: appendSteeringEvent(sessionStateRef.current.steeringHistory, {
          ...classified,
          suggestedPrompt: last.text,
          actualUserPrompt: userPrompt.trim(),
          at: new Date().toISOString(),
        }),
      });
    },
    [persistState],
  );

  const requestAfterTurn = useCallback(
    (entries: ChatEntry[], status: TurnStatus, abortNote?: string) => {
      const current = settingsRef.current;
      if (!active || !current.enabled) return;

      const epoch = ++epochRef.current;
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;
      setDismissed(false);
      dismissedRef.current = false;

      let turnsSince = sessionStateRef.current.turnsSinceLastStalenessCheck + 1;
      if (current.reseedEnabled && turnsSince >= current.reseedTurnInterval) {
        const stale = checkSeedStaleness(cwd);
        if (stale.stale && stale.trigger) void runReseed(stale.trigger);
        turnsSince = 0;
      }

      const applyResult = (
        text: string | null,
        result?: { usage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number }; modelId?: string },
      ) => {
        if (epoch !== epochRef.current) return;
        const nextText = text && isRepeatedRejected(text, sessionStateRef.current.steeringHistory) ? null : text;
        setSuggestion(nextText);
        suggestionRef.current = nextText;
        if (nextText && current.autoAccept) {
          insertSuggestion(nextText, true);
        }

        const nextUsage = result?.usage
          ? addUsage(sessionStateRef.current.suggestionUsage, result.usage, result.modelId ?? current.model)
          : sessionStateRef.current.suggestionUsage;
        persistState({
          ...sessionStateRef.current,
          lastSuggestion: nextText
            ? { text: nextText, shownAt: new Date().toISOString(), turnStatus: status }
            : sessionStateRef.current.lastSuggestion,
          lastUsage: result?.usage
            ? {
                inputTokens: result.usage.inputTokens,
                outputTokens: result.usage.outputTokens,
                totalTokens: result.usage.totalTokens,
                modelId: result.modelId ?? current.model,
              }
            : sessionStateRef.current.lastUsage,
          suggestionUsage: nextUsage,
          turnsSinceLastStalenessCheck: turnsSince,
        });
      };

      if (shouldFastPathContinue(status, current.fastPathContinueOnError)) {
        applyResult(fastPathContinueResult().text);
        return;
      }

      const apiKey = getApiKey();
      if (!apiKey) {
        applyResult(null);
        return;
      }

      const context = buildSuggestionContext(entries, status, {
        abortNote,
        maxSuggestionChars: current.maxSuggestionChars,
        customInstruction: current.customInstruction,
        intentSeed: compactSeedForPrompt(loadSeed(cwd)),
        recentChanged: recentChangedExamples(sessionStateRef.current.steeringHistory),
      });

      void generatePromptSuggestion(
        createProvider(apiKey, baseURL),
        renderSuggestionPrompt(context),
        current.model,
        current.maxSuggestionChars,
        ac.signal,
      )
        .then((raw) => {
          if (epoch !== epochRef.current) return;
          const finalized = finalizeSuggestionResult(raw, current.maxSuggestionChars);
          applyResult(finalized.kind === "suggestion" ? finalized.text : null, {
            usage: finalized.usage,
            modelId: finalized.modelId,
          });
        })
        .catch(() => {
          if (epoch !== epochRef.current) return;
          applyResult(null);
        });
    },
    [active, baseURL, cwd, insertSuggestion, persistState, runReseed],
  );

  const setEnabled = useCallback(
    (enabled: boolean) => {
      const next = saveSuggesterSettings({ enabled });
      setSettings(next);
      if (!enabled) {
        cancel();
        setSuggestion(null);
        suggestionRef.current = null;
        setDismissed(true);
      }
    },
    [cancel],
  );

  const setAutoAccept = useCallback((autoAccept: boolean) => {
    setSettings(saveSuggesterSettings({ autoAccept }));
  }, []);

  const setCustomInstruction = useCallback((customInstruction: string) => {
    setSettings(saveSuggesterSettings({ customInstruction }));
  }, []);

  const setSuggesterModel = useCallback((model: string) => {
    setSettings(saveSuggesterSettings({ model }));
  }, []);

  const setSeederModel = useCallback((seederModel: string) => {
    setSettings(saveSuggesterSettings({ seederModel }));
  }, []);

  const formatStatus = useCallback(
    () => formatSuggesterStatus(settingsRef.current, sessionStateRef.current, loadSeed(cwd)),
    [cwd],
  );

  const handleKey = useCallback(
    (key: KeyEvent, blocked: boolean) => {
      if (!active || blocked || !settingsRef.current.enabled) return false;
      const editorText = inputRef.current?.plainText ?? "";
      const text = suggestionRef.current;
      if (!text || dismissedRef.current) return false;

      const isEscape =
        key.name === "escape" || key.sequence === "\u001b" || (key as KeyEvent & { raw?: string }).raw === "\u001b";
      if (isEscape && editorText === text) {
        key.preventDefault();
        key.stopPropagation();
        inputRef.current?.clear();
        dismiss();
        return true;
      }

      if (editorText) return false;

      if (isGhostAcceptKey(key, settingsRef.current.ghostAcceptKeys)) {
        key.preventDefault();
        key.stopPropagation();
        accept();
        return true;
      }

      if (isEscape) {
        key.preventDefault();
        key.stopPropagation();
        dismiss();
        return true;
      }

      return false;
    },
    [accept, active, dismiss, inputRef],
  );

  const visible = Boolean(active && settings.enabled && suggestion && editorEmpty && !dismissed);

  return {
    suggestion,
    visible,
    enabled: settings.enabled,
    requestAfterTurn,
    recordSubmit,
    ensureSeed,
    requestReseed,
    cancel,
    accept,
    dismiss,
    setEnabled,
    setAutoAccept,
    setCustomInstruction,
    setSuggesterModel,
    setSeederModel,
    formatStatus,
    handleKey,
  };
}
