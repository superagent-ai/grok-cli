import type { ToolDefinition } from "../types/index.js";

export const TOOLS: ToolDefinition[] = [
  {
    type: "function",
    function: {
      name: "bash",
      description:
        "Execute a bash command. Use this for ALL operations: viewing files (cat, less), editing files (sed, tee), searching (grep, rg, find), git, build tools, package managers, and any other shell command. Commands run in the project working directory.",
      parameters: {
        type: "object",
        properties: {
          command: {
            type: "string",
            description: "The bash command to execute",
          },
          timeout: {
            type: "number",
            description:
              "Timeout in milliseconds (default: 30000). Use higher values for long-running commands.",
          },
        },
        required: ["command"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_web",
      description:
        "Search the web for current, real-time information. Returns results from across the internet. Use when the user asks about current events, documentation, APIs, packages, or anything requiring up-to-date information.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "The search query",
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_x",
      description:
        "Search X (formerly Twitter) for posts, discussions, trends, and real-time conversations. Use when the user asks about social media discussions, trending topics, or community sentiment.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "The search query",
          },
        },
        required: ["query"],
      },
    },
  },
];
