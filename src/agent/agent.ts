import { type ModelMessage, stepCountIs, streamText, type ToolSet } from "ai";
import { createProvider, generateTitle as genTitle, resolveModelRuntime, type XaiProvider } from "../grok/client";
import { DEFAULT_MODEL, getModelInfo, normalizeModelId } from "../grok/models";
import { createTools } from "../grok/tools";
import { buildMcpToolSet } from "../mcp/runtime";
import {
  appendCompaction,
  appendMessages,
  appendSystemMessage,
  buildChatEntries,
  getNextMessageSequence,
  getSessionTotalTokens,
  loadTranscript,
  loadTranscriptState,
  recordUsageEvent,
  SessionStore,
} from "../storage/index";
import { BashTool } from "../tools/bash";
import { type ScheduleDaemonStatus, ScheduleManager, type StoredSchedule } from "../tools/schedule";
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
import { loadCustomInstructions } from "../utils/instructions";
import { type CustomSubagentConfig, loadMcpServers, loadValidSubAgents, type SandboxMode } from "../utils/settings";
import { discoverSkills, formatSkillsForPrompt } from "../utils/skills";
import {
  type CompactionSettings,
  createCompactionSummaryMessage,
  DEFAULT_KEEP_RECENT_TOKENS,
  DEFAULT_RESERVE_TOKENS,
  estimateConversationTokens,
  generateCompactionSummary,
  prepareCompaction,
  relaxCompactionSettings,
  shouldCompactContext,
} from "./compaction";
import { DelegationManager } from "./delegations";
import { containsEncryptedReasoning, sanitizeModelMessages } from "./reasoning";
import { buildVisionUserMessages } from "./vision-input";

const MAX_TOOL_ROUNDS = 400;
const VISION_MODEL = "grok-4-1-fast-reasoning";

interface AgentOptions {
  persistSession?: boolean;
  session?: string;
  sandboxMode?: SandboxMode;
}

type ProcessMessageFinishReason = "stop" | "length" | "content-filter" | "tool-calls" | "error" | "other";

export interface ProcessMessageUsage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
}

export interface ProcessMessageStepStart {
  stepNumber: number;
  timestamp: number;
}

export interface ProcessMessageStepFinish {
  stepNumber: number;
  timestamp: number;
  finishReason: ProcessMessageFinishReason;
  usage: ProcessMessageUsage;
}

export interface ProcessMessageToolStart {
  toolCall: ToolCall;
  timestamp: number;
}

export interface ProcessMessageToolFinish {
  toolCall: ToolCall;
  toolResult: ToolResult;
  timestamp: number;
}

export interface ProcessMessageError {
  message: string;
  timestamp: number;
}

export interface ProcessMessageObserver {
  onStepStart?(info: ProcessMessageStepStart): void;
  onStepFinish?(info: ProcessMessageStepFinish): void;
  onToolStart?(info: ProcessMessageToolStart): void;
  onToolFinish?(info: ProcessMessageToolFinish): void;
  onError?(info: ProcessMessageError): void;
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
- task: Delegate a focused foreground task to a sub-agent. Use general for multi-step execution, explore for fast read-only research, or a configured custom sub-agent name when listed under CUSTOM SUB-AGENTS.
- delegate: Launch a read-only background agent for longer research while you continue working.
- delegation_read: Retrieve a completed background delegation result by ID.
- delegation_list: List running and completed background delegations. Do not poll it repeatedly.
- schedule_create: Create a recurring or one-time scheduled headless run.
- schedule_list: List saved schedules and their status.
- schedule_remove: Remove a saved schedule.
- schedule_read_log: Read recent log output from a schedule.
- schedule_daemon_status: Check whether the schedule daemon is running.
- schedule_daemon_start: Start the schedule daemon in the background.
- schedule_daemon_stop: Stop the schedule daemon.
- search_web: Search the web for current information, documentation, APIs, tutorials, etc.
- search_x: Search X/Twitter for real-time posts, discussions, opinions, and trends.
- generate_image: Generate a new image or edit an existing image. It saves image files locally and returns their paths.
- generate_video: Generate a new video or animate an existing image. It saves video files locally and returns their paths.
- MCP tools: Enabled servers appear as tools named like mcp_<server>__<tool>.

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
- Use a matching custom sub-agent when the task fits one of the configured specializations.
- Never use delegate for tasks that should edit files or make shell changes.
- When a background delegation is running, do not wait idly and do not spam delegation_list(). Continue useful work.
- Do not wait for the user to explicitly ask for a sub-agent when delegation would clearly help.
- Skip delegation only when the task is trivial, single-file, or you already have the exact answer.

EXAMPLES:
- "review this change" -> delegate to explore first
- "research how auth works" -> delegate to explore first
- "investigate why this test fails" -> delegate to explore first, then continue with findings
- "refactor this module" -> delegate a focused part to general when helpful
- "generate a logo" -> use generate_image
- "animate this still image" -> use generate_video
- Recurring specialized workflows -> use the matching custom sub-agent via task
- "every weekday at 9am run this check" -> use schedule_create with a cron expression
- "run this once automatically" -> use schedule_create with the right timing
- "make sure scheduled jobs keep running" -> use schedule_daemon_status and schedule_daemon_start

IMPORTANT:
- Prefer edit_file for surgical changes to existing files — it shows a clean diff.
- Use write_file only for new files or when most of the file is changing.
- Use read_file instead of cat/head/tail for reading files.
- When the user asks for an automated recurring or one-time run, use the schedule tools instead of only describing the setup.
- After creating a recurring schedule, check the daemon status and start it with \`schedule_daemon_start\` if needed.

Be direct. Execute, don't just describe. Show results, not plans.`,

  plan: `You are Grok CLI in Plan mode — you analyze and plan but DO NOT execute changes.

${ENVIRONMENT}

TOOLS:
- read_file: Read file contents for analysis.
- bash: ONLY for searching (find, grep, ls) — NEVER modify files.
- task: Delegate a focused task to a sub-agent when deeper research or specialized analysis would help.
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
- task: Delegate a focused task to a sub-agent when specialized analysis or deeper investigation would help.

BEHAVIOR:
- Answer the user's question directly and thoroughly
- Use tools to gather context when needed
- Provide code examples when helpful
- NEVER create, modify, or delete files
- Focus on explanation, not execution`,
};

function findCustomSubagent(
  agent: string,
  subagents: CustomSubagentConfig[] = loadValidSubAgents(),
): CustomSubagentConfig | undefined {
  return (
    subagents.find((item) => item.name === agent) ??
    subagents.find((item) => item.name.toLowerCase() === agent.toLowerCase())
  );
}

function formatCustomSubagentsPromptSection(subagents: CustomSubagentConfig[]): string {
  if (subagents.length === 0) return "";

  const lines = subagents.map((agent) => {
    const instruction = agent.instruction.trim() || "(none)";
    return `### ${agent.name}\n- model: ${agent.model}\n- instruction:\n${instruction}`;
  });

  return `\n\nCUSTOM SUB-AGENTS:\nUser-defined foreground sub-agents from ~/.grok/user-settings.json. When one matches the task, call the task tool with agent set to the exact name.\n\n${lines.join("\n\n")}\n`;
}

function buildSystemPrompt(
  cwd: string,
  mode: AgentMode,
  sandboxMode: SandboxMode,
  planContext?: string | null,
  subagents?: CustomSubagentConfig[],
): string {
  const custom = loadCustomInstructions(cwd);
  const customSection = custom
    ? `\n\nCUSTOM INSTRUCTIONS:\n${custom}\n\nFollow the above alongside standard instructions.\n`
    : "";

  const skillsText = formatSkillsForPrompt(discoverSkills(cwd));
  const skillsSection = skillsText ? `\n\n${skillsText}\n` : "";
  const subagentsSection = formatCustomSubagentsPromptSection(subagents ?? loadValidSubAgents());
  const sandboxSection = formatSandboxPromptSection(sandboxMode);

  const planSection = planContext
    ? `\n\nAPPROVED PLAN:\nThe following plan has been approved by the user. Execute it now.\n${planContext}\n`
    : "";

  return `${MODE_PROMPTS[mode]}${sandboxSection}${customSection}${skillsSection}${subagentsSection}${planSection}

Current working directory: ${cwd}`;
}

function buildSubagentPrompt(
  request: TaskRequest,
  cwd: string,
  custom: CustomSubagentConfig | null,
  sandboxMode: SandboxMode,
  subagents?: CustomSubagentConfig[],
): string {
  const isExplore = request.agent === "explore";
  const isVision = request.agent === "vision";
  const mode: AgentMode = isExplore ? "ask" : "agent";
  const role = custom
    ? `You are the custom sub-agent "${custom.name}". You can investigate, edit files, and run commands unless the delegated task says otherwise.`
    : request.agent === "explore"
      ? "You are the Explore sub-agent. You are read-only and focus on fast codebase research."
      : isVision
        ? "You are the Vision sub-agent."
        : "You are the General sub-agent. You can investigate, edit files, and run commands to complete delegated work.";

  const rules = isExplore
    ? [
        "Do not create, modify, or delete files.",
        "Prefer `read_file` and search commands over broad shell exploration.",
        "Return concise findings for the parent agent.",
      ]
    : isVision
      ? ["Validate the image."]
      : [
          "Work only on the delegated task below.",
          "Use tools directly instead of narrating your intent.",
          "Return a concise summary for the parent agent with key outcomes and any open risks.",
        ];

  const instructionLines = custom?.instruction.trim() ? ["", "SUB-AGENT INSTRUCTIONS:", custom.instruction.trim()] : [];

  return [
    role,
    ...instructionLines,
    "",
    "You are helping a parent agent. Do not address the end user directly.",
    "Focus tightly on the delegated scope and summarize what matters back to the parent agent.",
    "",
    ...rules,
    "",
    `Delegated task: ${request.description}`,
    "",
    buildSystemPrompt(cwd, mode, sandboxMode, undefined, subagents),
  ].join("\n");
}

function formatSandboxPromptSection(sandboxMode: SandboxMode): string {
  if (sandboxMode === "off") return "";
  return [
    "",
    "SANDBOX MODE:",
    "- Bash commands run inside a Shuru sandbox.",
    "- Network is disabled by default unless the current workspace config allows it.",
    "- The current workspace is mounted inside the sandbox at `/workspace`.",
    "- Shell-side workspace file changes do not persist back to the host in this version.",
    "- Use `read_file`, `edit_file`, and `write_file` for durable source edits.",
    "- If a task needs a host-persistent shell mutation, explain that sandbox mode blocks that workflow and ask whether to disable sandbox mode.",
  ].join("\n");
}

function applyModelConstraints(system: string, modelId: string): string {
  const modelInfo = getModelInfo(modelId);
  if (modelInfo?.supportsClientTools !== false) {
    return system;
  }

  return [
    system,
    "",
    "MODEL CONSTRAINTS:",
    "- The selected model does not support client-side CLI tool calls in this environment.",
    "- Do not call bash, read_file, write_file, edit_file, task, delegate, delegation, or MCP tools.",
    "- Answer directly using only the conversation context already provided.",
  ].join("\n");
}

export class Agent {
  private provider: XaiProvider | null = null;
  private apiKey: string | null = null;
  private baseURL: string | null = null;
  private bash: BashTool;
  private delegations: DelegationManager;
  private schedules: ScheduleManager;
  private sessionStore: SessionStore | null = null;
  private workspace: WorkspaceInfo | null = null;
  private session: SessionInfo | null = null;
  private messages: ModelMessage[] = [];
  private messageSeqs: Array<number | null> = [];
  private abortController: AbortController | null = null;
  private maxToolRounds: number;
  private mode: AgentMode = "agent";
  private modelId: string;
  private maxTokens: number;
  private planContext: string | null = null;
  private subagentStatusListeners = new Set<(status: SubagentStatus | null) => void>();
  private sendTelegramFile: ((filePath: string) => Promise<ToolResult>) | null = null;

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
    this.bash = new BashTool(process.cwd(), { sandboxMode: options.sandboxMode ?? "off" });
    this.delegations = new DelegationManager(() => this.bash.getCwd());
    this.modelId = normalizeModelId(model || DEFAULT_MODEL);
    this.schedules = new ScheduleManager(
      () => this.bash.getCwd(),
      () => this.modelId,
    );
    this.maxToolRounds = maxToolRounds || MAX_TOOL_ROUNDS;
    const envMax = Number(process.env.GROK_MAX_TOKENS);
    this.maxTokens = Number.isFinite(envMax) && envMax > 0 ? envMax : 16_384;

    if (options.persistSession !== false) {
      this.sessionStore = new SessionStore(this.bash.getCwd());
      this.workspace = this.sessionStore.getWorkspace();
      this.session = this.sessionStore.openSession(options.session, this.modelId, this.mode, this.bash.getCwd());
      this.mode = this.session.mode;
      const transcript = loadTranscriptState(this.session.id);
      this.messages = transcript.messages;
      this.messageSeqs = transcript.seqs;
      this.sessionStore.setModel(this.session.id, this.modelId);
    }
  }

  getModel(): string {
    return this.modelId;
  }

  setModel(model: string): void {
    this.modelId = normalizeModelId(model);
    if (this.sessionStore && this.session) {
      this.sessionStore.setModel(this.session.id, this.modelId);
      this.session = this.sessionStore.getRequiredSession(this.session.id);
    }
  }

  getMode(): AgentMode {
    return this.mode;
  }

  getSandboxMode(): SandboxMode {
    return this.bash.getSandboxMode();
  }

  setSandboxMode(mode: SandboxMode): void {
    this.bash.setSandboxMode(mode);
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

  setSendTelegramFile(fn: ((filePath: string) => Promise<ToolResult>) | null): void {
    this.sendTelegramFile = fn;
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

  async listSchedules(): Promise<StoredSchedule[]> {
    return this.schedules.list();
  }

  async removeSchedule(id: string): Promise<string> {
    const removed = await this.schedules.remove(id);
    return removed ? `Removed schedule "${removed.name}".` : `Schedule "${id}" not found.`;
  }

  async getScheduleDaemonStatus(): Promise<ScheduleDaemonStatus> {
    return this.schedules.getDaemonStatus();
  }

  getContextStats(
    contextWindow: number,
    inFlightText = "",
  ): {
    contextWindow: number;
    usedTokens: number;
    remainingTokens: number;
    ratioUsed: number;
    ratioRemaining: number;
  } {
    const system = buildSystemPrompt(this.bash.getCwd(), this.mode, this.bash.getSandboxMode(), this.planContext);
    const usedTokens = Math.min(contextWindow, estimateConversationTokens(system, this.messages, inFlightText));
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
    this.recordUsage(generated.usage, "title", generated.modelId);
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
      this.messageSeqs = [];
      return null;
    }

    this.sessionStore = new SessionStore(this.bash.getCwd());
    this.workspace = this.sessionStore.getWorkspace();
    this.session = this.sessionStore.createSession(this.modelId, this.mode, this.bash.getCwd());
    this.messages = [];
    this.messageSeqs = [];
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
      this.messageSeqs.splice(idx, 1);
    }
  }

  private recordUsage(
    usage?: { totalTokens?: number; inputTokens?: number; outputTokens?: number },
    source: UsageSource = "message",
    model = this.modelId,
  ): void {
    if (!usage) return;
    if (this.session) {
      recordUsageEvent(this.session.id, source, model, usage);
    }
  }

  async consumeBackgroundNotifications(): Promise<string[]> {
    try {
      const notifications = await this.delegations.consumeNotifications();
      for (const notification of notifications) {
        this.messages.push({ role: "system", content: notification.message });
        let seq: number | null = null;
        if (this.session) {
          seq = appendSystemMessage(this.session.id, notification.message);
        }
        this.messageSeqs.push(seq);
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
    const agentKey = String(request.agent);
    const isExplore = agentKey === "explore";
    const isGeneral = agentKey === "general";
    const isVision = agentKey === "vision";
    const subagents = loadValidSubAgents();
    const custom = !isExplore && !isGeneral && !isVision ? findCustomSubagent(agentKey, subagents) : undefined;

    if (!isExplore && !isGeneral && !isVision && !custom) {
      const message = `Unknown sub-agent "${agentKey}". Use general, explore, vision, or a configured name from ~/.grok/user-settings.json.`;
      return {
        success: false,
        output: message,
        task: {
          agent: agentKey,
          description: request.description,
          summary: message,
        },
      };
    }

    const childMode: AgentMode = isExplore ? "ask" : "agent";
    const childBash = new BashTool(this.bash.getCwd(), { sandboxMode: this.bash.getSandboxMode() });
    const childBaseTools = createTools(childBash, provider, childMode);
    const initialDetail = isExplore ? "Scanning the codebase" : "Planning delegated work";
    let assistantText = "";
    let lastActivity = initialDetail;
    let childTools: ToolSet = childBaseTools;
    let closeMcp: (() => Promise<void>) | undefined;
    const childModelId = normalizeModelId(
      isVision ? VISION_MODEL : isExplore ? DEFAULT_MODEL : custom ? custom.model : this.modelId,
    );
    const childRuntime = isVision
      ? { ...resolveModelRuntime(provider, childModelId), model: provider.responses(childModelId) }
      : resolveModelRuntime(provider, childModelId);
    const childSystem = applyModelConstraints(
      buildSubagentPrompt(request, childBash.getCwd(), custom ?? null, childBash.getSandboxMode(), subagents),
      childRuntime.modelId,
    );

    onActivity?.(initialDetail);

    try {
      if (childMode === "agent" && childRuntime.modelInfo?.supportsClientTools !== false) {
        const mcpBundle = await buildMcpToolSet(loadMcpServers());
        closeMcp = mcpBundle.close;
        childTools = { ...childBaseTools, ...mcpBundle.tools };
        if (mcpBundle.errors.length > 0) {
          lastActivity = `MCP unavailable: ${mcpBundle.errors.join(" | ")}`;
          onActivity?.(lastActivity);
        }
      }

      const childMessages = isVision
        ? await buildVisionUserMessages(request.prompt, childBash.getCwd(), signal)
        : [{ role: "user" as const, content: request.prompt }];

      const result = streamText({
        model: childRuntime.model,
        system: childSystem,
        messages: childMessages,
        tools: childRuntime.modelInfo?.supportsClientTools === false ? {} : childTools,
        stopWhen: stepCountIs(Math.min(this.maxToolRounds, isExplore ? 60 : 120)),
        maxRetries: 0,
        abortSignal: signal,
        temperature: isExplore ? 0.2 : 0.5,
        ...(childRuntime.modelInfo?.supportsMaxOutputTokens === false
          ? {}
          : { maxOutputTokens: Math.min(this.maxTokens, 8_192) }),
        ...(childRuntime.providerOptions ? { providerOptions: childRuntime.providerOptions } : {}),
        onFinish: ({ totalUsage }) => {
          this.recordUsage(totalUsage, "task", childRuntime.modelId);
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
    } finally {
      await closeMcp?.().catch(() => {});
    }
  }

  private async runTask(request: TaskRequest, abortSignal?: AbortSignal): Promise<ToolResult> {
    try {
      return await this.runTaskRequest(
        request,
        (detail) => {
          if (abortSignal?.aborted) return;
          this.emitSubagentStatus({
            agent: request.agent,
            description: request.description,
            detail,
          });
        },
        abortSignal,
      );
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
        sandboxMode: this.bash.getSandboxMode(),
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

  private getCompactionSettings(): CompactionSettings {
    return {
      reserveTokens: Math.max(this.maxTokens, DEFAULT_RESERVE_TOKENS),
      keepRecentTokens: DEFAULT_KEEP_RECENT_TOKENS,
    };
  }

  private async compactForContext(
    provider: XaiProvider,
    system: string,
    contextWindow: number,
    signal: AbortSignal,
    settings = this.getCompactionSettings(),
    force = false,
  ): Promise<boolean> {
    if (!this.session) return false;

    const preparation = prepareCompaction(this.messages, system, settings);
    if (!preparation) return false;
    if (!force && !shouldCompactContext(preparation.tokensBefore, contextWindow, settings)) {
      return false;
    }

    const keptSeqs = this.messageSeqs.slice(preparation.firstKeptIndex);
    const firstKeptSeq = keptSeqs.find((seq): seq is number => seq !== null) ?? getNextMessageSequence(this.session.id);
    const summary = await generateCompactionSummary(provider, this.modelId, preparation, undefined, signal);

    appendCompaction(this.session.id, firstKeptSeq, summary, preparation.tokensBefore);
    this.messages = [createCompactionSummaryMessage(summary), ...preparation.keptMessages];
    this.messageSeqs = [null, ...keptSeqs];
    return true;
  }

  private appendCompletedTurn(userMessage: ModelMessage, newMessages: ModelMessage[]): void {
    if (newMessages.length === 0) return;

    const userIndex = this.messages.lastIndexOf(userMessage);
    if (!this.sessionStore || !this.session) {
      if (userIndex >= 0 && this.messageSeqs[userIndex] == null) {
        this.messageSeqs[userIndex] = null;
      }
      this.messages.push(...newMessages);
      this.messageSeqs.push(...newMessages.map(() => null));
      return;
    }

    const insertedSeqs = appendMessages(this.session.id, [userMessage, ...newMessages]);
    if (userIndex >= 0) {
      this.messageSeqs[userIndex] = insertedSeqs[0] ?? this.messageSeqs[userIndex];
    }
    this.messages.push(...newMessages);
    this.messageSeqs.push(...insertedSeqs.slice(1));
    this.sessionStore.touchSession(this.session.id, this.bash.getCwd());
    this.session = this.sessionStore.getRequiredSession(this.session.id);
  }

  async *processMessage(
    userMessage: string,
    observer?: ProcessMessageObserver,
  ): AsyncGenerator<StreamChunk, void, unknown> {
    this.abortController = new AbortController();
    const signal = this.abortController.signal;
    this.emitSubagentStatus(null);

    await this.consumeBackgroundNotifications();
    const userModelMessage: ModelMessage = { role: "user", content: userMessage };
    this.messages.push(userModelMessage);
    this.messageSeqs.push(null);

    const provider = this.requireProvider();
    const subagents = loadValidSubAgents();
    const system = applyModelConstraints(
      buildSystemPrompt(this.bash.getCwd(), this.mode, this.bash.getSandboxMode(), this.planContext, subagents),
      this.modelId,
    );
    const runtime = resolveModelRuntime(provider, this.modelId);
    const modelInfo = runtime.modelInfo;
    this.planContext = null;
    let attemptedOverflowRecovery = false;

    try {
      while (true) {
        let assistantText = "";
        let reasoningPreview = "";
        let encryptedReasoningHidden = false;
        let streamOk = false;
        let closeMcp: (() => Promise<void>) | undefined;
        let stepNumber = -1;

        try {
          const settings = attemptedOverflowRecovery
            ? relaxCompactionSettings(this.getCompactionSettings())
            : this.getCompactionSettings();
          if (modelInfo) {
            await this.compactForContext(
              provider,
              system,
              modelInfo.contextWindow,
              signal,
              settings,
              attemptedOverflowRecovery,
            );
          }

          const baseTools = createTools(this.bash, provider, this.mode, {
            runTask: (request, abortSignal) => this.runTask(request, combineAbortSignals(signal, abortSignal)),
            runDelegation: (request, abortSignal) =>
              this.runDelegation(request, combineAbortSignals(signal, abortSignal)),
            readDelegation: (id) => this.readDelegation(id),
            listDelegations: () => this.listDelegations(),
            scheduleManager: this.schedules,
            subagents,
            sendTelegramFile: this.sendTelegramFile ?? undefined,
          });
          let tools: ToolSet = runtime.modelInfo?.supportsClientTools === false ? {} : baseTools;
          if (this.mode === "agent" && runtime.modelInfo?.supportsClientTools !== false) {
            const mcpBundle = await buildMcpToolSet(loadMcpServers());
            closeMcp = mcpBundle.close;
            tools = { ...baseTools, ...mcpBundle.tools };
            if (mcpBundle.errors.length > 0) {
              yield { type: "content", content: `MCP unavailable: ${mcpBundle.errors.join(" | ")}\n\n` };
            }
          }

          const result = streamText({
            model: runtime.model,
            system,
            messages: this.messages,
            tools,
            stopWhen: stepCountIs(this.maxToolRounds),
            maxRetries: 0,
            abortSignal: signal,
            temperature: 0.7,
            ...(runtime.modelInfo?.supportsMaxOutputTokens === false ? {} : { maxOutputTokens: this.maxTokens }),
            ...(runtime.providerOptions ? { providerOptions: runtime.providerOptions } : {}),
            experimental_onStepStart: (event: unknown) => {
              stepNumber = getStepNumber(event, stepNumber + 1);
              notifyObserver(observer?.onStepStart, {
                stepNumber,
                timestamp: Date.now(),
              });
            },
            onStepFinish: (event: unknown) => {
              const currentStep = getStepNumber(event, Math.max(stepNumber, 0));
              stepNumber = Math.max(stepNumber, currentStep);
              notifyObserver(observer?.onStepFinish, {
                stepNumber: currentStep,
                timestamp: Date.now(),
                finishReason: getFinishReason(event),
                usage: getUsage(event),
              });
            },
            onFinish: ({ totalUsage }) => {
              this.recordUsage(totalUsage, "message", runtime.modelId);
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
                reasoningPreview = `${reasoningPreview}${part.text}`.slice(-256);
                if (containsEncryptedReasoning(reasoningPreview)) {
                  if (!encryptedReasoningHidden) {
                    encryptedReasoningHidden = true;
                    yield { type: "reasoning", content: "[Encrypted reasoning hidden]" };
                  }
                  break;
                }
                yield { type: "reasoning", content: part.text };
                break;

              case "tool-call": {
                const tc = toToolCall(part);
                notifyObserver(observer?.onToolStart, {
                  toolCall: tc,
                  timestamp: Date.now(),
                });
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
                notifyObserver(observer?.onToolFinish, {
                  toolCall: tc,
                  toolResult: tr,
                  timestamp: Date.now(),
                });
                yield { type: "tool_result", toolCall: tc, toolResult: tr };
                break;
              }

              case "error": {
                const message = String(part.error);
                notifyObserver(observer?.onError, {
                  message,
                  timestamp: Date.now(),
                });
                yield { type: "error", content: message };
                break;
              }

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
              this.appendCompletedTurn(userModelMessage, sanitizeModelMessages(response.messages));
              streamOk = true;
            }
          } catch (responseError: unknown) {
            if (
              !attemptedOverflowRecovery &&
              !assistantText.trim() &&
              modelInfo &&
              isContextLimitError(responseError)
            ) {
              attemptedOverflowRecovery = true;
              continue;
            }
          }

          if (signal.aborted) {
            this.discardAbortedTurn(userModelMessage);
            yield { type: "done" };
            return;
          }

          if (!streamOk && assistantText.trim()) {
            this.appendCompletedTurn(userModelMessage, [{ role: "assistant", content: assistantText }]);
          }

          yield { type: "done" };
          return;
        } catch (err: unknown) {
          if (signal.aborted) {
            this.discardAbortedTurn(userModelMessage);
            yield { type: "content", content: "\n\n[Cancelled]" };
            yield { type: "done" };
            return;
          }

          if (!attemptedOverflowRecovery && !assistantText.trim() && modelInfo && isContextLimitError(err)) {
            attemptedOverflowRecovery = true;
            continue;
          }

          const msg = err instanceof Error ? err.message : String(err);
          notifyObserver(observer?.onError, {
            message: `Error: ${msg}`,
            timestamp: Date.now(),
          });
          yield { type: "error", content: `Error: ${msg}` };
          if (assistantText.trim()) {
            this.appendCompletedTurn(userModelMessage, [{ role: "assistant", content: assistantText }]);
          }
          yield { type: "done" };
          return;
        } finally {
          await closeMcp?.().catch(() => {});
        }
      }
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

function notifyObserver<T>(listener: ((payload: T) => void) | undefined, payload: T): void {
  if (!listener) {
    return;
  }

  try {
    listener(payload);
  } catch {
    // Observer failures should never break generation.
  }
}

function getStepNumber(event: unknown, fallback: number): number {
  if (event && typeof event === "object" && "stepNumber" in event && typeof event.stepNumber === "number") {
    return event.stepNumber;
  }

  return fallback;
}

function getFinishReason(event: unknown): ProcessMessageFinishReason {
  if (event && typeof event === "object" && "finishReason" in event) {
    switch (event.finishReason) {
      case "stop":
      case "length":
      case "content-filter":
      case "tool-calls":
      case "error":
      case "other":
        return event.finishReason;
    }
  }

  return "other";
}

function getUsage(event: unknown): ProcessMessageUsage {
  if (!(event && typeof event === "object" && "usage" in event)) {
    return {};
  }

  const usage = event.usage;
  if (!usage || typeof usage !== "object") {
    return {};
  }

  const u = usage as Record<string, unknown>;
  return {
    inputTokens: typeof u.inputTokens === "number" ? u.inputTokens : undefined,
    outputTokens: typeof u.outputTokens === "number" ? u.outputTokens : undefined,
    totalTokens: typeof u.totalTokens === "number" ? u.totalTokens : undefined,
  };
}

function toToolResult(output: unknown): ToolResult {
  if (output && typeof output === "object" && "success" in output) {
    const r = output as {
      success: boolean;
      output?: string;
      error?: string;
      diff?: ToolResult["diff"];
      plan?: Plan;
      task?: ToolResult["task"];
      delegation?: ToolResult["delegation"];
      backgroundProcess?: ToolResult["backgroundProcess"];
      media?: ToolResult["media"];
    };
    return {
      success: r.success,
      output: r.output,
      error: r.error ?? (r.success ? undefined : r.output),
      diff: r.diff,
      plan: r.plan,
      task: r.task,
      delegation: r.delegation,
      backgroundProcess: r.backgroundProcess,
      media: r.media,
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
  if (toolName === "generate_image") return `Generate image "${truncate(parsed.prompt || "", 50)}"`;
  if (toolName === "generate_video") return `Generate video "${truncate(parsed.prompt || "", 50)}"`;
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

function isContextLimitError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /(context|token|prompt).*(limit|length|large|window|overflow)|too many tokens|maximum context/i.test(message);
}
