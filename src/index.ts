#!/usr/bin/env bun
import { InvalidArgumentError, program } from "commander";
import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";
import packageJson from "../package.json";
import { Agent, type ProcessMessageObserver } from "./agent/agent";
import { completeDelegation, failDelegation, loadDelegation } from "./agent/delegations";
import { MODELS, normalizeModelId } from "./grok/models";
import {
  createHeadlessJsonlEmitter,
  type HeadlessOutputFormat,
  isHeadlessOutputFormat,
  renderHeadlessChunk,
  renderHeadlessPrelude,
  renderHeadlessRunFinishEvent,
} from "./headless/output";
import { getApiKey, getBaseURL, getCurrentModel, getHeadlessOutputFilePath, saveUserSettings } from "./utils/settings";

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
  apiKey: string | undefined,
  baseURL: string,
  model: string,
  maxToolRounds: number,
  session?: string,
  initialMessage?: string,
) {
  const agent = new Agent(apiKey, baseURL, model, maxToolRounds, { session });
  const { createCliRenderer } = await import("@opentui/core");
  const { createRoot } = await import("@opentui/react");
  const { createElement } = await import("react");
  const { App } = await import("./ui/app");

  const renderer = await createCliRenderer({
    exitOnCtrlC: false,
    // Lets terminals (Kitty, iTerm2, WezTerm, …) report Command as `super` on KeyEvent — needed for ⌘C in the TUI.
    useKittyKeyboard: {
      disambiguate: true,
      alternateKeys: true,
    },
  });

  const onExit = () => {
    renderer.destroy();
    process.exit(0);
  };

  createRoot(renderer).render(
    createElement(App, {
      agent,
      startupConfig: {
        apiKey,
        baseURL,
        model,
        maxToolRounds,
      },
      initialMessage,
      onExit,
    }),
  );
}

async function runHeadless(
  prompt: string,
  apiKey: string,
  baseURL: string,
  model: string,
  maxToolRounds: number,
  format: HeadlessOutputFormat,
  session?: string,
  outputFilePath?: string,
): Promise<{ success: boolean; errorCount: number; lastStepNumber: number }> {
  const agent = new Agent(apiKey, baseURL, model, maxToolRounds, { session });
  const outputFile = prepareHeadlessOutputFile(outputFilePath);
  let errorCount = 0;
  let lastStepNumber = 0;
  const trackStep = (stepNumber: number) => {
    lastStepNumber = Math.max(lastStepNumber, stepNumber);
  };
  const prelude = renderHeadlessPrelude(format, agent.getSessionId() || undefined);
  writeHeadlessWrites(prelude, outputFile);

  if (format === "json") {
    const { observer, consumeChunk, flush } = createHeadlessJsonlEmitter(agent.getSessionId() || undefined);
    const trackingObserver: ProcessMessageObserver = {
      onStepStart(info) {
        trackStep(info.stepNumber);
        observer.onStepStart?.(info);
      },
      onStepFinish(info) {
        trackStep(info.stepNumber);
        observer.onStepFinish?.(info);
      },
      onToolStart: observer.onToolStart,
      onToolFinish: observer.onToolFinish,
      onError(info) {
        errorCount += 1;
        observer.onError?.(info);
      },
    };
    for await (const chunk of agent.processMessage(prompt, trackingObserver)) {
      writeHeadlessWrites(consumeChunk(chunk), outputFile);
    }
    writeHeadlessWrites(flush(), outputFile);
    const success = errorCount === 0;
    writeHeadlessWrites(
      {
        stdout: renderHeadlessRunFinishEvent({
          sessionId: agent.getSessionId() || undefined,
          success,
          exitCode: success ? 0 : 1,
          errorCount,
          lastStepNumber,
        }),
      },
      outputFile,
    );
    return { success, errorCount, lastStepNumber };
  }

  const trackingObserver: ProcessMessageObserver = {
    onStepStart(info) {
      trackStep(info.stepNumber);
    },
    onStepFinish(info) {
      trackStep(info.stepNumber);
    },
    onError() {
      errorCount += 1;
    },
  };
  for await (const chunk of agent.processMessage(prompt, trackingObserver)) {
    writeHeadlessWrites(renderHeadlessChunk(chunk), outputFile);
  }
  return { success: errorCount === 0, errorCount, lastStepNumber };
}

async function runBackgroundDelegation(jobPath: string, options: Record<string, string | undefined>) {
  let output = "";

  try {
    const delegation = await loadDelegation(jobPath);
    const apiKey = options.apiKey || getApiKey();
    if (!apiKey) {
      throw new Error("API key required. Set GROK_API_KEY, use --api-key, or save it to ~/.grok/user-settings.json.");
    }

    const baseURL = options.baseUrl || getBaseURL();
    const model = normalizeModelId(options.model || delegation.model || getCurrentModel());
    const maxToolRounds =
      parseInt(options.maxToolRounds || String(delegation.maxToolRounds), 10) || delegation.maxToolRounds;
    const agent = new Agent(apiKey, baseURL, model, maxToolRounds, { persistSession: false });
    const result = await agent.runTaskRequest({
      agent: delegation.agent,
      description: delegation.description,
      prompt: delegation.prompt,
    });

    output = (result.output || "").trim();

    if (!result.success) {
      await failDelegation(jobPath, result.output || result.error || "Background delegation failed.", output);
      return;
    }

    await completeDelegation(jobPath, output, result.task?.summary);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    try {
      await failDelegation(jobPath, msg, output);
    } catch {
      // Best effort — background tasks should fail silently if persistence is unavailable.
    }
    process.exit(1);
  }
}

function resolveConfig(options: Record<string, string | undefined>) {
  const apiKey = options.apiKey || getApiKey();
  const baseURL = options.baseUrl || getBaseURL();
  const model = normalizeModelId(options.model || getCurrentModel());
  const maxToolRounds = parseInt(options.maxToolRounds || "400", 10) || 400;

  if (options.apiKey) saveUserSettings({ apiKey: options.apiKey });
  if (options.model) saveUserSettings({ defaultModel: normalizeModelId(options.model) });

  return { apiKey, baseURL, model, maxToolRounds };
}

function requireApiKey(apiKey: string | undefined): string {
  if (!apiKey) {
    console.error(
      "Error: API key required. Set GROK_API_KEY env var, use --api-key, or save to ~/.grok/user-settings.json",
    );
    process.exit(1);
  }

  return apiKey;
}

function parseHeadlessOutputFormat(value: string): HeadlessOutputFormat {
  if (isHeadlessOutputFormat(value)) {
    return value;
  }

  throw new InvalidArgumentError(`Invalid headless format "${value}". Expected "text" or "json".`);
}

function prepareHeadlessOutputFile(outputFilePath?: string): string | undefined {
  if (!outputFilePath) {
    return undefined;
  }

  const resolvedPath = path.resolve(outputFilePath);
  fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
  fs.writeFileSync(resolvedPath, "");
  return resolvedPath;
}

function writeHeadlessWrites(writes: { stdout?: string; stderr?: string }, outputFilePath?: string): void {
  if (writes.stdout) {
    process.stdout.write(writes.stdout);
    if (outputFilePath) {
      fs.appendFileSync(outputFilePath, writes.stdout);
    }
  }
  if (writes.stderr) {
    process.stderr.write(writes.stderr);
  }
}

program
  .name("grok")
  .description("AI coding agent powered by Grok — built with Bun and OpenTUI")
  .version(packageJson.version)
  .argument("[message...]", "Initial message to send")
  .option("-k, --api-key <key>", "Grok API key")
  .option("-u, --base-url <url>", "API base URL")
  .option("-m, --model <model>", "Model to use")
  .option("-d, --directory <dir>", "Working directory", process.cwd())
  .option("-p, --prompt <prompt>", "Run a single prompt headlessly")
  .option("--format <format>", "Headless output format: text or json", parseHeadlessOutputFormat, "text")
  .option("--output-file <path>", "Write headless stdout to a file")
  .option("--benchmark", "Enable benchmark-safe behavior for headless runs")
  .option("-s, --session <id>", "Continue a saved session by id, or use 'latest'")
  .option("--background-task-file <path>", "Run a persisted background delegation")
  .option("--max-tool-rounds <n>", "Max tool execution rounds", "400")
  .action(async (message: string[], options) => {
    if (options.benchmark) {
      process.env.GROK_BENCHMARK = "1";
      process.env.GROK_DISABLE_SEARCH_TOOLS = "1";
    }

    if (options.directory) {
      try {
        process.chdir(options.directory);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`Cannot change to directory ${options.directory}: ${msg}`);
        process.exit(1);
      }
    }

    if (options.backgroundTaskFile) {
      await runBackgroundDelegation(options.backgroundTaskFile, options);
      return;
    }

    const config = resolveConfig(options);
    const outputFilePath = options.outputFile || getHeadlessOutputFilePath();

    if (outputFilePath && !options.prompt) {
      console.error("Error: --output-file can only be used together with --prompt");
      process.exit(1);
    }

    if (options.prompt) {
      const result = await runHeadless(
        options.prompt,
        requireApiKey(config.apiKey),
        config.baseURL,
        config.model,
        config.maxToolRounds,
        options.format,
        options.session,
        outputFilePath,
      );
      if (!result.success) {
        process.exitCode = 1;
      }
      return;
    }

    const initialMessage = message.length > 0 ? message.join(" ") : undefined;
    await startInteractive(
      config.apiKey,
      config.baseURL,
      config.model,
      config.maxToolRounds,
      options.session,
      initialMessage,
    );
  });

program
  .command("models")
  .description("List available Grok models")
  .action(() => {
    console.log("\nAvailable Grok Models:\n");
    for (const m of MODELS) {
      const tags = [
        m.reasoning ? "reasoning" : "non-reasoning",
        m.multiAgent ? "multi-agent" : null,
        m.responsesOnly ? "responses-only" : null,
      ].filter(Boolean);
      const suffix = tags.length > 0 ? ` (${tags.join(", ")})` : "";
      console.log(`  \x1b[36m${m.id}\x1b[0m — ${m.name}${suffix}`);
      console.log(
        `    ${m.description} | ${formatContext(m.contextWindow)} context | $${m.inputPrice}/$${m.outputPrice} per 1M tokens`,
      );
      if ((m.aliases?.length ?? 0) > 0) {
        console.log(`    aliases: ${(m.aliases ?? []).join(", ")}`);
      }
    }
    console.log();
  });

program.parse();

function formatContext(tokens: number): string {
  if (tokens >= 1_000_000) return `${tokens / 1_000_000}M`;
  return `${tokens / 1_000}K`;
}
