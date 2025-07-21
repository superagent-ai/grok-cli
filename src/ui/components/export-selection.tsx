import React from "react";
import { Box, Text } from "ink";

interface ExportFormat {
  format: string;
  description: string;
}

interface ExportSelectionProps {
  formats: ExportFormat[];
  selectedIndex: number;
  isVisible: boolean;
}

export function ExportSelection({
  formats,
  selectedIndex,
  isVisible,
}: ExportSelectionProps) {
  if (!isVisible) return null;

  return (
    <Box marginTop={1} flexDirection="column">
      <Text color="yellow" bold>
        📤 Export Conversation
      </Text>
      <Box marginBottom={1}>
        <Text color="gray">Choose format:</Text>
      </Box>
      
      {formats.map((format, index) => (
        <Box key={index} paddingLeft={1}>
          <Text
            color={index === selectedIndex ? "white" : "cyan"}
            backgroundColor={index === selectedIndex ? "blue" : undefined}
            bold={index === selectedIndex}
          >
            {index === selectedIndex ? `❯ ${format.format}` : `  ${format.format}`}
          </Text>
          <Box marginLeft={1}>
            <Text color={index === selectedIndex ? "white" : "gray"} dimColor={index !== selectedIndex}>
              {format.description}
            </Text>
          </Box>
        </Box>
      ))}
      
      <Box marginTop={1}>
        <Text color="gray" dimColor>
          ↑↓ navigate • Enter/Tab select • Esc cancel
        </Text>
      </Box>
    </Box>
  );
}