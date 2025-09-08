import React from 'react';
import { Text } from 'ink';

export function MarkdownRenderer({ content }: { content: string }) {
  // Note: ink-markdown is not compatible with ink v5
  // For now, rendering as plain text. Consider using a compatible markdown solution later.
  return <Text>{content}</Text>;
}