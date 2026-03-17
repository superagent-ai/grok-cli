#!/usr/bin/env bun
import { program } from "commander";
import * as dotenv from "dotenv";
import { createCliRenderer } from "@opentui/core";
import { createRoot } from "@opentui/react";
import { createElement } from "react";
import { Agent } from "./agent/agent.js";
import { App } from "./ui/app.js";
import { getApiKey, getBaseURL, getCurrentModel, saveUserSettings } from "./utils/settings.js";
import { MODELS } from "./grok/models.js";

dotenv.config();

process.on("SIGTERM", () => {
  process.exit(0);
});

process.on("uncaughtException", (err) => {
  console.error("Fatal:", err.message);
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled rejection:", reason);
  process.exit(1);
});

async function startInteractive(
  apiKey: string,
  baseURL: string,
  model: string,
  maxToolRounds: number,
  initialMessage?: string,
) {
  const agent = new Agent(apiKey, baseURL, model, maxToolRounds);

  const renderer = await createCliRenderer({
    exitOnCtrlC: true,
  });

  createRoot(renderer).render(createElement(App, { agent, initialMessage }));
}

async function runHeadless(
  prompt: string,
  apiKey: string,
  baseURL: string,
  model: string,
  maxToolRounds: number,
) {
  const agent = new Agent(apiKey, baseURL, model, maxToolRounds);

  process.stdout.write(`\x1b[36m⏳ Processing...\x1b[0m\n`);

  for await (const chunk of agent.processMessage(prompt)) {
    switch (chunk.type) {
      case "content":
        if (chunk.content) process.stdout.write(chunk.content);
        break;
      case "tool_calls":
        if (chunk.toolCalls) {
          for (const tc of chunk.toolCalls) {
            process.stderr.write(`\x1b[33m⚙ ${tc.function.name}\x1b[0m\n`);
          }
        }
        break;
      case "tool_result":
        if (chunk.toolResult) {
          const icon = chunk.toolResult.success ? "✓" : "✗";
          const color = chunk.toolResult.success ? "\x1b[32m" : "\x1b[31m";
          process.stderr.write(`${color}${icon} ${chunk.toolCall?.function.name || "tool"}\x1b[0m\n`);
        }
        break;
      case "error":
        process.stderr.write(`\x1b[31m${chunk.content}\x1b[0m\n`);
        break;
      case "done":
        process.stdout.write("\n");
        break;
    }
  }
}

function resolveConfig(options: Record<string, string | undefined>) {
  const apiKey = options.apiKey || getApiKey();
  const baseURL = options.baseUrl || getBaseURL();
  const model = options.model || getCurrentModel();
  const maxToolRounds = parseInt(options.maxToolRounds || "400") || 400;

  if (!apiKey) {
    console.error(
      "Error: API key required. Set GROK_API_KEY env var, use --api-key, or save to ~/.grok/user-settings.json",
    );
    process.exit(1);
  }

  if (options.apiKey) saveUserSettings({ apiKey: options.apiKey });
  if (options.baseUrl) saveUserSettings({ baseURL: options.baseUrl });

  return { apiKey, baseURL, model, maxToolRounds };
}

program
  .name("grok")
  .description("AI coding agent powered by Grok — built with Bun and OpenTUI")
  .version("1.0.0")
  .argument("[message...]", "Initial message to send")
  .option("-k, --api-key <key>", "Grok API key")
  .option("-u, --base-url <url>", "API base URL")
  .option("-m, --model <model>", "Model to use")
  .option("-d, --directory <dir>", "Working directory", process.cwd())
  .option("-p, --prompt <prompt>", "Run a single prompt headlessly")
  .option("--max-tool-rounds <n>", "Max tool execution rounds", "400")
  .action(async (message: string[], options) => {
    if (options.directory) {
      try {
        process.chdir(options.directory);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`Cannot change to directory ${options.directory}: ${msg}`);
        process.exit(1);
      }
    }

    const config = resolveConfig(options);

    if (options.prompt) {
      await runHeadless(options.prompt, config.apiKey, config.baseURL, config.model, config.maxToolRounds);
      return;
    }

    const initialMessage = message.length > 0 ? message.join(" ") : undefined;
    await startInteractive(config.apiKey, config.baseURL, config.model, config.maxToolRounds, initialMessage);
  });

program
  .command("models")
  .description("List available Grok models")
  .action(() => {
    console.log("\nAvailable Grok Models:\n");
    for (const m of MODELS) {
      const reasoning = m.reasoning ? " (reasoning)" : "";
      console.log(
        `  \x1b[36m${m.id}\x1b[0m — ${m.name}${reasoning}`,
      );
      console.log(
        `    ${m.description} | ${formatContext(m.contextWindow)} context | $${m.inputPrice}/$${m.outputPrice} per 1M tokens`,
      );
    }
    console.log();
  });

program.parse();

function formatContext(tokens: number): string {
  if (tokens >= 1_000_000) return `${tokens / 1_000_000}M`;
  return `${tokens / 1_000}K`;
}
