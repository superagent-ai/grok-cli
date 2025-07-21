import React from "react";
import { Box, Text } from "ink";

interface ChatInputProps {
  input: string;
  isProcessing: boolean;
  isStreaming: boolean;
  placeholder?: string;
}

export function ChatInput({ input, isProcessing, isStreaming, placeholder }: ChatInputProps) {
  const showCursor = !isProcessing && !isStreaming;
  const displayText = input || (placeholder && !input ? "" : "");
  
  return (
    <Box borderStyle="round" borderColor="gray" paddingX={1} marginTop={1}>
      <Text color="gray">❯ </Text>
      <Text>
        {displayText}
        {showCursor && <Text color="white">█</Text>}
        {placeholder && !input && (
          <Text color="gray" dimColor> {placeholder}</Text>
        )}
      </Text>
    </Box>
  );
}