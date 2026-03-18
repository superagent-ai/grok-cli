import React from "react";
import type { Theme } from "./theme.js";

/* ── Block types ─────────────────────────────────────────────── */

type Block =
  | { kind: "paragraph"; text: string }
  | { kind: "heading"; level: number; text: string }
  | { kind: "code"; lang: string; code: string }
  | { kind: "list"; ordered: boolean; items: string[] }
  | { kind: "hr" }
  | { kind: "blockquote"; text: string };

/* ── Block parser ────────────────────────────────────────────── */

function parseBlocks(src: string): Block[] {
  const lines = src.split("\n");
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Fenced code block
    const fenceMatch = line.match(/^(`{3,}|~{3,})(\S*)/);
    if (fenceMatch) {
      const fence = fenceMatch[1];
      const lang = fenceMatch[2] || "";
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith(fence)) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // skip closing fence
      blocks.push({ kind: "code", lang, code: codeLines.join("\n") });
      continue;
    }

    // Heading
    const headingMatch = line.match(/^(#{1,6})\s+(.+)/);
    if (headingMatch) {
      blocks.push({ kind: "heading", level: headingMatch[1].length, text: headingMatch[2] });
      i++;
      continue;
    }

    // Horizontal rule
    if (/^(\s*[-*_]\s*){3,}$/.test(line)) {
      blocks.push({ kind: "hr" });
      i++;
      continue;
    }

    // Unordered list
    if (/^\s*[-*+]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*+]\s+/, ""));
        i++;
      }
      blocks.push({ kind: "list", ordered: false, items });
      continue;
    }

    // Ordered list
    if (/^\s*\d+[.)]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+[.)]\s+/, ""));
        i++;
      }
      blocks.push({ kind: "list", ordered: true, items });
      continue;
    }

    // Blockquote
    if (line.startsWith("> ")) {
      const bqLines: string[] = [];
      while (i < lines.length && lines[i].startsWith("> ")) {
        bqLines.push(lines[i].slice(2));
        i++;
      }
      blocks.push({ kind: "blockquote", text: bqLines.join("\n") });
      continue;
    }

    // Empty line — skip
    if (line.trim() === "") {
      i++;
      continue;
    }

    // Paragraph — collect until empty line or block start
    const paraLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !lines[i].match(/^(`{3,}|~{3,})/) &&
      !lines[i].match(/^#{1,6}\s+/) &&
      !lines[i].match(/^(\s*[-*_]\s*){3,}$/) &&
      !lines[i].match(/^\s*[-*+]\s+/) &&
      !lines[i].match(/^\s*\d+[.)]\s+/) &&
      !lines[i].startsWith("> ")
    ) {
      paraLines.push(lines[i]);
      i++;
    }
    if (paraLines.length > 0) {
      blocks.push({ kind: "paragraph", text: paraLines.join("\n") });
    }
  }

  return blocks;
}

/* ── Inline parser ───────────────────────────────────────────── */

type InlineNode =
  | { kind: "text"; text: string }
  | { kind: "bold"; text: string }
  | { kind: "italic"; text: string }
  | { kind: "bolditalic"; text: string }
  | { kind: "code"; text: string }
  | { kind: "link"; text: string; url: string };

function parseInline(src: string): InlineNode[] {
  const nodes: InlineNode[] = [];
  // Order matters: bold-italic before bold before italic
  const pattern =
    /(`[^`]+`)|(\*\*\*[^*]+\*\*\*|___[^_]+___)|(  \*\*[^*]+\*\*|__[^_]+__)|(\*[^*]+\*|_[^_]+_)|(\[[^\]]+\]\([^)]+\))/g;

  let last = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(src)) !== null) {
    if (match.index > last) {
      nodes.push({ kind: "text", text: src.slice(last, match.index) });
    }
    const m = match[0];

    if (match[1]) {
      // inline code
      nodes.push({ kind: "code", text: m.slice(1, -1) });
    } else if (match[2]) {
      // bold italic
      nodes.push({ kind: "bolditalic", text: m.slice(3, -3) });
    } else if (match[3]) {
      // bold
      nodes.push({ kind: "bold", text: m.slice(2, -2) });
    } else if (match[4]) {
      // italic
      nodes.push({ kind: "italic", text: m.slice(1, -1) });
    } else if (match[5]) {
      // link
      const linkMatch = m.match(/\[([^\]]+)\]\(([^)]+)\)/);
      if (linkMatch) {
        nodes.push({ kind: "link", text: linkMatch[1], url: linkMatch[2] });
      }
    }

    last = match.index + m.length;
  }

  if (last < src.length) {
    nodes.push({ kind: "text", text: src.slice(last) });
  }

  return nodes;
}

/* ── Inline renderer ─────────────────────────────────────────── */

function InlineContent({ text, t }: { text: string; t: Theme }) {
  const nodes = parseInline(text);
  return (
    <text>
      {nodes.map((node, i) => {
        switch (node.kind) {
          case "text":
            return <span key={i} style={{ fg: t.text }}>{node.text}</span>;
          case "bold":
            return <b key={i}><span style={{ fg: t.mdBold }}>{node.text}</span></b>;
          case "italic":
            return <i key={i}><span style={{ fg: t.mdItalic }}>{node.text}</span></i>;
          case "bolditalic":
            return <b key={i}><i><span style={{ fg: t.mdBold }}>{node.text}</span></i></b>;
          case "code":
            return <span key={i} style={{ fg: t.mdCode }}>{`\`${node.text}\``}</span>;
          case "link":
            return (
              <span key={i}>
                <span style={{ fg: t.mdLinkText }}>{node.text}</span>
                <span style={{ fg: t.textDim }}>{" ("}</span>
                <u><span style={{ fg: t.mdLink }}>{node.url}</span></u>
                <span style={{ fg: t.textDim }}>{")"}</span>
              </span>
            );
        }
      })}
    </text>
  );
}

/* ── Block renderer ──────────────────────────────────────────── */

function renderBlock(block: Block, key: number, t: Theme): React.ReactNode {
  switch (block.kind) {
    case "heading":
      return (
        <box key={key} marginTop={key > 0 ? 1 : 0}>
          <text>
            <b><span style={{ fg: t.mdHeading }}>{block.text}</span></b>
          </text>
        </box>
      );

    case "paragraph":
      return (
        <box key={key}>
          <InlineContent text={block.text} t={t} />
        </box>
      );

    case "code":
      return (
        <box key={key} marginTop={0} marginBottom={0} backgroundColor={t.mdCodeBlockBg} paddingLeft={1} paddingRight={1}>
          <text fg={t.mdCodeBlockFg}>{block.code}</text>
        </box>
      );

    case "list":
      return (
        <box key={key} flexDirection="column">
          {block.items.map((item, i) => (
            <box key={i} flexDirection="row">
              <text>
                <span style={{ fg: t.mdListBullet }}>
                  {block.ordered ? `${i + 1}. ` : "  • "}
                </span>
              </text>
              <InlineContent text={item} t={t} />
            </box>
          ))}
        </box>
      );

    case "blockquote":
      return (
        <box key={key} paddingLeft={1} borderColor={t.mdItalic} border={["left"]}>
          <text>
            <i><span style={{ fg: t.mdItalic }}>{block.text}</span></i>
          </text>
        </box>
      );

    case "hr":
      return (
        <box key={key} marginTop={0} marginBottom={0}>
          <text fg={t.mdHr}>{"─".repeat(40)}</text>
        </box>
      );
  }
}

/* ── Public component ────────────────────────────────────────── */

export function Markdown({ content, t }: { content: string; t: Theme }) {
  const blocks = parseBlocks(content);
  return (
    <box flexDirection="column">
      {blocks.map((block, i) => renderBlock(block, i, t))}
    </box>
  );
}
