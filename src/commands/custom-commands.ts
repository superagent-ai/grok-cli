import * as fs from "fs-extra";
import * as path from "path";

export interface CustomCommand {
  name: string;
  description?: string;
  prompt: string;
  filePath: string;
}

export class CustomCommandLoader {
  private projectCommandsDir: string;
  private globalCommandsDir: string;
  private commandCache: Map<string, CustomCommand> = new Map();
  private lastScanTime: number = 0;
  private scanInterval: number = 5000;  // Re-scan every 5 seconds

  constructor() {
    this.projectCommandsDir = path.join(process.cwd(), ".grok", "commands");
    this.globalCommandsDir = path.join(
      process.env.HOME || process.env.USERPROFILE || "",
      ".grok",
      "commands"
    );
  }

  private async scanCommands(): Promise<void> {
    const now = Date.now();
    if (now - this.lastScanTime < this.scanInterval) {
      return;  // Use cache
    }

    this.commandCache.clear();

    // Scan global commands first
    await this.scanDirectory(this.globalCommandsDir);

    // Scan project commands (override global)
    await this.scanDirectory(this.projectCommandsDir);

    this.lastScanTime = now;
  }

  private async scanDirectory(dir: string): Promise<void> {
    if (!(await fs.pathExists(dir))) {
      return;
    }

    try {
      const files = await fs.readdir(dir);

      for (const file of files) {
        if (!file.endsWith(".md")) {
          continue;
        }

        const filePath = path.join(dir, file);
        const name = file.replace(".md", "");

        try {
          const content = await fs.readFile(filePath, "utf-8");
          const command = this.parseCommandFile(name, content, filePath);
          this.commandCache.set(name, command);
        } catch (error) {
          console.warn(`Failed to load command ${name}:`, error);
        }
      }
    } catch (error) {
      console.warn(`Failed to scan commands directory ${dir}:`, error);
    }
  }

  private parseCommandFile(
    name: string,
    content: string,
    filePath: string
  ): CustomCommand {
    // Check for YAML frontmatter
    let description: string | undefined;
    let prompt = content;

    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    if (frontmatterMatch) {
      const frontmatter = frontmatterMatch[1];
      prompt = frontmatterMatch[2].trim();

      // Parse description from frontmatter
      const descMatch = frontmatter.match(/description:\s*(.+)/);
      if (descMatch) {
        description = descMatch[1].trim();
      }
    }

    return {
      name,
      description,
      prompt,
      filePath,
    };
  }

  async getCommand(name: string): Promise<CustomCommand | null> {
    await this.scanCommands();
    return this.commandCache.get(name) || null;
  }

  async getAllCommands(): Promise<CustomCommand[]> {
    await this.scanCommands();
    return Array.from(this.commandCache.values());
  }

  async expandCommand(name: string, args?: string): Promise<string | null> {
    const command = await this.getCommand(name);
    if (!command) {
      return null;
    }

    let expandedPrompt = command.prompt;

    // Replace argument placeholders
    if (args) {
      // Replace $ARGUMENTS or {{args}} with the provided args
      expandedPrompt = expandedPrompt
        .replace(/\$ARGUMENTS/g, args)
        .replace(/\{\{args\}\}/g, args)
        .replace(/\$1/g, args);

      // Split args and replace numbered placeholders
      const argParts = args.split(/\s+/);
      argParts.forEach((arg, index) => {
        expandedPrompt = expandedPrompt.replace(
          new RegExp(`\\$${index + 1}`, "g"),
          arg
        );
      });
    }

    // Replace environment-style variables
    expandedPrompt = expandedPrompt.replace(/\$\{?(\w+)\}?/g, (match, varName) => {
      // Special variables
      switch (varName) {
        case "CWD":
        case "PWD":
          return process.cwd();
        case "USER":
          return process.env.USER || process.env.USERNAME || "user";
        case "DATE":
          return new Date().toISOString().split("T")[0];
        case "TIME":
          return new Date().toISOString().split("T")[1].slice(0, 8);
        default:
          return process.env[varName] || match;
      }
    });

    return expandedPrompt;
  }

  async createCommand(
    name: string,
    prompt: string,
    description?: string,
    global: boolean = false
  ): Promise<string> {
    const dir = global ? this.globalCommandsDir : this.projectCommandsDir;
    await fs.ensureDir(dir);

    const filePath = path.join(dir, `${name}.md`);

    let content = "";
    if (description) {
      content += `---\ndescription: ${description}\n---\n\n`;
    }
    content += prompt;

    await fs.writeFile(filePath, content, "utf-8");

    // Clear cache to pick up new command
    this.lastScanTime = 0;

    return filePath;
  }

  async deleteCommand(name: string): Promise<boolean> {
    // Try project first, then global
    const projectPath = path.join(this.projectCommandsDir, `${name}.md`);
    const globalPath = path.join(this.globalCommandsDir, `${name}.md`);

    if (await fs.pathExists(projectPath)) {
      await fs.remove(projectPath);
      this.commandCache.delete(name);
      return true;
    }

    if (await fs.pathExists(globalPath)) {
      await fs.remove(globalPath);
      this.commandCache.delete(name);
      return true;
    }

    return false;
  }

  formatCommandList(): string {
    if (this.commandCache.size === 0) {
      return "No custom commands found.\n\nCreate commands in:\n  Project: .grok/commands/<name>.md\n  Global: ~/.grok/commands/<name>.md";
    }

    let output = "Custom Commands:\n\n";

    for (const [name, command] of this.commandCache) {
      const location = command.filePath.includes(this.projectCommandsDir)
        ? "(project)"
        : "(global)";
      output += `  /${name} ${location}\n`;
      if (command.description) {
        output += `    ${command.description}\n`;
      }
    }

    output += `\nUsage: /<command> [arguments]\n`;

    return output;
  }

  formatHelp(): string {
    return `
Custom Commands System

Create reusable prompts as markdown files:

Location:
  Project-level: .grok/commands/<name>.md
  Global:        ~/.grok/commands/<name>.md

File Format:
  ---
  description: Optional description
  ---

  Your prompt template here.
  Use $ARGUMENTS or {{args}} for input.
  Use $1, $2, etc. for specific arguments.
  Use $CWD, $USER, $DATE for special values.

Example (.grok/commands/review.md):
  ---
  description: Review code changes
  ---

  Review the following code changes and provide feedback:

  $ARGUMENTS

  Focus on:
  1. Code quality
  2. Potential bugs
  3. Performance

Usage:
  /review "the changes in src/utils.ts"

Commands:
  /commands           List all custom commands
  /command:create     Create a new command
  /command:delete     Delete a command
`;
  }
}

// Singleton instance
let customCommandLoaderInstance: CustomCommandLoader | null = null;

export function getCustomCommandLoader(): CustomCommandLoader {
  if (!customCommandLoaderInstance) {
    customCommandLoaderInstance = new CustomCommandLoader();
  }
  return customCommandLoaderInstance;
}
