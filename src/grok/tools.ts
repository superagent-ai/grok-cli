import { generateText, type ToolSet, tool } from "ai";
import { z } from "zod";
import type { BashTool } from "../tools/bash";
import { editFile, readFile, writeFile } from "../tools/file";
import type { ScheduleDaemonStatus, ScheduleManager, StoredSchedule } from "../tools/schedule";
import type { AgentMode, TaskRequest, ToolResult } from "../types/index";
import { type CustomSubagentConfig, loadValidSubAgents } from "../utils/settings";
import type { XaiProvider } from "./client";
import {
  type GenerateImageToolInput,
  type GenerateVideoToolInput,
  generateImageTool,
  generateVideoTool,
  IMAGE_ASPECT_RATIOS,
  IMAGE_RESOLUTIONS,
  VIDEO_ASPECT_RATIOS,
  VIDEO_RESOLUTIONS,
} from "./media";

const RESPONSES_SEARCH_MODEL = "grok-4-1-fast-non-reasoning";

interface CreateToolsOptions {
  runTask?: (request: TaskRequest, abortSignal?: AbortSignal) => Promise<ToolResult>;
  runDelegation?: (request: TaskRequest, abortSignal?: AbortSignal) => Promise<ToolResult>;
  readDelegation?: (id: string) => Promise<ToolResult>;
  listDelegations?: () => Promise<ToolResult>;
  scheduleManager?: ScheduleManager;
  subagents?: CustomSubagentConfig[];
  sendTelegramFile?: (filePath: string) => Promise<ToolResult>;
}

export function createTools(
  bash: BashTool,
  provider: XaiProvider,
  mode: AgentMode = "agent",
  options: CreateToolsOptions = {},
) {
  const cwd = () => bash.getCwd();

  const runResponsesSearch = async (
    query: string,
    toolName: "web_search" | "x_search",
    abortSignal?: AbortSignal,
  ): Promise<{ success: boolean; output: string }> => {
    try {
      const { text } = await generateText({
        model: provider.responses(RESPONSES_SEARCH_MODEL),
        maxOutputTokens: 4096,
        prompt: query,
        abortSignal,
        tools: {
          ...(toolName === "web_search" ? { web_search: provider.tools.webSearch() } : {}),
          ...(toolName === "x_search" ? { x_search: provider.tools.xSearch() } : {}),
        },
      });

      return {
        success: true,
        output: text || "No search results found.",
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      const label = toolName === "web_search" ? "Web search" : "X search";
      return { success: false, output: `${label} failed: ${msg}` };
    }
  };

  const base = {
    bash: tool({
      description: bash.getToolDescription(),
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
      execute: async ({ command, timeout, background }, { abortSignal }) => {
        if (background) {
          return bash.startBackground(command);
        }
        const result = await bash.execute(command, timeout, abortSignal);
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
      execute: async ({ query }, { abortSignal }) => {
        return runResponsesSearch(query, "web_search", abortSignal);
      },
    }),

    search_x: tool({
      description:
        "Search X (Twitter) for real-time posts, discussions, opinions, and trends. Returns relevant posts with authors and engagement data.",
      inputSchema: z.object({
        query: z.string().describe("The search query"),
      }),
      execute: async ({ query }, { abortSignal }) => {
        return runResponsesSearch(query, "x_search", abortSignal);
      },
    }),

    generate_image: tool({
      description:
        "Generate a new image or edit an existing image using Grok Imagine. Use when the user asks to create, redesign, restyle, or modify an image. Optionally pass a local file path or public URL in source to edit an existing image. Saves the generated image files locally and returns their paths.",
      inputSchema: z.object({
        prompt: z.string().describe("Prompt describing the image to generate or the edit to apply"),
        source: z
          .string()
          .optional()
          .describe("Optional local image path or public image URL to use as the source for editing"),
        aspect_ratio: z
          .enum(IMAGE_ASPECT_RATIOS)
          .optional()
          .describe("Optional output aspect ratio. Use when the user requests a specific format."),
        resolution: z.enum(IMAGE_RESOLUTIONS).optional().describe("Optional output resolution: 1k or 2k"),
        n: z.number().int().min(1).max(10).optional().describe("Number of images to generate (default: 1)"),
        output_path: z
          .string()
          .optional()
          .describe("Optional file path for the generated image. For multiple images, numbered suffixes are added."),
      }),
      execute: async (input: GenerateImageToolInput, { abortSignal }) => {
        return generateImageTool(provider, input, cwd(), abortSignal);
      },
    }),

    generate_video: tool({
      description:
        "Generate a new short video or animate an existing image using Grok Imagine Video. Use when the user asks for a clip, animation, cinematic shot, or motion from a still image. Optionally pass a local image path or public image URL in source for image-to-video generation. Saves the generated video files locally and returns their paths.",
      inputSchema: z.object({
        prompt: z.string().describe("Prompt describing the video or motion to generate"),
        source: z
          .string()
          .optional()
          .describe("Optional local image path or public image URL to use as the starting frame"),
        duration: z.number().int().min(1).max(15).optional().describe("Video duration in seconds (1-15)"),
        aspect_ratio: z
          .enum(VIDEO_ASPECT_RATIOS)
          .optional()
          .describe("Optional output aspect ratio for text-to-video or to override image-to-video framing"),
        resolution: z.enum(VIDEO_RESOLUTIONS).optional().describe("Optional output resolution: 480p or 720p"),
        output_path: z
          .string()
          .optional()
          .describe("Optional file path for the generated video. For multiple videos, numbered suffixes are added."),
        poll_interval_ms: z
          .number()
          .int()
          .min(100)
          .optional()
          .describe("Optional polling interval in milliseconds while waiting for video generation"),
        poll_timeout_ms: z
          .number()
          .int()
          .min(1000)
          .optional()
          .describe("Optional timeout in milliseconds while waiting for video generation"),
      }),
      execute: async (input: GenerateVideoToolInput, { abortSignal }) => {
        return generateVideoTool(provider, input, cwd(), abortSignal);
      },
    }),
  };

  const tools: ToolSet = { ...base };

  if (options.sendTelegramFile) {
    const sendFile = options.sendTelegramFile;
    tools.telegram_send_file = tool({
      description:
        "Send a local file to the current Telegram chat as an attachment. Use this to deliver generated images, videos, documents, or any other file to the user in Telegram. The file is uploaded directly — the user receives it as a Telegram media message or document.",
      inputSchema: z.object({
        path: z.string().describe("Absolute or cwd-relative path to the local file to send"),
      }),
      execute: async ({ path: filePath }) => {
        const resolved = filePath.startsWith("/") ? filePath : `${cwd()}/${filePath}`;
        return sendFile(resolved);
      },
    });
  }

  if (options.runTask) {
    const customNames = (options.subagents ?? loadValidSubAgents()).map((agent) => agent.name);
    const taskAgentEnum = ["general", "explore", "vision", "verify", ...customNames] as [string, ...string[]];
    const customHint =
      customNames.length > 0
        ? ` You may also use these user-defined sub-agents by exact name: ${customNames.join(", ")}.`
        : "";

    tools.task = tool({
      description: `Delegate a focused foreground task to a sub-agent. Prefer this proactively for review, research, investigation, code quality work, and verification instead of waiting for the user to request a sub-agent. Use \`general\` for multi-step execution, \`explore\` for fast read-only investigation, \`vision\` for image validation, and \`verify\` for sandbox-aware build, test, and smoke validation.${customHint} Provide a short description plus a detailed prompt for the child agent.`,
      inputSchema: z.object({
        agent: z
          .enum(taskAgentEnum)
          .default("general")
          .describe(
            customNames.length > 0
              ? "Built-in general, explore, vision, or verify, or a configured custom sub-agent name from user settings"
              : "Which sub-agent to use",
          ),
        description: z.string().describe("A short label for the delegated task, such as 'Deep code quality analysis'"),
        prompt: z.string().describe("Detailed instructions for the sub-agent to complete"),
      }),
      execute: async ({ agent, description, prompt }, { abortSignal }) => {
        return options.runTask!({ agent, description, prompt }, abortSignal);
      },
    });
  }

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

    if (options.scheduleManager) {
      const schedules = options.scheduleManager;

      tools.schedule_create = tool({
        description:
          "Create a recurring or one-time scheduled headless Grok run. Provide a name, the instruction to run, and a cron expression for recurring schedules. Omit cron for an immediate one-time run.",
        inputSchema: z.object({
          name: z.string().describe("Human-readable schedule name"),
          instruction: z.string().describe("The prompt/instruction Grok should run headlessly"),
          cron: z.string().optional().describe("Cron expression for recurring schedules, such as '0 9 * * 1-5'"),
          model: z.string().optional().describe("Optional model override; defaults to the current selected model"),
          directory: z.string().optional().describe("Optional working directory; defaults to the current directory"),
          max_tool_rounds: z.number().int().positive().optional().describe("Optional max tool rounds override"),
        }),
        execute: async ({ name, instruction, cron, model, directory, max_tool_rounds }) => {
          try {
            const result = await schedules.create({
              name,
              instruction,
              cron,
              model,
              directory,
              maxToolRounds: max_tool_rounds,
            });

            const lines = [
              `Schedule created: ${result.schedule.name}`,
              `ID: ${result.schedule.id}`,
              `Type: ${result.schedule.cron ? "recurring" : "one-time"}`,
              `Model: ${result.schedule.model}`,
              `Directory: ${result.schedule.directory}`,
            ];
            if (result.schedule.cron) {
              lines.push(`Cron: ${result.schedule.cron}`);
              lines.push(formatDaemonReminder(result.daemonStatus));
            } else {
              lines.push(`Run started in background${result.startedPid ? ` (pid ${result.startedPid})` : ""}.`);
            }

            return { success: true, output: lines.join("\n") };
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            return { success: false, output: `Failed to create schedule: ${msg}` };
          }
        },
      });

      tools.schedule_list = tool({
        description:
          "List all saved schedules, including one-time and recurring runs, along with daemon status and last run time.",
        inputSchema: z.object({}),
        execute: async () => {
          try {
            const [items, daemonStatus] = await Promise.all([schedules.list(), schedules.getDaemonStatus()]);
            if (items.length === 0) {
              return {
                success: true,
                output: `No schedules found.\n${formatDaemonReminder(daemonStatus)}`,
              };
            }

            return {
              success: true,
              output: formatScheduleList(items, daemonStatus),
            };
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            return { success: false, output: `Failed to list schedules: ${msg}` };
          }
        },
      });

      tools.schedule_remove = tool({
        description: "Remove a saved schedule and its run logs by schedule id.",
        inputSchema: z.object({
          id: z.string().describe("Schedule id, such as 'daily-security-scan'"),
        }),
        execute: async ({ id }) => {
          try {
            const removed = await schedules.remove(id);
            if (!removed) {
              return { success: false, output: `Schedule "${id}" not found.` };
            }
            return {
              success: true,
              output: `Removed schedule "${removed.name}" (${removed.id}).`,
            };
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            return { success: false, output: `Failed to remove schedule: ${msg}` };
          }
        },
      });

      tools.schedule_read_log = tool({
        description: "Read recent log output from a saved schedule.",
        inputSchema: z.object({
          id: z.string().describe("Schedule id, such as 'daily-security-scan'"),
          tail: z.number().int().positive().optional().describe("Number of log lines to return from the end"),
        }),
        execute: async ({ id, tail }) => {
          try {
            return {
              success: true,
              output: await schedules.readLog(id, tail ?? 50),
            };
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            return { success: false, output: `Failed to read schedule log: ${msg}` };
          }
        },
      });

      tools.schedule_daemon_status = tool({
        description: "Check whether the schedule daemon is currently running.",
        inputSchema: z.object({}),
        execute: async () => {
          try {
            const status = await schedules.getDaemonStatus();
            return {
              success: true,
              output: formatDaemonReminder(status),
            };
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            return { success: false, output: `Failed to get schedule daemon status: ${msg}` };
          }
        },
      });

      tools.schedule_daemon_start = tool({
        description:
          "Start the schedule daemon in the background so recurring schedules can run even after the TUI closes.",
        inputSchema: z.object({}),
        execute: async () => {
          try {
            const result = await schedules.startDaemon();
            return {
              success: true,
              output: result.alreadyRunning
                ? `Schedule daemon already running${result.status.pid ? ` (pid ${result.status.pid})` : ""}.`
                : `Schedule daemon started${result.pid ? ` (pid ${result.pid})` : ""}.`,
            };
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            return { success: false, output: `Failed to start schedule daemon: ${msg}` };
          }
        },
      });

      tools.schedule_daemon_stop = tool({
        description: "Stop the background schedule daemon.",
        inputSchema: z.object({}),
        execute: async () => {
          try {
            const result = await schedules.stopDaemon();
            return {
              success: true,
              output: result.wasRunning
                ? `Schedule daemon stopped${result.pid ? ` (pid ${result.pid})` : ""}.`
                : "Schedule daemon is not running.",
            };
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            return { success: false, output: `Failed to stop schedule daemon: ${msg}` };
          }
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

function formatScheduleList(schedules: StoredSchedule[], daemonStatus: ScheduleDaemonStatus): string {
  const lines = [
    `Daemon: ${daemonStatus.running ? `running${daemonStatus.pid ? ` (pid ${daemonStatus.pid})` : ""}` : "not running"}`,
  ];

  for (const schedule of schedules) {
    const scheduleType = schedule.cron ? "recurring" : "one-time";
    lines.push("");
    lines.push(`- ${schedule.name} (\`${schedule.id}\`)`);
    lines.push(`  type: ${scheduleType}`);
    if (schedule.cron) {
      lines.push(`  cron: ${schedule.cron}`);
      lines.push(`  enabled: ${schedule.enabled ? "yes" : "no"}`);
    }
    lines.push(`  model: ${schedule.model}`);
    lines.push(`  directory: ${schedule.directory}`);
    lines.push(`  last run: ${schedule.lastRunAt ?? "never"}`);
  }

  if (!daemonStatus.running) {
    lines.push("");
    lines.push("Start `grok daemon` to run recurring schedules.");
  }

  return lines.join("\n");
}

function formatDaemonReminder(status: ScheduleDaemonStatus): string {
  if (status.running) {
    return `Daemon status: running${status.pid ? ` (pid ${status.pid})` : ""}.`;
  }
  return "Daemon status: not running. Use `schedule_daemon_start` (or `grok daemon`) to run recurring schedules.";
}
