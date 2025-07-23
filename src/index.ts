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

// Load API key from user settings if not in environment
function loadApiKey(): string | undefined {
  // First check environment variables
  let apiKey = process.env.GROK_API_KEY;

  if (!apiKey) {
    // Try to load from user settings file
    try {
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
    "A conversational AI CLI tool powered by Grok-3 with text editor capabilities"
  )
  .version("1.0.0")
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

program.parse();
