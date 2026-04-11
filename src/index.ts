#!/usr/bin/env bun
import { InvalidArgumentError, program } from "commander";
import * as dotenv from "dotenv";
import packageJson from "../package.json";
import { Agent } from "./agent/agent";
import { completeDelegation, failDelegation, loadDelegation } from "./agent/delegations";
import { MODELS, normalizeModelId } from "./grok/models";
import {
  createHeadlessJsonlEmitter,
  type HeadlessOutputFormat,
  isHeadlessOutputFormat,
  renderHeadlessChunk,
  renderHeadlessPrelude,
} from "./headless/output";
import { runTelegramHeadlessBridge } from "./telegram/headless-bridge";
import { startScheduleDaemon } from "./tools/schedule";
import { processAtMentions } from "./utils/at-mentions.js";
import { runScriptManagedUninstall } from "./utils/install-manager";
import {
  getApiKey,
  getBaseURL,
  getCurrentSandboxMode,
  getCurrentSandboxSettings,
  loadPaymentSettings,
  mergeSandboxSettings,
  type SandboxMode,
  type SandboxSettings,
  savePaymentSettings,
  saveUserSettings,
} from "./utils/settings";
import { runUpdate } from "./utils/update-checker";
import { buildVerifyPrompt, getVerifyCliError } from "./verify/entrypoint";

dotenv.config();

const exitCleanlyOnSigterm = () => {
  process.exit(0);
};

process.on("SIGTERM", exitCleanlyOnSigterm);

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
  model: string | undefined,
  maxToolRounds: number,
  batchApi: boolean,
  sandboxMode: SandboxMode,
  sandboxSettings: SandboxSettings,
  session?: string,
  initialMessage?: string,
) {
  const agent = new Agent(apiKey, baseURL, model, maxToolRounds, { session, sandboxMode, sandboxSettings, batchApi });
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
    void agent.cleanup().finally(() => {
      renderer.destroy();
      process.exit(0);
    });
  };

  createRoot(renderer).render(
    createElement(App, {
      agent,
      startupConfig: {
        apiKey,
        baseURL,
        model: agent.getModel(),
        maxToolRounds,
        sandboxMode,
        sandboxSettings,
        version: packageJson.version,
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
  model: string | undefined,
  maxToolRounds: number,
  batchApi: boolean,
  sandboxMode: SandboxMode,
  sandboxSettings: SandboxSettings,
  format: HeadlessOutputFormat,
  session?: string,
) {
  const agent = new Agent(apiKey, baseURL, model, maxToolRounds, {
    session,
    sandboxMode,
    sandboxSettings,
    batchApi,
  });
  const prelude = renderHeadlessPrelude(format, agent.getSessionId() || undefined);
  if (prelude.stdout) process.stdout.write(prelude.stdout);
  if (prelude.stderr) process.stderr.write(prelude.stderr);

  try {
    const { enhancedMessage } = processAtMentions(prompt, process.cwd());

    if (format === "json") {
      const { observer, consumeChunk, flush } = createHeadlessJsonlEmitter(agent.getSessionId() || undefined);
      for await (const chunk of agent.processMessage(enhancedMessage, observer)) {
        const writes = consumeChunk(chunk);
        if (writes.stdout) process.stdout.write(writes.stdout);
        if (writes.stderr) process.stderr.write(writes.stderr ?? "");
      }
      const tail = flush();
      if (tail.stdout) process.stdout.write(tail.stdout);
      if (tail.stderr) process.stderr.write(tail.stderr ?? "");
      return;
    }

    for await (const chunk of agent.processMessage(enhancedMessage)) {
      const writes = renderHeadlessChunk(chunk);
      if (writes.stdout) process.stdout.write(writes.stdout);
      if (writes.stderr) process.stderr.write(writes.stderr);
    }
  } finally {
    await agent.cleanup();
  }
}

function changeDirectoryOrExit(directory: string | undefined) {
  if (!directory) {
    return;
  }

  try {
    process.chdir(directory);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`Cannot change to directory ${directory}: ${msg}`);
    process.exit(1);
  }
}

type CliOptions = Record<string, string | boolean | undefined>;

function stringOption(value: string | boolean | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function collect(value: string, prev: string[]): string[] {
  return [...prev, value];
}

function resolveCliSandboxMode(value: string | boolean | undefined): SandboxMode | undefined {
  if (value === true) return "shuru";
  if (value === false) return "off";
  return undefined;
}

async function runBackgroundDelegation(jobPath: string, options: CliOptions) {
  let output = "";
  let agent: Agent | undefined;

  try {
    const delegation = await loadDelegation(jobPath);
    const apiKey = stringOption(options.apiKey) || getApiKey();
    if (!apiKey) {
      throw new Error("API key required. Set GROK_API_KEY, use --api-key, or save it to ~/.grok/user-settings.json.");
    }

    const baseURL = stringOption(options.baseUrl) || getBaseURL();
    const explicitModel = stringOption(options.model) || delegation.model;
    const model = explicitModel ? normalizeModelId(explicitModel) : undefined;
    const maxToolRounds =
      parseInt(stringOption(options.maxToolRounds) || String(delegation.maxToolRounds), 10) || delegation.maxToolRounds;
    const sandboxMode = resolveCliSandboxMode(options.sandbox) || delegation.sandboxMode || getCurrentSandboxMode();
    const sandboxSettings = mergeSandboxSettings(getCurrentSandboxSettings(), delegation.sandboxSettings);
    agent = new Agent(apiKey, baseURL, model, maxToolRounds, {
      persistSession: false,
      sandboxMode,
      sandboxSettings,
      batchApi: Boolean(delegation.batchApi ?? options.batchApi === true),
    });
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
  } finally {
    await agent?.cleanup();
  }
}

function resolveConfig(options: CliOptions) {
  const apiKey = stringOption(options.apiKey) || getApiKey();
  const baseURL = stringOption(options.baseUrl) || getBaseURL();
  const explicitModel = stringOption(options.model);
  const model = explicitModel ? normalizeModelId(explicitModel) : undefined;
  const maxToolRounds = parseInt(stringOption(options.maxToolRounds) || "400", 10) || 400;
  const sandboxMode = resolveCliSandboxMode(options.sandbox) || getCurrentSandboxMode();

  const cliOverrides: SandboxSettings = {};
  if (options.allowNet === true) cliOverrides.allowNet = true;
  const allowHostValue = options.allowHost;
  if (Array.isArray(allowHostValue) && allowHostValue.length > 0) {
    cliOverrides.allowedHosts = allowHostValue as string[];
    if (!cliOverrides.allowNet) cliOverrides.allowNet = true;
  }
  const portValue = options.port;
  if (Array.isArray(portValue) && portValue.length > 0) {
    cliOverrides.ports = portValue as string[];
  }
  const sandboxSettings = mergeSandboxSettings(getCurrentSandboxSettings(), cliOverrides);

  if (typeof options.apiKey === "string") saveUserSettings({ apiKey: options.apiKey });
  if (typeof options.model === "string") saveUserSettings({ defaultModel: normalizeModelId(options.model) });

  return { apiKey, baseURL, model, maxToolRounds, sandboxMode, sandboxSettings };
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
  .option("--verify", "Run the built-in verify flow headlessly")
  .option("--format <format>", "Headless output format: text or json", parseHeadlessOutputFormat, "text")
  .option("--sandbox", "Run agent shell commands inside a Shuru sandbox")
  .option("--no-sandbox", "Run agent shell commands directly on the host")
  .option("--allow-net", "Enable network access inside the Shuru sandbox")
  .option("--allow-host <pattern>", "Restrict sandbox network to specific hosts (repeatable)", collect, [])
  .option("--port <mapping>", "Forward a host port to sandbox guest (HOST:GUEST, repeatable)", collect, [])
  .option("-s, --session <id>", "Continue a saved session by id, or use 'latest'")
  .option("--background-task-file <path>", "Run a persisted background delegation")
  .option("--max-tool-rounds <n>", "Max tool execution rounds", "400")
  .option("--batch-api", "Use xAI Batch API for model calls (async, lower cost)")
  .option("--update", "Update grok to the latest version and exit")
  .action(async (message: string[], options) => {
    if (options.update) {
      console.log("Checking for updates...");
      const result = await runUpdate(packageJson.version);
      console.log(result.output);
      process.exit(result.success ? 0 : 1);
    }

    changeDirectoryOrExit(options.directory);

    if (options.backgroundTaskFile) {
      await runBackgroundDelegation(options.backgroundTaskFile, options);
      return;
    }

    const config = resolveConfig(options);

    if (options.verify) {
      const verifyError = getVerifyCliError({ hasPrompt: Boolean(options.prompt), hasMessageArgs: message.length > 0 });
      if (verifyError) {
        console.error(verifyError);
        process.exit(1);
      }

      await runHeadless(
        buildVerifyPrompt(process.cwd()),
        requireApiKey(config.apiKey),
        config.baseURL,
        config.model,
        config.maxToolRounds,
        options.batchApi === true,
        config.sandboxMode,
        config.sandboxSettings,
        options.format,
        options.session,
      );
      return;
    }

    if (options.prompt) {
      await runHeadless(
        options.prompt,
        requireApiKey(config.apiKey),
        config.baseURL,
        config.model,
        config.maxToolRounds,
        options.batchApi === true,
        config.sandboxMode,
        config.sandboxSettings,
        options.format,
        options.session,
      );
      return;
    }

    const initialMessage = message.length > 0 ? message.join(" ") : undefined;
    await startInteractive(
      config.apiKey,
      config.baseURL,
      config.model,
      config.maxToolRounds,
      options.batchApi === true,
      config.sandboxMode,
      config.sandboxSettings,
      options.session,
      initialMessage,
    );
  });

program
  .command("telegram-bridge")
  .description("Start the Telegram remote-control bridge without opening the TUI")
  .option("-k, --api-key <key>", "Grok API key")
  .option("-u, --base-url <url>", "API base URL")
  .option("-m, --model <model>", "Model to use")
  .option("-d, --directory <dir>", "Working directory", process.cwd())
  .option("--sandbox", "Run agent shell commands inside a Shuru sandbox")
  .option("--no-sandbox", "Run agent shell commands directly on the host")
  .option("--max-tool-rounds <n>", "Max tool execution rounds", "400")
  .option("--log-file <path>", "Bridge log file", "telegram-remote-bridge.log")
  .option("--pair-code-file <path>", "Pairing code file", "telegram-pair-code.txt")
  .action(async (options) => {
    changeDirectoryOrExit(options.directory);
    const config = resolveConfig(options);

    process.off("SIGTERM", exitCleanlyOnSigterm);
    try {
      await runTelegramHeadlessBridge({
        apiKey: requireApiKey(config.apiKey),
        baseURL: config.baseURL,
        model: config.model,
        maxToolRounds: config.maxToolRounds,
        sandboxMode: config.sandboxMode,
        sandboxSettings: config.sandboxSettings,
        logFile: options.logFile,
        pairCodeFile: options.pairCodeFile,
      });
    } finally {
      process.on("SIGTERM", exitCleanlyOnSigterm);
    }
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

program
  .command("update")
  .description("Update Grok to the latest release")
  .action(async () => {
    console.log("Checking for updates...");
    const result = await runUpdate(packageJson.version);
    console.log(result.output);
    process.exit(result.success ? 0 : 1);
  });

program
  .command("uninstall")
  .description("Remove a script-installed Grok binary and optional data")
  .option("--dry-run", "Show what would be removed without removing it")
  .option("--force", "Skip the confirmation prompt")
  .option("--keep-config", "Keep ~/.grok config files")
  .option("--keep-data", "Keep ~/.grok data files")
  .action(async (options) => {
    const result = await runScriptManagedUninstall({
      dryRun: options.dryRun === true,
      force: options.force === true,
      keepConfig: options.keepConfig === true,
      keepData: options.keepData === true,
    });
    console.log(result.output);
    process.exit(result.success ? 0 : 1);
  });

const walletCommand = program.command("wallet").description("Manage the local x402 wallet and payment settings");

walletCommand
  .command("init")
  .description("Generate a new wallet keypair and enable payments for the selected chain")
  .option("--chain <chain>", "Wallet chain: base or base-sepolia", "base-sepolia")
  .action(async (options) => {
    const { WalletManager } = await import("./wallet/manager");
    const selectedChain = options.chain === "base" ? "base" : "base-sepolia";
    const wallet = new WalletManager();
    const data = wallet.init(selectedChain);
    const current = loadPaymentSettings();
    savePaymentSettings({
      enabled: true,
      chain: data.chain,
      approval: current.approval,
    });

    console.log("\nWallet initialized.");
    console.log(`  Address: ${data.address}`);
    console.log(`  Chain:   ${data.chain}`);
    console.log(`  Created: ${data.createdAt}`);
    console.log("\nPayments have been enabled in ~/.grok/user-settings.json.");
  });

walletCommand
  .command("balance")
  .description("Show the current wallet balance")
  .action(async () => {
    const { WalletManager } = await import("./wallet/manager");
    const wallet = new WalletManager();
    const balance = await wallet.getBalance();
    console.log(`\nAddress: ${balance.address}`);
    console.log(`Chain:   ${balance.chain}`);
    console.log(`${balance.nativeSymbol}:     ${balance.nativeBalance}`);
    console.log(`USDC:    ${balance.usdcBalance}\n`);
  });

walletCommand
  .command("history")
  .description("Show recent x402 payment attempts")
  .option("--limit <n>", "Number of records to show", "20")
  .action(async (options) => {
    const { PaymentHistory } = await import("./payments/history");
    const limit = Number.parseInt(options.limit, 10) || 20;
    const history = new PaymentHistory().list(limit);

    if (history.length === 0) {
      console.log("\nNo payment history yet.\n");
      return;
    }

    console.log();
    for (const row of history) {
      console.log(`${row.createdAt}  ${row.status}`);
      console.log(`  ${row.method} ${row.url}`);
      console.log(`  ${row.amount} ${row.asset} on ${row.network}`);
      if (row.txHash) console.log(`  tx: ${row.txHash}`);
      console.log();
    }
  });

program
  .command("daemon")
  .description("Start the schedule daemon to run scheduled tasks")
  .option("--background", "Detach and run in the background")
  .action(async (options) => {
    if (options.background) {
      const result = await startScheduleDaemon(process.cwd());
      console.log(
        result.alreadyRunning
          ? `Schedule daemon already running (pid: ${result.status.pid ?? "unknown"}).`
          : `Schedule daemon started in the background (pid: ${result.pid ?? "unknown"}).`,
      );
      return;
    }

    process.off("SIGTERM", exitCleanlyOnSigterm);
    const { SchedulerDaemon } = await import("./daemon/scheduler");
    const daemon = new SchedulerDaemon();
    await daemon.start();
  });

program.parse();

function formatContext(tokens: number): string {
  if (tokens >= 1_000_000) return `${tokens / 1_000_000}M`;
  return `${tokens / 1_000}K`;
}
