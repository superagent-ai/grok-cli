#!/usr/bin/env node

import React from "react";
import { render } from "ink";
import { program } from "commander";
import * as dotenv from "dotenv";
import { GrokAgent } from "./agent/grok-agent";
import ChatInterface from "./ui/components/chat-interface";
import { getUserSettingsManager } from "./utils/user-settings";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

// Load environment variables
dotenv.config();

// Load API key from user settings if not in environment
async function loadApiKey(): Promise<string | undefined> {
  // First check environment variables
  let apiKey = process.env.GROK_API_KEY;
  
  if (!apiKey) {
    // Try to load from user settings manager
    try {
      const settingsManager = getUserSettingsManager();
      await settingsManager.initialize();
      apiKey = settingsManager.getApiKey();
    } catch (error) {
      // Ignore errors, apiKey will remain undefined
    }
  }
  
  return apiKey;
}

program
  .name("grok")
  .description(
    "A conversational AI CLI tool powered by Grok-3 with text editor capabilities"
  )
  .version("1.0.0")
  .option("-d, --directory <dir>", "set working directory", process.cwd())
  .option("-k, --api-key <key>", "Grok API key (or set GROK_API_KEY env var)")
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
      const apiKey = options.apiKey || await loadApiKey();
      const agent = apiKey ? new GrokAgent(apiKey) : undefined;

      console.log("🤖 Starting Grok CLI Conversational Assistant...\n");

      render(React.createElement(ChatInterface, { agent }));
    } catch (error: any) {
      console.error("❌ Error initializing Grok CLI:", error.message);
      process.exit(1);
    }
  });

program.parse();
