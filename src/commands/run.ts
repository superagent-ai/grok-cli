import { Command } from "commander";
import { execSync } from "child_process";
import chalk from "chalk";
import readline from "readline";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function askConfirmation(question: string): Promise<boolean> {
  return new Promise((resolve) => {
    rl.question(`${question} (y/N): `, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase() === "y");
    });
  });
}

export const runCommand = new Command("run")
  .description("Execute a shell command suggested by Grok safely")
  .argument("<cmd>", "Command to execute")
  .option("--dry-run", "Preview the command without running it")
  .option("--confirm", "Ask for confirmation before executing")
  .action(async (cmd: string, options: { dryRun?: boolean; confirm?: boolean }) => {
    console.log(chalk.cyanBright(`🧠 Suggested command:`), chalk.yellow(cmd));

    if (options.dryRun) {
      console.log(chalk.green("✅ Dry-run mode: command not executed."));
      return;
    }

    if (options.confirm) {
      const ok = await askConfirmation("⚠️  Do you want to run this command?");
      if (!ok) {
        console.log(chalk.red("❌ Command aborted by user."));
        return;
      }
    }

    try {
      console.log(chalk.green("🚀 Running command..."));
      execSync(cmd, { stdio: "inherit", shell: true });
      console.log(chalk.green("✅ Command completed successfully."));
    } catch (err: any) {
      console.error(chalk.red("❌ Command failed:"), err.message);
    }
  });
