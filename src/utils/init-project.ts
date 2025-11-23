import fs from 'fs';
import path from 'path';

export interface InitOptions {
  force?: boolean;
  includeHooks?: boolean;
  includeMcp?: boolean;
  includeCommands?: boolean;
  includeSecurity?: boolean;
  includeGitignore?: boolean;
}

export interface InitResult {
  success: boolean;
  created: string[];
  skipped: string[];
  errors: string[];
}

/**
 * Initialize .grok directory with templates and configurations
 * Similar to Claude Code's project initialization
 */
export function initGrokProject(
  workingDirectory: string = process.cwd(),
  options: InitOptions = {}
): InitResult {
  const result: InitResult = {
    success: true,
    created: [],
    skipped: [],
    errors: []
  };

  const grokDir = path.join(workingDirectory, '.grok');

  // Create .grok directory
  if (!fs.existsSync(grokDir)) {
    fs.mkdirSync(grokDir, { recursive: true });
    result.created.push('.grok/');
  }

  // Create GROK.md (custom instructions)
  const grokMdPath = path.join(grokDir, 'GROK.md');
  if (!fs.existsSync(grokMdPath) || options.force) {
    const grokMdContent = `# Custom Instructions for Grok CLI

## About This Project
<!-- Describe your project here -->
This project is...

## Code Style Guidelines
- Use TypeScript for all new files
- Follow the existing code style
- Add comments for complex logic
- Use meaningful variable names

## Architecture
<!-- Describe your project architecture -->
- src/ - Source code
- tests/ - Test files

## Testing
- Write tests for new features
- Maintain test coverage above 80%
- Use Jest/Vitest for testing

## Git Conventions
- Use conventional commits (feat:, fix:, docs:, etc.)
- Keep commits small and focused
- Write descriptive commit messages

## Important Notes
<!-- Add any project-specific notes here -->
- ...

## Forbidden Actions
<!-- List things Grok should never do -->
- Never commit .env files
- Never expose API keys
- Never delete production data
`;
    fs.writeFileSync(grokMdPath, grokMdContent);
    result.created.push('.grok/GROK.md');
  } else {
    result.skipped.push('.grok/GROK.md (already exists)');
  }

  // Create hooks.json
  if (options.includeHooks !== false) {
    const hooksPath = path.join(grokDir, 'hooks.json');
    if (!fs.existsSync(hooksPath) || options.force) {
      const hooksContent = {
        enabled: true,
        globalTimeout: 30000,
        hooks: [
          {
            type: 'pre-commit',
            command: 'npm run lint && npm test',
            enabled: false,
            timeout: 60000,
            continueOnError: false,
            description: 'Run linter and tests before commit'
          },
          {
            type: 'post-edit',
            command: 'npm run typecheck',
            enabled: false,
            timeout: 30000,
            continueOnError: true,
            description: 'Run type checking after file edit'
          },
          {
            type: 'on-file-change',
            command: 'prettier --write {file}',
            enabled: false,
            timeout: 10000,
            continueOnError: true,
            description: 'Format file with Prettier on change'
          }
        ]
      };
      fs.writeFileSync(hooksPath, JSON.stringify(hooksContent, null, 2));
      result.created.push('.grok/hooks.json');
    } else {
      result.skipped.push('.grok/hooks.json (already exists)');
    }
  }

  // Create mcp.json
  if (options.includeMcp !== false) {
    const mcpPath = path.join(grokDir, 'mcp.json');
    if (!fs.existsSync(mcpPath) || options.force) {
      const mcpContent = {
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        description: 'MCP server configuration. This file can be committed to share MCP servers with your team.',
        mcpServers: {
          // Example configurations (disabled by default)
          'filesystem': {
            name: 'filesystem',
            type: 'stdio',
            command: 'npx',
            args: ['-y', '@anthropic-ai/mcp-server-filesystem', '.'],
            enabled: false,
            description: 'File system access MCP server'
          },
          'github': {
            name: 'github',
            type: 'stdio',
            command: 'npx',
            args: ['-y', '@anthropic-ai/mcp-github'],
            env: {
              GITHUB_TOKEN: '${GITHUB_TOKEN}'
            },
            enabled: false,
            description: 'GitHub integration MCP server'
          }
        }
      };
      fs.writeFileSync(mcpPath, JSON.stringify(mcpContent, null, 2));
      result.created.push('.grok/mcp.json');
    } else {
      result.skipped.push('.grok/mcp.json (already exists)');
    }
  }

  // Create security.json
  if (options.includeSecurity !== false) {
    const securityPath = path.join(grokDir, 'security.json');
    if (!fs.existsSync(securityPath) || options.force) {
      const securityContent = {
        mode: 'suggest',
        allowedDirectories: [],
        blockedCommands: [],
        blockedPaths: []
      };
      fs.writeFileSync(securityPath, JSON.stringify(securityContent, null, 2));
      result.created.push('.grok/security.json');
    } else {
      result.skipped.push('.grok/security.json (already exists)');
    }
  }

  // Create commands directory with example
  if (options.includeCommands !== false) {
    const commandsDir = path.join(grokDir, 'commands');
    if (!fs.existsSync(commandsDir)) {
      fs.mkdirSync(commandsDir, { recursive: true });
      result.created.push('.grok/commands/');
    }

    // Create example command
    const exampleCommandPath = path.join(commandsDir, 'example.md');
    if (!fs.existsSync(exampleCommandPath) || options.force) {
      const exampleCommandContent = `---
description: Example custom command template
---

# Example Command

This is an example slash command. Usage: /example [argument]

Replace this content with your own prompt template.

You can use placeholders:
- $1, $2, etc. for positional arguments
- $@ for all arguments combined

Example: Analyze the file $1 and suggest improvements.
`;
      fs.writeFileSync(exampleCommandPath, exampleCommandContent);
      result.created.push('.grok/commands/example.md');
    }

    // Create deploy command template
    const deployCommandPath = path.join(commandsDir, 'deploy.md');
    if (!fs.existsSync(deployCommandPath) || options.force) {
      const deployCommandContent = `---
description: Deploy the application to production
---

# Deploy Command

Perform a deployment to production:

1. Run all tests to ensure nothing is broken
2. Build the project for production
3. Check for any uncommitted changes
4. Create a git tag for the release
5. Push to the deployment branch

Environment: $1 (default: production)

Safety checks:
- Ensure all tests pass
- Ensure no uncommitted changes
- Confirm before proceeding
`;
      fs.writeFileSync(deployCommandPath, deployCommandContent);
      result.created.push('.grok/commands/deploy.md');
    }
  }

  // Create settings.json
  const settingsPath = path.join(grokDir, 'settings.json');
  if (!fs.existsSync(settingsPath) || options.force) {
    const settingsContent = {
      model: 'grok-code-fast-1',
      maxToolRounds: 400,
      theme: 'default'
    };
    fs.writeFileSync(settingsPath, JSON.stringify(settingsContent, null, 2));
    result.created.push('.grok/settings.json');
  } else {
    result.skipped.push('.grok/settings.json (already exists)');
  }

  // Update .gitignore if it exists
  if (options.includeGitignore !== false) {
    const gitignorePath = path.join(workingDirectory, '.gitignore');
    const grokIgnoreEntries = `
# Grok CLI
.grok/sessions/
.grok/history/
.grok/user-settings.json
`;

    if (fs.existsSync(gitignorePath)) {
      const currentContent = fs.readFileSync(gitignorePath, 'utf-8');
      if (!currentContent.includes('# Grok CLI')) {
        fs.appendFileSync(gitignorePath, grokIgnoreEntries);
        result.created.push('.gitignore (updated with Grok entries)');
      } else {
        result.skipped.push('.gitignore (already has Grok entries)');
      }
    } else {
      fs.writeFileSync(gitignorePath, grokIgnoreEntries.trim());
      result.created.push('.gitignore');
    }
  }

  // Create README for .grok directory
  const readmePath = path.join(grokDir, 'README.md');
  if (!fs.existsSync(readmePath) || options.force) {
    const readmeContent = `# .grok Directory

This directory contains configuration and customization files for [Grok CLI](https://github.com/vibe-kit/grok-cli).

## Files

- **GROK.md** - Custom instructions that Grok follows when working in this project
- **settings.json** - Project-specific settings
- **hooks.json** - Automated hooks (pre-commit, post-edit, etc.)
- **mcp.json** - MCP server configurations (committable, shared with team)
- **security.json** - Security mode configuration
- **commands/** - Custom slash commands

## Custom Commands

Create \`.md\` files in the \`commands/\` directory to add custom slash commands.

Example \`commands/my-command.md\`:
\`\`\`markdown
---
description: My custom command
---

# My Command

Your prompt template here. Use $1, $2 for arguments.
\`\`\`

Then use it with: \`/my-command arg1 arg2\`

## Hooks

Configure automated actions in \`hooks.json\`:
- \`pre-commit\` - Run before git commit
- \`post-edit\` - Run after file edit
- \`on-file-change\` - Run when files change

## MCP Servers

Configure MCP servers in \`mcp.json\` to extend Grok's capabilities.
This file can be committed to share servers with your team.

## Security

Configure security modes in \`security.json\`:
- \`suggest\` - All changes require approval (safest)
- \`auto-edit\` - File edits auto-apply, bash requires approval
- \`full-auto\` - Fully autonomous but sandboxed

## More Information

See the [Grok CLI documentation](https://github.com/vibe-kit/grok-cli) for more details.
`;
    fs.writeFileSync(readmePath, readmeContent);
    result.created.push('.grok/README.md');
  }

  return result;
}

/**
 * Format init result for display
 */
export function formatInitResult(result: InitResult): string {
  let output = '🚀 Grok Project Initialization\n' + '═'.repeat(50) + '\n\n';

  if (result.created.length > 0) {
    output += '✅ Created:\n';
    for (const item of result.created) {
      output += `   • ${item}\n`;
    }
    output += '\n';
  }

  if (result.skipped.length > 0) {
    output += '⏭️  Skipped:\n';
    for (const item of result.skipped) {
      output += `   • ${item}\n`;
    }
    output += '\n';
  }

  if (result.errors.length > 0) {
    output += '❌ Errors:\n';
    for (const item of result.errors) {
      output += `   • ${item}\n`;
    }
    output += '\n';
  }

  output += '─'.repeat(50) + '\n';
  output += '💡 Edit .grok/GROK.md to customize Grok for this project\n';
  output += '📚 See .grok/README.md for documentation';

  return output;
}
