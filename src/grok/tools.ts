import { tool, generateText } from "ai";
import { z } from "zod";
import type { BashTool } from "../tools/bash.js";
import type { XaiProvider } from "./client.js";

const SEARCH_MODEL = "grok-3-mini-fast";

export function createTools(bash: BashTool, provider: XaiProvider) {
  return {
    bash: tool({
      description:
        "Execute a bash command. Use this for ALL operations: viewing files (cat, less), editing files (sed, tee), searching (grep, rg, find), git, build tools, package managers, and any other shell command. Commands run in the project working directory.",
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
