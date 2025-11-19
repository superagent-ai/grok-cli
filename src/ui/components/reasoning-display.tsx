import React from "react";
import { Box, Text } from "ink";

export interface ReasoningDisplayProps {
  /**
   * Reasoning content from GLM-4.6 thinking mode
   */
  content: string;
  /**
   * Whether to show the reasoning content
   * @default true
   */
  visible?: boolean;
  /**
   * Whether this is a streaming update
   * @default false
   */
  isStreaming?: boolean;
}

/**
 * ReasoningDisplay Component
 *
 * Displays GLM-4.6 reasoning content (thinking mode) with visual
 * separation from the final answer.
 *
 * Features:
 * - Collapsible/expandable reasoning section
 * - Visual distinction with dimmed styling
 * - Streaming support with indicator
 * - Clear separation from final answer
 *
 * @example
 * ```tsx
 * <ReasoningDisplay
 *   content="Let me break down this problem step by step..."
 *   visible={showReasoning}
 *   isStreaming={true}
 * />
 * ```
 */
export function ReasoningDisplay({
  content,
  visible = true,
  isStreaming = false,
}: ReasoningDisplayProps) {
  // Don't render if not visible or no content
  if (!visible || !content || content.trim().length === 0) {
    return null;
  }

  return (
    <Box flexDirection="column" marginBottom={1} paddingLeft={2} borderStyle="single" borderColor="gray">
      <Box flexDirection="row" marginBottom={0}>
        <Text color="cyan" dimColor>
          💭 Thinking{isStreaming ? "..." : ""}
        </Text>
      </Box>
      <Box flexDirection="column" paddingLeft={1}>
        <Text color="white" dimColor italic>
          {content}
        </Text>
      </Box>
    </Box>
  );
}

/**
 * CollapsibleReasoningDisplay Component
 *
 * Advanced version with collapse/expand functionality.
 * Allows users to toggle visibility of reasoning content.
 *
 * @example
 * ```tsx
 * <CollapsibleReasoningDisplay
 *   content="Step 1: Analyze the input..."
 *   defaultCollapsed={false}
 * />
 * ```
 */
export interface CollapsibleReasoningDisplayProps {
  content: string;
  /**
   * Whether the reasoning is collapsed by default
   * @default false
   */
  defaultCollapsed?: boolean;
  /**
   * Whether this is a streaming update
   * @default false
   */
  isStreaming?: boolean;
}

export function CollapsibleReasoningDisplay({
  content,
  defaultCollapsed = false,
  isStreaming = false,
}: CollapsibleReasoningDisplayProps) {
  const [isCollapsed] = React.useState(defaultCollapsed);
  // const setIsCollapsed = ...; // TODO: Implement toggle functionality with user input

  if (!content || content.trim().length === 0) {
    return null;
  }

  // Extract first line as preview
  const lines = content.split("\n");
  const preview = lines[0]?.slice(0, 80) || "";
  const hasMore = content.length > 80 || lines.length > 1;

  return (
    <Box flexDirection="column" marginBottom={1} paddingLeft={2} borderStyle="single" borderColor="gray">
      <Box flexDirection="row" marginBottom={0}>
        <Text color="cyan" dimColor>
          {isCollapsed ? "▸" : "▾"} 💭 Thinking{isStreaming ? "..." : ""}
          {hasMore && isCollapsed && (
            <Text dimColor> (click to expand)</Text>
          )}
        </Text>
      </Box>
      <Box flexDirection="column" paddingLeft={1}>
        {isCollapsed ? (
          <Text color="white" dimColor italic>
            {preview}{hasMore && "..."}
          </Text>
        ) : (
          <Text color="white" dimColor italic>
            {content}
          </Text>
        )}
      </Box>
    </Box>
  );
}

/**
 * ReasoningSection Component
 *
 * Wrapper for multiple reasoning steps or sections.
 * Useful for displaying step-by-step thought processes.
 *
 * @example
 * ```tsx
 * <ReasoningSection
 *   steps={[
 *     "Step 1: Understanding the problem...",
 *     "Step 2: Analyzing the code...",
 *     "Step 3: Proposing a solution..."
 *   ]}
 * />
 * ```
 */
export interface ReasoningSectionProps {
  /**
   * Array of reasoning steps
   */
  steps: string[];
  /**
   * Whether to show step numbers
   * @default true
   */
  showStepNumbers?: boolean;
  /**
   * Whether this is actively streaming
   * @default false
   */
  isStreaming?: boolean;
}

export function ReasoningSection({
  steps,
  showStepNumbers = true,
  isStreaming = false,
}: ReasoningSectionProps) {
  if (!steps || steps.length === 0) {
    return null;
  }

  return (
    <Box flexDirection="column" marginBottom={1} paddingLeft={2} borderStyle="single" borderColor="gray">
      <Box flexDirection="row" marginBottom={0}>
        <Text color="cyan" dimColor>
          💭 Thinking Process{isStreaming ? "..." : ""}
        </Text>
      </Box>
      <Box flexDirection="column" paddingLeft={1}>
        {steps.map((step, index) => (
          <Box key={index} flexDirection="row" marginY={0}>
            {showStepNumbers && (
              <Text color="cyan" dimColor>
                {index + 1}.{" "}
              </Text>
            )}
            <Text color="white" dimColor italic>
              {step}
            </Text>
          </Box>
        ))}
      </Box>
    </Box>
  );
}

/**
 * Utility function to parse reasoning content into steps
 * Detects common step patterns like "Step 1:", "1.", etc.
 *
 * @param content - Raw reasoning content
 * @returns Array of reasoning steps
 */
export function parseReasoningSteps(content: string): string[] {
  if (!content) return [];

  // Try to detect step patterns
  const stepPatterns = [
    /^Step \d+:/im,
    /^\d+\./m,
    /^-\s/m,
    /^\*\s/m,
  ];

  for (const pattern of stepPatterns) {
    if (pattern.test(content)) {
      // Split by the pattern
      const steps = content
        .split(/(?=^Step \d+:|^\d+\.|^-\s|^\*\s)/m)
        .filter(s => s.trim().length > 0)
        .map(s => s.trim());

      if (steps.length > 1) {
        return steps;
      }
    }
  }

  // If no patterns found, split by paragraphs
  const paragraphs = content
    .split("\n\n")
    .filter(p => p.trim().length > 0)
    .map(p => p.trim());

  return paragraphs.length > 1 ? paragraphs : [content];
}
