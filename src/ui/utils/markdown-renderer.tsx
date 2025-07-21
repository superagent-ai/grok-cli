import React from 'react';
import Markdown from 'ink-markdown';

export function MarkdownRenderer({ content }: { content: string }) {
  return <Markdown>{content}</Markdown>;
}