import * as fs from "fs-extra";
import * as path from "path";
import axios from "axios";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export interface MentionContext {
  type: "file" | "url" | "image" | "git" | "symbol" | "search";
  original: string;
  resolved: string;
  content?: string;
  error?: string;
}

export interface ExpandedInput {
  text: string;
  contexts: MentionContext[];
}

export class ContextMentionParser {
  private patterns = {
    file: /@file:([^\s]+)/g,
    url: /@url:([^\s]+)/g,
    image: /@image:([^\s]+)/g,
    git: /@git:(\w+)/g,
    symbol: /@symbol:([^\s]+)/g,
    search: /@search:["']([^"']+)["']/g,
  };

  private maxFileSize = 100 * 1024;  // 100KB max for included files
  private maxUrlSize = 50 * 1024;    // 50KB max for URL content

  async expandMentions(input: string): Promise<ExpandedInput> {
    const contexts: MentionContext[] = [];
    let expandedText = input;

    // Process each mention type
    for (const [type, pattern] of Object.entries(this.patterns)) {
      // Reset regex
      pattern.lastIndex = 0;

      let match;
      while ((match = pattern.exec(input)) !== null) {
        const original = match[0];
        const value = match[1];

        try {
          const context = await this.resolveMention(
            type as MentionContext["type"],
            value,
            original
          );
          contexts.push(context);

          // Replace mention with a reference placeholder
          if (context.content) {
            const placeholder = `[${type.toUpperCase()}: ${value}]`;
            expandedText = expandedText.replace(original, placeholder);
          }
        } catch (error: any) {
          contexts.push({
            type: type as MentionContext["type"],
            original,
            resolved: value,
            error: error.message,
          });
        }
      }
    }

    return { text: expandedText, contexts };
  }

  private async resolveMention(
    type: MentionContext["type"],
    value: string,
    original: string
  ): Promise<MentionContext> {
    switch (type) {
      case "file":
        return this.resolveFile(value, original);
      case "url":
        return this.resolveUrl(value, original);
      case "image":
        return this.resolveImage(value, original);
      case "git":
        return this.resolveGit(value, original);
      case "symbol":
        return this.resolveSymbol(value, original);
      case "search":
        return this.resolveSearch(value, original);
      default:
        throw new Error(`Unknown mention type: ${type}`);
    }
  }

  private async resolveFile(filePath: string, original: string): Promise<MentionContext> {
    const resolvedPath = path.resolve(filePath);

    if (!(await fs.pathExists(resolvedPath))) {
      throw new Error(`File not found: ${filePath}`);
    }

    const stats = await fs.stat(resolvedPath);

    if (stats.isDirectory()) {
      const files = await fs.readdir(resolvedPath);
      return {
        type: "file",
        original,
        resolved: resolvedPath,
        content: `Directory ${filePath}:\n${files.join("\n")}`,
      };
    }

    if (stats.size > this.maxFileSize) {
      throw new Error(`File too large: ${filePath} (${Math.round(stats.size / 1024)}KB > ${Math.round(this.maxFileSize / 1024)}KB)`);
    }

    const content = await fs.readFile(resolvedPath, "utf-8");
    return {
      type: "file",
      original,
      resolved: resolvedPath,
      content: `File ${filePath}:\n\`\`\`\n${content}\n\`\`\``,
    };
  }

  private async resolveUrl(url: string, original: string): Promise<MentionContext> {
    // Ensure URL has protocol
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      url = "https://" + url;
    }

    try {
      const response = await axios.get(url, {
        timeout: 10000,
        maxContentLength: this.maxUrlSize,
        headers: {
          "User-Agent": "Grok-CLI/1.0",
        },
      });

      let content = response.data;

      // Try to extract text from HTML
      if (typeof content === "string" && content.includes("<html")) {
        content = this.extractTextFromHtml(content);
      }

      // Truncate if too long
      if (typeof content === "string" && content.length > this.maxUrlSize) {
        content = content.slice(0, this.maxUrlSize) + "\n... (truncated)";
      }

      return {
        type: "url",
        original,
        resolved: url,
        content: `URL ${url}:\n${content}`,
      };
    } catch (error: any) {
      throw new Error(`Failed to fetch URL: ${error.message}`);
    }
  }

  private extractTextFromHtml(html: string): string {
    // Simple HTML text extraction
    return html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  private async resolveImage(imagePath: string, original: string): Promise<MentionContext> {
    const resolvedPath = path.resolve(imagePath);

    if (!(await fs.pathExists(resolvedPath))) {
      throw new Error(`Image not found: ${imagePath}`);
    }

    // Read image and convert to base64
    const imageBuffer = await fs.readFile(resolvedPath);
    const base64 = imageBuffer.toString("base64");
    const ext = path.extname(imagePath).toLowerCase().slice(1);
    const mimeType = this.getMimeType(ext);

    return {
      type: "image",
      original,
      resolved: resolvedPath,
      content: `data:${mimeType};base64,${base64}`,
    };
  }

  private getMimeType(ext: string): string {
    const mimeTypes: Record<string, string> = {
      png: "image/png",
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      gif: "image/gif",
      webp: "image/webp",
      svg: "image/svg+xml",
    };
    return mimeTypes[ext] || "application/octet-stream";
  }

  private async resolveGit(command: string, original: string): Promise<MentionContext> {
    const gitCommands: Record<string, string> = {
      status: "git status",
      diff: "git diff",
      "diff-staged": "git diff --cached",
      log: "git log --oneline -10",
      branch: "git branch -a",
      remote: "git remote -v",
      stash: "git stash list",
    };

    const gitCmd = gitCommands[command];
    if (!gitCmd) {
      throw new Error(`Unknown git command: ${command}. Available: ${Object.keys(gitCommands).join(", ")}`);
    }

    try {
      const { stdout, stderr } = await execAsync(gitCmd);
      return {
        type: "git",
        original,
        resolved: command,
        content: `Git ${command}:\n\`\`\`\n${stdout || stderr || "(empty)"}\n\`\`\``,
      };
    } catch (error: any) {
      throw new Error(`Git command failed: ${error.message}`);
    }
  }

  private async resolveSymbol(symbol: string, original: string): Promise<MentionContext> {
    // Search for symbol in codebase using ripgrep
    try {
      const { stdout } = await execAsync(
        `rg -l "\\b(class|function|interface|type|const|let|var|export)\\s+${symbol}\\b" --type-add 'code:*.{ts,tsx,js,jsx,py,go,rs,java}' --type code`,
        { maxBuffer: 1024 * 1024 }
      );

      const files = stdout.trim().split("\n").filter(Boolean);

      if (files.length === 0) {
        throw new Error(`Symbol not found: ${symbol}`);
      }

      // Read the first matching file
      const firstFile = files[0];
      const content = await fs.readFile(firstFile, "utf-8");

      // Try to extract the symbol definition
      const symbolContent = this.extractSymbolDefinition(content, symbol);

      return {
        type: "symbol",
        original,
        resolved: symbol,
        content: `Symbol ${symbol} (from ${firstFile}):\n\`\`\`\n${symbolContent}\n\`\`\`\nAlso found in: ${files.slice(1, 5).join(", ")}${files.length > 5 ? ` (+${files.length - 5} more)` : ""}`,
      };
    } catch (error: any) {
      throw new Error(`Symbol search failed: ${error.message}`);
    }
  }

  private extractSymbolDefinition(content: string, symbol: string): string {
    const lines = content.split("\n");

    // Find the line with the symbol definition
    let startLine = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].match(new RegExp(`\\b(class|function|interface|type|const|let|var|export)\\s+${symbol}\\b`))) {
        startLine = i;
        break;
      }
    }

    if (startLine === -1) {
      return content.slice(0, 500);
    }

    // Extract the definition (basic brace matching)
    let braceCount = 0;
    let endLine = startLine;
    let started = false;

    for (let i = startLine; i < lines.length && i < startLine + 100; i++) {
      for (const char of lines[i]) {
        if (char === "{" || char === "(") {
          braceCount++;
          started = true;
        } else if (char === "}" || char === ")") {
          braceCount--;
        }
      }

      endLine = i;

      if (started && braceCount === 0) {
        break;
      }
    }

    return lines.slice(startLine, endLine + 1).join("\n");
  }

  private async resolveSearch(query: string, original: string): Promise<MentionContext> {
    try {
      const { stdout } = await execAsync(
        `rg -n "${query}" --type-add 'code:*.{ts,tsx,js,jsx,py,go,rs,java,md}' --type code -C 2 | head -50`,
        { maxBuffer: 1024 * 1024 }
      );

      return {
        type: "search",
        original,
        resolved: query,
        content: `Search results for "${query}":\n\`\`\`\n${stdout || "(no matches)"}\n\`\`\``,
      };
    } catch (error: any) {
      throw new Error(`Search failed: ${error.message}`);
    }
  }

  formatContexts(contexts: MentionContext[]): string {
    if (contexts.length === 0) {
      return "";
    }

    let output = "\n--- CONTEXT FROM MENTIONS ---\n";

    for (const ctx of contexts) {
      if (ctx.error) {
        output += `\n⚠️ ${ctx.original}: ${ctx.error}\n`;
      } else if (ctx.content) {
        output += `\n${ctx.content}\n`;
      }
    }

    output += "--- END CONTEXT ---\n";

    return output;
  }

  getHelp(): string {
    return `
@ Mentions - Add rich context to your prompts:

  @file:path/to/file.ts     Include file contents
  @url:example.com/page     Fetch and include URL content
  @image:screenshot.png     Include image (base64)
  @git:status               Include git status
  @git:diff                 Include git diff
  @git:log                  Include recent commits
  @symbol:MyClass           Find and include symbol definition
  @search:'query here'      Search codebase for pattern

Examples:
  "Fix the bug in @file:src/utils.ts"
  "Implement the design from @url:figma.com/file/xyz"
  "Review @git:diff and suggest improvements"
  "Refactor @symbol:UserService to use dependency injection"
`;
  }
}

// Singleton instance
let contextMentionParserInstance: ContextMentionParser | null = null;

export function getContextMentionParser(): ContextMentionParser {
  if (!contextMentionParserInstance) {
    contextMentionParserInstance = new ContextMentionParser();
  }
  return contextMentionParserInstance;
}
