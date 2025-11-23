import fs from 'fs';
import path from 'path';
import os from 'os';

export interface SlashCommand {
  name: string;
  description: string;
  prompt: string;
  filePath: string;
  isBuiltin: boolean;
  arguments?: SlashCommandArgument[];
}

export interface SlashCommandArgument {
  name: string;
  description: string;
  required: boolean;
  default?: string;
}

export interface SlashCommandResult {
  success: boolean;
  prompt?: string;
  error?: string;
  command?: SlashCommand;
}

/**
 * Slash Commands Manager - Inspired by Claude Code
 * Supports custom commands from .grok/commands/*.md files
 */
export class SlashCommandManager {
  private commands: Map<string, SlashCommand> = new Map();
  private workingDirectory: string;
  private commandsDirs: string[];

  constructor(workingDirectory: string = process.cwd()) {
    this.workingDirectory = workingDirectory;
    this.commandsDirs = [
      path.join(workingDirectory, '.grok', 'commands'),
      path.join(os.homedir(), '.grok', 'commands')
    ];

    this.loadBuiltinCommands();
    this.loadCustomCommands();
  }

  /**
   * Load built-in slash commands
   */
  private loadBuiltinCommands(): void {
    const builtinCommands: SlashCommand[] = [
      {
        name: 'help',
        description: 'Show available commands and help information',
        prompt: 'List all available slash commands and their descriptions.',
        filePath: '',
        isBuiltin: true
      },
      {
        name: 'clear',
        description: 'Clear the chat history',
        prompt: '__CLEAR_CHAT__',
        filePath: '',
        isBuiltin: true
      },
      {
        name: 'model',
        description: 'Change the AI model',
        prompt: '__CHANGE_MODEL__',
        filePath: '',
        isBuiltin: true,
        arguments: [
          { name: 'model', description: 'Model name to switch to', required: false }
        ]
      },
      {
        name: 'mode',
        description: 'Change agent mode (plan/code/ask)',
        prompt: '__CHANGE_MODE__',
        filePath: '',
        isBuiltin: true,
        arguments: [
          { name: 'mode', description: 'Mode to switch to: plan, code, or ask', required: true }
        ]
      },
      {
        name: 'checkpoints',
        description: 'List all checkpoints',
        prompt: '__LIST_CHECKPOINTS__',
        filePath: '',
        isBuiltin: true
      },
      {
        name: 'restore',
        description: 'Restore to a checkpoint',
        prompt: '__RESTORE_CHECKPOINT__',
        filePath: '',
        isBuiltin: true,
        arguments: [
          { name: 'checkpoint', description: 'Checkpoint ID or number', required: false }
        ]
      },
      {
        name: 'review',
        description: 'Review code changes before commit',
        prompt: `You are a code reviewer. Analyze the current git changes and provide a detailed code review.

1. First, run \`git diff\` to see all unstaged changes
2. Run \`git diff --cached\` to see staged changes
3. Analyze the changes for:
   - Code quality and best practices
   - Potential bugs or issues
   - Security vulnerabilities
   - Performance concerns
   - Missing tests
   - Code style consistency

Provide a structured review with:
- Summary of changes
- Issues found (critical, warnings, suggestions)
- Recommendations
- Overall assessment (approve/request changes)`,
        filePath: '',
        isBuiltin: true
      },
      {
        name: 'commit',
        description: 'Generate commit message and commit changes',
        prompt: `Analyze the current git changes and create an appropriate commit:

1. Run \`git status\` to see all changes
2. Run \`git diff --cached\` to see staged changes (or \`git diff\` if nothing staged)
3. Generate a conventional commit message following the format:
   - type(scope): description
   - Types: feat, fix, docs, style, refactor, test, chore
4. Stage relevant files with \`git add\`
5. Create the commit with the generated message

Keep the commit message concise but descriptive.`,
        filePath: '',
        isBuiltin: true
      },
      {
        name: 'test',
        description: 'Run tests and analyze results',
        prompt: `Run the project's test suite and analyze the results:

1. Detect the test framework (jest, vitest, mocha, pytest, etc.)
2. Run the tests with verbose output
3. If tests fail:
   - Analyze the failures
   - Suggest fixes for failing tests
   - Offer to fix them if appropriate
4. Provide a summary of test results`,
        filePath: '',
        isBuiltin: true
      },
      {
        name: 'lint',
        description: 'Run linter and fix issues',
        prompt: `Run the project's linter and help fix any issues:

1. Detect the linter (eslint, prettier, pylint, etc.)
2. Run the linter
3. If issues are found:
   - List all issues by severity
   - Offer to auto-fix what's possible
   - Suggest manual fixes for complex issues
4. Provide a summary`,
        filePath: '',
        isBuiltin: true
      },
      {
        name: 'explain',
        description: 'Explain a file or piece of code',
        prompt: `Provide a detailed explanation of the code or file. Include:
- Overall purpose and functionality
- Key components and their roles
- Important patterns or techniques used
- Dependencies and how they're used
- Potential areas for improvement`,
        filePath: '',
        isBuiltin: true,
        arguments: [
          { name: 'file', description: 'File path to explain', required: false }
        ]
      },
      {
        name: 'refactor',
        description: 'Suggest refactoring improvements',
        prompt: `Analyze the code and suggest refactoring improvements:

1. Identify code smells and anti-patterns
2. Suggest improvements for:
   - Readability
   - Maintainability
   - Performance
   - Testability
3. Provide specific refactoring recommendations with examples
4. Prioritize suggestions by impact`,
        filePath: '',
        isBuiltin: true,
        arguments: [
          { name: 'file', description: 'File path to refactor', required: false }
        ]
      },
      {
        name: 'debug',
        description: 'Help debug an issue',
        prompt: `Help debug the described issue:

1. Gather information about the problem
2. Analyze relevant code and logs
3. Identify potential causes
4. Suggest debugging steps
5. Propose solutions

Be systematic and thorough in your analysis.`,
        filePath: '',
        isBuiltin: true
      },
      {
        name: 'docs',
        description: 'Generate documentation',
        prompt: `Generate documentation for the code:

1. Analyze the code structure
2. Generate appropriate documentation:
   - JSDoc/TSDoc comments for functions
   - README sections if needed
   - API documentation
   - Usage examples
3. Follow the project's documentation style`,
        filePath: '',
        isBuiltin: true,
        arguments: [
          { name: 'file', description: 'File to document', required: false }
        ]
      },
      {
        name: 'security',
        description: 'Security audit of the code',
        prompt: `Perform a security audit of the code:

1. Scan for common vulnerabilities:
   - SQL injection
   - XSS
   - CSRF
   - Command injection
   - Path traversal
   - Insecure dependencies
2. Check for sensitive data exposure
3. Review authentication/authorization
4. Provide severity ratings and remediation steps`,
        filePath: '',
        isBuiltin: true
      },
      {
        name: 'todo',
        description: 'Find and list TODO comments in code',
        prompt: `Search for TODO, FIXME, HACK, and XXX comments in the codebase:

1. Use search to find all TODO-style comments
2. Categorize them by type and priority
3. List them with file locations
4. Suggest which ones should be addressed first`,
        filePath: '',
        isBuiltin: true
      },
      {
        name: 'init',
        description: 'Initialize .grok directory with templates',
        prompt: '__INIT_GROK__',
        filePath: '',
        isBuiltin: true
      }
    ];

    for (const cmd of builtinCommands) {
      this.commands.set(cmd.name, cmd);
    }
  }

  /**
   * Load custom commands from .grok/commands/*.md files
   */
  private loadCustomCommands(): void {
    for (const commandsDir of this.commandsDirs) {
      if (!fs.existsSync(commandsDir)) {
        continue;
      }

      try {
        const files = fs.readdirSync(commandsDir);

        for (const file of files) {
          if (!file.endsWith('.md')) continue;

          const filePath = path.join(commandsDir, file);
          const commandName = path.basename(file, '.md');

          try {
            const content = fs.readFileSync(filePath, 'utf-8');
            const { description, prompt, arguments: args } = this.parseCommandFile(content);

            // Custom commands override builtin commands
            this.commands.set(commandName, {
              name: commandName,
              description: description || `Custom command: ${commandName}`,
              prompt,
              filePath,
              isBuiltin: false,
              arguments: args
            });
          } catch (error) {
            console.warn(`Failed to load custom command ${commandName}:`, error);
          }
        }
      } catch (error) {
        // Directory doesn't exist or can't be read
      }
    }
  }

  /**
   * Parse a command markdown file
   */
  private parseCommandFile(content: string): {
    description: string;
    prompt: string;
    arguments?: SlashCommandArgument[];
  } {
    const lines = content.split('\n');
    let description = '';
    let prompt = '';
    const args: SlashCommandArgument[] = [];

    let inFrontmatter = false;
    let frontmatterDone = false;
    const promptLines: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Handle YAML frontmatter
      if (line.trim() === '---') {
        if (!frontmatterDone) {
          inFrontmatter = !inFrontmatter;
          if (!inFrontmatter) {
            frontmatterDone = true;
          }
          continue;
        }
      }

      if (inFrontmatter) {
        // Parse frontmatter
        const descMatch = line.match(/^description:\s*(.+)$/);
        if (descMatch) {
          description = descMatch[1].trim().replace(/^["']|["']$/g, '');
        }

        const argMatch = line.match(/^argument:\s*(.+)$/);
        if (argMatch) {
          const argParts = argMatch[1].split(',').map(s => s.trim());
          args.push({
            name: argParts[0] || 'arg',
            description: argParts[1] || '',
            required: argParts[2] === 'required'
          });
        }
      } else {
        // Everything after frontmatter is the prompt
        promptLines.push(line);
      }
    }

    prompt = promptLines.join('\n').trim();

    // If no frontmatter, first line starting with # is description
    if (!description && prompt.startsWith('#')) {
      const firstLineEnd = prompt.indexOf('\n');
      if (firstLineEnd > 0) {
        description = prompt.substring(1, firstLineEnd).trim();
        prompt = prompt.substring(firstLineEnd + 1).trim();
      }
    }

    return { description, prompt, arguments: args.length > 0 ? args : undefined };
  }

  /**
   * Get all available commands
   */
  getCommands(): SlashCommand[] {
    return Array.from(this.commands.values());
  }

  /**
   * Get a specific command
   */
  getCommand(name: string): SlashCommand | undefined {
    return this.commands.get(name);
  }

  /**
   * Execute a slash command
   */
  execute(input: string): SlashCommandResult {
    // Parse command and arguments
    const parts = input.trim().split(/\s+/);
    const commandName = parts[0].replace(/^\//, '');
    const args = parts.slice(1);

    const command = this.commands.get(commandName);

    if (!command) {
      // Check for partial matches
      const matches = Array.from(this.commands.keys())
        .filter(name => name.startsWith(commandName));

      if (matches.length === 1) {
        return this.execute(`/${matches[0]} ${args.join(' ')}`);
      }

      return {
        success: false,
        error: `Unknown command: /${commandName}. Use /help to see available commands.`
      };
    }

    // Handle special built-in commands
    if (command.prompt.startsWith('__')) {
      return {
        success: true,
        prompt: command.prompt,
        command
      };
    }

    // Replace argument placeholders in prompt
    let prompt = command.prompt;

    if (args.length > 0) {
      // Replace $1, $2, etc. with arguments
      args.forEach((arg, index) => {
        prompt = prompt.replace(new RegExp(`\\$${index + 1}`, 'g'), arg);
      });

      // Replace $@ with all arguments
      prompt = prompt.replace(/\$@/g, args.join(' '));

      // Append arguments if no placeholders
      if (!command.prompt.includes('$')) {
        prompt = `${prompt}\n\nContext: ${args.join(' ')}`;
      }
    }

    return {
      success: true,
      prompt,
      command
    };
  }

  /**
   * Format commands list for display
   */
  formatCommandsList(): string {
    const builtinCmds = Array.from(this.commands.values())
      .filter(cmd => cmd.isBuiltin);
    const customCmds = Array.from(this.commands.values())
      .filter(cmd => !cmd.isBuiltin);

    let output = '📚 Available Slash Commands\n' + '═'.repeat(50) + '\n\n';

    output += '🔧 Built-in Commands:\n' + '─'.repeat(30) + '\n';
    for (const cmd of builtinCmds) {
      const argsStr = cmd.arguments
        ? cmd.arguments.map(a => a.required ? `<${a.name}>` : `[${a.name}]`).join(' ')
        : '';
      output += `  /${cmd.name}${argsStr ? ' ' + argsStr : ''}\n`;
      output += `    ${cmd.description}\n\n`;
    }

    if (customCmds.length > 0) {
      output += '\n📁 Custom Commands:\n' + '─'.repeat(30) + '\n';
      for (const cmd of customCmds) {
        const argsStr = cmd.arguments
          ? cmd.arguments.map(a => a.required ? `<${a.name}>` : `[${a.name}]`).join(' ')
          : '';
        output += `  /${cmd.name}${argsStr ? ' ' + argsStr : ''}\n`;
        output += `    ${cmd.description}\n`;
        output += `    📄 ${cmd.filePath}\n\n`;
      }
    }

    output += '\n💡 Create custom commands in .grok/commands/*.md';

    return output;
  }

  /**
   * Reload commands (useful after editing command files)
   */
  reload(): void {
    this.commands.clear();
    this.loadBuiltinCommands();
    this.loadCustomCommands();
  }

  /**
   * Create a new custom command template
   */
  createCommandTemplate(name: string, description: string): string {
    const commandsDir = path.join(this.workingDirectory, '.grok', 'commands');

    // Ensure directory exists
    if (!fs.existsSync(commandsDir)) {
      fs.mkdirSync(commandsDir, { recursive: true });
    }

    const filePath = path.join(commandsDir, `${name}.md`);

    const template = `---
description: ${description}
---

# ${name}

Your prompt instructions here.

You can use $1, $2, etc. for arguments, or $@ for all arguments.

Example usage: /${name} argument1 argument2
`;

    fs.writeFileSync(filePath, template);
    this.reload();

    return filePath;
  }
}

// Singleton instance
let slashCommandManagerInstance: SlashCommandManager | null = null;

export function getSlashCommandManager(workingDirectory?: string): SlashCommandManager {
  if (!slashCommandManagerInstance || workingDirectory) {
    slashCommandManagerInstance = new SlashCommandManager(workingDirectory);
  }
  return slashCommandManagerInstance;
}

export function resetSlashCommandManager(): void {
  slashCommandManagerInstance = null;
}
