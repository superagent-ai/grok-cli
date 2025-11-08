import { Command } from "commander";
import { runCommand } from "./run";

const program = new Command();

program
  .name("grok")
  .description("CLI for interacting with Grok AI safely")
  .version("1.0.0");

program.addCommand(runCommand);

program.parse();
