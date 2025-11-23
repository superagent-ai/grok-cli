import React from 'react';
import { Text } from 'ink';
import { marked } from 'marked';
import TerminalRenderer from 'marked-terminal';

// Configure marked to use the terminal renderer with default settings
marked.setOptions({
  renderer: new (TerminalRenderer as any)()
});

export function MarkdownRenderer({ content }: { content: string }) {
  try {
    // Use marked.parse for synchronous parsing
    const result = marked.parse(content);
    // Handle both sync and async results
    const rendered = typeof result === 'string' ? result : content;
    return <Text>{rendered}</Text>;
  } catch (error) {
    // Fallback to plain text if markdown parsing fails
    console.error('Markdown rendering error:', error);
    return <Text>{content}</Text>;
  }
}