import React from 'react';
import { Text, Box } from 'ink';

export const colorizeCode = (
  content: string,
  _language: string | null,
  _availableTerminalHeight?: number,
  _terminalWidth?: number
): React.ReactNode => {
  // Simple plain text rendering - could be enhanced with syntax highlighting later
  return (
    <Box flexDirection="column">
      {content.split('\n').map((line, index) => (
        <Text key={index} wrap="wrap">
          {line}
        </Text>
      ))}
    </Box>
  );
};