/**
 * Professional diff renderer component
 */

import React from "react";
import { Box, Text } from "ink";
import { Colors } from "../utils/colors.js";
import crypto from "crypto";
import { colorizeCode, getLanguageFromFilename } from "../utils/code-colorizer.js";
import { MaxSizedBox } from "../shared/max-sized-box.js";

interface DiffLine {
  type: "add" | "del" | "context" | "hunk" | "other";
  oldLine?: number;
  newLine?: number;
  content: string;
}

function parseDiffWithLineNumbers(diffContent: string): DiffLine[] {
  const lines = diffContent.split("\n");
  const result: DiffLine[] = [];
  let currentOldLine = 0;
  let currentNewLine = 0;
  let inHunk = false;
  const hunkHeaderRegex = /^@@ -(\d+),?\d* \+(\d+),?\d* @@/;

  for (const line of lines) {
    const hunkMatch = line.match(hunkHeaderRegex);
    if (hunkMatch) {
      currentOldLine = parseInt(hunkMatch[1], 10);
      currentNewLine = parseInt(hunkMatch[2], 10);
      inHunk = true;
      result.push({ type: "hunk", content: line });
      currentOldLine--;
      currentNewLine--;
      continue;
    }
    if (!inHunk) {
      if (
        line.startsWith("--- ") ||
        line.startsWith("+++ ") ||
        line.startsWith("diff --git") ||
        line.startsWith("index ") ||
        line.startsWith("similarity index") ||
        line.startsWith("rename from") ||
        line.startsWith("rename to") ||
        line.startsWith("new file mode") ||
        line.startsWith("deleted file mode")
      )
        continue;
      continue;
    }
    if (line.startsWith("+")) {
      currentNewLine++;
      result.push({
        type: "add",
        newLine: currentNewLine,
        content: line.substring(1),
      });
    } else if (line.startsWith("-")) {
      currentOldLine++;
      result.push({
        type: "del",
        oldLine: currentOldLine,
        content: line.substring(1),
      });
    } else if (line.startsWith(" ")) {
      currentOldLine++;
      currentNewLine++;
      result.push({
        type: "context",
        oldLine: currentOldLine,
        newLine: currentNewLine,
        content: line.substring(1),
      });
    } else if (line.startsWith("\\")) {
      result.push({ type: "other", content: line });
    }
  }
  return result;
}

interface DiffRendererProps {
  diffContent: string;
  filename?: string;
  tabWidth?: number;
  availableTerminalHeight?: number;
  terminalWidth?: number;
}

const DEFAULT_TAB_WIDTH = 4;

export const DiffRenderer = ({
  diffContent,
  filename,
  tabWidth = DEFAULT_TAB_WIDTH,
  availableTerminalHeight,
  terminalWidth = 80,
}: DiffRendererProps): React.ReactElement => {
  if (!diffContent || typeof diffContent !== "string") {
    return <Text color={Colors.AccentYellow}>No diff content.</Text>;
  }

  const lines = diffContent.split("\n");
  const firstLine = lines[0];
  let actualDiffContent = diffContent;

  if (firstLine && (firstLine.startsWith("Updated ") || firstLine.startsWith("Created "))) {
    actualDiffContent = lines.slice(1).join("\n");
  }

  const parsedLines = parseDiffWithLineNumbers(actualDiffContent);

  if (parsedLines.length === 0) {
    return <Text dimColor>No changes detected.</Text>;
  }

  const renderedOutput = renderDiffContent(
    parsedLines,
    filename,
    tabWidth,
    availableTerminalHeight,
    terminalWidth,
  );

  return <>{renderedOutput}</>;
};

const renderDiffContent = (
  parsedLines: DiffLine[],
  filename: string | undefined,
  tabWidth = DEFAULT_TAB_WIDTH,
  availableTerminalHeight: number | undefined,
  terminalWidth: number,
) => {
  const normalizedLines = parsedLines.map((line) => ({
    ...line,
    content: line.content.replace(/\t/g, " ".repeat(tabWidth)),
  }));

  const displayableLines = normalizedLines.filter(
    (l) => l.type !== "hunk" && l.type !== "other",
  );

  if (displayableLines.length === 0) {
    return <Text dimColor>No changes detected.</Text>;
  }

  let baseIndentation = Infinity;
  for (const line of displayableLines) {
    if (line.content.trim() === "") continue;
    const firstCharIndex = line.content.search(/\S/);
    const currentIndent = firstCharIndex === -1 ? 0 : firstCharIndex;
    baseIndentation = Math.min(baseIndentation, currentIndent);
  }
  if (!isFinite(baseIndentation)) {
    baseIndentation = 0;
  }

  const key = filename
    ? `diff-box-${filename}`
    : `diff-box-${crypto.createHash("sha1").update(JSON.stringify(parsedLines)).digest("hex")}`;

  let lastLineNumber: number | null = null;
  const MAX_CONTEXT_LINES_WITHOUT_GAP = 5;

  return (
    <MaxSizedBox
      maxHeight={availableTerminalHeight}
      maxWidth={terminalWidth}
      key={key}
    >
      {displayableLines.reduce<React.ReactNode[]>((acc, line, index) => {
        let relevantLineNumberForGapCalc: number | null = null;
        if (line.type === "add" || line.type === "context") {
          relevantLineNumberForGapCalc = line.newLine ?? null;
        } else if (line.type === "del") {
          relevantLineNumberForGapCalc = line.oldLine ?? null;
        }

        if (
          lastLineNumber !== null &&
          relevantLineNumberForGapCalc !== null &&
          relevantLineNumberForGapCalc >
            lastLineNumber + MAX_CONTEXT_LINES_WITHOUT_GAP + 1
        ) {
          acc.push(
            <Box key={`gap-${index}`}>
              <Text wrap="truncate">{"═".repeat(terminalWidth)}</Text>
            </Box>,
          );
        }

        const lineKey = `diff-line-${index}`;
        let gutterNumStr = "";
        let backgroundColor: string | undefined = undefined;
        let prefixSymbol = " ";
        let dim = false;

        switch (line.type) {
          case "add":
            gutterNumStr = (line.newLine ?? "").toString();
            backgroundColor = "green";
            prefixSymbol = "+";
            lastLineNumber = line.newLine ?? null;
            break;
          case "del":
            gutterNumStr = (line.oldLine ?? "").toString();
            backgroundColor = "red";
            prefixSymbol = "-";
            if (line.oldLine !== undefined) {
              lastLineNumber = line.oldLine;
            }
            break;
          case "context":
            gutterNumStr = (line.newLine ?? "").toString();
            dim = true;
            prefixSymbol = " ";
            lastLineNumber = line.newLine ?? null;
            break;
          default:
            return acc;
        }

        const displayContent = line.content.substring(baseIndentation);
        const language = getLanguageFromFilename(filename);
        const highlightedLine = colorizeCode(displayContent, language);

        acc.push(
          <Box key={lineKey} flexDirection="row">
            <Text color={Colors.Gray} dimColor={dim}>{gutterNumStr.padEnd(4)}</Text>
            <Text color={backgroundColor ? "black" : undefined} backgroundColor={backgroundColor} dimColor={!backgroundColor && dim}>{prefixSymbol} </Text>
            <Box flexGrow={1}>{highlightedLine}</Box>
          </Box>,
        );
        return acc;
      }, [])}
    </MaxSizedBox>
  );
};
