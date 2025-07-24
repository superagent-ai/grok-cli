import { useState, useRef } from "react";
import { useInput, useApp } from "ink";
import { GrokAgent, ChatEntry } from "../agent/grok-agent";
import { ConfirmationService } from "../utils/confirmation-service";
import { updateSetting } from "../utils/settings";

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
    { command: "/commit-and-push", description: "AI commit & push to remote" },
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
        content: `Grok CLI Help:

Built-in Commands:
  /clear      - Clear chat history
  /help       - Show this help
  /models     - Switch Grok models
  /exit       - Exit application
  exit, quit  - Exit application
  
Git Commands:
  /commit-and-push - AI-generated commit + push to remote
  
Keyboard Shortcuts:
  Shift+Tab   - Toggle auto-edit mode (bypass confirmations)

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
        updateSetting('selectedModel', modelArg);
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

    if (trimmedInput === "/commit-and-push") {
      const userEntry: ChatEntry = {
        type: "user",
        content: "/commit-and-push",
        timestamp: new Date(),
      };
      setChatHistory((prev) => [...prev, userEntry]);

      setIsProcessing(true);
      setIsStreaming(true);

      try {
        // First check if there are any changes at all
        const initialStatusResult = await agent.executeBashCommand("git status --porcelain");
        
        if (!initialStatusResult.success || !initialStatusResult.output?.trim()) {
          const noChangesEntry: ChatEntry = {
            type: "assistant",
            content: "No changes to commit. Working directory is clean.",
            timestamp: new Date(),
          };
          setChatHistory((prev) => [...prev, noChangesEntry]);
          setIsProcessing(false);
          setIsStreaming(false);
          setInput("");
          return true;
        }

        // Add all changes
        const addResult = await agent.executeBashCommand("git add .");
        
        if (!addResult.success) {
          const addErrorEntry: ChatEntry = {
            type: "assistant",
            content: `Failed to stage changes: ${addResult.error || 'Unknown error'}`,
            timestamp: new Date(),
          };
          setChatHistory((prev) => [...prev, addErrorEntry]);
          setIsProcessing(false);
          setIsStreaming(false);
          setInput("");
          return true;
        }

        // Show that changes were staged
        const addEntry: ChatEntry = {
          type: "tool_result",
          content: "Changes staged successfully",
          timestamp: new Date(),
          toolCall: {
            id: `git_add_${Date.now()}`,
            type: "function",
            function: {
              name: "bash",
              arguments: JSON.stringify({ command: "git add ." }),
            },
          },
          toolResult: addResult,
        };
        setChatHistory((prev) => [...prev, addEntry]);

        // Get staged changes for commit message generation
        const diffResult = await agent.executeBashCommand("git diff --cached");

        // Generate commit message using AI
        const commitPrompt = `Generate a concise, professional git commit message for these changes:

Git Status:
${initialStatusResult.output}

Git Diff (staged changes):
${diffResult.output || "No staged changes shown"}

Follow conventional commit format (feat:, fix:, docs:, etc.) and keep it under 72 characters.
Respond with ONLY the commit message, no additional text.`;

        let commitMessage = "";
        let streamingEntry: ChatEntry | null = null;

        for await (const chunk of agent.processUserMessageStream(commitPrompt)) {
          if (chunk.type === "content" && chunk.content) {
            if (!streamingEntry) {
              const newEntry = {
                type: "assistant" as const,
                content: `Generating commit message...\n\n${chunk.content}`,
                timestamp: new Date(),
                isStreaming: true,
              };
              setChatHistory((prev) => [...prev, newEntry]);
              streamingEntry = newEntry;
              commitMessage = chunk.content;
            } else {
              commitMessage += chunk.content;
              setChatHistory((prev) =>
                prev.map((entry, idx) =>
                  idx === prev.length - 1 && entry.isStreaming
                    ? { ...entry, content: `Generating commit message...\n\n${commitMessage}` }
                    : entry
                )
              );
            }
          } else if (chunk.type === "done") {
            if (streamingEntry) {
              setChatHistory((prev) =>
                prev.map((entry) =>
                  entry.isStreaming 
                    ? { ...entry, content: `Generated commit message: "${commitMessage.trim()}"`, isStreaming: false }
                    : entry
                )
              );
            }
            break;
          }
        }

        // Execute the commit
        const cleanCommitMessage = commitMessage.trim().replace(/^["']|["']$/g, '');
        const commitCommand = `git commit -m "${cleanCommitMessage}"`;
        const commitResult = await agent.executeBashCommand(commitCommand);

        const commitEntry: ChatEntry = {
          type: "tool_result",
          content: commitResult.success
            ? commitResult.output || "Commit successful"
            : commitResult.error || "Commit failed",
          timestamp: new Date(),
          toolCall: {
            id: `git_commit_${Date.now()}`,
            type: "function",
            function: {
              name: "bash",
              arguments: JSON.stringify({ command: commitCommand }),
            },
          },
          toolResult: commitResult,
        };
        setChatHistory((prev) => [...prev, commitEntry]);

        // If commit was successful, push to remote
        if (commitResult.success) {
          // First try regular push, if it fails try with upstream setup
          let pushResult = await agent.executeBashCommand("git push");
          let pushCommand = "git push";
          
          if (!pushResult.success && pushResult.error?.includes("no upstream branch")) {
            pushCommand = "git push -u origin HEAD";
            pushResult = await agent.executeBashCommand(pushCommand);
          }

          const pushEntry: ChatEntry = {
            type: "tool_result",
            content: pushResult.success
              ? pushResult.output || "Push successful"
              : pushResult.error || "Push failed",
            timestamp: new Date(),
            toolCall: {
              id: `git_push_${Date.now()}`,
              type: "function",
              function: {
                name: "bash",
                arguments: JSON.stringify({ command: pushCommand }),
              },
            },
            toolResult: pushResult,
          };
          setChatHistory((prev) => [...prev, pushEntry]);
        }

      } catch (error: any) {
        const errorEntry: ChatEntry = {
          type: "assistant",
          content: `Error during commit and push: ${error.message}`,
          timestamp: new Date(),
        };
        setChatHistory((prev) => [...prev, errorEntry]);
      }

      setIsProcessing(false);
      setIsStreaming(false);
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
        updateSetting('selectedModel', selectedModel.model);
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
