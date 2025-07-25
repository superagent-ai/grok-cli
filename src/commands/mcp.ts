import { Command } from 'commander';
import { addMCPServer, removeMCPServer, loadMCPConfig, PREDEFINED_SERVERS } from '../mcp/config';
import { getMCPManager } from '../grok/tools';
import { MCPServerConfig } from '../mcp/client';
import chalk from 'chalk';

export function createMCPCommand(): Command {
  const mcpCommand = new Command('mcp');
  mcpCommand.description('Manage MCP (Model Context Protocol) servers');

  // Add server command
  mcpCommand
    .command('add <name>')
    .description('Add an MCP server')
    .option('-t, --transport <type>', 'Transport type (stdio, http, sse, streamable_http)', 'stdio')
    .option('-c, --command <command>', 'Command to run the server (for stdio transport)')
    .option('-a, --args [args...]', 'Arguments for the server command (for stdio transport)', [])
    .option('-u, --url <url>', 'URL for HTTP/SSE transport')
    .option('-h, --headers [headers...]', 'HTTP headers (key=value format)', [])
    .option('-e, --env [env...]', 'Environment variables (key=value format)', [])
    .action(async (name: string, options) => {
      try {
        // Check if it's a predefined server
        if (PREDEFINED_SERVERS[name]) {
          const config = PREDEFINED_SERVERS[name];
          addMCPServer(config);
          console.log(chalk.green(`✓ Added predefined MCP server: ${name}`));
          
          // Try to connect immediately
          const manager = getMCPManager();
          await manager.addServer(config);
          console.log(chalk.green(`✓ Connected to MCP server: ${name}`));
          
          const tools = manager.getTools().filter(t => t.serverName === name);
          console.log(chalk.blue(`  Available tools: ${tools.length}`));
          
          return;
        }

        // Custom server
        const transportType = options.transport.toLowerCase();
        
        if (transportType === 'stdio') {
          if (!options.command) {
            console.error(chalk.red('Error: --command is required for stdio transport'));
            process.exit(1);
          }
        } else if (transportType === 'http' || transportType === 'sse' || transportType === 'streamable_http') {
          if (!options.url) {
            console.error(chalk.red(`Error: --url is required for ${transportType} transport`));
            process.exit(1);
          }
        } else {
          console.error(chalk.red('Error: Transport type must be stdio, http, sse, or streamable_http'));
          process.exit(1);
        }

        // Parse environment variables
        const env: Record<string, string> = {};
        for (const envVar of options.env || []) {
          const [key, value] = envVar.split('=', 2);
          if (key && value) {
            env[key] = value;
          }
        }

        // Parse headers
        const headers: Record<string, string> = {};
        for (const header of options.headers || []) {
          const [key, value] = header.split('=', 2);
          if (key && value) {
            headers[key] = value;
          }
        }

        const config = {
          name,
          transport: {
            type: transportType as 'stdio' | 'http' | 'sse' | 'streamable_http',
            command: options.command,
            args: options.args || [],
            url: options.url,
            env,
            headers: Object.keys(headers).length > 0 ? headers : undefined
          }
        };

        addMCPServer(config);
        console.log(chalk.green(`✓ Added MCP server: ${name}`));
        
        // Try to connect immediately
        const manager = getMCPManager();
        await manager.addServer(config);
        console.log(chalk.green(`✓ Connected to MCP server: ${name}`));
        
        const tools = manager.getTools().filter(t => t.serverName === name);
        console.log(chalk.blue(`  Available tools: ${tools.length}`));

      } catch (error: any) {
        console.error(chalk.red(`Error adding MCP server: ${error.message}`));
        process.exit(1);
      }
    });

  // Add server from JSON command
  mcpCommand
    .command('add-json <name> <json>')
    .description('Add an MCP server from JSON configuration')
    .action(async (name: string, jsonConfig: string) => {
      try {
        let config;
        try {
          config = JSON.parse(jsonConfig);
        } catch (error) {
          console.error(chalk.red('Error: Invalid JSON configuration'));
          process.exit(1);
        }

        const serverConfig: MCPServerConfig = {
          name,
          transport: {
            type: 'stdio', // default
            command: config.command,
            args: config.args || [],
            env: config.env || {},
            url: config.url,
            headers: config.headers
          }
        };

        // Override transport type if specified
        if (config.transport) {
          if (typeof config.transport === 'string') {
            serverConfig.transport.type = config.transport as 'stdio' | 'http' | 'sse';
          } else if (typeof config.transport === 'object') {
            serverConfig.transport = { ...serverConfig.transport, ...config.transport };
          }
        }

        addMCPServer(serverConfig);
        console.log(chalk.green(`✓ Added MCP server: ${name}`));
        
        // Try to connect immediately
        const manager = getMCPManager();
        await manager.addServer(serverConfig);
        console.log(chalk.green(`✓ Connected to MCP server: ${name}`));
        
        const tools = manager.getTools().filter(t => t.serverName === name);
        console.log(chalk.blue(`  Available tools: ${tools.length}`));

      } catch (error: any) {
        console.error(chalk.red(`Error adding MCP server: ${error.message}`));
        process.exit(1);
      }
    });

  // Remove server command
  mcpCommand
    .command('remove <name>')
    .description('Remove an MCP server')
    .action(async (name: string) => {
      try {
        const manager = getMCPManager();
        await manager.removeServer(name);
        removeMCPServer(name);
        console.log(chalk.green(`✓ Removed MCP server: ${name}`));
      } catch (error: any) {
        console.error(chalk.red(`Error removing MCP server: ${error.message}`));
        process.exit(1);
      }
    });

  // List servers command
  mcpCommand
    .command('list')
    .description('List configured MCP servers')
    .action(() => {
      const config = loadMCPConfig();
      const manager = getMCPManager();
      
      if (config.servers.length === 0) {
        console.log(chalk.yellow('No MCP servers configured'));
        return;
      }

      console.log(chalk.bold('Configured MCP servers:'));
      console.log();

      for (const server of config.servers) {
        const isConnected = manager.getServers().includes(server.name);
        const status = isConnected 
          ? chalk.green('✓ Connected') 
          : chalk.red('✗ Disconnected');
        
        console.log(`${chalk.bold(server.name)}: ${status}`);
        
        // Display transport information
        if (server.transport) {
          console.log(`  Transport: ${server.transport.type}`);
          if (server.transport.type === 'stdio') {
            console.log(`  Command: ${server.transport.command} ${(server.transport.args || []).join(' ')}`);
          } else if (server.transport.type === 'http' || server.transport.type === 'sse') {
            console.log(`  URL: ${server.transport.url}`);
          }
        } else if (server.command) {
          // Legacy format
          console.log(`  Command: ${server.command} ${(server.args || []).join(' ')}`);
        }
        
        if (isConnected) {
          const transportType = manager.getTransportType(server.name);
          if (transportType) {
            console.log(`  Active Transport: ${transportType}`);
          }
          
          const tools = manager.getTools().filter(t => t.serverName === server.name);
          console.log(`  Tools: ${tools.length}`);
          if (tools.length > 0) {
            tools.forEach(tool => {
              const displayName = tool.name.replace(`mcp__${server.name}__`, '');
              console.log(`    - ${displayName}: ${tool.description}`);
            });
          }
        }
        
        console.log();
      }
    });

  // Test server command
  mcpCommand
    .command('test <name>')
    .description('Test connection to an MCP server')
    .action(async (name: string) => {
      try {
        const config = loadMCPConfig();
        const serverConfig = config.servers.find(s => s.name === name);
        
        if (!serverConfig) {
          console.error(chalk.red(`Server ${name} not found`));
          process.exit(1);
        }

        console.log(chalk.blue(`Testing connection to ${name}...`));
        
        const manager = getMCPManager();
        await manager.addServer(serverConfig);
        
        const tools = manager.getTools().filter(t => t.serverName === name);
        console.log(chalk.green(`✓ Successfully connected to ${name}`));
        console.log(chalk.blue(`  Available tools: ${tools.length}`));
        
        if (tools.length > 0) {
          console.log('  Tools:');
          tools.forEach(tool => {
            const displayName = tool.name.replace(`mcp__${name}__`, '');
            console.log(`    - ${displayName}: ${tool.description}`);
          });
        }

      } catch (error: any) {
        console.error(chalk.red(`✗ Failed to connect to ${name}: ${error.message}`));
        process.exit(1);
      }
    });

  return mcpCommand;
}