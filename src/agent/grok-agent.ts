import { GrokClient, GrokMessage, GrokToolCall } from "../grok/client.js";
import {
  getAllGrokTools,
  getRelevantTools,
  getMCPManager,
  initializeMCPServers,
  classifyQuery,
  ToolSelectionResult,
  getToolSelector,
} from "../grok/tools.js";
import { recordToolRequest, formatToolSelectionMetrics } from "../tools/tool-selector.js";
import { loadMCPConfig } from "../mcp/config.js";
import {
  TextEditorTool,
  MorphEditorTool,
  BashTool,
  TodoTool,
  SearchTool,
  WebSearchTool,
  ImageTool,
} from "../tools/index.js";
import { ToolResult } from "../types/index.js";
import { EventEmitter } from "events";
import { createTokenCounter, TokenCounter } from "../utils/token-counter.js";
import { loadCustomInstructions } from "../utils/custom-instructions.js";
import { getCheckpointManager, CheckpointManager } from "../checkpoints/checkpoint-manager.js";
import { getSessionStore, SessionStore } from "../persistence/session-store.js";
import { getAgentModeManager, AgentModeManager, AgentMode } from "./agent-mode.js";
import { getSandboxManager, SandboxManager } from "../security/sandbox.js";
import { getMCPClient, MCPClient } from "../mcp/mcp-client.js";
import { getSettingsManager } from "../utils/settings-manager.js";

/**
 * Represents a single entry in the chat history
 */
export interface ChatEntry {
  /** Type of chat entry */
  type: "user" | "assistant" | "tool_result" | "tool_call";
  /** Content of the message */
  content: string;
  /** When this entry was created */
  timestamp: Date;
  /** Tool calls made by the assistant (if any) */
  toolCalls?: GrokToolCall[];
  /** Single tool call (for tool_call type) */
  toolCall?: GrokToolCall;
  /** Result of tool execution (for tool_result type) */
  toolResult?: { success: boolean; output?: string; error?: string };
  /** Whether this entry is currently being streamed */
  isStreaming?: boolean;
}

/**
 * Represents a chunk of data in a streaming response
 */
export interface StreamingChunk {
  /** Type of streaming chunk */
  type: "content" | "tool_calls" | "tool_result" | "done" | "token_count";
  /** Text content (for content type) */
  content?: string;
  /** Tool calls made (for tool_calls type) */
  toolCalls?: GrokToolCall[];
  /** Single tool call (for tool_call type) */
  toolCall?: GrokToolCall;
  /** Result of tool execution (for tool_result type) */
  toolResult?: ToolResult;
  /** Current token count (for token_count type) */
  tokenCount?: number;
}

/**
 * Main agent class that orchestrates conversation with Grok AI and tool execution
 *
 * @example
 * ```typescript
 * const agent = new GrokAgent(apiKey, baseURL, model);
 *
 * // Process a message with streaming
 * for await (const chunk of agent.processUserMessageStream("Show me package.json")) {
 *   if (chunk.type === "content") {
 *     console.log(chunk.content);
 *   }
 * }
 *
 * // Clean up when done
 * agent.dispose();
 * ```
 */
export class GrokAgent extends EventEmitter {
  private grokClient: GrokClient;
  private textEditor: TextEditorTool;
  private morphEditor: MorphEditorTool | null;
  private bash: BashTool;
  private todoTool: TodoTool;
  private search: SearchTool;
  private webSearch: WebSearchTool;
  private imageTool: ImageTool;
  private chatHistory: ChatEntry[] = [];
  private messages: GrokMessage[] = [];
  private tokenCounter: TokenCounter;
  private abortController: AbortController | null = null;
  private checkpointManager: CheckpointManager;
  private sessionStore: SessionStore;
  private modeManager: AgentModeManager;
  private sandboxManager: SandboxManager;
  private mcpClient: MCPClient;
  private maxToolRounds: number;
  private useRAGToolSelection: boolean;
  private lastToolSelection: ToolSelectionResult | null = null;
  private parallelToolExecution: boolean = true;
  private lastSelectedToolNames: string[] = [];
  private lastQueryForToolSelection: string = '';

  /**
   * Create a new GrokAgent instance
   *
   * @param apiKey - API key for authentication
   * @param baseURL - Optional base URL for the API endpoint
   * @param model - Optional model name (defaults to saved model or grok-code-fast-1)
   * @param maxToolRounds - Maximum tool execution rounds (default: 400)
   * @param useRAGToolSelection - Enable RAG-based tool selection (default: true)
   */
  constructor(
    apiKey: string,
    baseURL?: string,
    model?: string,
    maxToolRounds?: number,
    useRAGToolSelection: boolean = true
  ) {
    super();
    const manager = getSettingsManager();
    const savedModel = manager.getCurrentModel();
    const modelToUse = model || savedModel || "grok-code-fast-1";
    this.maxToolRounds = maxToolRounds || 400;
    this.useRAGToolSelection = useRAGToolSelection;
    this.grokClient = new GrokClient(apiKey, modelToUse, baseURL);
    this.textEditor = new TextEditorTool();
    this.morphEditor = process.env.MORPH_API_KEY ? new MorphEditorTool() : null;
    this.bash = new BashTool();
    this.todoTool = new TodoTool();
    this.search = new SearchTool();
    this.webSearch = new WebSearchTool();
    this.imageTool = new ImageTool();
    this.tokenCounter = createTokenCounter(modelToUse);
    this.checkpointManager = getCheckpointManager();
    this.sessionStore = getSessionStore();
    this.modeManager = getAgentModeManager();
    this.sandboxManager = getSandboxManager();
    this.mcpClient = getMCPClient();

    // Initialize MCP servers if configured
    this.initializeMCP();

    // Load custom instructions
    const customInstructions = loadCustomInstructions();
    const customInstructionsSection = customInstructions
      ? `\n\nCUSTOM INSTRUCTIONS:\n${customInstructions}\n\nThe above custom instructions should be followed alongside the standard instructions below.`
      : "";

    // Initialize with system message
    this.messages.push({
      role: "system",
      content: `You are Grok CLI, an AI assistant that helps with file editing, coding tasks, and system operations.${customInstructionsSection}

You have access to these tools:
- view_file: View file contents or directory listings
- create_file: Create new files with content (ONLY use this for files that don't exist yet)
- str_replace_editor: Replace text in existing files (ALWAYS use this to edit or update existing files)${
        this.morphEditor
          ? "\n- edit_file: High-speed file editing with Morph Fast Apply (4,500+ tokens/sec with 98% accuracy)"
          : ""
      }
- bash: Execute bash commands (use for searching, file discovery, navigation, and system operations)
- search: Unified search tool for finding text content or files (similar to Cursor's search functionality)
- create_todo_list: Create a visual todo list for planning and tracking tasks
- update_todo_list: Update existing todos in your todo list
- web_search: Search the web for current information, documentation, or answers
- web_fetch: Fetch and read the content of a specific web page URL

REAL-TIME INFORMATION:
You have access to real-time web search and X (Twitter) data. When users ask for current information, latest news, or recent events, you automatically have access to up-to-date information from the web and social media.

IMPORTANT TOOL USAGE RULES:
- NEVER use create_file on files that already exist - this will overwrite them completely
- ALWAYS use str_replace_editor to modify existing files, even for small changes
- Before editing a file, use view_file to see its current contents
- Use create_file ONLY when creating entirely new files that don't exist

SEARCHING AND EXPLORATION:
- Use search for fast, powerful text search across files or finding files by name (unified search tool)
- Examples: search for text content like "import.*react", search for files like "component.tsx"
- Use bash with commands like 'find', 'grep', 'rg', 'ls' for complex file operations and navigation
- view_file is best for reading specific files you already know exist

When a user asks you to edit, update, modify, or change an existing file:
1. First use view_file to see the current contents
2. Then use str_replace_editor to make the specific changes
3. Never use create_file for existing files

When a user asks you to create a new file that doesn't exist:
1. Use create_file with the full content

TASK PLANNING WITH TODO LISTS:
- For complex requests with multiple steps, ALWAYS create a todo list first to plan your approach
- Use create_todo_list to break down tasks into manageable items with priorities
- Mark tasks as 'in_progress' when you start working on them (only one at a time)
- Mark tasks as 'completed' immediately when finished
- Use update_todo_list to track your progress throughout the task
- Todo lists provide visual feedback with colors: ✅ Green (completed), 🔄 Cyan (in progress), ⏳ Yellow (pending)
- Always create todos with priorities: 'high' (🔴), 'medium' (🟡), 'low' (🟢)

USER CONFIRMATION SYSTEM:
File operations (create_file, str_replace_editor) and bash commands will automatically request user confirmation before execution. The confirmation system will show users the actual content or command before they decide. Users can choose to approve individual operations or approve all operations of that type for the session.

If a user rejects an operation, the tool will return an error and you should not proceed with that specific operation.

Be helpful, direct, and efficient. Always explain what you're doing and show the results.

IMPORTANT RESPONSE GUIDELINES:
- After using tools, do NOT respond with pleasantries like "Thanks for..." or "Great!"
- Only provide necessary explanations or next steps if relevant to the task
- Keep responses concise and focused on the actual work being done
- If a tool execution completes the user's request, you can remain silent or give a brief confirmation

Current working directory: ${process.cwd()}`,
    });
  }

  private async initializeMCP(): Promise<void> {
    // Initialize MCP in the background without blocking
    Promise.resolve().then(async () => {
      try {
        const config = loadMCPConfig();
        if (config.servers.length > 0) {
          await initializeMCPServers();
        }
      } catch (error) {
        console.warn("MCP initialization failed:", error);
      }
    });
  }

  private isGrokModel(): boolean {
    const currentModel = this.grokClient.getCurrentModel();
    return currentModel.toLowerCase().includes("grok");
  }

  // Heuristic: enable web search only when likely needed
  private shouldUseSearchFor(message: string): boolean {
    const q = message.toLowerCase();
    const keywords = [
      "today",
      "latest",
      "news",
      "trending",
      "breaking",
      "current",
      "now",
      "recent",
      "x.com",
      "twitter",
      "tweet",
      "what happened",
      "as of",
      "update on",
      "release notes",
      "changelog",
      "price",
    ];
    if (keywords.some((k) => q.includes(k))) return true;
    // crude date pattern (e.g., 2024/2025) may imply recency
    if (/(20\d{2})/.test(q)) return true;
    return false;
  }

  /**
   * Check if tool calls can be safely executed in parallel
   *
   * Tools that modify the same files or have side effects should not be parallelized.
   * Read-only operations (view_file, search, web_search) are safe to parallelize.
   */
  private canParallelizeToolCalls(toolCalls: GrokToolCall[]): boolean {
    if (!this.parallelToolExecution || toolCalls.length <= 1) {
      return false;
    }

    // Tools that are safe to run in parallel (read-only)
    const safeParallelTools = new Set([
      'view_file',
      'search',
      'web_search',
      'web_fetch',
      'codebase_map',
      'pdf',
      'audio',
      'video',
      'document',
      'ocr',
      'qr',
      'archive',
      'clipboard' // read operations
    ]);

    // Tools that modify state (unsafe for parallel)
    const writeTools = new Set([
      'create_file',
      'str_replace_editor',
      'edit_file',
      'multi_edit',
      'bash',
      'git',
      'create_todo_list',
      'update_todo_list',
      'screenshot',
      'export',
      'diagram'
    ]);

    // Check if all tools are safe for parallel execution
    const allSafe = toolCalls.every(tc => safeParallelTools.has(tc.function.name));
    if (allSafe) return true;

    // Check if any write tools target the same file
    const writeToolCalls = toolCalls.filter(tc => writeTools.has(tc.function.name));
    if (writeToolCalls.length > 1) {
      // Extract file paths from arguments
      const filePaths = new Set<string>();
      for (const tc of writeToolCalls) {
        try {
          const args = JSON.parse(tc.function.arguments);
          const path = args.path || args.target_file || args.file_path;
          if (path) {
            if (filePaths.has(path)) {
              return false; // Same file targeted by multiple write tools
            }
            filePaths.add(path);
          }
        } catch {
          return false; // Can't parse args, be safe
        }
      }
    }

    // If there's only one write tool, safe to parallelize with read tools
    return writeToolCalls.length <= 1;
  }

  /**
   * Execute multiple tool calls, potentially in parallel
   */
  private async _executeToolCallsParallel(
    toolCalls: GrokToolCall[]
  ): Promise<Map<string, ToolResult>> {
    const results = new Map<string, ToolResult>();

    if (this.canParallelizeToolCalls(toolCalls)) {
      // Execute in parallel
      const promises = toolCalls.map(async (toolCall) => {
        const result = await this.executeTool(toolCall);
        return { id: toolCall.id, result };
      });

      const settled = await Promise.all(promises);
      for (const { id, result } of settled) {
        results.set(id, result);
      }
    } else {
      // Execute sequentially
      for (const toolCall of toolCalls) {
        const result = await this.executeTool(toolCall);
        results.set(toolCall.id, result);
      }
    }

    return results;
  }

  /**
   * Get tools for a query using RAG selection if enabled
   */
  private async getToolsForQuery(query: string): Promise<{
    tools: import("../grok/client.js").GrokTool[];
    selection: ToolSelectionResult | null;
  }> {
    this.lastQueryForToolSelection = query;

    if (this.useRAGToolSelection) {
      const selection = await getRelevantTools(query, {
        maxTools: 15,
        useRAG: true,
        alwaysInclude: ['view_file', 'bash', 'search', 'str_replace_editor']
      });
      this.lastToolSelection = selection;
      this.lastSelectedToolNames = selection.selectedTools.map(t => t.function.name);
      return { tools: selection.selectedTools, selection };
    } else {
      const tools = await getAllGrokTools();
      this.lastSelectedToolNames = tools.map(t => t.function.name);
      return { tools, selection: null };
    }
  }

  /**
   * Record tool request for metrics (called when LLM requests a tool)
   */
  private recordToolRequestMetric(toolName: string): void {
    if (this.useRAGToolSelection && this.lastQueryForToolSelection) {
      recordToolRequest(
        toolName,
        this.lastSelectedToolNames,
        this.lastQueryForToolSelection
      );
    }
  }

  async processUserMessage(message: string): Promise<ChatEntry[]> {
    // Add user message to conversation
    const userEntry: ChatEntry = {
      type: "user",
      content: message,
      timestamp: new Date(),
    };
    this.chatHistory.push(userEntry);
    this.messages.push({ role: "user", content: message });

    const newEntries: ChatEntry[] = [userEntry];
    const maxToolRounds = this.maxToolRounds; // Prevent infinite loops
    let toolRounds = 0;

    try {
      // Use RAG-based tool selection for initial query
      const { tools } = await this.getToolsForQuery(message);
      let currentResponse = await this.grokClient.chat(
        this.messages,
        tools,
        undefined,
        this.isGrokModel() && this.shouldUseSearchFor(message)
          ? { search_parameters: { mode: "auto" } }
          : { search_parameters: { mode: "off" } }
      );

      // Agent loop - continue until no more tool calls or max rounds reached
      while (toolRounds < maxToolRounds) {
        const assistantMessage = currentResponse.choices[0]?.message;

        if (!assistantMessage) {
          throw new Error("No response from Grok");
        }

        // Handle tool calls
        if (
          assistantMessage.tool_calls &&
          assistantMessage.tool_calls.length > 0
        ) {
          toolRounds++;

          // Add assistant message with tool calls
          const assistantEntry: ChatEntry = {
            type: "assistant",
            content: assistantMessage.content || "Using tools to help you...",
            timestamp: new Date(),
            toolCalls: assistantMessage.tool_calls,
          };
          this.chatHistory.push(assistantEntry);
          newEntries.push(assistantEntry);

          // Add assistant message to conversation
          this.messages.push({
            role: "assistant",
            content: assistantMessage.content || "",
            tool_calls: assistantMessage.tool_calls,
          } as any);

          // Create initial tool call entries to show tools are being executed
          assistantMessage.tool_calls.forEach((toolCall) => {
            const toolCallEntry: ChatEntry = {
              type: "tool_call",
              content: "Executing...",
              timestamp: new Date(),
              toolCall: toolCall,
            };
            this.chatHistory.push(toolCallEntry);
            newEntries.push(toolCallEntry);
          });

          // Execute tool calls and update the entries
          for (const toolCall of assistantMessage.tool_calls) {
            const result = await this.executeTool(toolCall);

            // Update the existing tool_call entry with the result
            const entryIndex = this.chatHistory.findIndex(
              (entry) =>
                entry.type === "tool_call" && entry.toolCall?.id === toolCall.id
            );

            if (entryIndex !== -1) {
              const updatedEntry: ChatEntry = {
                ...this.chatHistory[entryIndex],
                type: "tool_result",
                content: result.success
                  ? result.output || "Success"
                  : result.error || "Error occurred",
                toolResult: result,
              };
              this.chatHistory[entryIndex] = updatedEntry;

              // Also update in newEntries for return value
              const newEntryIndex = newEntries.findIndex(
                (entry) =>
                  entry.type === "tool_call" &&
                  entry.toolCall?.id === toolCall.id
              );
              if (newEntryIndex !== -1) {
                newEntries[newEntryIndex] = updatedEntry;
              }
            }

            // Add tool result to messages with proper format (needed for AI context)
            this.messages.push({
              role: "tool",
              content: result.success
                ? result.output || "Success"
                : result.error || "Error",
              tool_call_id: toolCall.id,
            });
          }

          // Get next response - this might contain more tool calls
          currentResponse = await this.grokClient.chat(
            this.messages,
            tools,
            undefined,
            this.isGrokModel() && this.shouldUseSearchFor(message)
              ? { search_parameters: { mode: "auto" } }
              : { search_parameters: { mode: "off" } }
          );
        } else {
          // No more tool calls, add final response
          const finalEntry: ChatEntry = {
            type: "assistant",
            content:
              assistantMessage.content ||
              "I understand, but I don't have a specific response.",
            timestamp: new Date(),
          };
          this.chatHistory.push(finalEntry);
          this.messages.push({
            role: "assistant",
            content: assistantMessage.content || "",
          });
          newEntries.push(finalEntry);
          break; // Exit the loop
        }
      }

      if (toolRounds >= maxToolRounds) {
        const warningEntry: ChatEntry = {
          type: "assistant",
          content:
            "Maximum tool execution rounds reached. Stopping to prevent infinite loops.",
          timestamp: new Date(),
        };
        this.chatHistory.push(warningEntry);
        newEntries.push(warningEntry);
      }

      return newEntries;
    } catch (error: any) {
      const errorEntry: ChatEntry = {
        type: "assistant",
        content: `Sorry, I encountered an error: ${error.message}`,
        timestamp: new Date(),
      };
      this.chatHistory.push(errorEntry);
      return [userEntry, errorEntry];
    }
  }

  private messageReducer(previous: any, item: any): any {
    const reduce = (acc: any, delta: any) => {
      acc = { ...acc };
      for (const [key, value] of Object.entries(delta)) {
        if (acc[key] === undefined || acc[key] === null) {
          acc[key] = value;
          // Clean up index properties from tool calls
          if (Array.isArray(acc[key])) {
            for (const arr of acc[key]) {
              delete arr.index;
            }
          }
        } else if (typeof acc[key] === "string" && typeof value === "string") {
          (acc[key] as string) += value;
        } else if (Array.isArray(acc[key]) && Array.isArray(value)) {
          const accArray = acc[key] as any[];
          for (let i = 0; i < value.length; i++) {
            if (!accArray[i]) accArray[i] = {};
            accArray[i] = reduce(accArray[i], value[i]);
          }
        } else if (typeof acc[key] === "object" && typeof value === "object") {
          acc[key] = reduce(acc[key], value);
        }
      }
      return acc;
    };

    return reduce(previous, item.choices[0]?.delta || {});
  }

  /**
   * Process a user message with streaming response
   *
   * This method runs an agentic loop that can execute multiple tool rounds.
   * It yields chunks as they arrive, including content, tool calls, and results.
   *
   * @param message - The user's message to process
   * @yields StreamingChunk objects containing different types of data
   * @throws Error if processing fails
   *
   * @example
   * ```typescript
   * for await (const chunk of agent.processUserMessageStream("List files")) {
   *   switch (chunk.type) {
   *     case "content":
   *       console.log(chunk.content);
   *       break;
   *     case "tool_calls":
   *       console.log("Tools:", chunk.toolCalls);
   *       break;
   *     case "done":
   *       console.log("Completed");
   *       break;
   *   }
   * }
   * ```
   */
  async *processUserMessageStream(
    message: string
  ): AsyncGenerator<StreamingChunk, void, unknown> {
    // Create new abort controller for this request
    this.abortController = new AbortController();

    // Add user message to conversation
    const userEntry: ChatEntry = {
      type: "user",
      content: message,
      timestamp: new Date(),
    };
    this.chatHistory.push(userEntry);
    this.messages.push({ role: "user", content: message });

    // Calculate input tokens
    let inputTokens = this.tokenCounter.countMessageTokens(
      this.messages as any
    );
    yield {
      type: "token_count",
      tokenCount: inputTokens,
    };

    const maxToolRounds = this.maxToolRounds; // Prevent infinite loops
    let toolRounds = 0;
    let totalOutputTokens = 0;
    let lastTokenUpdate = 0;

    try {
      // Agent loop - continue until no more tool calls or max rounds reached
      while (toolRounds < maxToolRounds) {
        // Check if operation was cancelled
        if (this.abortController?.signal.aborted) {
          yield {
            type: "content",
            content: "\n\n[Operation cancelled by user]",
          };
          yield { type: "done" };
          return;
        }

        // Stream response and accumulate
        // Use RAG-based tool selection on first round, then use same tools for consistency
        const { tools } = toolRounds === 0
          ? await this.getToolsForQuery(message)
          : { tools: await getAllGrokTools() };
        const stream = this.grokClient.chatStream(
          this.messages,
          tools,
          undefined,
          this.isGrokModel() && this.shouldUseSearchFor(message)
            ? { search_parameters: { mode: "auto" } }
            : { search_parameters: { mode: "off" } }
        );
        let accumulatedMessage: any = {};
        let accumulatedContent = "";
        let toolCallsYielded = false;

        for await (const chunk of stream) {
          // Check for cancellation in the streaming loop
          if (this.abortController?.signal.aborted) {
            yield {
              type: "content",
              content: "\n\n[Operation cancelled by user]",
            };
            yield { type: "done" };
            return;
          }

          if (!chunk.choices?.[0]) continue;

          // Accumulate the message using reducer
          accumulatedMessage = this.messageReducer(accumulatedMessage, chunk);

          // Check for tool calls - yield when we have complete tool calls with function names
          if (!toolCallsYielded && accumulatedMessage.tool_calls?.length > 0) {
            // Check if we have at least one complete tool call with a function name
            const hasCompleteTool = accumulatedMessage.tool_calls.some(
              (tc: any) => tc.function?.name
            );
            if (hasCompleteTool) {
              yield {
                type: "tool_calls",
                toolCalls: accumulatedMessage.tool_calls,
              };
              toolCallsYielded = true;
            }
          }

          // Stream content as it comes
          if (chunk.choices[0].delta?.content) {
            accumulatedContent += chunk.choices[0].delta.content;

            // Update token count in real-time including accumulated content and any tool calls
            const currentOutputTokens =
              this.tokenCounter.estimateStreamingTokens(accumulatedContent) +
              (accumulatedMessage.tool_calls
                ? this.tokenCounter.countTokens(
                    JSON.stringify(accumulatedMessage.tool_calls)
                  )
                : 0);
            totalOutputTokens = currentOutputTokens;

            yield {
              type: "content",
              content: chunk.choices[0].delta.content,
            };

            // Emit token count update
            const now = Date.now();
            if (now - lastTokenUpdate > 250) {
              lastTokenUpdate = now;
              yield {
                type: "token_count",
                tokenCount: inputTokens + totalOutputTokens,
              };
            }
        }
      }

        // Add assistant entry to history
        const assistantEntry: ChatEntry = {
          type: "assistant",
          content: accumulatedMessage.content || "Using tools to help you...",
          timestamp: new Date(),
          toolCalls: accumulatedMessage.tool_calls || undefined,
        };
        this.chatHistory.push(assistantEntry);

        // Add accumulated message to conversation
        this.messages.push({
          role: "assistant",
          content: accumulatedMessage.content || "",
          tool_calls: accumulatedMessage.tool_calls,
        } as any);

        // Handle tool calls if present
        if (accumulatedMessage.tool_calls?.length > 0) {
          toolRounds++;

          // Only yield tool_calls if we haven't already yielded them during streaming
          if (!toolCallsYielded) {
            yield {
              type: "tool_calls",
              toolCalls: accumulatedMessage.tool_calls,
            };
          }

          // Execute tools
          for (const toolCall of accumulatedMessage.tool_calls) {
            // Check for cancellation before executing each tool
            if (this.abortController?.signal.aborted) {
              yield {
                type: "content",
                content: "\n\n[Operation cancelled by user]",
              };
              yield { type: "done" };
              return;
            }

            const result = await this.executeTool(toolCall);

            const toolResultEntry: ChatEntry = {
              type: "tool_result",
              content: result.success
                ? result.output || "Success"
                : result.error || "Error occurred",
              timestamp: new Date(),
              toolCall: toolCall,
              toolResult: result,
            };
            this.chatHistory.push(toolResultEntry);

            yield {
              type: "tool_result",
              toolCall,
              toolResult: result,
            };

            // Add tool result with proper format (needed for AI context)
            this.messages.push({
              role: "tool",
              content: result.success
                ? result.output || "Success"
                : result.error || "Error",
              tool_call_id: toolCall.id,
            });
          }

          // Update token count after processing all tool calls to include tool results
          inputTokens = this.tokenCounter.countMessageTokens(
            this.messages as any
          );
          // Final token update after tools processed
          yield {
            type: "token_count",
            tokenCount: inputTokens + totalOutputTokens,
          };

          // Continue the loop to get the next response (which might have more tool calls)
        } else {
          // No tool calls, we're done
          break;
        }
      }

      if (toolRounds >= maxToolRounds) {
        yield {
          type: "content",
          content:
            "\n\nMaximum tool execution rounds reached. Stopping to prevent infinite loops.",
        };
      }

      yield { type: "done" };
    } catch (error: any) {
      // Check if this was a cancellation
      if (this.abortController?.signal.aborted) {
        yield {
          type: "content",
          content: "\n\n[Operation cancelled by user]",
        };
        yield { type: "done" };
        return;
      }

      const errorEntry: ChatEntry = {
        type: "assistant",
        content: `Sorry, I encountered an error: ${error.message}`,
        timestamp: new Date(),
      };
      this.chatHistory.push(errorEntry);
      yield {
        type: "content",
        content: errorEntry.content,
      };
      yield { type: "done" };
    } finally {
      // Clean up abort controller
      this.abortController = null;
    }
  }

  private async executeTool(toolCall: GrokToolCall): Promise<ToolResult> {
    // Record this tool request for metrics tracking
    this.recordToolRequestMetric(toolCall.function.name);

    try {
      const args = JSON.parse(toolCall.function.arguments);

      switch (toolCall.function.name) {
        case "view_file":
          const range: [number, number] | undefined =
            args.start_line && args.end_line
              ? [args.start_line, args.end_line]
              : undefined;
          return await this.textEditor.view(args.path, range);

        case "create_file":
          // Create checkpoint before creating file
          this.checkpointManager.checkpointBeforeCreate(args.path);
          return await this.textEditor.create(args.path, args.content);

        case "str_replace_editor":
          // Create checkpoint before editing file
          this.checkpointManager.checkpointBeforeEdit(args.path);
          return await this.textEditor.strReplace(
            args.path,
            args.old_str,
            args.new_str,
            args.replace_all
          );

        case "edit_file":
          if (!this.morphEditor) {
            return {
              success: false,
              error:
                "Morph Fast Apply not available. Please set MORPH_API_KEY environment variable to use this feature.",
            };
          }
          return await this.morphEditor.editFile(
            args.target_file,
            args.instructions,
            args.code_edit
          );

        case "bash":
          return await this.bash.execute(args.command);

        case "create_todo_list":
          return await this.todoTool.createTodoList(args.todos);

        case "update_todo_list":
          return await this.todoTool.updateTodoList(args.updates);

        case "search":
          return await this.search.search(args.query, {
            searchType: args.search_type,
            includePattern: args.include_pattern,
            excludePattern: args.exclude_pattern,
            caseSensitive: args.case_sensitive,
            wholeWord: args.whole_word,
            regex: args.regex,
            maxResults: args.max_results,
            fileTypes: args.file_types,
            includeHidden: args.include_hidden,
          });

        case "web_search":
          return await this.webSearch.search(args.query, {
            maxResults: args.max_results,
          });

        case "web_fetch":
          return await this.webSearch.fetchPage(args.url);

        default:
          // Check if this is an MCP tool
          if (toolCall.function.name.startsWith("mcp__")) {
            return await this.executeMCPTool(toolCall);
          }

          return {
            success: false,
            error: `Unknown tool: ${toolCall.function.name}`,
          };
      }
    } catch (error: any) {
      return {
        success: false,
        error: `Tool execution error: ${error.message}`,
      };
    }
  }

  private async executeMCPTool(toolCall: GrokToolCall): Promise<ToolResult> {
    try {
      const args = JSON.parse(toolCall.function.arguments);
      const mcpManager = getMCPManager();

      const result = await mcpManager.callTool(toolCall.function.name, args);

      if (result.isError) {
        return {
          success: false,
          error: (result.content[0] as any)?.text || "MCP tool error",
        };
      }

      // Extract content from result
      const output = result.content
        .map((item) => {
          if (item.type === "text") {
            return item.text;
          } else if (item.type === "resource") {
            return `Resource: ${item.resource?.uri || "Unknown"}`;
          }
          return String(item);
        })
        .join("\n");

      return {
        success: true,
        output: output || "Success",
      };
    } catch (error: any) {
      return {
        success: false,
        error: `MCP tool execution error: ${error.message}`,
      };
    }
  }

  getChatHistory(): ChatEntry[] {
    return [...this.chatHistory];
  }

  getCurrentDirectory(): string {
    return this.bash.getCurrentDirectory();
  }

  async executeBashCommand(command: string): Promise<ToolResult> {
    return await this.bash.execute(command);
  }

  getCurrentModel(): string {
    return this.grokClient.getCurrentModel();
  }

  setModel(model: string): void {
    this.grokClient.setModel(model);
    // Update token counter for new model
    this.tokenCounter.dispose();
    this.tokenCounter = createTokenCounter(model);
  }

  abortCurrentOperation(): void {
    if (this.abortController) {
      this.abortController.abort();
    }
  }

  // Checkpoint methods
  createCheckpoint(description: string): void {
    this.checkpointManager.createCheckpoint(description);
  }

  rewindToLastCheckpoint(): { success: boolean; message: string } {
    const result = this.checkpointManager.rewindToLast();
    if (result.success) {
      return {
        success: true,
        message: result.checkpoint
          ? `Rewound to: ${result.checkpoint.description}\nRestored: ${result.restored.join(', ')}`
          : 'No checkpoint found'
      };
    }
    return {
      success: false,
      message: result.errors.join('\n') || 'Failed to rewind'
    };
  }

  getCheckpointList(): string {
    return this.checkpointManager.formatCheckpointList();
  }

  getCheckpointManager(): CheckpointManager {
    return this.checkpointManager;
  }

  // Session methods
  getSessionStore(): SessionStore {
    return this.sessionStore;
  }

  saveCurrentSession(): void {
    this.sessionStore.updateCurrentSession(this.chatHistory);
  }

  getSessionList(): string {
    return this.sessionStore.formatSessionList();
  }

  exportCurrentSession(outputPath?: string): string | null {
    const currentId = this.sessionStore.getCurrentSessionId();
    if (!currentId) return null;
    return this.sessionStore.exportSessionToFile(currentId, outputPath);
  }

  // Clear chat and reset
  clearChat(): void {
    this.chatHistory = [];
    // Keep only the system message
    this.messages = this.messages.slice(0, 1);
  }

  // Mode methods
  getMode(): AgentMode {
    return this.modeManager.getMode();
  }

  setMode(mode: AgentMode): void {
    this.modeManager.setMode(mode);
  }

  getModeStatus(): string {
    return this.modeManager.formatModeStatus();
  }

  isToolAllowedInCurrentMode(toolName: string): boolean {
    return this.modeManager.isToolAllowed(toolName);
  }

  // Sandbox methods
  getSandboxStatus(): string {
    return this.sandboxManager.formatStatus();
  }

  validateCommand(command: string): { valid: boolean; reason?: string } {
    return this.sandboxManager.validateCommand(command);
  }

  // MCP methods
  async connectMCPServers(): Promise<void> {
    await this.mcpClient.connectAll();
  }

  getMCPStatus(): string {
    return this.mcpClient.formatStatus();
  }

  async getMCPTools(): Promise<Map<string, any[]>> {
    return this.mcpClient.getAllTools();
  }

  getMCPClient(): MCPClient {
    return this.mcpClient;
  }

  // Image methods
  async processImage(imagePath: string): Promise<ToolResult> {
    return this.imageTool.processImage({ type: 'file', data: imagePath });
  }

  isImageFile(filePath: string): boolean {
    return this.imageTool.isImage(filePath);
  }

  // RAG Tool Selection methods

  /**
   * Enable or disable RAG-based tool selection
   *
   * When enabled, only semantically relevant tools are sent to the LLM,
   * reducing prompt bloat and improving tool selection accuracy.
   *
   * @param enabled - Whether to enable RAG tool selection
   */
  setRAGToolSelection(enabled: boolean): void {
    this.useRAGToolSelection = enabled;
  }

  /**
   * Check if RAG tool selection is enabled
   */
  isRAGToolSelectionEnabled(): boolean {
    return this.useRAGToolSelection;
  }

  /**
   * Get the last tool selection result
   *
   * Contains information about which tools were selected,
   * their scores, and token savings.
   */
  getLastToolSelection(): ToolSelectionResult | null {
    return this.lastToolSelection;
  }

  /**
   * Get a formatted summary of the last tool selection
   */
  formatToolSelectionStats(): string {
    const selection = this.lastToolSelection;
    if (!selection) {
      return 'No tool selection data available';
    }

    const { selectedTools, classification, reducedTokens, originalTokens } = selection;
    const tokenSavings = originalTokens > 0
      ? Math.round((1 - reducedTokens / originalTokens) * 100)
      : 0;

    const lines = [
      '📊 Tool Selection Statistics',
      '─'.repeat(30),
      `RAG Enabled: ${this.useRAGToolSelection ? '✅' : '❌'}`,
      `Selected Tools: ${selectedTools.length}`,
      `Categories: ${classification.categories.join(', ')}`,
      `Confidence: ${Math.round(classification.confidence * 100)}%`,
      `Token Savings: ~${tokenSavings}% (${originalTokens} → ${reducedTokens})`,
      '',
      'Selected Tools:',
      ...selectedTools.map(t => `  • ${t.function.name}`)
    ];

    return lines.join('\n');
  }

  /**
   * Classify a query to understand what types of tools might be needed
   */
  classifyUserQuery(query: string) {
    return classifyQuery(query);
  }

  /**
   * Get tool selection metrics (success rates, missed tools, etc.)
   */
  getToolSelectionMetrics() {
    return getToolSelector().getMetrics();
  }

  /**
   * Format tool selection metrics as a readable string
   */
  formatToolSelectionMetrics(): string {
    return formatToolSelectionMetrics();
  }

  /**
   * Get most frequently missed tools for debugging
   */
  getMostMissedTools(limit: number = 10) {
    return getToolSelector().getMostMissedTools(limit);
  }

  /**
   * Reset tool selection metrics
   */
  resetToolSelectionMetrics(): void {
    getToolSelector().resetMetrics();
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return getToolSelector().getCacheStats();
  }

  /**
   * Clear all caches
   */
  clearCaches(): void {
    getToolSelector().clearAllCaches();
  }

  // Parallel Tool Execution methods

  /**
   * Enable or disable parallel tool execution
   *
   * When enabled, multiple read-only tool calls (view_file, search, web_search, etc.)
   * will be executed in parallel for faster response times.
   *
   * Write operations are automatically serialized to prevent conflicts.
   *
   * @param enabled - Whether to enable parallel tool execution
   */
  setParallelToolExecution(enabled: boolean): void {
    this.parallelToolExecution = enabled;
  }

  /**
   * Enable or disable self-healing for bash commands
   *
   * When enabled, failed bash commands will attempt automatic remediation.
   * When disabled (via --no-self-heal flag), commands fail without auto-fix attempts.
   *
   * @param enabled - Whether to enable self-healing
   */
  setSelfHealing(enabled: boolean): void {
    this.bash.setSelfHealing(enabled);
  }

  /**
   * Check if self-healing is enabled for bash commands
   */
  isSelfHealingEnabled(): boolean {
    return this.bash.isSelfHealingEnabled();
  }

  /**
   * Check if parallel tool execution is enabled
   */
  isParallelToolExecutionEnabled(): boolean {
    return this.parallelToolExecution;
  }

  /**
   * Clean up all resources
   * Should be called when the agent is no longer needed
   */
  dispose(): void {
    // Clean up token counter
    if (this.tokenCounter) {
      this.tokenCounter.dispose();
    }

    // Abort any ongoing operations
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }

    // Clear chat history and messages to free memory
    this.chatHistory = [];
    this.messages = [];
  }
}
