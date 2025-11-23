import React from "react";
import { Box, Text } from "ink";

interface ModelOption {
  model: string;
}

interface ModelSelectionProps {
  models: ModelOption[];
  selectedIndex: number;
  isVisible: boolean;
  currentModel: string;
}

export function ModelSelection({
  models,
  selectedIndex,
  isVisible,
  currentModel,
}: ModelSelectionProps) {
  if (!isVisible) return null;

  return (
    <Box marginTop={1} flexDirection="column">
      <Box marginBottom={1}>
        <Text color="cyan">Select Grok Model (current: {currentModel}):</Text>
      </Box>
      {models.map((modelOption, index) => (
        <Box key={index} paddingLeft={1}>
          <Text
            color={index === selectedIndex ? "black" : "white"}
            backgroundColor={index === selectedIndex ? "cyan" : undefined}
          >
            {modelOption.model}
          </Text>
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