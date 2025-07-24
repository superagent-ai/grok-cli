#!/usr/bin/env node

import React from "react";
import { render } from "ink";
import { program } from "commander";
import * as dotenv from "dotenv";
import { GrokAgent } from "./agent/grok-agent";
import ChatInterface from "./ui/components/chat-interface";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { ConfirmationService } from "./utils/confirmation-service";

// Load environment variables
dotenv.config();

// Ensure user .grok directory exists with default settings
function ensureUserSettingsDirectory(): void {
  try {
    const homeDir = os.homedir();
    const grokDir = path.join(homeDir, ".grok");
    const settingsFile = path.join(grokDir, "user-settings.json");

    // Create .grok directory if it doesn't exist
    if (!fs.existsSync(grokDir)) {
      fs.mkdirSync(grokDir, { recursive: true });
    }

    // Create default user-settings.json if it doesn't exist
    if (!fs.existsSync(settingsFile)) {
      const defaultSettings = {
        apiKey: "",
        baseURL: "",
        defaultModel: "grok-4-latest"
      };
      fs.writeFileSync(settingsFile, JSON.stringify(defaultSettings, null, 2));
    }
  } catch (error) {
    // Silently ignore errors during setup
  }
}

// Load API key from user settings if not in environment
function loadApiKey(): string | undefined {
  // First check environment variables
  let apiKey = process.env.GROK_API_KEY;

  if (!apiKey) {
    // Try to load from user settings file
    try {
      ensureUserSettingsDirectory();
      const homeDir = os.homedir();
      const settingsFile = path.join(homeDir, ".grok", "user-settings.json");

      if (fs.existsSync(settingsFile)) {
        const settings = JSON.parse(fs.readFileSync(settingsFile, "utf8"));
        apiKey = settings.apiKey;
      }
    } catch (error) {
      // Ignore errors, apiKey will remain undefined
    }
  }

  return apiKey;
}

// Load base URL from user settings if not in environment
function loadBaseURL(): string | undefined {
  // First check environment variables
  let baseURL = process.env.GROK_BASE_URL;

  if (!baseURL) {
    // Try to load from user settings file
    try {
      ensureUserSettingsDirectory();
      const homeDir = os.homedir();
      const settingsFile = path.join(homeDir, ".grok", "user-settings.json");

      if (fs.existsSync(settingsFile)) {
        const settings = JSON.parse(fs.readFileSync(settingsFile, "utf8"));
        baseURL = settings.baseURL;
      }
    } catch (error) {
      // Ignore errors, baseURL will remain undefined
    }
  }

  return baseURL;
}

// Handle commit-and-push command in headless mode
async function handleCommitAndPushHeadless(
  apiKey: string,
  baseURL?: string,
  model?: string
): Promise<void> {
  try {
    const agent = new GrokAgent(apiKey, baseURL, model);

    // Configure confirmation service for headless mode (auto-approve all operations)
    const confirmationService = ConfirmationService.getInstance();
    confirmationService.setSessionFlag("allOperations", true);

    console.log("🤖 Processing commit and push...\n");
    console.log("> /commit-and-push\n");

    // First check if there are any changes at all
    const initialStatusResult = await agent.executeBashCommand("git status --porcelain");
    
    if (!initialStatusResult.success || !initialStatusResult.output?.trim()) {
      console.log("❌ No changes to commit. Working directory is clean.");
      process.exit(1);
    }

    console.log("✅ git status: Changes detected");

    // Add all changes
    const addResult = await agent.executeBashCommand("git add .");
    
    if (!addResult.success) {
      console.log(`❌ git add: ${addResult.error || 'Failed to stage changes'}`);
      process.exit(1);
    }

    console.log("✅ git add: Changes staged");

    // Get staged changes for commit message generation
    const diffResult = await agent.executeBashCommand("git diff --cached");

    // Generate commit message using AI
    const commitPrompt = `Generate a concise, professional git commit message for these changes:

Git Status:
${initialStatusResult.output}

Git Diff (staged changes):
${diffResult.output || "No staged changes shown"}

Follow conventional commit format (feat:, fix:, docs:, etc.) and keep it under 72 characters.
Respond with ONLY the commit message, no additional text.`;

    console.log("🤖 Generating commit message...");
    
    const commitMessageEntries = await agent.processUserMessage(commitPrompt);
    let commitMessage = "";
    
    // Extract the commit message from the AI response
    for (const entry of commitMessageEntries) {
      if (entry.type === "assistant" && entry.content.trim()) {
        commitMessage = entry.content.trim();
        break;
      }
    }

    if (!commitMessage) {
      console.log("❌ Failed to generate commit message");
      process.exit(1);
    }

    // Clean the commit message
    const cleanCommitMessage = commitMessage.replace(/^["']|["']$/g, '');
    console.log(`✅ Generated commit message: "${cleanCommitMessage}"`);

    // Execute the commit
    const commitCommand = `git commit -m "${cleanCommitMessage}"`;
    const commitResult = await agent.executeBashCommand(commitCommand);

    if (commitResult.success) {
      console.log(`✅ git commit: ${commitResult.output?.split('\n')[0] || 'Commit successful'}`);
      
      // If commit was successful, push to remote
      // First try regular push, if it fails try with upstream setup
      let pushResult = await agent.executeBashCommand("git push");
      
      if (!pushResult.success && pushResult.error?.includes("no upstream branch")) {
        console.log("🔄 Setting upstream and pushing...");
        pushResult = await agent.executeBashCommand("git push -u origin HEAD");
      }
      
      if (pushResult.success) {
        console.log(`✅ git push: ${pushResult.output?.split('\n')[0] || 'Push successful'}`);
      } else {
        console.log(`❌ git push: ${pushResult.error || 'Push failed'}`);
        process.exit(1);
      }
    } else {
      console.log(`❌ git commit: ${commitResult.error || 'Commit failed'}`);
      process.exit(1);
    }

  } catch (error: any) {
    console.error("❌ Error during commit and push:", error.message);
    process.exit(1);
  }
}

// Headless mode processing function
async function processPromptHeadless(
  prompt: string,
  apiKey: string,
  baseURL?: string,
  model?: string
): Promise<void> {
  try {
    const agent = new GrokAgent(apiKey, baseURL, model);

    // Configure confirmation service for headless mode (auto-approve all operations)
    const confirmationService = ConfirmationService.getInstance();
    confirmationService.setSessionFlag("allOperations", true);

    console.log("🤖 Processing prompt...\n");

    // Process the user message
    const chatEntries = await agent.processUserMessage(prompt);

    // Output the results
    for (const entry of chatEntries) {
      switch (entry.type) {
        case "user":
          console.log(`> ${entry.content}\n`);
          break;

        case "assistant":
          if (entry.content.trim()) {
            console.log(entry.content.trim());
            console.log();
          }
          break;

        case "tool_result":
          const toolName = entry.toolCall?.function?.name || "unknown";
          const getFilePath = (toolCall: any) => {
            if (toolCall?.function?.arguments) {
              try {
                const args = JSON.parse(toolCall.function.arguments);
                if (toolCall.function.name === "search") {
                  return args.query;
                }
                return args.path || args.file_path || args.command || "";
              } catch {
                return "";
              }
            }
            return "";
          };

          const filePath = getFilePath(entry.toolCall);
          const toolDisplay = filePath ? `${toolName}(${filePath})` : toolName;

          if (entry.toolResult?.success) {
            console.log(`✅ ${toolDisplay}: ${entry.content.split("\n")[0]}`);
          } else {
            console.log(`❌ ${toolDisplay}: ${entry.content}`);
          }
          break;
      }
    }
  } catch (error: any) {
    console.error("❌ Error processing prompt:", error.message);
    process.exit(1);
  }
}

program
  .name("grok")
  .description(
    "A conversational AI CLI tool powered by Grok with text editor capabilities"
  )
  .version("1.0.1")
  .option("-d, --directory <dir>", "set working directory", process.cwd())
  .option("-k, --api-key <key>", "Grok API key (or set GROK_API_KEY env var)")
  .option(
    "-u, --base-url <url>",
    "Grok API base URL (or set GROK_BASE_URL env var)"
  )
  .option(
    "-m, --model <model>",
    "AI model to use (e.g., gemini-2.5-pro, grok-4-latest)"
  )
  .option(
    "-p, --prompt <prompt>",
    "process a single prompt and exit (headless mode)"
  )
  .action(async (options) => {
    if (options.directory) {
      try {
        process.chdir(options.directory);
      } catch (error: any) {
        console.error(
          `Error changing directory to ${options.directory}:`,
          error.message
        );
        process.exit(1);
      }
    }

    try {
      // Get API key from options, environment, or user settings
      const apiKey = options.apiKey || loadApiKey();
      const baseURL = options.baseUrl || loadBaseURL();
      const model = options.model;

      if (!apiKey) {
        console.error(
          "❌ Error: API key required. Set GROK_API_KEY environment variable, use --api-key flag, or save to ~/.grok/user-settings.json"
        );
        process.exit(1);
      }

      // Headless mode: process prompt and exit
      if (options.prompt) {
        await processPromptHeadless(options.prompt, apiKey, baseURL, model);
        return;
      }

      // Interactive mode: launch UI
      const agent = new GrokAgent(apiKey, baseURL, model);
      console.log("🤖 Starting Grok CLI Conversational Assistant...\n");
      render(React.createElement(ChatInterface, { agent }));
    } catch (error: any) {
      console.error("❌ Error initializing Grok CLI:", error.message);
      process.exit(1);
    }
  });

// Git subcommand
const gitCommand = program
  .command("git")
  .description("Git operations with AI assistance");

gitCommand
  .command("commit-and-push")
  .description("Generate AI commit message and push to remote")
  .option("-d, --directory <dir>", "set working directory", process.cwd())
  .option("-k, --api-key <key>", "Grok API key (or set GROK_API_KEY env var)")
  .option(
    "-u, --base-url <url>",
    "Grok API base URL (or set GROK_BASE_URL env var)"
  )
  .option(
    "-m, --model <model>",
    "AI model to use (e.g., gemini-2.5-pro, grok-4-latest)"
  )
  .action(async (options) => {
    if (options.directory) {
      try {
        process.chdir(options.directory);
      } catch (error: any) {
        console.error(
          `Error changing directory to ${options.directory}:`,
          error.message
        );
        process.exit(1);
      }
    }

    try {
      // Get API key from options, environment, or user settings
      const apiKey = options.apiKey || loadApiKey();
      const baseURL = options.baseUrl || loadBaseURL();
      const model = options.model;

      if (!apiKey) {
        console.error(
          "❌ Error: API key required. Set GROK_API_KEY environment variable, use --api-key flag, or save to ~/.grok/user-settings.json"
        );
        process.exit(1);
      }

      await handleCommitAndPushHeadless(apiKey, baseURL, model);
    } catch (error: any) {
      console.error("❌ Error during git commit-and-push:", error.message);
      process.exit(1);
    }
  });

program.parse();
