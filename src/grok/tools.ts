import { tool, generateText } from "ai";
import { z } from "zod";
import type { BashTool } from "../tools/bash.js";
import { readFile, writeFile, editFile } from "../tools/file.js";
import type { XaiProvider } from "./client.js";

const SEARCH_MODEL = "grok-3-mini-fast";

export function createTools(bash: BashTool, provider: XaiProvider) {
  const cwd = () => bash.getCwd();

  return {
    bash: tool({
      description:
        "Execute a bash command. Use for searching (grep, rg, find), git, build tools, package managers, running tests, and any other shell command. For file read/write/edit, prefer the dedicated file tools instead.",
      inputSchema: z.object({
        command: z.string().describe("The bash command to execute"),
        timeout: z
          .number()
          .optional()
          .describe(
            "Timeout in milliseconds (default: 30000). Use higher values for long-running commands.",
          ),
      }),
      execute: async ({ command, timeout }) => {
        const result = await bash.execute(command, timeout);
        return {
          success: result.success,
          output: result.success
            ? result.output || "Command executed successfully (no output)"
            : result.error || "Command failed",
        };
      },
    }),

    read_file: tool({
      description:
        "Read the contents of a file. Returns numbered lines with a header showing the range and total line count. Use start_line/end_line to read specific sections of large files iteratively.",
      inputSchema: z.object({
        path: z.string().describe("File path (relative to cwd or absolute)"),
        start_line: z
          .number()
          .optional()
          .describe("First line to read (1-indexed, default: 1)"),
        end_line: z
          .number()
          .optional()
          .describe("Last line to read (inclusive, default: end of file)"),
      }),
      execute: async ({ path, start_line, end_line }) => {
        return readFile(path, cwd(), start_line, end_line);
      },
    }),

    write_file: tool({
      description:
        "Create or overwrite a file with the given content. Use for creating new files or completely rewriting existing ones. Returns a diff of the changes.",
      inputSchema: z.object({
        path: z.string().describe("File path (relative to cwd or absolute)"),
        content: z.string().describe("The full file content to write"),
      }),
      execute: async ({ path, content }) => {
        return writeFile(path, content, cwd());
      },
    }),

    edit_file: tool({
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
}
