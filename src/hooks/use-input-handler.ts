import { useState, useRef } from "react";
import { useInput, useApp } from "ink";
import { GrokAgent, ChatEntry } from "../agent/grok-agent";
import { ConfirmationService } from "../utils/confirmation-service";
import * as fs from "fs-extra";
import * as path from "path";

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
  const [showExportSelection, setShowExportSelection] = useState(false);
  const [selectedExportIndex, setSelectedExportIndex] = useState(0);
  const [exportAwaitingFilename, setExportAwaitingFilename] = useState<'json' | 'md' | null>(null);
  const { exit } = useApp();

  const commandSuggestions: CommandSuggestion[] = [
    { command: "/help", description: "Show help information" },
    { command: "/clear", description: "Clear chat history" },
    { command: "/models", description: "Switch Grok Model" },
    { command: "/export", description: "Export conversation to file" },
    { command: "/exit", description: "Exit the application" },
  ];

  const availableModels: ModelOption[] = [
    { model: "grok-4-latest", description: "Latest Grok-4 model (most capable)" },
    { model: "grok-3-latest", description: "Latest Grok-3 model" },
    { model: "grok-3-fast", description: "Fast Grok-3 variant" },
    { model: "grok-3-mini-fast", description: "Fastest Grok-3 variant" }
  ];

  const exportFormats = [
    { format: "json", description: "Structured JSON data" },
    { format: "md", description: "Readable Markdown format" },
    { format: "cancel", description: "Cancel export" }
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
        content: `Grok CLI Help:

Built-in Commands:
  /clear      - Clear chat history
  /help       - Show this help
  /models     - Switch Grok models
  /export     - Export conversation to file
  /exit       - Exit application
  exit, quit  - Exit application

Export Commands:
  /export         - Show export options
  /export json    - Export as JSON with timestamp
  /export md      - Export as Markdown with timestamp
  /export json filename - Export as JSON with custom name
  /export md filename   - Export as Markdown with custom name

Direct Commands (executed immediately):
  ls [path]   - List directory contents
  pwd         - Show current directory  
  cd <path>   - Change directory
  cat <file>  - View file contents
  mkdir <dir> - Create directory
  touch <file>- Create empty file

For complex operations, just describe what you want in natural language.
Examples:
  "edit package.json and add a new script"
  "create a new React component called Header"
  "show me all TypeScript files in this project"`,
        timestamp: new Date(),
      };
      setChatHistory((prev) => [...prev, helpEntry]);
      setInput("");
      return true;
    }

    if (trimmedInput === "/exit") {
      exit();
      return true;
    }

    if (trimmedInput === "/models") {
      setShowModelSelection(true);
      setSelectedModelIndex(0);
      setInput("");
      return true;
    }

    if (trimmedInput === "/export") {
      if (chatHistory.length === 0) {
        const errorEntry: ChatEntry = {
          type: "assistant",
          content: "No conversation to export. Start a conversation first!",
          timestamp: new Date(),
        };
        setChatHistory((prev) => [...prev, errorEntry]);
        setInput("");
        return true;
      }
      
      setShowExportSelection(true);
      setSelectedExportIndex(0);
      setInput("");
      return true;
    }

    if (trimmedInput.startsWith("/models ")) {
      const modelArg = trimmedInput.split(" ")[1];
      const modelNames = availableModels.map(m => m.model);

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

    const directBashCommands = [
      "ls", "pwd", "cd", "cat", "mkdir", "touch", "echo", "grep", "find", "cp", "mv", "rm",
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
                  entry.isStreaming ? { ...entry, isStreaming: false, toolCalls: chunk.toolCalls } : entry
                )
              );
              streamingEntry = null;
            }
            break;

          case "tool_result":
            if (chunk.toolCall && chunk.toolResult) {
              setChatHistory((prev) =>
                prev.map((entry) =>
                  entry.isStreaming ? { ...entry, isStreaming: false } : entry
                )
              );

              const toolResultEntry: ChatEntry = {
                type: "tool_result",
                content: chunk.toolResult.success
                  ? chunk.toolResult.output || "Success"
                  : chunk.toolResult.error || "Error occurred",
                timestamp: new Date(),
                toolCall: chunk.toolCall,
                toolResult: chunk.toolResult,
              };
              setChatHistory((prev) => [...prev, toolResultEntry]);
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


  const handleExportWithFormat = async (format: 'json' | 'md', filename?: string): Promise<void> => {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0] + '_' + 
                     new Date().toISOString().replace(/[:.]/g, '-').split('T')[1].split('.')[0];
    const defaultFilename = `grok-conversation-${timestamp}`;
    const finalFilename = filename || defaultFilename;
    const extension = format;
    const fullFilename = `${finalFilename}.${extension}`;
    const filePath = path.join(process.cwd(), fullFilename);

    try {
      let content: string;
      
      if (format === 'json') {
        // Export as structured JSON
        const exportData = {
          exportedAt: new Date().toISOString(),
          model: agent.getCurrentModel(),
          totalEntries: chatHistory.length,
          conversation: chatHistory.map(entry => ({
            type: entry.type,
            content: entry.content,
            timestamp: entry.timestamp,
            ...(entry.toolCall && { toolCall: entry.toolCall }),
            ...(entry.toolResult && { toolResult: entry.toolResult }),
            ...(entry.toolCalls && { toolCalls: entry.toolCalls })
          }))
        };
        content = JSON.stringify(exportData, null, 2);
      } else {
        // Export as Markdown
        content = `# Grok Conversation Export

**Exported At:** ${new Date().toISOString()}  
**Model:** ${agent.getCurrentModel()}  
**Total Entries:** ${chatHistory.length}

---

`;
        
        chatHistory.forEach((entry, index) => {
          const typeIcon = {
            user: "👤",
            assistant: "🤖", 
            tool_result: "🔧"
          }[entry.type] || "📝";
          
          content += `## ${typeIcon} ${entry.type.toUpperCase()} - ${entry.timestamp.toLocaleString()}

${entry.content}

---

`;
        });
      }

      await fs.writeFile(filePath, content, 'utf8');
      
      const fileStats = await fs.stat(filePath);
      const fileSizeKB = Math.round(fileStats.size / 1024 * 100) / 100;
      
      const successEntry: ChatEntry = {
        type: "assistant",
        content: `✅ Conversation exported successfully!

📁 File Details:
   Name: ${fullFilename}
   Location: ${filePath}
   Format: ${format.toUpperCase()}
   Size: ${fileSizeKB} KB (${chatHistory.length} entries)

💡 The file has been saved to your current working directory.
   You can open it with any text editor or import it into other applications.`,
        timestamp: new Date(),
      };
      setChatHistory((prev) => [...prev, successEntry]);
      
    } catch (error: any) {
      const errorEntry: ChatEntry = {
        type: "assistant", 
        content: `❌ Export failed: ${error.message}

Please check file permissions and try again.`,
        timestamp: new Date(),
      };
      setChatHistory((prev) => [...prev, errorEntry]);
    }
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
      if (showExportSelection) {
        setShowExportSelection(false);
        setSelectedExportIndex(0);
        return;
      }
      if (exportAwaitingFilename) {
        const cancelEntry: ChatEntry = {
          type: "assistant",
          content: "Export cancelled.",
          timestamp: new Date(),
        };
        setChatHistory((prev) => [...prev, cancelEntry]);
        setExportAwaitingFilename(null);
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
        setSelectedCommandIndex((prev) => (prev + 1) % commandSuggestions.length);
        return;
      }
      if (key.tab || key.return) {
        const selectedCommand = commandSuggestions[selectedCommandIndex];
        
        // Special handling for /models command with Tab
        if (selectedCommand.command === "/models" && key.tab) {
          setShowModelSelection(true);
          setSelectedModelIndex(0);
          setShowCommandSuggestions(false);
          setSelectedCommandIndex(0);
          setInput("");
          return;
        }
        
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

    if (showExportSelection) {
      if (key.upArrow) {
        setSelectedExportIndex((prev) =>
          prev === 0 ? exportFormats.length - 1 : prev - 1
        );
        return;
      }
      if (key.downArrow) {
        setSelectedExportIndex((prev) => (prev + 1) % exportFormats.length);
        return;
      }
      if (key.tab || key.return) {
        const selectedFormat = exportFormats[selectedExportIndex];
        
        if (selectedFormat.format === "cancel") {
          const cancelEntry: ChatEntry = {
            type: "assistant",
            content: "Export cancelled.",
            timestamp: new Date(),
          };
          setChatHistory((prev) => [...prev, cancelEntry]);
        } else {
          // Show filename input prompt
          const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0] + '_' + 
                           new Date().toISOString().replace(/[:.]/g, '-').split('T')[1].split('.')[0];
          const defaultFilename = `grok-conversation-${timestamp}`;
          const currentDir = process.cwd();
          
          const filenamePromptEntry: ChatEntry = {
            type: "assistant",
            content: `Export format: ${selectedFormat.format.toUpperCase()}

Enter filename (without extension) or press Enter for default:

Default: ${defaultFilename}.${selectedFormat.format}
Save location: ${currentDir}/

Type your filename and press Enter, or just press Enter to use default:`,
            timestamp: new Date(),
          };
          setChatHistory((prev) => [...prev, filenamePromptEntry]);
          setExportAwaitingFilename(selectedFormat.format as 'json' | 'md');
        }
        
        setShowExportSelection(false);
        setSelectedExportIndex(0);
        return;
      }
    }

    if (key.return) {
      const userInput = input.trim();
      
      // Handle filename input for export
      if (exportAwaitingFilename) {
        const filename = userInput || undefined;
        await handleExportWithFormat(exportAwaitingFilename, filename);
        setExportAwaitingFilename(null);
        setInput("");
        return;
      }
      
      if (userInput === "exit" || userInput === "quit") {
        exit();
        return;
      }

      if (userInput) {
        // Clear any active UI states first
        setShowCommandSuggestions(false);
        setShowModelSelection(false);
        setShowExportSelection(false);
        setSelectedCommandIndex(0);
        setSelectedModelIndex(0);
        setSelectedExportIndex(0);
        
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

      // Only show command suggestions for partial commands, not complete ones
      if (newInput === "/") {
        setShowCommandSuggestions(true);
        setSelectedCommandIndex(0);
      } else if (newInput.startsWith("/") && !newInput.includes(" ")) {
        // Show suggestions for partial command matches
        const hasMatch = commandSuggestions.some(cmd => 
          cmd.command.startsWith(newInput) && cmd.command !== newInput
        );
        setShowCommandSuggestions(hasMatch);
        if (!hasMatch) {
          setSelectedCommandIndex(0);
        }
      } else {
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
    showExportSelection,
    selectedExportIndex,
    exportAwaitingFilename,
    commandSuggestions,
    availableModels,
    exportFormats,
    agent,
  };
}