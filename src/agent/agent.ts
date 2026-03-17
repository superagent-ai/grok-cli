import { GrokClient } from "../grok/client.js";
import { TOOLS } from "../grok/tools.js";
import { BashTool } from "../tools/bash.js";
import { loadCustomInstructions } from "../utils/instructions.js";
import type { ChatEntry, Message, StreamChunk, ToolCall, ToolResult } from "../types/index.js";

const MAX_TOOL_ROUNDS = 400;

function buildSystemPrompt(cwd: string): string {
  const custom = loadCustomInstructions();
  const customSection = custom
    ? `\n\nCUSTOM INSTRUCTIONS:\n${custom}\n\nFollow the above custom instructions alongside the standard instructions.\n`
    : "";

  return `You are Grok CLI, a powerful AI coding agent running in the terminal. You operate directly through bash commands.${customSection}

TOOLS:
- bash: Execute any shell command. Use this for EVERYTHING — viewing files (cat, bat, less), editing files (sed, awk, tee, or write with heredocs), searching code (grep, rg, find), git operations, running builds, installing packages, etc.
- search_web: Search the internet for real-time information, documentation, APIs, current events.
- search_x: Search X (Twitter) for posts, discussions, trends, community sentiment.

WORKFLOW:
1. Understand what the user wants
2. Use bash to explore, read files, and understand the codebase
3. Make changes using bash commands (sed, tee, heredocs, etc.)
4. Verify your changes by reading the modified files
5. Run any relevant tests or builds to confirm correctness

FILE EDITING PATTERNS:
- For small edits: sed -i 's/old/new/g' file
- For creating files: cat > file << 'EOF' ... EOF
- For appending: cat >> file << 'EOF' ... EOF
- For complex edits: Use a combination of sed, awk, or write the entire file with cat/tee
- Always verify edits by reading the file after modification

RESPONSE STYLE:
- Be direct and concise
- Show what you're doing, not what you plan to do
- After tool use, give brief confirmation or note issues
- Use markdown formatting in responses

Current working directory: ${cwd}`;
}

export class Agent {
  private client: GrokClient;
  private bash: BashTool;
  private messages: Message[] = [];
  private history: ChatEntry[] = [];
  private abortController: AbortController | null = null;
  private maxToolRounds: number;

  constructor(apiKey: string, baseURL?: string, model?: string, maxToolRounds?: number) {
    this.client = new GrokClient(apiKey, model, baseURL);
    this.bash = new BashTool();
    this.maxToolRounds = maxToolRounds || MAX_TOOL_ROUNDS;
    this.messages.push({
      role: "system",
      content: buildSystemPrompt(process.cwd()),
    });
  }

  getModel(): string {
    return this.client.getModel();
  }

  setModel(model: string): void {
    this.client.setModel(model);
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
    const systemMsg = this.messages[0];
    this.messages = [systemMsg];
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
