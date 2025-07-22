import React from "react";
import { Box, Text } from "ink";

interface ChatInputProps {
  input: string;
  isProcessing: boolean;
  isStreaming: boolean;
}

export function ChatInput({
  input,
  isProcessing,
  isStreaming,
}: ChatInputProps) {
  return (
    <Box borderStyle="round" borderColor="gray" paddingX={1} marginTop={1}>
      <Text color="gray">❯ </Text>
      <Text>
        {input}
        {!isProcessing && !isStreaming && <Text color="white">█</Text>}
      </Text>
    </Box>
  );
}
