import { streamText, stepCountIs, type ModelMessage } from "ai";
import { createProvider, generateTitle as genTitle, type XaiProvider } from "../grok/client.js";
import { createTools } from "../grok/tools.js";
import { BashTool } from "../tools/bash.js";
import { loadCustomInstructions } from "../utils/instructions.js";
import type { AgentMode, Plan, StreamChunk, ToolCall, ToolResult } from "../types/index.js";

const MAX_TOOL_ROUNDS = 400;

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
- bash: Execute shell commands — searching (grep/rg/find), git, builds, tests, package managers, etc.
- search_web: Search the web for current information, documentation, APIs, tutorials, etc.
- search_x: Search X/Twitter for real-time posts, discussions, opinions, and trends.

WORKFLOW:
1. Understand the request
2. Use read_file and bash to explore the codebase
3. Use edit_file for targeted changes, write_file for new files or full rewrites
4. Verify changes by reading modified files
5. Run tests or builds with bash to confirm correctness
6. Use search_web or search_x when you need up-to-date information

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

function buildSystemPrompt(cwd: string, mode: AgentMode): string {
  const custom = loadCustomInstructions();
  const customSection = custom
    ? `\n\nCUSTOM INSTRUCTIONS:\n${custom}\n\nFollow the above alongside standard instructions.\n`
    : "";

  return `${MODE_PROMPTS[mode]}${customSection}

Current working directory: ${cwd}`;
}

export class Agent {
  private provider: XaiProvider;
  private bash: BashTool;
  private messages: ModelMessage[] = [];
  private abortController: AbortController | null = null;
  private maxToolRounds: number;
  private mode: AgentMode = "agent";
  private modelId: string;
  private maxTokens: number;

  constructor(apiKey: string, baseURL?: string, model?: string, maxToolRounds?: number) {
    this.provider = createProvider(apiKey, baseURL);
    this.bash = new BashTool();
    this.modelId = model || "grok-4-1-fast";
    this.maxToolRounds = maxToolRounds || MAX_TOOL_ROUNDS;
    const envMax = Number(process.env.GROK_MAX_TOKENS);
    this.maxTokens = Number.isFinite(envMax) && envMax > 0 ? envMax : 16_384;
  }

  getModel(): string {
    return this.modelId;
  }

  setModel(model: string): void {
    this.modelId = model;
  }

  getMode(): AgentMode {
    return this.mode;
  }

  setMode(mode: AgentMode): void {
    this.mode = mode;
  }

  getCwd(): string {
    return this.bash.getCwd();
  }

  async generateTitle(userMessage: string): Promise<string> {
    return genTitle(this.provider, userMessage);
  }

  abort(): void {
    this.abortController?.abort();
  }

  clearHistory(): void {
    this.messages = [];
  }

  async *processMessage(userMessage: string): AsyncGenerator<StreamChunk, void, unknown> {
    this.abortController = new AbortController();

    this.messages.push({ role: "user", content: userMessage });

    let assistantText = "";
    let streamOk = false;

    try {
      const tools = createTools(this.bash, this.provider);
      const system = buildSystemPrompt(this.bash.getCwd(), this.mode);

      const result = streamText({
        model: this.provider(this.modelId),
        system,
        messages: this.messages,
        tools,
        stopWhen: stepCountIs(this.maxToolRounds),
        maxRetries: 0,
        abortSignal: this.abortController.signal,
        temperature: 0.7,
        maxOutputTokens: this.maxTokens,
      });

      for await (const part of result.fullStream) {
        if (this.abortController.signal.aborted) {
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
        }
      }

      try {
        const response = await result.response;
        this.messages.push(...response.messages);
        streamOk = true;
      } catch {
        // response promise can fail after stream errors — fall back to manual message
      }

      if (!streamOk && assistantText.trim()) {
        this.messages.push({ role: "assistant", content: assistantText });
      }

      yield { type: "done" };
    } catch (err: unknown) {
      if (this.abortController.signal.aborted) {
        yield { type: "content", content: "\n\n[Cancelled]" };
      } else {
        const msg = err instanceof Error ? err.message : String(err);
        yield { type: "error", content: `Error: ${msg}` };
      }
      if (assistantText.trim()) {
        this.messages.push({ role: "assistant", content: assistantText });
      }
      yield { type: "done" };
    } finally {
      this.abortController = null;
    }
  }
}

function toToolCall(part: { toolCallId: string; toolName: string; args?: unknown }): ToolCall {
  return {
    id: part.toolCallId,
    type: "function",
    function: {
      name: part.toolName,
      arguments: JSON.stringify(part.args ?? {}),
    },
  };
}

function toToolResult(output: unknown): ToolResult {
  if (output && typeof output === "object" && "success" in output) {
    const r = output as { success: boolean; output?: string; diff?: ToolResult["diff"]; plan?: Plan };
    return {
      success: r.success,
      output: r.output,
      error: r.success ? undefined : r.output,
      diff: r.diff,
      plan: r.plan,
    };
  }
  return { success: true, output: String(output) };
}
