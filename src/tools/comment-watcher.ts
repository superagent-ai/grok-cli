import * as fs from "fs-extra";
import * as path from "path";
import { exec } from "child_process";
import { promisify } from "util";
import { EventEmitter } from "events";

const execAsync = promisify(exec);

export interface CommentTrigger {
  pattern: string;           // e.g., "AI:", "GROK:", "TODO(ai):"
  regex: RegExp;
  action: "prompt" | "auto"; // How to handle matches
  priority: number;          // Higher = more important
}

export interface DetectedComment {
  file: string;
  line: number;
  column: number;
  trigger: string;
  content: string;
  fullLine: string;
  priority: number;
}

export interface CommentWatcherConfig {
  triggers: CommentTrigger[];
  ignoreDirs: string[];
  fileExtensions: string[];
  autoWatch: boolean;
}

const DEFAULT_TRIGGERS: CommentTrigger[] = [
  {
    pattern: "AI:",
    regex: /\/\/\s*AI:\s*(.+)$/i,
    action: "prompt",
    priority: 10,
  },
  {
    pattern: "GROK:",
    regex: /\/\/\s*GROK:\s*(.+)$/i,
    action: "prompt",
    priority: 10,
  },
  {
    pattern: "TODO(ai):",
    regex: /\/\/\s*TODO\s*\(ai\):\s*(.+)$/i,
    action: "prompt",
    priority: 8,
  },
  {
    pattern: "FIXME(ai):",
    regex: /\/\/\s*FIXME\s*\(ai\):\s*(.+)$/i,
    action: "prompt",
    priority: 9,
  },
  {
    pattern: "# AI:",
    regex: /#\s*AI:\s*(.+)$/i,
    action: "prompt",
    priority: 10,
  },
  {
    pattern: "# GROK:",
    regex: /#\s*GROK:\s*(.+)$/i,
    action: "prompt",
    priority: 10,
  },
];

const DEFAULT_CONFIG: CommentWatcherConfig = {
  triggers: DEFAULT_TRIGGERS,
  ignoreDirs: ["node_modules", ".git", "dist", "build", "coverage", "__pycache__", ".venv"],
  fileExtensions: [".ts", ".tsx", ".js", ".jsx", ".py", ".go", ".rs", ".java", ".rb", ".php"],
  autoWatch: false,
};

/**
 * Comment Watcher - Detect and act on AI-directed comments
 * Looks for comments like: // AI: fix this bug
 */
export class CommentWatcher extends EventEmitter {
  private config: CommentWatcherConfig;
  private projectRoot: string;
  private detectedComments: DetectedComment[] = [];

  constructor(projectRoot: string = process.cwd(), config: Partial<CommentWatcherConfig> = {}) {
    super();
    this.projectRoot = projectRoot;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Add a custom trigger
   */
  addTrigger(pattern: string, regex: RegExp, action: "prompt" | "auto" = "prompt", priority: number = 5): void {
    this.config.triggers.push({ pattern, regex, action, priority });
  }

  /**
   * Scan a single file for AI comments
   */
  async scanFile(filePath: string): Promise<DetectedComment[]> {
    const comments: DetectedComment[] = [];

    try {
      const content = await fs.readFile(filePath, "utf-8");
      const lines = content.split("\n");

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        for (const trigger of this.config.triggers) {
          const match = line.match(trigger.regex);
          if (match) {
            const column = line.indexOf(match[0]);
            comments.push({
              file: filePath,
              line: i + 1,
              column,
              trigger: trigger.pattern,
              content: match[1].trim(),
              fullLine: line.trim(),
              priority: trigger.priority,
            });
          }
        }
      }
    } catch (error) {
      // Ignore read errors
    }

    return comments;
  }

  /**
   * Scan project for AI comments using ripgrep
   */
  async scanProject(): Promise<DetectedComment[]> {
    this.detectedComments = [];

    // Build pattern for ripgrep
    const patterns = this.config.triggers.map((t) => t.pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    const pattern = patterns.join("|");

    // Build ignore patterns
    const ignores = this.config.ignoreDirs.map((d) => `--glob '!${d}/**'`).join(" ");

    // Build file type filters
    const types = this.config.fileExtensions.map((e) => `--glob '*${e}'`).join(" ");

    try {
      const { stdout } = await execAsync(
        `rg -n "${pattern}" ${ignores} ${types} || true`,
        {
          cwd: this.projectRoot,
          maxBuffer: 10 * 1024 * 1024,
        }
      );

      const lines = stdout.trim().split("\n").filter(Boolean);

      for (const line of lines) {
        // Format: file:line:content
        const match = line.match(/^([^:]+):(\d+):(.+)$/);
        if (!match) continue;

        const [, file, lineNum, content] = match;

        // Match against triggers to get full details
        for (const trigger of this.config.triggers) {
          const triggerMatch = content.match(trigger.regex);
          if (triggerMatch) {
            this.detectedComments.push({
              file,
              line: parseInt(lineNum),
              column: content.indexOf(triggerMatch[0]),
              trigger: trigger.pattern,
              content: triggerMatch[1].trim(),
              fullLine: content.trim(),
              priority: trigger.priority,
            });
            break;
          }
        }
      }
    } catch (error) {
      // Fallback to manual scan
      await this.manualScan();
    }

    // Sort by priority
    this.detectedComments.sort((a, b) => b.priority - a.priority);

    this.emit("scan:complete", { count: this.detectedComments.length });

    return this.detectedComments;
  }

  /**
   * Manual scan fallback (slower but works without ripgrep)
   */
  private async manualScan(dir: string = this.projectRoot): Promise<void> {
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        if (!this.config.ignoreDirs.includes(entry.name)) {
          await this.manualScan(fullPath);
        }
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name);
        if (this.config.fileExtensions.includes(ext)) {
          const comments = await this.scanFile(fullPath);
          this.detectedComments.push(...comments);
        }
      }
    }
  }

  /**
   * Get detected comments
   */
  getDetectedComments(): DetectedComment[] {
    return this.detectedComments;
  }

  /**
   * Get comments grouped by file
   */
  getCommentsByFile(): Map<string, DetectedComment[]> {
    const grouped = new Map<string, DetectedComment[]>();

    for (const comment of this.detectedComments) {
      const existing = grouped.get(comment.file) || [];
      existing.push(comment);
      grouped.set(comment.file, existing);
    }

    return grouped;
  }

  /**
   * Get high-priority comments
   */
  getHighPriorityComments(minPriority: number = 8): DetectedComment[] {
    return this.detectedComments.filter((c) => c.priority >= minPriority);
  }

  /**
   * Generate prompt for a comment
   */
  generatePromptForComment(comment: DetectedComment): string {
    return `In file ${comment.file} at line ${comment.line}, there is an AI-directed comment:\n\n` +
      `\`\`\`\n${comment.fullLine}\n\`\`\`\n\n` +
      `The instruction is: "${comment.content}"\n\n` +
      `Please address this instruction.`;
  }

  /**
   * Mark comment as resolved (remove it from file)
   */
  async resolveComment(comment: DetectedComment): Promise<boolean> {
    try {
      const content = await fs.readFile(comment.file, "utf-8");
      const lines = content.split("\n");

      // Remove or modify the comment line
      if (comment.line <= lines.length) {
        const line = lines[comment.line - 1];

        // Check if it's a standalone comment line
        const trimmed = line.trim();
        if (trimmed.startsWith("//") || trimmed.startsWith("#")) {
          // Remove the entire line
          lines.splice(comment.line - 1, 1);
        } else {
          // It's an inline comment, just remove the AI part
          for (const trigger of this.config.triggers) {
            const newLine = line.replace(trigger.regex, "").trimEnd();
            if (newLine !== line) {
              lines[comment.line - 1] = newLine;
              break;
            }
          }
        }

        await fs.writeFile(comment.file, lines.join("\n"));

        // Remove from detected list
        const index = this.detectedComments.indexOf(comment);
        if (index > -1) {
          this.detectedComments.splice(index, 1);
        }

        this.emit("comment:resolved", comment);

        return true;
      }
    } catch (error) {
      // Ignore errors
    }

    return false;
  }

  /**
   * Format detected comments for display
   */
  formatComments(): string {
    if (this.detectedComments.length === 0) {
      return "No AI-directed comments found.\n\n💡 Add comments like '// AI: fix this bug' to your code.";
    }

    let output = `\n💬 AI-Directed Comments\n${"═".repeat(50)}\n\n`;
    output += `Found ${this.detectedComments.length} comment(s)\n\n`;

    const byFile = this.getCommentsByFile();

    for (const [file, comments] of byFile) {
      const relativePath = path.relative(this.projectRoot, file);
      output += `📄 ${relativePath}\n`;

      for (const comment of comments) {
        const priority = comment.priority >= 9 ? "🔴" : comment.priority >= 7 ? "🟡" : "🟢";
        output += `   ${priority} Line ${comment.line}: ${comment.content}\n`;
      }
      output += "\n";
    }

    output += `${"═".repeat(50)}\n`;
    output += `💡 Commands: /scan-todos, /address-todo <index>\n`;

    return output;
  }

  /**
   * Format as actionable list
   */
  formatActionableList(): string {
    if (this.detectedComments.length === 0) {
      return "No AI-directed comments found.";
    }

    let output = "📋 Actionable AI Comments:\n\n";

    for (let i = 0; i < this.detectedComments.length; i++) {
      const c = this.detectedComments[i];
      const priority = c.priority >= 9 ? "🔴" : c.priority >= 7 ? "🟡" : "🟢";
      const relativePath = path.relative(this.projectRoot, c.file);

      output += `${i + 1}. ${priority} ${c.content}\n`;
      output += `   ${relativePath}:${c.line}\n\n`;
    }

    return output;
  }
}

// Singleton instance
let commentWatcherInstance: CommentWatcher | null = null;

export function getCommentWatcher(projectRoot?: string): CommentWatcher {
  if (!commentWatcherInstance) {
    commentWatcherInstance = new CommentWatcher(projectRoot);
  }
  return commentWatcherInstance;
}

export function resetCommentWatcher(): void {
  commentWatcherInstance = null;
}
