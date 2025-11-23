import fs from 'fs';
import path from 'path';
import os from 'os';

export interface CustomCommand {
  name: string;
  description: string;
  prompt: string;
  source: 'project' | 'user';
  filePath: string;
}

const PROJECT_COMMANDS_DIR = '.grok/commands';
const USER_COMMANDS_DIR = path.join(os.homedir(), '.grok', 'commands');

/**
 * Parse a command file to extract description and prompt
 * Format:
 * ---
 * description: Short description of the command
 * ---
 * Rest of the file is the prompt template
 *
 * Or simply: First line starting with # is description, rest is prompt
 */
function parseCommandFile(content: string, fileName: string): { description: string; prompt: string } {
  const lines = content.split('\n');

  // Check for frontmatter format
  if (lines[0]?.trim() === '---') {
    const endIndex = lines.findIndex((line, idx) => idx > 0 && line.trim() === '---');
    if (endIndex > 0) {
      const frontmatter = lines.slice(1, endIndex).join('\n');
      const descMatch = frontmatter.match(/description:\s*(.+)/i);
      const description = descMatch ? descMatch[1].trim() : `Custom command: ${fileName}`;
      const prompt = lines.slice(endIndex + 1).join('\n').trim();
      return { description, prompt };
    }
  }

  // Check for markdown heading format
  if (lines[0]?.startsWith('# ')) {
    return {
      description: lines[0].slice(2).trim(),
      prompt: lines.slice(1).join('\n').trim()
    };
  }

  // Default: use whole file as prompt
  return {
    description: `Custom command: ${fileName}`,
    prompt: content.trim()
  };
}

/**
 * Load commands from a directory
 */
function loadCommandsFromDirectory(dir: string, source: 'project' | 'user'): CustomCommand[] {
  const commands: CustomCommand[] = [];

  if (!fs.existsSync(dir)) {
    return commands;
  }

  try {
    const files = fs.readdirSync(dir);

    for (const file of files) {
      if (!file.endsWith('.md')) continue;

      const filePath = path.join(dir, file);
      const stat = fs.statSync(filePath);

      if (!stat.isFile()) continue;

      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const { description, prompt } = parseCommandFile(content, file);
        const commandName = file.replace('.md', '');

        commands.push({
          name: commandName,
          description,
          prompt,
          source,
          filePath
        });
      } catch (error) {
        // Skip files that can't be read
        console.error(`Failed to load command ${file}:`, error);
      }
    }
  } catch (error) {
    // Directory reading failed
  }

  return commands;
}

/**
 * Load all custom commands from both project and user directories
 */
export function loadCustomCommands(): CustomCommand[] {
  const projectDir = path.join(process.cwd(), PROJECT_COMMANDS_DIR);
  const projectCommands = loadCommandsFromDirectory(projectDir, 'project');
  const userCommands = loadCommandsFromDirectory(USER_COMMANDS_DIR, 'user');

  // Project commands take precedence over user commands with the same name
  const commandMap = new Map<string, CustomCommand>();

  // Add user commands first
  for (const cmd of userCommands) {
    commandMap.set(cmd.name, cmd);
  }

  // Project commands override user commands
  for (const cmd of projectCommands) {
    commandMap.set(cmd.name, cmd);
  }

  return Array.from(commandMap.values());
}

/**
 * Get a specific custom command by name
 */
export function getCustomCommand(name: string): CustomCommand | undefined {
  const commands = loadCustomCommands();
  return commands.find(cmd => cmd.name === name);
}

/**
 * Process a custom command with arguments
 * Replaces $ARGUMENTS[n] or {{arg}} placeholders with actual arguments
 */
export function processCommandPrompt(command: CustomCommand, args: string[]): string {
  let prompt = command.prompt;

  // Replace $ARGUMENTS[n] placeholders
  prompt = prompt.replace(/\$ARGUMENTS\[(\d+)\]/g, (_, index) => {
    const idx = parseInt(index, 10);
    return args[idx] || '';
  });

  // Replace {{0}}, {{1}}, etc. placeholders
  prompt = prompt.replace(/\{\{(\d+)\}\}/g, (_, index) => {
    const idx = parseInt(index, 10);
    return args[idx] || '';
  });

  // Replace $ARGS with all arguments joined
  prompt = prompt.replace(/\$ARGS/g, args.join(' '));

  // Replace {{args}} with all arguments
  prompt = prompt.replace(/\{\{args\}\}/g, args.join(' '));

  return prompt.trim();
}

/**
 * Ensure command directories exist
 */
export function ensureCommandDirectories(): void {
  const projectDir = path.join(process.cwd(), PROJECT_COMMANDS_DIR);
  const userDir = USER_COMMANDS_DIR;

  try {
    if (!fs.existsSync(projectDir)) {
      fs.mkdirSync(projectDir, { recursive: true });
    }
    if (!fs.existsSync(userDir)) {
      fs.mkdirSync(userDir, { recursive: true });
    }
  } catch (error) {
    // Silently ignore errors
  }
}

/**
 * Create a sample command file
 */
export function createSampleCommand(name: string, isProject: boolean = true): string {
  const dir = isProject
    ? path.join(process.cwd(), PROJECT_COMMANDS_DIR)
    : USER_COMMANDS_DIR;

  ensureCommandDirectories();

  const filePath = path.join(dir, `${name}.md`);
  const sampleContent = `---
description: ${name} - A custom command
---

# ${name}

This is a custom command template. Edit this file to customize the behavior.

## Arguments
Use \$ARGUMENTS[0], \$ARGUMENTS[1], etc. to reference command arguments.
Or use {{0}}, {{1}}, etc.
Use \$ARGS or {{args}} to get all arguments as a string.

## Your prompt here
Replace this with instructions for Grok when this command is invoked.
`;

  fs.writeFileSync(filePath, sampleContent);
  return filePath;
}
