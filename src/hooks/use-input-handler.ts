import { useState, useRef } from "react";
import { useInput, useApp } from "ink";
import chalk from "chalk";
import { GrokAgent, ChatEntry } from "../agent/grok-agent";
import { ConfirmationService } from "../utils/confirmation-service";

interface UseInputHandlerProps {
  agent: GrokAgent;
  chatHistory: ChatEntry[];
  setChatHistory: React.Dispatch<React.SetStateAction<ChatEntry[]>>;
  setIsProcessing: (processing: boolean) => void;
  setIsStreaming: (streaming: boolean) => void;
  setTokenCount: (count: number) => void;
  setProcessingTime: (time: number) => void;
  processingStartTime: React.MutableRefObject<number>;
  isProcessing: boolean;
  isStreaming: boolean;
  isConfirmationActive?: boolean;
}

interface CommandSuggestion {
  command: string;
  description: string;
}

interface ModelOption {
  model: string;
  description: string;
}

export function useInputHandler({
  agent,
  chatHistory,
  setChatHistory,
  setIsProcessing,
  setIsStreaming,
  setTokenCount,
  setProcessingTime,
  processingStartTime,
  isProcessing,
  isStreaming,
  isConfirmationActive = false,
}: UseInputHandlerProps) {
  const [input, setInput] = useState("");
  const [showCommandSuggestions, setShowCommandSuggestions] = useState(false);
  const [selectedCommandIndex, setSelectedCommandIndex] = useState(0);
  const [showModelSelection, setShowModelSelection] = useState(false);
  const [selectedModelIndex, setSelectedModelIndex] = useState(0);
  const [autoEditEnabled, setAutoEditEnabled] = useState(() => {
    const confirmationService = ConfirmationService.getInstance();
    const sessionFlags = confirmationService.getSessionFlags();
    return sessionFlags.allOperations;
  });
  const { exit } = useApp();

  const commandSuggestions: CommandSuggestion[] = [
    { command: "/help", description: "Show help information" },
    { command: "/clear", description: "Clear chat history" },
    { command: "/models", description: "Switch Grok Model" },
    { command: "/mcp", description: "Show MCP server status" },
    { command: "/resources", description: "List available MCP resources" },
    { command: "/prompts", description: "List available MCP prompts" },
    { command: "/roots", description: "List available MCP roots" },
    { command: "/exit", description: "Exit the application" },
  ];

  const availableModels: ModelOption[] = [
    {
      model: "grok-4-latest",
      description: "Latest Grok-4 model (most capable)",
    },
    { model: "grok-3-latest", description: "Latest Grok-3 model" },
    { model: "grok-3-fast", description: "Fast Grok-3 variant" },
    { model: "grok-3-mini-fast", description: "Fastest Grok-3 variant" },
  ];

  const handleDirectCommand = async (input: string): Promise<boolean> => {
    const trimmedInput = input.trim();

    if (trimmedInput === "/clear") {
      // Reset chat history
      setChatHistory([]);

      // Reset processing states
      setIsProcessing(false);
      setIsStreaming(false);
      setTokenCount(0);
      setProcessingTime(0);
      processingStartTime.current = 0;

      // Reset confirmation service session flags
      const confirmationService = ConfirmationService.getInstance();
      confirmationService.resetSession();

      setInput("");
      return true;
    }

    if (trimmedInput === "/help") {
      const helpEntry: ChatEntry = {
        type: "assistant",
        content: `Grok CLI Help - MCP Enhanced

  /clear        - Clear chat history
  /help         - Show this help
  /models       - Switch Grok models
  /mcp          - Show MCP server status and tools
    /mcp -d     - Show detailed tool descriptions and schemas
    /mcp -t     - Show only tools
    /mcp -s     - Show only servers
  /resources    - List all available MCP resources
  /prompts      - List all available MCP prompts
  /roots        - List all configured MCP roots
  /read-resource <uri> - Read content from an MCP resource
  /get-prompt <name> [args...] - Get an MCP prompt with optional arguments
  /exit         - Exit application
  exit, quit    - Exit application

Keyboard Shortcuts:
  Shift+Tab   - Toggle auto-edit mode (bypass confirmations)

Direct Commands (executed immediately):
  ls [path]     - List directory contents
  pwd           - Show current directory  
  cd <path>     - Change directory
  cat <file>    - View file contents
  mkdir <dir>   - Create directory
  touch <file>  - Create empty file

MCP Commands (via CLI):
  grok mcp resources list     - List all MCP resources
  grok mcp resources read <uri> - Read a specific resource
  grok mcp prompts list       - List all MCP prompts
  grok mcp prompts get <name> - Get a specific prompt
  grok mcp roots list         - List all MCP roots
  grok mcp serve              - Start Grok as MCP server

Keyboard Shortcuts:
  Tab           - Toggle MCP status display (expand/collapse)

For complex operations, just describe what you want in natural language.
Examples:
  "edit package.json and add a new script"
  "create a new React component called Header"
  "show me all TypeScript files in this project"
  "use the code-review prompt to review src/main.ts"
  "read the grok://config resource to see current settings"`,
        timestamp: new Date(),
      };
      setChatHistory((prev) => [...prev, helpEntry]);
      setInput("");
      return true;
    }

    if (trimmedInput === "/models") {
      setShowModelSelection(true);
      setSelectedModelIndex(0);
      setInput("");
      return true;
    }

    if (trimmedInput.startsWith("/models ")) {
      const modelArg = trimmedInput.split(" ")[1];
      const modelNames = availableModels.map((m) => m.model);

      if (modelNames.includes(modelArg)) {
        agent.setModel(modelArg);
        const confirmEntry: ChatEntry = {
          type: "assistant",
          content: `✓ Switched to model: ${modelArg}`,
          timestamp: new Date(),
        };
        setChatHistory((prev) => [...prev, confirmEntry]);
      } else {
        const errorEntry: ChatEntry = {
          type: "assistant",
          content: `Invalid model: ${modelArg}

Available models: ${modelNames.join(", ")}`,
          timestamp: new Date(),
        };
        setChatHistory((prev) => [...prev, errorEntry]);
      }

      setInput("");
      return true;
    }

    if (trimmedInput === "/resources" || trimmedInput.startsWith("/resources ")) {
      try {
        const { MCPService } = await import('../mcp/mcp-service');
        const service = new MCPService();
        
        const response = await service.listResources();
        
        let content = `${chalk.bold('Available MCP Resources:')}\n\n`;
        
        if (response.resources.length === 0) {
          content += chalk.yellow('No resources available.');
        } else {
          response.resources.forEach((resource, index) => {
            content += `${chalk.cyan(`${index + 1}. ${resource.name}`)}\n`;
            content += chalk.gray(`   URI: ${resource.uri}\n`);
            if (resource.description) {
              content += chalk.gray(`   ${resource.description}\n`);
            }
            if (resource.mimeType) {
              content += chalk.gray(`   Type: ${resource.mimeType}\n`);
            }
            content += '\n';
          });
        }
        
        content += `\n${chalk.blue('Usage:')} ${chalk.cyan('/read-resource <uri>')} - Read a specific resource`;
        
        const resourceEntry: ChatEntry = {
          type: "assistant",
          content,
          timestamp: new Date(),
        };
        setChatHistory((prev) => [...prev, resourceEntry]);
      } catch (error: any) {
        const errorEntry: ChatEntry = {
          type: "assistant",
          content: `Error listing resources: ${error.message}`,
          timestamp: new Date(),
        };
        setChatHistory((prev) => [...prev, errorEntry]);
      }
      
      setInput("");
      return true;
    }

    if (trimmedInput === "/prompts" || trimmedInput.startsWith("/prompts ")) {
      try {
        const { MCPService } = await import('../mcp/mcp-service');
        const service = new MCPService();
        
        const response = await service.listPrompts();
        
        let content = `${chalk.bold('Available MCP Prompts:')}\n\n`;
        
        if (response.prompts.length === 0) {
          content += chalk.yellow('No prompts available.');
        } else {
          response.prompts.forEach((prompt, index) => {
            content += `${chalk.cyan(`${index + 1}. ${prompt.name}`)}\n`;
            if (prompt.description) {
              content += chalk.gray(`   ${prompt.description}\n`);
            }
            if (prompt.arguments && prompt.arguments.length > 0) {
              content += chalk.gray(`   Arguments: ${prompt.arguments.map(arg => arg.name).join(', ')}\n`);
            }
            content += '\n';
          });
        }
        
        content += `\n${chalk.blue('Usage:')} ${chalk.cyan('/get-prompt <name> [args...]')} - Get a specific prompt`;
        
        const promptEntry: ChatEntry = {
          type: "assistant",
          content,
          timestamp: new Date(),
        };
        setChatHistory((prev) => [...prev, promptEntry]);
      } catch (error: any) {
        const errorEntry: ChatEntry = {
          type: "assistant",
          content: `Error listing prompts: ${error.message}`,
          timestamp: new Date(),
        };
        setChatHistory((prev) => [...prev, errorEntry]);
      }
      
      setInput("");
      return true;
    }

    if (trimmedInput === "/roots" || trimmedInput.startsWith("/roots ")) {
      try {
        const { MCPService } = await import('../mcp/mcp-service');
        const service = new MCPService();
        
        const response = await service.listRoots();
        
        let content = `${chalk.bold('Configured MCP Roots:')}\n\n`;
        
        if (response.roots.length === 0) {
          content += chalk.yellow('No roots configured.');
        } else {
          response.roots.forEach((root, index) => {
            content += `${chalk.cyan(`${index + 1}. ${root.name || 'Unnamed Root'}`)}\n`;
            content += chalk.gray(`   URI: ${root.uri}\n`);
            content += '\n';
          });
        }
        
        content += `\n${chalk.blue('Usage:')} ${chalk.cyan('/add-root <uri> [--name <name>]')} - Add a new root`;
        
        const rootEntry: ChatEntry = {
          type: "assistant",
          content,
          timestamp: new Date(),
        };
        setChatHistory((prev) => [...prev, rootEntry]);
      } catch (error: any) {
        const errorEntry: ChatEntry = {
          type: "assistant",
          content: `Error listing roots: ${error.message}`,
          timestamp: new Date(),
        };
        setChatHistory((prev) => [...prev, errorEntry]);
      }
      
      setInput("");
      return true;
    }

    if (trimmedInput.startsWith("/read-resource ")) {
      const uri = trimmedInput.substring("/read-resource ".length).trim();
      if (uri) {
        try {
          const { MCPService } = await import('../mcp/mcp-service');
          const service = new MCPService();
          
          const response = await service.readResource(uri);
          
          const contentEntry: ChatEntry = {
            type: "assistant",
            content: typeof response.content.content === 'string' ? response.content.content : response.content.content.toString(),
            timestamp: new Date(),
          };
          setChatHistory((prev) => [...prev, contentEntry]);
        } catch (error: any) {
          const errorEntry: ChatEntry = {
            type: "assistant",
            content: `Error reading resource: ${error.message}`,
            timestamp: new Date(),
          };
          setChatHistory((prev) => [...prev, errorEntry]);
        }
      } else {
        const errorEntry: ChatEntry = {
          type: "assistant",
          content: "Usage: /read-resource <uri>",
          timestamp: new Date(),
        };
        setChatHistory((prev) => [...prev, errorEntry]);
      }
      
      setInput("");
      return true;
    }

    if (trimmedInput.startsWith("/get-prompt ")) {
      const promptName = trimmedInput.substring("/get-prompt ".length).trim();
      if (promptName) {
        try {
          const { MCPService } = await import('../mcp/mcp-service');
          const service = new MCPService();
          
          const response = await service.getPrompt(promptName);
          
          let content = `${chalk.bold(`Prompt: ${promptName}`)}\n\n`;
          if (response.description) {
            content += chalk.gray(`${response.description}\n\n`);
          }
          
          response.messages.forEach((msg, index) => {
            content += `${chalk.cyan(`${index + 1}. [${msg.role.toUpperCase()}]`)}\n`;
            content += msg.content;
            content += '\n\n';
          });
          
          const promptEntry: ChatEntry = {
            type: "assistant",
            content,
            timestamp: new Date(),
          };
          setChatHistory((prev) => [...prev, promptEntry]);
        } catch (error: any) {
          const errorEntry: ChatEntry = {
            type: "assistant",
            content: `Error getting prompt: ${error.message}`,
            timestamp: new Date(),
          };
          setChatHistory((prev) => [...prev, errorEntry]);
        }
      } else {
        const errorEntry: ChatEntry = {
          type: "assistant",
          content: "Usage: /get-prompt <name>",
          timestamp: new Date(),
        };
        setChatHistory((prev) => [...prev, errorEntry]);
      }
      
      setInput("");
      return true;
    }

    if (trimmedInput === "/mcp" || trimmedInput.startsWith("/mcp ")) {
      try {
        const mcpManager = (agent as any).mcpManager;
        if (!mcpManager) {
          const errorEntry: ChatEntry = {
            type: "assistant",
            content: "MCP manager not available",
            timestamp: new Date(),
          };
          setChatHistory((prev) => [...prev, errorEntry]);
          setInput("");
          return true;
        }

        const args = trimmedInput.split(" ").slice(1);
        const showDetailed = args.includes("--detailed") || args.includes("-d");
        const showTools = args.includes("--tools") || args.includes("-t") || args.length === 0;
        const showServers = args.includes("--servers") || args.includes("-s") || args.length === 0;

        const serverStatuses = mcpManager.getServerStatuses();
        const allTools = mcpManager.getAllTools();
        const configManager = mcpManager.getConfigManager();
        
        const connectedServers = Object.values(serverStatuses).filter(
          (status: any) => status.status === 'connected'
        );
        
        const disconnectedServers = Object.values(serverStatuses).filter(
          (status: any) => status.status !== 'connected'
        );
        
        // Calculate scope counts
        const scopeCounts = { project: 0, user: 0, local: 0, fallback: 0 };
        Object.values(serverStatuses).forEach((status: any) => {
          const scope = configManager?.getServerScope(status.id) || 'fallback';
          scopeCounts[scope]++;
        });

        // Build scope display
        const scopeDisplay = [];
        if (scopeCounts.project > 0) {
          scopeDisplay.push(chalk.cyan(`Project:${scopeCounts.project}`));
        }
        if (scopeCounts.user > 0) {
          scopeDisplay.push(chalk.green(`User:${scopeCounts.user}`));
        }
        if (scopeCounts.local > 0) {
          scopeDisplay.push(chalk.yellow(`Local:${scopeCounts.local}`));
        }
        if (scopeCounts.fallback > 0) {
          scopeDisplay.push(chalk.gray(`Fallback:${scopeCounts.fallback}`));
        }
        
        const scopeText = scopeDisplay.length > 0 ? ` (${scopeDisplay.join(' ')})` : '';
        
        let statusContent = `🔧 ${chalk.bold('MCP Server Status')}\n\n`;
        statusContent += `📊 ${chalk.bold('Summary')}: ${chalk.magenta(connectedServers.length)} connected servers${scopeText}, ${chalk.magenta(allTools.length)} total tools\n\n`;
        
        if (showServers && connectedServers.length > 0) {
          statusContent += `${chalk.green('✅ Connected Servers')}:\n`;
          connectedServers.forEach((server: any) => {
            const scope = configManager?.getServerScope(server.id) || 'fallback';
            const scopeColor = scope === 'project' ? chalk.cyan : 
                              scope === 'user' ? chalk.green : 
                              scope === 'local' ? chalk.yellow : chalk.gray;
            statusContent += `  • ${chalk.cyan(server.id)} ${scopeColor(`[${scope}]`)} (${server.tools?.length || 0} tools)\n`;
          });
          statusContent += `\n`;
        }
        
        if (showServers && disconnectedServers.length > 0) {
          statusContent += `${chalk.red('❌ Disconnected/Error Servers')}:\n`;
          disconnectedServers.forEach((server: any) => {
            const scope = configManager?.getServerScope(server.id) || 'fallback';
            const scopeColor = scope === 'project' ? chalk.cyan : 
                              scope === 'user' ? chalk.green : 
                              scope === 'local' ? chalk.yellow : chalk.gray;
            const statusIcon = server.status === 'connecting' ? '🔄' : '❌';
            statusContent += `  ${statusIcon} ${chalk.cyan(server.id)} ${scopeColor(`[${scope}]`)} (${chalk.red(server.status)})`;
            if (server.error) {
              statusContent += ` - ${chalk.red(server.error)}`;
            }
            statusContent += `\n`;
          });
          statusContent += `\n`;
        }
        
        if (showTools && allTools.length > 0) {
          statusContent += `${chalk.blue('🛠️ Available Tools')}:\n`;
          
          if (showDetailed) {
            // Group tools by server for detailed view
            const toolsByServer = new Map();
            allTools.forEach((tool: any) => {
              if (!toolsByServer.has(tool.serverId)) {
                toolsByServer.set(tool.serverId, []);
              }
              toolsByServer.get(tool.serverId).push(tool);
            });
            
            toolsByServer.forEach((tools: any[], serverId: string) => {
              const scope = configManager?.getServerScope(serverId) || 'fallback';
              const scopeColor = scope === 'project' ? chalk.cyan : 
                                scope === 'user' ? chalk.green : 
                                scope === 'local' ? chalk.yellow : chalk.gray;
              statusContent += `\n  📁 ${chalk.cyan(serverId)} ${scopeColor(`[${scope}]`)}:\n`;
              tools.forEach((tool: any) => {
                statusContent += `    🔧 ${chalk.yellow(tool.name)}\n`;
                if (tool.description) {
                  statusContent += `       📝 ${chalk.gray(tool.description)}\n`;
                }
                if (tool.inputSchema) {
                  statusContent += `       📋 ${chalk.blue('Schema')}: `;
                  if (tool.inputSchema.properties) {
                    const props = Object.keys(tool.inputSchema.properties);
                    statusContent += `{${chalk.green(props.join(', '))}}\n`;
                  } else {
                    statusContent += `${JSON.stringify(tool.inputSchema, null, 2).replace(/\n/g, '\n           ')}\n`;
                  }
                }
                statusContent += `\n`;
              });
            });
          } else {
            // Simple view - just tool names grouped by server
            const toolsByServer = new Map();
            allTools.forEach((tool: any) => {
              if (!toolsByServer.has(tool.serverId)) {
                toolsByServer.set(tool.serverId, []);
              }
              toolsByServer.get(tool.serverId).push(tool.name);
            });
            
            toolsByServer.forEach((tools: string[], serverId: string) => {
              const scope = configManager?.getServerScope(serverId) || 'fallback';
              const scopeColor = scope === 'project' ? chalk.cyan : 
                                scope === 'user' ? chalk.green : 
                                scope === 'local' ? chalk.yellow : chalk.gray;
              statusContent += `  📁 ${chalk.cyan(serverId)} ${scopeColor(`[${scope}]`)}: ${chalk.yellow(tools.join(', '))}\n`;
            });
            
            statusContent += `\n💡 Use ${chalk.cyan("'/mcp --detailed'")} or ${chalk.cyan("'/mcp -d'")} to see tool descriptions and schemas\n`;
          }
        }
        
        if (args.length === 0) {
          statusContent += `\n${chalk.blue('📖 Usage')}:\n`;
          statusContent += `  ${chalk.cyan('/mcp')}              - Show summary (default)\n`;
          statusContent += `  ${chalk.cyan('/mcp --detailed')}   - Show detailed tool info with descriptions and schemas\n`;
          statusContent += `  ${chalk.cyan('/mcp --tools')}      - Show only tools\n`;
          statusContent += `  ${chalk.cyan('/mcp --servers')}    - Show only servers\n`;
          statusContent += `  ${chalk.cyan('/mcp -d')}           - Short for --detailed\n`;
          statusContent += `  ${chalk.cyan('/mcp -t')}           - Short for --tools\n`;
          statusContent += `  ${chalk.cyan('/mcp -s')}           - Short for --servers\n`;
        }

        const mcpEntry: ChatEntry = {
          type: "assistant",
          content: statusContent,
          timestamp: new Date(),
        };
        setChatHistory((prev) => [...prev, mcpEntry]);
      } catch (error: any) {
        const errorEntry: ChatEntry = {
          type: "assistant",
          content: `Error getting MCP status: ${error.message}`,
          timestamp: new Date(),
        };
        setChatHistory((prev) => [...prev, errorEntry]);
      }

      setInput("");
      return true;
    }

    const directBashCommands = [
      "ls",
      "pwd",
      "cd",
      "cat",
      "mkdir",
      "touch",
      "echo",
      "grep",
      "find",
      "cp",
      "mv",
      "rm",
    ];
    const firstWord = trimmedInput.split(" ")[0];

    if (directBashCommands.includes(firstWord)) {
      const userEntry: ChatEntry = {
        type: "user",
        content: trimmedInput,
        timestamp: new Date(),
      };
      setChatHistory((prev) => [...prev, userEntry]);

      try {
        const result = await agent.executeBashCommand(trimmedInput);

        const commandEntry: ChatEntry = {
          type: "tool_result",
          content: result.success
            ? result.output || "Command completed"
            : result.error || "Command failed",
          timestamp: new Date(),
          toolCall: {
            id: `bash_${Date.now()}`,
            type: "function",
            function: {
              name: "bash",
              arguments: JSON.stringify({ command: trimmedInput }),
            },
          },
          toolResult: result,
        };
        setChatHistory((prev) => [...prev, commandEntry]);
      } catch (error: any) {
        const errorEntry: ChatEntry = {
          type: "assistant",
          content: `Error executing command: ${error.message}`,
          timestamp: new Date(),
        };
        setChatHistory((prev) => [...prev, errorEntry]);
      }

      setInput("");
      return true;
    }

    return false;
  };

  const processUserMessage = async (userInput: string) => {
    const userEntry: ChatEntry = {
      type: "user",
      content: userInput,
      timestamp: new Date(),
    };
    setChatHistory((prev) => [...prev, userEntry]);

    setIsProcessing(true);
    setInput("");

    try {
      setIsStreaming(true);
      let streamingEntry: ChatEntry | null = null;

      for await (const chunk of agent.processUserMessageStream(userInput)) {
        switch (chunk.type) {
          case "content":
            if (chunk.content) {
              if (!streamingEntry) {
                const newStreamingEntry = {
                  type: "assistant" as const,
                  content: chunk.content,
                  timestamp: new Date(),
                  isStreaming: true,
                };
                setChatHistory((prev) => [...prev, newStreamingEntry]);
                streamingEntry = newStreamingEntry;
              } else {
                setChatHistory((prev) =>
                  prev.map((entry, idx) =>
                    idx === prev.length - 1 && entry.isStreaming
                      ? { ...entry, content: entry.content + chunk.content }
                      : entry
                  )
                );
              }
            }
            break;

          case "token_count":
            if (chunk.tokenCount !== undefined) {
              setTokenCount(chunk.tokenCount);
            }
            break;

          case "tool_calls":
            if (chunk.toolCalls) {
              // Stop streaming for the current assistant message
              setChatHistory((prev) =>
                prev.map((entry) =>
                  entry.isStreaming
                    ? {
                        ...entry,
                        isStreaming: false,
                        toolCalls: chunk.toolCalls,
                      }
                    : entry
                )
              );
              streamingEntry = null;

              // Add individual tool call entries to show tools are being executed
              chunk.toolCalls.forEach((toolCall) => {
                const toolCallEntry: ChatEntry = {
                  type: "tool_call",
                  content: "Executing...",
                  timestamp: new Date(),
                  toolCall: toolCall,
                };
                setChatHistory((prev) => [...prev, toolCallEntry]);
              });
            }
            break;

          case "tool_result":
            if (chunk.toolCall && chunk.toolResult) {
              setChatHistory((prev) =>
                prev.map((entry) => {
                  if (entry.isStreaming) {
                    return { ...entry, isStreaming: false };
                  }
                  // Update the existing tool_call entry with the result
                  if (
                    entry.type === "tool_call" &&
                    entry.toolCall?.id === chunk.toolCall?.id
                  ) {
                    return {
                      ...entry,
                      type: "tool_result",
                      content: chunk.toolResult.success
                        ? chunk.toolResult.output || "Success"
                        : chunk.toolResult.error || "Error occurred",
                      toolResult: chunk.toolResult,
                    };
                  }
                  return entry;
                })
              );
              streamingEntry = null;
            }
            break;

          case "done":
            if (streamingEntry) {
              setChatHistory((prev) =>
                prev.map((entry) =>
                  entry.isStreaming ? { ...entry, isStreaming: false } : entry
                )
              );
            }
            setIsStreaming(false);
            break;
        }
      }
    } catch (error: any) {
      const errorEntry: ChatEntry = {
        type: "assistant",
        content: `Error: ${error.message}`,
        timestamp: new Date(),
      };
      setChatHistory((prev) => [...prev, errorEntry]);
      setIsStreaming(false);
    }

    setIsProcessing(false);
    processingStartTime.current = 0;
  };

  useInput(async (inputChar: string, key: any) => {
    // Don't handle input if confirmation dialog is active
    if (isConfirmationActive) {
      return;
    }

    if (key.ctrl && inputChar === "c") {
      exit();
      return;
    }

    // Handle shift+tab to toggle auto-edit mode
    if (key.shift && key.tab) {
      const newAutoEditState = !autoEditEnabled;
      setAutoEditEnabled(newAutoEditState);

      const confirmationService = ConfirmationService.getInstance();
      if (newAutoEditState) {
        // Enable auto-edit: set all operations to be accepted
        confirmationService.setSessionFlag("allOperations", true);
      } else {
        // Disable auto-edit: reset session flags
        confirmationService.resetSession();
      }

      return;
    }

    if (key.escape) {
      if (showCommandSuggestions) {
        setShowCommandSuggestions(false);
        setSelectedCommandIndex(0);
        return;
      }
      if (showModelSelection) {
        setShowModelSelection(false);
        setSelectedModelIndex(0);
        return;
      }
      if (isProcessing || isStreaming) {
        agent.abortCurrentOperation();
        setIsProcessing(false);
        setIsStreaming(false);
        setTokenCount(0);
        setProcessingTime(0);
        processingStartTime.current = 0;
        return;
      }
    }

    if (showCommandSuggestions) {
      if (key.upArrow) {
        setSelectedCommandIndex((prev) =>
          prev === 0 ? commandSuggestions.length - 1 : prev - 1
        );
        return;
      }
      if (key.downArrow) {
        setSelectedCommandIndex(
          (prev) => (prev + 1) % commandSuggestions.length
        );
        return;
      }
      if (key.tab || key.return) {
        const selectedCommand = commandSuggestions[selectedCommandIndex];
        setInput(selectedCommand.command + " ");
        setShowCommandSuggestions(false);
        setSelectedCommandIndex(0);
        return;
      }
    }

    if (showModelSelection) {
      if (key.upArrow) {
        setSelectedModelIndex((prev) =>
          prev === 0 ? availableModels.length - 1 : prev - 1
        );
        return;
      }
      if (key.downArrow) {
        setSelectedModelIndex((prev) => (prev + 1) % availableModels.length);
        return;
      }
      if (key.tab || key.return) {
        const selectedModel = availableModels[selectedModelIndex];
        agent.setModel(selectedModel.model);
        const confirmEntry: ChatEntry = {
          type: "assistant",
          content: `✓ Switched to model: ${selectedModel.model}`,
          timestamp: new Date(),
        };
        setChatHistory((prev) => [...prev, confirmEntry]);
        setShowModelSelection(false);
        setSelectedModelIndex(0);
        return;
      }
    }

    if (key.return) {
      const userInput = input.trim();
      if (userInput === "exit" || userInput === "quit") {
        exit();
        return;
      }

      if (userInput) {
        const directCommandResult = await handleDirectCommand(userInput);
        if (!directCommandResult) {
          await processUserMessage(userInput);
        }
      }
      return;
    }

    if (key.backspace || key.delete) {
      const newInput = input.slice(0, -1);
      setInput(newInput);

      if (!newInput.startsWith("/")) {
        setShowCommandSuggestions(false);
        setSelectedCommandIndex(0);
      }
      return;
    }

    if (inputChar && !key.ctrl && !key.meta) {
      const newInput = input + inputChar;
      setInput(newInput);

      if (
        newInput === "/" ||
        ["ls", "pwd", "cd", "cat", "mkdir", "touch"].some((cmd) =>
          cmd.startsWith(newInput)
        )
      ) {
        setShowCommandSuggestions(true);
        setSelectedCommandIndex(0);
      } else if (
        !newInput.startsWith("/") &&
        !["ls", "pwd", "cd", "cat", "mkdir", "touch"].some((cmd) =>
          cmd.startsWith(newInput)
        )
      ) {
        setShowCommandSuggestions(false);
        setSelectedCommandIndex(0);
      }
    }
  });

  return {
    input,
    showCommandSuggestions,
    selectedCommandIndex,
    showModelSelection,
    selectedModelIndex,
    commandSuggestions,
    availableModels,
    agent,
    autoEditEnabled,
  };
}
