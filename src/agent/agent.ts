import { streamText, stepCountIs, type ModelMessage } from "ai";
import { DelegationManager } from "./delegations";
import { createProvider, generateTitle as genTitle, type XaiProvider } from "../grok/client";
import { createTools } from "../grok/tools";
import {
  SessionStore,
  appendMessages,
  appendSystemMessage,
  buildChatEntries,
  getSessionTotalTokens,
  loadTranscript,
  recordUsageEvent,
} from "../storage/index";
import { BashTool } from "../tools/bash";
import { loadCustomInstructions } from "../utils/instructions";
import type {
  AgentMode,
  ChatEntry,
  Plan,
  SessionInfo,
  SessionSnapshot,
  StreamChunk,
  SubagentStatus,
  TaskRequest,
  ToolCall,
  ToolResult,
  UsageSource,
  WorkspaceInfo,
} from "../types/index";

const MAX_TOOL_ROUNDS = 400;

interface AgentOptions {
  persistSession?: boolean;
  session?: string;
}

const ENVIRONMENT = `ENVIRONMENT:
You are running inside a terminal (CLI). Your text output is rendered in a plain terminal — not a browser, not a rich text editor.
- Use plain text only. No markdown tables, no HTML, no images, no colored text.
- Use simple markers like dashes (-) or asterisks (*) for lists.
- Use indentation and blank lines for structure.
- Keep lines under 100 characters when possible.
- Use backticks for inline code and triple backticks for code blocks — these are rendered.
- Never use unicode box-drawing, fancy borders, or ASCII art in your responses.`;

const MODE_PROMPTS: Record<AgentMode, string> = {
  agent: `You are Grok CLI in Agent mode — a powerful AI coding agent. You execute tasks directly using tools.

${ENVIRONMENT}

TOOLS:
- read_file: Read file contents with start_line/end_line for iterative reading. Use for examining code.
- write_file: Create new files or overwrite existing ones with full content.
- edit_file: Replace a unique string in a file with new content. The old_string must be unique — include enough context lines.
- bash: Execute shell commands. Set background=true for long-running processes (dev servers, watchers, builds). Returns a process ID immediately.
- process_logs: View recent output from a background process by ID.
- process_stop: Stop a background process by ID.
- process_list: List all background processes with status and uptime.
- task: Delegate a focused foreground task to a sub-agent. Use general for multi-step execution and explore for fast read-only research.
- delegate: Launch a read-only background agent for longer research while you continue working.
- delegation_read: Retrieve a completed background delegation result by ID.
- delegation_list: List running and completed background delegations. Do not poll it repeatedly.
- search_web: Search the web for current information, documentation, APIs, tutorials, etc.
- search_x: Search X/Twitter for real-time posts, discussions, opinions, and trends.

WORKFLOW:
1. Understand the request
2. Decide whether a sub-agent should handle the first investigation pass
3. Use read_file and bash to explore the codebase directly when the task is small or tightly scoped
4. Use bash with background=true for dev servers, watchers, or any long-running process — then continue working
5. Use delegate for read-only work that can run in parallel, then continue productive work
6. Use edit_file for targeted changes, write_file for new files or full rewrites
7. Verify changes by reading modified files
8. Run tests or builds with bash to confirm correctness
9. Use search_web or search_x when you need up-to-date information

DEFAULT DELEGATION POLICY:
- Prefer the task tool by default for code review, code quality analysis, architecture research, root-cause investigation, bug triage, or any request that likely needs reading multiple files before acting.
- Prefer delegate for longer-running read-only exploration when you can keep making progress without blocking.
- Use the explore sub-agent for read-only investigation, reviews, research, and "how does this work?" tasks.
- Use the general sub-agent for delegated work that may need editing files, running commands, or producing a concrete implementation.
- Never use delegate for tasks that should edit files or make shell changes.
- When a background delegation is running, do not wait idly and do not spam delegation_list(). Continue useful work.
- Do not wait for the user to explicitly ask for a sub-agent when delegation would clearly help.
- Skip delegation only when the task is trivial, single-file, or you already have the exact answer.

EXAMPLES:
- "review this change" -> delegate to explore first
- "research how auth works" -> delegate to explore first
- "investigate why this test fails" -> delegate to explore first, then continue with findings
- "refactor this module" -> delegate a focused part to general when helpful

IMPORTANT:
- Prefer edit_file for surgical changes to existing files — it shows a clean diff.
- Use write_file only for new files or when most of the file is changing.
- Use read_file instead of cat/head/tail for reading files.

Be direct. Execute, don't just describe. Show results, not plans.`,

  plan: `You are Grok CLI in Plan mode — you analyze and plan but DO NOT execute changes.

${ENVIRONMENT}

TOOLS:
- read_file: Read file contents for analysis.
- bash: ONLY for searching (find, grep, ls) — NEVER modify files.
- generate_plan: ALWAYS use this to present your plan. Creates an interactive UI with steps and questions.

BEHAVIOR:
- Explore the codebase first using read_file and bash to understand the current state
- ALWAYS call generate_plan to present your plan — never just describe it in text
- Include clear, ordered steps with affected file paths
- Include questions when you need user input on approach, trade-offs, or preferences
- Use "select" questions for single-choice decisions, "multiselect" for picking multiple options, and "text" for free-form input
- Highlight potential risks, edge cases, and dependencies in the plan summary
- NEVER create, modify, or delete files — only read and analyze`,

  ask: `You are Grok CLI in Ask mode — you answer questions clearly and thoroughly.

${ENVIRONMENT}

TOOLS:
- read_file: Read file contents for context.
- bash: ONLY for searching (find, grep, ls) — NEVER modify.

BEHAVIOR:
- Answer the user's question directly and thoroughly
- Use tools to gather context when needed
- Provide code examples when helpful
- NEVER create, modify, or delete files
- Focus on explanation, not execution`,
};

function buildSystemPrompt(cwd: string, mode: AgentMode, planContext?: string | null): string {
  const custom = loadCustomInstructions();
  const customSection = custom
    ? `\n\nCUSTOM INSTRUCTIONS:\n${custom}\n\nFollow the above alongside standard instructions.\n`
    : "";

  const planSection = planContext
    ? `\n\nAPPROVED PLAN:\nThe following plan has been approved by the user. Execute it now.\n${planContext}\n`
    : "";

  return `${MODE_PROMPTS[mode]}${customSection}${planSection}

Current working directory: ${cwd}`;
}

function buildSubagentPrompt(request: TaskRequest, cwd: string): string {
  const mode: AgentMode = request.agent === "explore" ? "ask" : "agent";
  const role =
    request.agent === "explore"
      ? "You are the Explore sub-agent. You are read-only and focus on fast codebase research."
      : "You are the General sub-agent. You can investigate, edit files, and run commands to complete delegated work.";

  const rules =
    request.agent === "explore"
      ? [
          "Do not create, modify, or delete files.",
          "Prefer `read_file` and search commands over broad shell exploration.",
          "Return concise findings for the parent agent.",
        ]
      : [
          "Work only on the delegated task below.",
          "Use tools directly instead of narrating your intent.",
          "Return a concise summary for the parent agent with key outcomes and any open risks.",
        ];

  return [
    role,
    "",
    "You are helping a parent agent. Do not address the end user directly.",
    "Focus tightly on the delegated scope and summarize what matters back to the parent agent.",
    "",
    ...rules,
    "",
    `Delegated task: ${request.description}`,
    "",
    buildSystemPrompt(cwd, mode),
  ].join("\n");
}

export class Agent {
  private provider: XaiProvider | null = null;
  private apiKey: string | null = null;
  private baseURL: string | null = null;
  private bash: BashTool;
  private delegations: DelegationManager;
  private sessionStore: SessionStore | null = null;
  private workspace: WorkspaceInfo | null = null;
  private session: SessionInfo | null = null;
  private messages: ModelMessage[] = [];
  private recordedTokens = 0;
  private abortController: AbortController | null = null;
  private maxToolRounds: number;
  private mode: AgentMode = "agent";
  private modelId: string;
  private maxTokens: number;
  private planContext: string | null = null;
  private subagentStatusListeners = new Set<(status: SubagentStatus | null) => void>();

  constructor(
    apiKey: string | undefined,
    baseURL?: string,
    model?: string,
    maxToolRounds?: number,
    options: AgentOptions = {},
  ) {
    this.baseURL = baseURL || null;
    if (apiKey) {
      this.setApiKey(apiKey, baseURL);
    }
    this.bash = new BashTool();
    this.delegations = new DelegationManager(() => this.bash.getCwd());
    this.modelId = model || "grok-4-1-fast";
    this.maxToolRounds = maxToolRounds || MAX_TOOL_ROUNDS;
    const envMax = Number(process.env.GROK_MAX_TOKENS);
    this.maxTokens = Number.isFinite(envMax) && envMax > 0 ? envMax : 16_384;

    if (options.persistSession !== false) {
      this.sessionStore = new SessionStore(this.bash.getCwd());
      this.workspace = this.sessionStore.getWorkspace();
      this.session = this.sessionStore.openSession(options.session, this.modelId, this.mode, this.bash.getCwd());
      this.mode = this.session.mode;
      this.messages = loadTranscript(this.session.id);
      this.recordedTokens = getSessionTotalTokens(this.session.id);
      this.sessionStore.setModel(this.session.id, this.modelId);
    }
  }

  getModel(): string {
    return this.modelId;
  }

  setModel(model: string): void {
    this.modelId = model;
    if (this.sessionStore && this.session) {
      this.sessionStore.setModel(this.session.id, model);
      this.session = this.sessionStore.getRequiredSession(this.session.id);
    }
  }

  getMode(): AgentMode {
    return this.mode;
  }

  setMode(mode: AgentMode): void {
    if (mode !== this.mode) {
      this.mode = mode;
      if (this.sessionStore && this.session) {
        this.sessionStore.setMode(this.session.id, mode);
        this.session = this.sessionStore.getRequiredSession(this.session.id);
      }
    }
  }

  setPlanContext(ctx: string | null): void {
    this.planContext = ctx;
  }

  hasApiKey(): boolean {
    return !!this.apiKey;
  }

  setApiKey(apiKey: string, baseURL = this.baseURL ?? undefined): void {
    this.apiKey = apiKey;
    this.baseURL = baseURL || null;
    this.provider = createProvider(apiKey, baseURL);
  }

  getCwd(): string {
    return this.bash.getCwd();
  }

  getContextStats(contextWindow: number, inFlightText = ""): {
    contextWindow: number;
    usedTokens: number;
    remainingTokens: number;
    ratioUsed: number;
    ratioRemaining: number;
  } {
    const system = buildSystemPrompt(this.bash.getCwd(), this.mode, this.planContext);
    const estimatedTokens = estimateTokens(`${system}\n${JSON.stringify(this.messages)}\n${inFlightText}`);
    const usedTokens = Math.min(contextWindow, Math.max(estimatedTokens, this.recordedTokens));
    const remainingTokens = Math.max(0, contextWindow - usedTokens);

    return {
      contextWindow,
      usedTokens,
      remainingTokens,
      ratioUsed: usedTokens / contextWindow,
      ratioRemaining: remainingTokens / contextWindow,
    };
  }

  async generateTitle(userMessage: string): Promise<string> {
    const provider = this.provider;
    if (!provider) {
      return "New session";
    }

    const generated = await genTitle(provider, userMessage);
    this.recordUsage(generated.usage, "title", "grok-3-mini-fast");
    if (this.sessionStore && this.session && !this.session.title && generated.title) {
      this.sessionStore.setTitle(this.session.id, generated.title);
      this.session = this.sessionStore.getRequiredSession(this.session.id);
    }
    return generated.title;
  }

  abort(): void {
    this.abortController?.abort();
    this.emitSubagentStatus(null);
  }

  clearHistory(): void {
    this.startNewSession();
  }

  startNewSession(): SessionSnapshot | null {
    if (!this.sessionStore) {
      this.messages = [];
      this.recordedTokens = 0;
      return null;
    }

    this.sessionStore = new SessionStore(this.bash.getCwd());
    this.workspace = this.sessionStore.getWorkspace();
    this.session = this.sessionStore.createSession(this.modelId, this.mode, this.bash.getCwd());
    this.messages = [];
    this.recordedTokens = 0;
    return this.getSessionSnapshot();
  }

  getSessionInfo(): SessionInfo | null {
    return this.session;
  }

  getSessionId(): string | null {
    return this.session?.id || null;
  }

  getSessionTitle(): string | null {
    return this.session?.title || null;
  }

  getChatEntries(): ChatEntry[] {
    if (!this.session) return [];
    return buildChatEntries(this.session.id);
  }

  getSessionSnapshot(): SessionSnapshot | null {
    if (!this.session || !this.workspace) return null;
    return {
      workspace: this.workspace,
      session: this.session,
      messages: loadTranscript(this.session.id),
      entries: buildChatEntries(this.session.id),
      totalTokens: getSessionTotalTokens(this.session.id),
    };
  }

  onSubagentStatus(listener: (status: SubagentStatus | null) => void): () => void {
    this.subagentStatusListeners.add(listener);
    return () => {
      this.subagentStatusListeners.delete(listener);
    };
  }

  private emitSubagentStatus(status: SubagentStatus | null): void {
    for (const listener of this.subagentStatusListeners) {
      listener(status);
    }
  }

  private discardAbortedTurn(userMessage: ModelMessage): void {
    const idx = this.messages.lastIndexOf(userMessage);
    if (idx >= 0) {
      this.messages.splice(idx, 1);
    }
  }

  private recordUsage(
    usage?: { totalTokens?: number; inputTokens?: number; outputTokens?: number },
    source: UsageSource = "message",
    model = this.modelId,
  ): void {
    if (!usage) return;
    const total = usage.totalTokens ?? ((usage.inputTokens ?? 0) + (usage.outputTokens ?? 0));
    if (Number.isFinite(total) && total > 0) {
      this.recordedTokens += total;
    }
    if (this.session) {
      recordUsageEvent(this.session.id, source, model, usage);
    }
  }

  async consumeBackgroundNotifications(): Promise<string[]> {
    try {
      const notifications = await this.delegations.consumeNotifications();
      for (const notification of notifications) {
        this.messages.push({ role: "system", content: notification.message });
        if (this.session) {
          appendSystemMessage(this.session.id, notification.message);
        }
      }
      return notifications.map((notification) => notification.message);
    } catch {
      return [];
    }
  }

  async runTaskRequest(
    request: TaskRequest,
    onActivity?: (detail: string) => void,
    abortSignal?: AbortSignal,
  ): Promise<ToolResult> {
    const provider = this.requireProvider();
    const signal = abortSignal;
    const childMode: AgentMode = request.agent === "explore" ? "ask" : "agent";
    const childBash = new BashTool(this.bash.getCwd());
    const childTools = createTools(childBash, provider, childMode);
    const initialDetail = request.agent === "explore" ? "Scanning the codebase" : "Planning delegated work";
    let assistantText = "";
    let lastActivity = initialDetail;

    onActivity?.(initialDetail);

    try {
      const result = streamText({
        model: provider(request.agent === "explore" ? "grok-4-1-fast" : this.modelId),
        system: buildSubagentPrompt(request, childBash.getCwd()),
        messages: [{ role: "user", content: request.prompt }],
        tools: childTools,
        stopWhen: stepCountIs(Math.min(this.maxToolRounds, request.agent === "explore" ? 60 : 120)),
        maxRetries: 0,
        abortSignal: signal,
        temperature: request.agent === "explore" ? 0.2 : 0.5,
        maxOutputTokens: Math.min(this.maxTokens, 8_192),
        onFinish: ({ totalUsage }) => {
          this.recordUsage(totalUsage, "task");
        },
      });

      for await (const part of result.fullStream) {
        if (signal?.aborted) {
          break;
        }

        if (part.type === "text-delta") {
          assistantText += part.text;
          continue;
        }

        if (part.type === "tool-call") {
          lastActivity = formatSubagentActivity(part.toolName, part.input);
          onActivity?.(lastActivity);
        }
      }

      if (signal?.aborted) {
        return { success: false, output: "[Cancelled]" };
      }

      await result.response;

      const output = assistantText.trim() || `Task completed. Last action: ${lastActivity}`;
      return {
        success: true,
        output,
        task: {
          agent: request.agent,
          description: request.description,
          summary: firstLine(output),
          activity: lastActivity,
        },
      };
    } catch (err: unknown) {
      if (signal?.aborted) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      const output = `Task failed: ${msg}`;
      return {
        success: false,
        output,
        task: {
          agent: request.agent,
          description: request.description,
          summary: output,
          activity: lastActivity,
        },
      };
    }
  }

  private async runTask(request: TaskRequest, abortSignal?: AbortSignal): Promise<ToolResult> {
    try {
      return await this.runTaskRequest(request, (detail) => {
        if (abortSignal?.aborted) return;
        this.emitSubagentStatus({
          agent: request.agent,
          description: request.description,
          detail,
        });
      }, abortSignal);
    } finally {
      this.emitSubagentStatus(null);
    }
  }

  private async runDelegation(request: TaskRequest, abortSignal?: AbortSignal): Promise<ToolResult> {
    try {
      if (abortSignal?.aborted) {
        return { success: false, output: "[Cancelled]" };
      }

      return await this.delegations.start(request, {
        model: this.modelId,
        maxToolRounds: this.maxToolRounds,
        maxTokens: this.maxTokens,
      });
    } catch (err: unknown) {
      if (abortSignal?.aborted) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        output: `Delegation failed: ${msg}`,
      };
    }
  }

  private async readDelegation(id: string): Promise<ToolResult> {
    try {
      return {
        success: true,
        output: await this.delegations.read(id),
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        output: `Failed to read delegation: ${msg}`,
      };
    }
  }

  private async listDelegations(): Promise<ToolResult> {
    try {
      const delegations = await this.delegations.list();
      if (delegations.length === 0) {
        return {
          success: true,
          output: "No delegations found for this project.",
        };
      }

      const lines = delegations.map((delegation) => {
        const title = delegation.description || delegation.id;
        return `- \`${delegation.id}\` [${delegation.status}] ${title}\n  ${delegation.summary}`;
      });

      return {
        success: true,
        output: `## Delegations\n\n${lines.join("\n")}`,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        output: `Failed to list delegations: ${msg}`,
      };
    }
  }

  async *processMessage(userMessage: string): AsyncGenerator<StreamChunk, void, unknown> {
    this.abortController = new AbortController();
    const signal = this.abortController.signal;
    this.emitSubagentStatus(null);

    await this.consumeBackgroundNotifications();
    const userModelMessage: ModelMessage = { role: "user", content: userMessage };
    this.messages.push(userModelMessage);

    let assistantText = "";
    let streamOk = false;

    try {
      const provider = this.requireProvider();
      const tools = createTools(this.bash, provider, this.mode, {
        runTask: (request, abortSignal) => this.runTask(request, combineAbortSignals(signal, abortSignal)),
        runDelegation: (request, abortSignal) => this.runDelegation(request, combineAbortSignals(signal, abortSignal)),
        readDelegation: (id) => this.readDelegation(id),
        listDelegations: () => this.listDelegations(),
      });
      const system = buildSystemPrompt(this.bash.getCwd(), this.mode, this.planContext);
      this.planContext = null;

      const result = streamText({
        model: provider(this.modelId),
        system,
        messages: this.messages,
        tools,
        stopWhen: stepCountIs(this.maxToolRounds),
        maxRetries: 0,
        abortSignal: signal,
        temperature: 0.7,
        maxOutputTokens: this.maxTokens,
        onFinish: ({ totalUsage }) => {
          this.recordUsage(totalUsage, "message");
        },
      });

      for await (const part of result.fullStream) {
        if (signal.aborted) {
          yield { type: "content", content: "\n\n[Cancelled]" };
          break;
        }

        switch (part.type) {
          case "text-delta":
            assistantText += part.text;
            yield { type: "content", content: part.text };
            break;

          case "reasoning-delta":
            yield { type: "reasoning", content: part.text };
            break;

          case "tool-call": {
            const tc = toToolCall(part);
            yield { type: "tool_calls", toolCalls: [tc] };
            break;
          }

          case "tool-result": {
            const tc: ToolCall = {
              id: part.toolCallId,
              type: "function",
              function: { name: part.toolName, arguments: JSON.stringify(part.input ?? {}) },
            };
            const tr = toToolResult(part.output);
            yield { type: "tool_result", toolCall: tc, toolResult: tr };
            break;
          }

          case "error":
            yield { type: "error", content: String(part.error) };
            break;

          case "abort":
            yield { type: "content", content: "\n\n[Cancelled]" };
            break;
        }
      }

      if (signal.aborted) {
        this.discardAbortedTurn(userModelMessage);
        yield { type: "done" };
        return;
      }

      try {
        const response = await result.response;
        if (!signal.aborted) {
          this.messages.push(...response.messages);
          if (this.sessionStore && this.session) {
            appendMessages(this.session.id, [userModelMessage, ...response.messages]);
            this.sessionStore.touchSession(this.session.id, this.bash.getCwd());
            this.session = this.sessionStore.getRequiredSession(this.session.id);
          }
          streamOk = true;
        }
      } catch {
        // response promise can fail after stream errors — fall back to manual message
      }

      if (signal.aborted) {
        this.discardAbortedTurn(userModelMessage);
        yield { type: "done" };
        return;
      }

      if (!streamOk && assistantText.trim()) {
        const fallbackMessage: ModelMessage = { role: "assistant", content: assistantText };
        this.messages.push(fallbackMessage);
        if (this.sessionStore && this.session) {
          appendMessages(this.session.id, [userModelMessage, fallbackMessage]);
          this.sessionStore.touchSession(this.session.id, this.bash.getCwd());
          this.session = this.sessionStore.getRequiredSession(this.session.id);
        }
      }

      yield { type: "done" };
    } catch (err: unknown) {
      if (signal.aborted) {
        this.discardAbortedTurn(userModelMessage);
        yield { type: "content", content: "\n\n[Cancelled]" };
      } else {
        const msg = err instanceof Error ? err.message : String(err);
        yield { type: "error", content: `Error: ${msg}` };
      }
      if (!signal.aborted && assistantText.trim()) {
        const fallbackMessage: ModelMessage = { role: "assistant", content: assistantText };
        this.messages.push(fallbackMessage);
        if (this.sessionStore && this.session) {
          appendMessages(this.session.id, [userModelMessage, fallbackMessage]);
          this.sessionStore.touchSession(this.session.id, this.bash.getCwd());
          this.session = this.sessionStore.getRequiredSession(this.session.id);
        }
      }
      yield { type: "done" };
    } finally {
      if (this.abortController?.signal === signal) {
        this.abortController = null;
      }
    }
  }

  private requireProvider(): XaiProvider {
    if (!this.provider) {
      throw new Error("API key required. Add an API key to continue.");
    }

    return this.provider;
  }
}

function toToolCall(part: { toolCallId: string; toolName: string; args?: unknown; input?: unknown }): ToolCall {
  return {
    id: part.toolCallId,
    type: "function",
    function: {
      name: part.toolName,
      arguments: JSON.stringify(part.input ?? part.args ?? {}),
    },
  };
}

function toToolResult(output: unknown): ToolResult {
  if (output && typeof output === "object" && "success" in output) {
    const r = output as {
      success: boolean;
      output?: string;
      diff?: ToolResult["diff"];
      plan?: Plan;
      task?: ToolResult["task"];
      delegation?: ToolResult["delegation"];
      backgroundProcess?: ToolResult["backgroundProcess"];
    };
    return {
      success: r.success,
      output: r.output,
      error: r.success ? undefined : r.output,
      diff: r.diff,
      plan: r.plan,
      task: r.task,
      delegation: r.delegation,
      backgroundProcess: r.backgroundProcess,
    };
  }
  return { success: true, output: String(output) };
}

function formatSubagentActivity(toolName: string, args?: unknown): string {
  const parsed = parseToolArgs(args);
  if (toolName === "read_file") return `Read ${parsed.path || "file"}`;
  if (toolName === "write_file") return `Write ${parsed.path || "file"}`;
  if (toolName === "edit_file") return `Edit ${parsed.path || "file"}`;
  if (toolName === "search_web") return `Web search "${truncate(parsed.query || "", 50)}"`;
  if (toolName === "search_x") return `X search "${truncate(parsed.query || "", 50)}"`;
  if (toolName === "bash") return truncate(parsed.command || "Run command", 70);
  return truncate(`${toolName}`, 70);
}

function parseToolArgs(args: unknown): Record<string, string> {
  if (!args || typeof args !== "object") return {};
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(args)) {
    result[key] = typeof value === "string" ? value : JSON.stringify(value);
  }
  return result;
}

function firstLine(text: string): string {
  return text.trim().split("\n").find(Boolean)?.trim() || "Task completed.";
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function combineAbortSignals(...signals: Array<AbortSignal | undefined>): AbortSignal | undefined {
  const activeSignals = signals.filter((signal): signal is AbortSignal => Boolean(signal));
  if (activeSignals.length === 0) return undefined;
  if (activeSignals.length === 1) return activeSignals[0];

  if (typeof AbortSignal.any === "function") {
    return AbortSignal.any(activeSignals);
  }

  const controller = new AbortController();
  for (const signal of activeSignals) {
    if (signal.aborted) {
      controller.abort();
      break;
    }

    signal.addEventListener("abort", () => controller.abort(), { once: true });
  }

  return controller.signal;
}
