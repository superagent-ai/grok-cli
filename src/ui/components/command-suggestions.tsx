import React from 'react';
import { Box, Text } from 'ink';

interface CommandSuggestion {
  command: string;
  description: string;
}

interface CommandSuggestionsProps {
  suggestions: CommandSuggestion[];
  input: string;
  selectedIndex: number;
  isVisible: boolean;
}

export function CommandSuggestions({
  suggestions,
  input,
  selectedIndex,
  isVisible,
}: CommandSuggestionsProps) {
  if (!isVisible) return null;

  const filteredSuggestions = suggestions
    .filter((suggestion) =>
      input.startsWith('/')
        ? suggestion.command.startsWith('/')
        : suggestion.command.toLowerCase().startsWith(input.toLowerCase())
    )
    .slice(0, 8);

  return (
    <Box marginTop={1} flexDirection="column">
      {filteredSuggestions.map((suggestion, index) => (
        <Box key={index} paddingLeft={1}>
          <Text
            color={index === selectedIndex ? 'black' : 'white'}
            backgroundColor={index === selectedIndex ? 'cyan' : undefined}
          >
            {suggestion.command}
          </Text>
          <Box marginLeft={1}>
            <Text color="gray">{suggestion.description}</Text>
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
