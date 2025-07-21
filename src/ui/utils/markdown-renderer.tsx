import React from 'react';
import { Text, Box } from 'ink';

export function MarkdownRenderer({ content }: { content: string }) {
  // Simple text renderer to avoid ink-markdown compatibility issues
  const lines = content.split('\n');
  
  return (
    <Box flexDirection="column">
      {lines.map((line, index) => (
        <Text key={index} color="white">
          {line}
        </Text>
      ))}
    </Box>
  );
}