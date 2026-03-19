import { generateText, type ToolSet, tool } from "ai";
import { z } from "zod";
import type { BashTool } from "../tools/bash";
import { editFile, readFile, writeFile } from "../tools/file";
import type { AgentMode, TaskRequest, ToolResult } from "../types/index";
import type { XaiProvider } from "./client";

const SEARCH_MODEL = "grok-3-mini-fast";

interface CreateToolsOptions {
  runTask?: (request: TaskRequest, abortSignal?: AbortSignal) => Promise<ToolResult>;
  runDelegation?: (request: TaskRequest, abortSignal?: AbortSignal) => Promise<ToolResult>;
  readDelegation?: (id: string) => Promise<ToolResult>;
  listDelegations?: () => Promise<ToolResult>;
}

export function createTools(
  bash: BashTool,
  provider: XaiProvider,
  mode: AgentMode = "agent",
  options: CreateToolsOptions = {},
) {
  const cwd = () => bash.getCwd();

  const base = {
    bash: tool({
      description:
        "Execute a bash command. Use for searching (grep, rg, find), git, build tools, package managers, running tests, and any other shell command. Set background=true for long-running processes like dev servers, watchers, or anything that should keep running while you continue working. For file read/write/edit, prefer the dedicated file tools instead.",
      inputSchema: z.object({
        command: z.string().describe("The bash command to execute"),
        timeout: z
          .number()
          .optional()
          .describe(
            "Timeout in milliseconds (default: 30000). Use higher values for long-running commands. Ignored when background=true.",
          ),
        background: z
          .boolean()
          .optional()
          .describe(
            "Run the command as a background process. Returns immediately with a process ID. Use process_logs/process_stop/process_list to manage it.",
          ),
      }),
      execute: async ({ command, timeout, background }) => {
        if (background) {
          return bash.startBackground(command);
        }
        const result = await bash.execute(command, timeout);
        return {
          success: result.success,
          output: result.success
            ? result.output || "Command executed successfully (no output)"
            : result.error || "Command failed",
        };
      },
    }),

    process_logs: tool({
      description:
        "View recent output (stdout + stderr) from a background process by its ID. Returns the last N lines of the log.",
      inputSchema: z.object({
        id: z.number().describe("The background process ID"),
        tail: z.number().optional().describe("Number of lines to return from the end (default: 50)"),
      }),
      execute: async ({ id, tail }) => {
        return bash.getProcessLogs(id, tail);
      },
    }),

    process_stop: tool({
      description:
        "Stop a running background process by its ID. Sends SIGTERM, then SIGKILL after 3 seconds if still alive.",
      inputSchema: z.object({
        id: z.number().describe("The background process ID to stop"),
      }),
      execute: async ({ id }) => {
        return bash.stopProcess(id);
      },
    }),

    process_list: tool({
      description: "List all background processes with their ID, status, PID, age, and command.",
      inputSchema: z.object({}),
      execute: async () => {
        return bash.listProcesses();
      },
    }),

    read_file: tool({
      description:
        "Read the contents of a file. Returns numbered lines with a header showing the range and total line count. Use start_line/end_line to read specific sections of large files iteratively.",
      inputSchema: z.object({
        path: z.string().describe("File path (relative to cwd or absolute)"),
        start_line: z.number().optional().describe("First line to read (1-indexed, default: 1)"),
        end_line: z.number().optional().describe("Last line to read (inclusive, default: end of file)"),
      }),
      execute: async ({ path, start_line, end_line }) => {
        return readFile(path, cwd(), start_line, end_line);
      },
    }),

    search_web: tool({
      description:
        "Search the web for current information, documentation, APIs, tutorials, news, or any real-time data. Returns summarized results with sources.",
      inputSchema: z.object({
        query: z.string().describe("The search query"),
      }),
      execute: async ({ query }) => {
        try {
          const { text } = await generateText({
            model: provider(SEARCH_MODEL),
            maxOutputTokens: 4096,
            providerOptions: {
              xai: {
                searchParameters: {
                  mode: "on",
                  returnCitations: true,
                  sources: [{ type: "web" }],
                },
              },
            },
            prompt: query,
          });
          return { success: true, output: text };
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          return { success: false, output: `Web search failed: ${msg}` };
        }
      },
    }),

    search_x: tool({
      description:
        "Search X (Twitter) for real-time posts, discussions, opinions, and trends. Returns relevant posts with authors and engagement data.",
      inputSchema: z.object({
        query: z.string().describe("The search query"),
      }),
      execute: async ({ query }) => {
        try {
          const { text } = await generateText({
            model: provider(SEARCH_MODEL),
            maxOutputTokens: 4096,
            providerOptions: {
              xai: {
                searchParameters: {
                  mode: "on",
                  returnCitations: true,
                  sources: [{ type: "x" }],
                },
              },
            },
            prompt: query,
          });
          return { success: true, output: text };
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          return { success: false, output: `X search failed: ${msg}` };
        }
      },
    }),
  };

  const tools: ToolSet = { ...base };

  if (mode === "agent") {
    tools.write_file = tool({
      description:
        "Create or overwrite a file with the given content. Use for creating new files or completely rewriting existing ones. Returns a diff of the changes.",
      inputSchema: z.object({
        path: z.string().describe("File path (relative to cwd or absolute)"),
        content: z.string().describe("The full file content to write"),
      }),
      execute: async ({ path, content }) => {
        return writeFile(path, content, cwd());
      },
    });

    tools.edit_file = tool({
      description:
        "Edit a file by replacing a unique string with new content. The old_string must appear exactly once in the file. Include enough surrounding context lines in old_string to make it unique. Returns a diff of the changes.",
      inputSchema: z.object({
        path: z.string().describe("File path (relative to cwd or absolute)"),
        old_string: z.string().describe("The exact text to find (must be unique in the file)"),
        new_string: z.string().describe("The replacement text"),
      }),
      execute: async ({ path, old_string, new_string }) => {
        return editFile(path, old_string, new_string, cwd());
      },
    });

    if (options.runTask) {
      tools.task = tool({
        description:
          "Delegate a focused foreground task to a sub-agent. Prefer this proactively for review, research, investigation, and code quality work instead of waiting for the user to request a sub-agent. Use `general` for multi-step execution and `explore` for fast read-only investigation. Provide a short description plus a detailed prompt for the child agent.",
        inputSchema: z.object({
          agent: z.enum(["general", "explore"]).default("general").describe("Which sub-agent to use"),
          description: z
            .string()
            .describe("A short label for the delegated task, such as 'Deep code quality analysis'"),
          prompt: z.string().describe("Detailed instructions for the sub-agent to complete"),
        }),
        execute: async ({ agent, description, prompt }, { abortSignal }) => {
          return options.runTask!({ agent, description, prompt }, abortSignal);
        },
      });
    }

    if (options.runDelegation) {
      tools.delegate = tool({
        description:
          "Launch a read-only background agent that can keep researching while you continue working. Use this only for `explore` tasks that do not edit files or make shell changes. You will be notified when it completes.",
        inputSchema: z.object({
          agent: z
            .enum(["explore"])
            .default("explore")
            .describe("Background delegations currently support only the read-only explore agent"),
          description: z.string().describe("A short label for the delegation, such as 'OAuth callback research'"),
          prompt: z.string().describe("Detailed instructions for the background agent to complete"),
        }),
        execute: async ({ agent, description, prompt }, { abortSignal }) => {
          return options.runDelegation!({ agent, description, prompt }, abortSignal);
        },
      });
    }

    if (options.readDelegation) {
      tools.delegation_read = tool({
        description:
          "Read the saved output of a background delegation by ID. Use this after a completion notice or when revisiting prior research.",
        inputSchema: z.object({
          id: z.string().describe("The delegation ID, such as 'calm-blue-fox'"),
        }),
        execute: async ({ id }) => {
          return options.readDelegation!(id);
        },
      });
    }

    if (options.listDelegations) {
      tools.delegation_list = tool({
        description:
          "List recent background delegations for the current project. Use sparingly to discover IDs or review prior results, not for repeated polling.",
        inputSchema: z.object({}),
        execute: async () => {
          return options.listDelegations!();
        },
      });
    }
  }

  if (mode !== "plan") return tools;

  tools.generate_plan = tool({
    description:
      "Generate an interactive implementation plan with steps and optional questions for the user. The plan is displayed in a structured UI where the user can review steps and answer questions. Always use this tool when creating plans.",
    inputSchema: z.object({
      title: z.string().describe("Plan title"),
      summary: z.string().describe("Brief summary of what the plan accomplishes"),
      steps: z
        .array(
          z.object({
            title: z.string().describe("Step title"),
            description: z.string().describe("Detailed description of what this step involves"),
            filePaths: z.array(z.string()).optional().describe("Files affected by this step"),
          }),
        )
        .describe("Ordered list of implementation steps"),
      questions: z
        .array(
          z.object({
            id: z.string().describe("Unique question identifier"),
            question: z.string().describe("The question to ask the user"),
            header: z.string().optional().describe("Single-word tab label (e.g. 'Format', 'Storage', 'Testing')"),
            type: z
              .enum(["select", "multiselect", "text"])
              .describe("Question type: select (pick one), multiselect (pick many), or text (free-form)"),
            options: z
              .array(
                z.object({
                  id: z.string().describe("Option identifier"),
                  label: z.string().describe("Option display text"),
                }),
              )
              .optional()
              .describe("Options for select/multiselect questions"),
          }),
        )
        .optional()
        .describe("Questions for the user to answer before proceeding"),
    }),
    execute: async ({ title, summary, steps, questions }) => {
      return {
        success: true,
        output: `Plan "${title}" generated with ${steps.length} steps`,
        plan: { title, summary, steps, questions },
      };
    },
  });

  return tools;
}
