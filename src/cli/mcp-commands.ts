import { Command } from 'commander';
import { MCPConfigManager } from '../mcp/config';
import { MCPManager } from '../mcp/manager';
import { MCPServerConfig } from '../mcp/types';
import chalk from 'chalk';

export function createMCPCommands(): Command {
  const mcpCommand = new Command('mcp');
  mcpCommand.description('Manage MCP (Model Context Protocol) servers');

  // List servers command
  mcpCommand
    .command('list')
    .alias('ls')
    .description('List all configured MCP servers')
    .action(async () => {
      try {
        const configManager = new MCPConfigManager();
        const config = await configManager.loadConfig();
        
        if (!config.mcpServers || Object.keys(config.mcpServers).length === 0) {
          console.log(chalk.yellow('No MCP servers configured.'));
          console.log(chalk.gray('Use "grok mcp add" to add a server.'));
          return;
        }

        console.log(chalk.bold('\nConfigured MCP Servers:'));
        console.log(chalk.gray('─'.repeat(50)));
        
        for (const [name, server] of Object.entries(config.mcpServers)) {
          console.log(chalk.cyan(`\n${name}`));
          console.log(chalk.gray(`  Type: ${server.transport}`));
          
          switch (server.transport) {
            case 'stdio':
              console.log(chalk.gray(`  Command: ${server.command}`));
              if (server.args) {
                console.log(chalk.gray(`  Args: ${server.args.join(' ')}`));
              }
              break;
            case 'sse':
              console.log(chalk.gray(`  URL: ${server.url}`));
              break;
            case 'https':
              console.log(chalk.gray(`  URL: ${server.url}`));
              break;
          }
          
          if (server.env) {
            console.log(chalk.gray(`  Environment: ${Object.keys(server.env).join(', ')}`));
          }
        }
        console.log();
      } catch (error: any) {
        console.error(chalk.red(`Error listing servers: ${error.message}`));
      }
    });

  // Add server command
  mcpCommand
    .command('add <name>')
    .description('Add a new MCP server')
    .option('-t, --type <type>', 'Server type (stdio, sse, https)', 'stdio')
    .option('-c, --command <command>', 'Command to run (for stdio servers)')
    .option('-u, --url <url>', 'Server URL (for sse/https servers)')
    .option('-a, --args <args...>', 'Command arguments (for stdio servers)')
    .option('-e, --env <env...>', 'Environment variables (KEY=VALUE format)')
    .option('-s, --scope <scope>', 'Configuration scope (project, user, local)', 'user')
    .action(async (name: string, options: any) => {
      try {
        // Validate scope
        const validScopes = ['project', 'user', 'local'];
        if (!validScopes.includes(options.scope)) {
          console.error(chalk.red(`Invalid scope: ${options.scope}. Valid scopes are: ${validScopes.join(', ')}`));
          return;
        }
        
        // Get the appropriate config path based on scope
        let configPath: string;
        switch (options.scope) {
          case 'project':
            configPath = '.grok/mcpConfig.json';
            break;
          case 'user':
            configPath = require('os').homedir() + '/.grok/mcpConfig.json';
            break;
          case 'local':
            configPath = 'mcpConfig.json';
            break;
          default:
            configPath = require('os').homedir() + '/.grok/mcpConfig.json';
        }
        
        const configManager = new MCPConfigManager(configPath);
        
        const serverConfig: MCPServerConfig = {
          transport: options.type as 'stdio' | 'sse' | 'https',
          enabled: true
        };

        // Validate and set type-specific options
        switch (serverConfig.transport) {
          case 'stdio':
            if (!options.command) {
              console.error(chalk.red('Command is required for stdio servers. Use --command option.'));
              return;
            }
            serverConfig.command = options.command;
            if (options.args) {
              serverConfig.args = options.args;
            }
            break;
          
          case 'sse':
          case 'https':
            if (!options.url) {
              console.error(chalk.red('URL is required for sse/https servers. Use --url option.'));
              return;
            }
            serverConfig.url = options.url;
            break;
        }

        // Parse environment variables
        if (options.env) {
          serverConfig.env = {};
          for (const envVar of options.env) {
            const [key, ...valueParts] = envVar.split('=');
            if (!key || valueParts.length === 0) {
              console.error(chalk.red(`Invalid environment variable format: ${envVar}. Use KEY=VALUE format.`));
              return;
            }
            serverConfig.env[key] = valueParts.join('=');
          }
        }

        await configManager.addServer(name, serverConfig);
        console.log(chalk.green(`✓ Added MCP server "${name}" to ${options.scope} configuration`));
        
        // Show the configuration
        console.log(chalk.gray('\nConfiguration:'));
        console.log(chalk.gray(`  Type: ${serverConfig.transport}`));
        if (serverConfig.command) {
          console.log(chalk.gray(`  Command: ${serverConfig.command}`));
        }
        if (serverConfig.url) {
          console.log(chalk.gray(`  URL: ${serverConfig.url}`));
        }
        if (serverConfig.args) {
          console.log(chalk.gray(`  Args: ${serverConfig.args.join(' ')}`));
        }
        if (serverConfig.env) {
          console.log(chalk.gray(`  Environment: ${Object.keys(serverConfig.env).join(', ')}`));
        }
      } catch (error: any) {
        console.error(chalk.red(`Error adding server: ${error.message}`));
      }
    });

  // Remove server command
  mcpCommand
    .command('remove <name>')
    .alias('rm')
    .description('Remove an MCP server')
    .option('-s, --scope <scope>', 'Configuration scope (project, user, local)', 'user')
    .action(async (name: string, options: any) => {
      try {
        // Validate scope
        const validScopes = ['project', 'user', 'local'];
        if (!validScopes.includes(options.scope)) {
          console.error(chalk.red(`Invalid scope: ${options.scope}. Valid scopes are: ${validScopes.join(', ')}`));
          return;
        }
        
        // Get the appropriate config path based on scope
        let configPath: string;
        switch (options.scope) {
          case 'project':
            configPath = '.grok/mcpConfig.json';
            break;
          case 'user':
            configPath = require('os').homedir() + '/.grok/mcpConfig.json';
            break;
          case 'local':
            configPath = 'mcpConfig.json';
            break;
          default:
            configPath = require('os').homedir() + '/.grok/mcpConfig.json';
        }
        
        const configManager = new MCPConfigManager(configPath);
        await configManager.removeServer(name);
        console.log(chalk.green(`✓ Removed MCP server "${name}" from ${options.scope} configuration`));
      } catch (error: any) {
        console.error(chalk.red(`Error removing server: ${error.message}`));
      }
    });

  // Test server command
  mcpCommand
    .command('test <name>')
    .description('Test connection to an MCP server')
    .action(async (name: string) => {
      try {
        const configManager = new MCPConfigManager();
        const mcpManager = new MCPManager(configManager);
        
        await mcpManager.initialize();
        
        console.log(chalk.blue(`Testing connection to "${name}"...`));
        
        const result = await mcpManager.testConnection(name);
        
        if (result.success) {
          console.log(chalk.green(`✓ Connection successful`));
          if (result.tools && result.tools.length > 0) {
            console.log(chalk.gray(`\nAvailable tools (${result.tools.length}):`));
            result.tools.forEach(tool => {
              console.log(chalk.gray(`  - ${tool.name}: ${tool.description}`));
            });
          }
          if (result.resources && result.resources.length > 0) {
            console.log(chalk.gray(`\nAvailable resources (${result.resources.length}):`));
            result.resources.forEach(resource => {
              console.log(chalk.gray(`  - ${resource.uri}: ${resource.name}`));
            });
          }
        } else {
          console.log(chalk.red(`✗ Connection failed: ${result.error}`));
        }
      } catch (error: any) {
        console.error(chalk.red(`Error testing server: ${error.message}`));
      }
    });

  // Status command
  mcpCommand
    .command('status')
    .description('Show status of all MCP servers')
    .action(async () => {
      try {
        const configManager = new MCPConfigManager();
        const mcpManager = new MCPManager(configManager);
        
        await mcpManager.initialize();
        const statuses = await mcpManager.getServerStatuses();
        
        console.log(chalk.bold('\nMCP Server Status:'));
        console.log(chalk.gray('─'.repeat(50)));
        
        for (const [name, status] of Object.entries(statuses)) {
          const statusColor = status.status === 'connected' ? chalk.green : chalk.red;
          const statusText = status.status === 'connected' ? '●' : '○';
          
          console.log(`${statusColor(statusText)} ${chalk.cyan(name)} - ${statusColor(status.status)}`);
          
          if (status.error) {
            console.log(chalk.red(`    Error: ${status.error}`));
          }
          
          if (status.status === 'connected') {
            // Show available tools and resources
            console.log(chalk.gray(`    Tools: ${status.tools?.length || 0}, Resources: ${status.resources?.length || 0}`));
          }
        }
        console.log();
      } catch (error: any) {
        console.error(chalk.red(`Error getting status: ${error.message}`));
      }
    });

  // Resources commands
  const resourcesCommand = mcpCommand
    .command('resources')
    .alias('res')
    .description('Manage MCP resources');

  resourcesCommand
    .command('list')
    .alias('ls')
    .description('List all available MCP resources')
    .action(async () => {
      try {
        const { MCPService } = await import('../mcp/mcp-service');
        const service = new MCPService();
        
        const response = await service.listResources();
        
        console.log(chalk.bold('\nAvailable MCP Resources:'));
        console.log(chalk.gray('─'.repeat(50)));
        
        if (response.resources.length === 0) {
          console.log(chalk.yellow('No resources available.'));
          return;
        }

        response.resources.forEach((resource, index) => {
          console.log(chalk.cyan(`${index + 1}. ${resource.name}`));
          console.log(chalk.gray(`   URI: ${resource.uri}`));
          if (resource.description) {
            console.log(chalk.gray(`   ${resource.description}`));
          }
          if (resource.mimeType) {
            console.log(chalk.gray(`   Type: ${resource.mimeType}`));
          }
          console.log();
        });
      } catch (error: any) {
        console.error(chalk.red(`Error listing resources: ${error.message}`));
      }
    });

  resourcesCommand
    .command('read <uri>')
    .description('Read content from an MCP resource')
    .action(async (uri: string) => {
      try {
        const { MCPService } = await import('../mcp/mcp-service');
        const service = new MCPService();
        
        const response = await service.readResource(uri);
        
        console.log(chalk.bold(`\nResource: ${uri}`));
        console.log(chalk.gray('─'.repeat(50)));
        console.log(response.content.content);
      } catch (error: any) {
        console.error(chalk.red(`Error reading resource: ${error.message}`));
      }
    });

  // Prompts commands
  const promptsCommand = mcpCommand
    .command('prompts')
    .description('Manage MCP prompts');

  promptsCommand
    .command('list')
    .alias('ls')
    .description('List all available MCP prompts')
    .action(async () => {
      try {
        const { MCPService } = await import('../mcp/mcp-service');
        const service = new MCPService();
        
        const response = await service.listPrompts();
        
        console.log(chalk.bold('\nAvailable MCP Prompts:'));
        console.log(chalk.gray('─'.repeat(50)));
        
        if (response.prompts.length === 0) {
          console.log(chalk.yellow('No prompts available.'));
          return;
        }

        response.prompts.forEach((prompt, index) => {
          console.log(chalk.cyan(`${index + 1}. ${prompt.name}`));
          if (prompt.description) {
            console.log(chalk.gray(`   ${prompt.description}`));
          }
          if (prompt.arguments && prompt.arguments.length > 0) {
            console.log(chalk.gray(`   Arguments: ${prompt.arguments.map(arg => arg.name).join(', ')}`));
          }
          console.log();
        });
      } catch (error: any) {
        console.error(chalk.red(`Error listing prompts: ${error.message}`));
      }
    });

  promptsCommand
    .command('get <name>')
    .description('Get an MCP prompt with optional arguments')
    .option('-a, --args <args...>', 'Arguments in KEY=VALUE format')
    .action(async (name: string, options: any) => {
      try {
        const { MCPService } = await import('../mcp/mcp-service');
        const service = new MCPService();
        
        // Parse arguments
        const args: Record<string, string> = {};
        if (options.args) {
          for (const arg of options.args) {
            const [key, ...valueParts] = arg.split('=');
            if (key && valueParts.length > 0) {
              args[key] = valueParts.join('=');
            }
          }
        }
        
        const response = await service.getPrompt(name, args);
        
        console.log(chalk.bold(`\nPrompt: ${name}`));
        if (response.description) {
          console.log(chalk.gray(response.description));
        }
        console.log(chalk.gray('─'.repeat(50)));
        
        response.messages.forEach((msg, index) => {
          console.log(chalk.cyan(`${index + 1}. [${msg.role.toUpperCase()}]`));
          console.log(msg.content);
          console.log();
        });
      } catch (error: any) {
        console.error(chalk.red(`Error getting prompt: ${error.message}`));
      }
    });

  // Roots commands
  const rootsCommand = mcpCommand
    .command('roots')
    .description('Manage MCP roots (allowed file system paths)');

  rootsCommand
    .command('list')
    .alias('ls')
    .description('List all configured MCP roots')
    .action(async () => {
      try {
        const { MCPService } = await import('../mcp/mcp-service');
        const service = new MCPService();
        
        const response = await service.listRoots();
        
        console.log(chalk.bold('\nConfigured MCP Roots:'));
        console.log(chalk.gray('─'.repeat(50)));
        
        if (response.roots.length === 0) {
          console.log(chalk.yellow('No roots configured.'));
          return;
        }

        response.roots.forEach((root, index) => {
          console.log(chalk.cyan(`${index + 1}. ${root.name || 'Unnamed Root'}`));
          console.log(chalk.gray(`   URI: ${root.uri}`));
          console.log();
        });
      } catch (error: any) {
        console.error(chalk.red(`Error listing roots: ${error.message}`));
      }
    });

  rootsCommand
    .command('add <uri>')
    .description('Add a new MCP root')
    .option('-n, --name <name>', 'Friendly name for the root')
    .action(async (uri: string, options: any) => {
      try {
        const { MCPService } = await import('../mcp/mcp-service');
        const service = new MCPService();
        
        service.addRoot({
          uri,
          name: options.name
        });
        
        console.log(chalk.green(`✓ Added root: ${uri}`));
        if (options.name) {
          console.log(chalk.gray(`  Name: ${options.name}`));
        }
      } catch (error: any) {
        console.error(chalk.red(`Error adding root: ${error.message}`));
      }
    });

  rootsCommand
    .command('remove <uri>')
    .alias('rm')
    .description('Remove an MCP root')
    .action(async (uri: string) => {
      try {
        const { MCPService } = await import('../mcp/mcp-service');
        const service = new MCPService();
        
        service.removeRoot(uri);
        
        console.log(chalk.green(`✓ Removed root: ${uri}`));
      } catch (error: any) {
        console.error(chalk.red(`Error removing root: ${error.message}`));
      }
    });

  // Serve command - make grok an MCP server
  mcpCommand
    .command('serve')
    .description('Start Grok CLI as an MCP server via stdio')
    .option('-p, --port <port>', 'Port to serve on (default: stdio)', 'stdio')
    .action(async (options: any) => {
      try {
        const { MCPServerTransport } = await import('../mcp/transports/stdio');
        const { MCPService } = await import('../mcp/mcp-service');
        
        console.log(chalk.blue('🚀 Starting Grok CLI as MCP server...'));
        console.log(chalk.gray('Transport: stdio'));
        console.log(chalk.gray('Capabilities: tools, resources, prompts, roots'));
        console.log();
        
        const service = new MCPService();
        const transport = new MCPServerTransport(service);
        
        await transport.start();
        
        // Keep the process alive
        process.on('SIGINT', async () => {
          console.log(chalk.yellow('\n🛑 Shutting down MCP server...'));
          await transport.stop();
          process.exit(0);
        });
        
        process.on('SIGTERM', async () => {
          console.log(chalk.yellow('\n🛑 Shutting down MCP server...'));
          await transport.stop();
          process.exit(0);
        });
        
      } catch (error: any) {
        console.error(chalk.red(`Error starting MCP server: ${error.message}`));
        process.exit(1);
      }
    });

  return mcpCommand;
}