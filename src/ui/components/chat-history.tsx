import React from "react";
import { Box, Text } from "ink";
import { ChatEntry } from "../../agent/grok-agent.js";
import { DiffRenderer } from "./diff-renderer.js";
import { MarkdownRenderer } from "../utils/markdown-renderer.js";
import { colorizeCode, getLanguageFromFilename } from "../utils/code-colorizer.js";

interface ChatHistoryProps {
  entries: ChatEntry[];
  isConfirmationActive?: boolean;
}

const MemoizedChatEntry = React.memo(
  ({ entry, index }: { entry: ChatEntry; index: number }) => {
    const renderDiff = (diffContent: string, filename?: string) => {
      return (
        <DiffRenderer
          diffContent={diffContent}
          filename={filename}
          terminalWidth={80}
        />
      );
    };

    const renderFileContent = (content: string, filename?: string) => {
      const lines = content.split("\n");

      let baseIndentation = Infinity;
      for (const line of lines) {
        if (line.trim() === "") continue;
        const firstCharIndex = line.search(/\S/);
        const currentIndent = firstCharIndex === -1 ? 0 : firstCharIndex;
        baseIndentation = Math.min(baseIndentation, currentIndent);
      }
      if (!isFinite(baseIndentation)) {
        baseIndentation = 0;
      }

      const normalizedContent = lines
        .map((line) => line.substring(baseIndentation))
        .join("\n");
      const language = getLanguageFromFilename(filename);
      return colorizeCode(normalizedContent, language);
    };

    switch (entry.type) {
      case "user":
        return (
          <Box key={index} flexDirection="column" marginTop={1}>
            <Box>
              <Text color="gray">
                {">"} {entry.content}
              </Text>
            </Box>
          </Box>
        );

      case "assistant":
        return (
          <Box key={index} flexDirection="column" marginTop={1}>
            <Box flexDirection="row" alignItems="flex-start">
              <Text color="white">⏺ </Text>
              <Box flexDirection="column" flexGrow={1}>
                {entry.toolCalls ? (
                  <Text color="white">{entry.content.trim()}</Text>
                ) : (
                  <MarkdownRenderer content={entry.content.trim()} />
                )}
                {entry.isStreaming && <Text color="cyan">█</Text>}
              </Box>
            </Box>
          </Box>
        );

      case "tool_call":
      case "tool_result":
        const getToolActionName = (toolName: string) => {
          if (toolName.startsWith("mcp__")) {
            const parts = toolName.split("__");
            if (parts.length >= 3) {
              const serverName = parts[1];
              const actualToolName = parts.slice(2).join("__");
              return `${serverName.charAt(0).toUpperCase() + serverName.slice(1)}(${actualToolName.replace(/_/g, " ")})`;
            }
          }

          switch (toolName) {
            case "view_file":
              return "Read";
            case "str_replace_editor":
              return "Update";
            case "create_file":
              return "Create";
            case "bash":
              return "Bash";
            case "search":
              return "Search";
            case "create_todo_list":
              return "Created Todo";
            case "update_todo_list":
              return "Updated Todo";
            default:
              return "Tool";
          }
        };

        const toolName = entry.toolCall?.function?.name || "unknown";
        const actionName = getToolActionName(toolName);

        const getFilePath = (toolCall: any) => {
          if (toolCall?.function?.arguments) {
            try {
              const args = JSON.parse(toolCall.function.arguments);
              if (toolCall.function.name === "search") {
                return args.query;
              }
              return args.path || args.file_path || args.command || "";
            } catch {
              return "";
            }
          }
          return "";
        };

        const filePath = getFilePath(entry.toolCall);
        const isExecuting = entry.type === "tool_call" || !entry.toolResult;

        const formatToolContent = (content: string, toolName: string) => {
          if (toolName.startsWith("mcp__")) {
            try {
              const parsed = JSON.parse(content);
              if (Array.isArray(parsed)) {
                return `Found ${parsed.length} items`;
              } else if (typeof parsed === "object") {
                return JSON.stringify(parsed, null, 2);
              }
            } catch {
              return content;
            }
          }
          return content;
        };
        const shouldShowDiff =
          entry.toolCall?.function?.name === "str_replace_editor" &&
          entry.toolResult?.success &&
          entry.content.includes("Updated") &&
          entry.content.includes("---") &&
          entry.content.includes("+++");

        const shouldShowFileContent =
          (entry.toolCall?.function?.name === "view_file" ||
            entry.toolCall?.function?.name === "create_file") &&
          entry.toolResult?.success &&
          !shouldShowDiff;

        return (
          <Box key={index} flexDirection="column" marginTop={1}>
            <Box>
              <Text color="magenta">⏺</Text>
              <Text color="white">
                {" "}
                {filePath ? `${actionName}(${filePath})` : actionName}
              </Text>
            </Box>
            <Box marginLeft={2} flexDirection="column">
              {isExecuting ? (
                <Text color="cyan">⎿ Executing...</Text>
              ) : shouldShowFileContent ? (
                <Box flexDirection="column">
                  <Text color="gray">⎿ File contents:</Text>
                  <Box marginLeft={2} flexDirection="column">
                    {renderFileContent(entry.content, filePath)}
                  </Box>
                </Box>
              ) : shouldShowDiff ? (
                <Text color="gray">⎿ {entry.content.split("\n")[0]}</Text>
              ) : (
                <Text color="gray">⎿ {formatToolContent(entry.content, toolName)}</Text>
              )}
            </Box>
            {shouldShowDiff && !isExecuting && (
              <Box marginLeft={4} flexDirection="column">
                {renderDiff(entry.content, filePath)}
              </Box>
            )}
          </Box>
        );

      default:
        return null;
    }
  }
);

MemoizedChatEntry.displayName = "MemoizedChatEntry";

export function ChatHistory({
  entries,
  isConfirmationActive = false,
}: ChatHistoryProps) {
  const filteredEntries = isConfirmationActive
    ? entries.filter(
        (entry) =>
          !(entry.type === "tool_call" && entry.content === "Executing...")
      )
    : entries;

  return (
    <Box flexDirection="column">
      {filteredEntries.slice(-20).map((entry, index) => (
        <MemoizedChatEntry
          key={`${entry.timestamp.getTime()}-${index}`}
          entry={entry}
          index={index}
        />
      ))}
    </Box>
  );
}
