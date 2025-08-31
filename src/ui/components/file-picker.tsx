import React from "react";
import { Box, Text } from "ink";
import path from "path";
import { FileSuggestion } from "../../utils/file-finder";

interface FilePickerProps {
  suggestions: FileSuggestion[];
  selectedIndex: number;
  query: string;
  isVisible: boolean;
}

export function FilePicker({
  suggestions,
  selectedIndex,
  query,
  isVisible,
}: FilePickerProps) {
  if (!isVisible || suggestions.length === 0) {
    return null;
  }

  const maxVisible = 8;
  const startIndex = Math.max(0, selectedIndex - Math.floor(maxVisible / 2));
  const endIndex = Math.min(suggestions.length, startIndex + maxVisible);
  const adjustedStartIndex = Math.max(0, endIndex - maxVisible);
  
  const visibleSuggestions = suggestions.slice(adjustedStartIndex, endIndex);
  const adjustedSelectedIndex = selectedIndex - adjustedStartIndex;

  return (
    <Box
      borderStyle="round"
      borderColor="blue"
      flexDirection="column"
      paddingX={1}
      marginTop={1}
      marginBottom={1}
    >
      <Box marginBottom={1}>
        <Text color="cyan" bold>
          File Selection {query && `(${query})`}
        </Text>
        {suggestions.length > maxVisible && (
          <Text color="gray" dimColor>
            {selectedIndex + 1}/{suggestions.length} files
          </Text>
        )}
      </Box>
      
      {adjustedStartIndex > 0 && (
        <Box>
          <Text color="gray" dimColor>
            ↑ {adjustedStartIndex} more above
          </Text>
        </Box>
      )}
      
      {visibleSuggestions.map((suggestion, index) => {
        const isSelected = index === adjustedSelectedIndex;
        const displayPath = suggestion.isDirectory ? `${suggestion.relativePath}/` : suggestion.relativePath;
        
        return (
          <Box key={suggestion.relativePath}>
            <Text
              color={isSelected ? "black" : "white"}
              backgroundColor={isSelected ? "blue" : undefined}
              bold={isSelected}
            >
              {isSelected ? "❯ " : "  "}
              {displayPath}
            </Text>
          </Box>
        );
      })}
      
      {endIndex < suggestions.length && (
        <Box>
          <Text color="gray" dimColor>
            ↓ {suggestions.length - endIndex} more below
          </Text>
        </Box>
      )}
      
      <Box marginTop={1}>
        <Text color="gray" dimColor>
          ↑/↓ Navigate • Tab/Enter Select • Esc Cancel
        </Text>
      </Box>
    </Box>
  );
}