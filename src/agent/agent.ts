import { GrokClient } from "../grok/client.js";
import { TOOLS } from "../grok/tools.js";
import { BashTool } from "../tools/bash.js";
import { loadCustomInstructions } from "../utils/instructions.js";
import type { AgentMode, ChatEntry, Message, StreamChunk, ToolCall, ToolResult } from "../types/index.js";

const MAX_TOOL_ROUNDS = 400;

const MODE_PROMPTS: Record<AgentMode, string> = {
  agent: `You are Grok CLI in Agent mode — a powerful AI coding agent. You execute tasks directly using tools.

TOOLS:
- bash: Execute any shell command — viewing files, editing (sed/tee/heredocs), searching (grep/rg/find), git, builds, packages.
- search_web: Real-time web search for documentation, APIs, current events.
- search_x: Search X (Twitter) for posts, discussions, trends.

WORKFLOW:
1. Understand the request
2. Use bash to explore and understand the codebase
3. Make changes using bash commands
4. Verify changes by reading modified files
5. Run tests or builds to confirm correctness

Be direct. Execute, don't just describe. Show results, not plans.`,

  plan: `You are Grok CLI in Plan mode — you analyze and plan but DO NOT execute changes.

TOOLS:
- bash: ONLY use for reading files (cat, head, tail, find, ls, grep) — NEVER modify files.
- search_web: Research documentation and current information.
- search_x: Research discussions and community sentiment.

BEHAVIOR:
- Create a detailed, step-by-step implementation plan
- Identify files that need changes and describe the specific edits
- Highlight potential risks, edge cases, and dependencies
- Suggest a testing strategy
- NEVER create, modify, or delete files — only read and analyze

Format your plan with clear numbered steps and file paths.`,

  ask: `You are Grok CLI in Ask mode — you answer questions clearly and thoroughly.

TOOLS:
- bash: ONLY for reading files to provide context (cat, find, ls, grep) — NEVER modify.
- search_web: Look up documentation and current information.
- search_x: Research discussions and trends.

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
  private client: GrokClient;
  private bash: BashTool;
  private messages: Message[] = [];
  private history: ChatEntry[] = [];
  private abortController: AbortController | null = null;
  private maxToolRounds: number;
  private mode: AgentMode = "agent";

  constructor(apiKey: string, baseURL?: string, model?: string, maxToolRounds?: number) {
    this.client = new GrokClient(apiKey, model, baseURL);
    this.bash = new BashTool();
    this.maxToolRounds = maxToolRounds || MAX_TOOL_ROUNDS;
    this.messages.push({
      role: "system",
      content: buildSystemPrompt(process.cwd(), this.mode),
    });
  }

  getModel(): string {
    return this.client.getModel();
  }

  setModel(model: string): void {
    this.client.setModel(model);
  }

  getMode(): AgentMode {
    return this.mode;
  }

  setMode(mode: AgentMode): void {
    this.mode = mode;
    this.messages[0] = {
      role: "system",
      content: buildSystemPrompt(this.bash.getCwd(), mode),
    };
  }

  getHistory(): ChatEntry[] {
    return [...this.history];
  }

  getCwd(): string {
    return this.bash.getCwd();
  }

  abort(): void {
    this.abortController?.abort();
  }

  clearHistory(): void {
    this.messages = [{
      role: "system",
      content: buildSystemPrompt(this.bash.getCwd(), this.mode),
    }];
    this.history = [];
  }

  async *processMessage(userMessage: string): AsyncGenerator<StreamChunk, void, unknown> {
    this.abortController = new AbortController();

    const userEntry: ChatEntry = {
      type: "user",
      content: userMessage,
      timestamp: new Date(),
    };
    this.history.push(userEntry);
    this.messages.push({ role: "user", content: userMessage });

    let toolRounds = 0;

    try {
      while (toolRounds < this.maxToolRounds) {
        if (this.abortController.signal.aborted) {
          yield { type: "content", content: "\n\n[Cancelled]" };
          yield { type: "done" };
          return;
        }

        let accContent = "";
        let accToolCalls: ToolCall[] | undefined;
        let accReasoning = "";

        for await (const delta of this.client.chatStream(this.messages, TOOLS)) {
          if (this.abortController.signal.aborted) {
            yield { type: "content", content: "\n\n[Cancelled]" };
            yield { type: "done" };
            return;
          }

          if (delta.content) {
            accContent += delta.content;
            yield { type: "content", content: delta.content };
          }

          if (delta.reasoning) {
            accReasoning += delta.reasoning;
            yield { type: "reasoning", content: delta.reasoning };
          }

          if (delta.toolCalls) {
            accToolCalls = delta.toolCalls;
            yield { type: "tool_calls", toolCalls: delta.toolCalls };
          }
        }

        this.messages.push({
          role: "assistant",
          content: accContent || "",
          tool_calls: accToolCalls,
        });

        this.history.push({
          type: "assistant",
          content: accContent || "",
          timestamp: new Date(),
          toolCalls: accToolCalls,
        });

        if (!accToolCalls || accToolCalls.length === 0) {
          break;
        }

        toolRounds++;

        for (const tc of accToolCalls) {
          if (this.abortController.signal.aborted) {
            yield { type: "content", content: "\n\n[Cancelled]" };
            yield { type: "done" };
            return;
          }

          const result = await this.executeTool(tc);

          yield { type: "tool_result", toolCall: tc, toolResult: result };

          this.history.push({
            type: "tool_result",
            content: result.success ? (result.output || "Success") : (result.error || "Error"),
            timestamp: new Date(),
            toolCall: tc,
            toolResult: result,
          });

          this.messages.push({
            role: "tool",
            content: result.success ? (result.output || "Success") : (result.error || "Error"),
            tool_call_id: tc.id,
          });
        }
      }

      if (toolRounds >= this.maxToolRounds) {
        yield { type: "content", content: "\n\nMax tool rounds reached." };
      }

      yield { type: "done" };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      yield { type: "error", content: `Error: ${msg}` };
      yield { type: "done" };
    } finally {
      this.abortController = null;
    }
  }

  private async executeTool(tc: ToolCall): Promise<ToolResult> {
    try {
      const args = JSON.parse(tc.function.arguments);

      switch (tc.function.name) {
        case "bash":
          return await this.bash.execute(args.command, args.timeout);

        case "search_web":
          const webResult = await this.client.searchWeb(args.query);
          return { success: true, output: webResult };

        case "search_x":
          const xResult = await this.client.searchX(args.query);
          return { success: true, output: xResult };

        default:
          return { success: false, error: `Unknown tool: ${tc.function.name}` };
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, error: `Tool error: ${msg}` };
    }
  }
}
