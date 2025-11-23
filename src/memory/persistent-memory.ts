import * as fs from "fs-extra";
import * as path from "path";
import * as os from "os";
import { EventEmitter } from "events";

export interface Memory {
  key: string;
  value: string;
  category: MemoryCategory;
  createdAt: Date;
  updatedAt: Date;
  accessCount: number;
  tags?: string[];
}

export type MemoryCategory =
  | "project"      // Project-specific context
  | "preferences"  // User preferences
  | "decisions"    // Architectural decisions
  | "patterns"     // Code patterns used
  | "context"      // Ongoing context
  | "custom";      // User-defined

export interface MemoryConfig {
  projectMemoryPath: string;   // .grok/GROK_MEMORY.md
  userMemoryPath: string;      // ~/.grok/memory.md
  autoCapture: boolean;        // Auto-capture important context
  maxMemories: number;         // Max memories per scope
  relevanceThreshold: number;  // For semantic matching (0-1)
}

const DEFAULT_CONFIG: MemoryConfig = {
  projectMemoryPath: ".grok/GROK_MEMORY.md",
  userMemoryPath: path.join(os.homedir(), ".grok", "memory.md"),
  autoCapture: true,
  maxMemories: 100,
  relevanceThreshold: 0.5,
};

const MEMORY_TEMPLATE = `# Grok Memory

This file stores persistent memory for the Grok CLI agent.
It is automatically managed but can be manually edited.

## Project Context
<!-- Key information about this project -->

## User Preferences
<!-- Coding style, conventions, preferences -->

## Decisions
<!-- Important architectural or design decisions -->

## Patterns
<!-- Code patterns and conventions used -->

## Custom
<!-- User-defined memories -->

---
*Last updated: ${new Date().toISOString()}*
`;

/**
 * Persistent Memory Manager - Inspired by Claude's CLAUDE.md memory system
 * Stores memories in markdown files that persist across sessions
 */
export class PersistentMemoryManager extends EventEmitter {
  private config: MemoryConfig;
  private projectMemories: Map<string, Memory> = new Map();
  private userMemories: Map<string, Memory> = new Map();
  private initialized: boolean = false;

  constructor(config: Partial<MemoryConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Initialize memory system, loading existing memories
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    await this.ensureMemoryFiles();
    await this.loadMemories("project");
    await this.loadMemories("user");

    this.initialized = true;
    this.emit("memory:initialized");
  }

  private async ensureMemoryFiles(): Promise<void> {
    // Ensure project memory file
    const projectDir = path.dirname(this.config.projectMemoryPath);
    await fs.ensureDir(projectDir);

    if (!(await fs.pathExists(this.config.projectMemoryPath))) {
      await fs.writeFile(this.config.projectMemoryPath, MEMORY_TEMPLATE);
    }

    // Ensure user memory file
    const userDir = path.dirname(this.config.userMemoryPath);
    await fs.ensureDir(userDir);

    if (!(await fs.pathExists(this.config.userMemoryPath))) {
      await fs.writeFile(this.config.userMemoryPath, MEMORY_TEMPLATE);
    }
  }

  private async loadMemories(scope: "project" | "user"): Promise<void> {
    const filePath = scope === "project"
      ? this.config.projectMemoryPath
      : this.config.userMemoryPath;

    const memories = scope === "project" ? this.projectMemories : this.userMemories;

    try {
      const content = await fs.readFile(filePath, "utf-8");
      const parsed = this.parseMemoryFile(content);

      for (const memory of parsed) {
        memories.set(memory.key, memory);
      }
    } catch (error) {
      // File doesn't exist or can't be read, start fresh
    }
  }

  private parseMemoryFile(content: string): Memory[] {
    const memories: Memory[] = [];
    const categoryMap: Record<string, MemoryCategory> = {
      "Project Context": "project",
      "User Preferences": "preferences",
      "Decisions": "decisions",
      "Patterns": "patterns",
      "Custom": "custom",
    };

    let currentCategory: MemoryCategory = "custom";
    const lines = content.split("\n");
    let currentKey = "";
    let currentValue = "";
    let inMemoryBlock = false;

    for (const line of lines) {
      // Check for category headers
      if (line.startsWith("## ")) {
        const categoryName = line.slice(3).trim();
        if (categoryMap[categoryName]) {
          currentCategory = categoryMap[categoryName];
        }
        continue;
      }

      // Check for memory entries (format: - **key**: value)
      const memoryMatch = line.match(/^-\s*\*\*([^*]+)\*\*:\s*(.*)$/);
      if (memoryMatch) {
        if (currentKey && currentValue) {
          memories.push(this.createMemory(currentKey, currentValue.trim(), currentCategory));
        }
        currentKey = memoryMatch[1];
        currentValue = memoryMatch[2];
        inMemoryBlock = true;
        continue;
      }

      // Continue multi-line value
      if (inMemoryBlock && line.startsWith("  ")) {
        currentValue += "\n" + line.trim();
      } else if (inMemoryBlock && line.trim() === "") {
        // End of memory block
        if (currentKey && currentValue) {
          memories.push(this.createMemory(currentKey, currentValue.trim(), currentCategory));
        }
        currentKey = "";
        currentValue = "";
        inMemoryBlock = false;
      }
    }

    // Don't forget last memory
    if (currentKey && currentValue) {
      memories.push(this.createMemory(currentKey, currentValue.trim(), currentCategory));
    }

    return memories;
  }

  private createMemory(key: string, value: string, category: MemoryCategory): Memory {
    return {
      key,
      value,
      category,
      createdAt: new Date(),
      updatedAt: new Date(),
      accessCount: 0,
    };
  }

  /**
   * Remember something (store in memory)
   */
  async remember(
    key: string,
    value: string,
    options: {
      scope?: "project" | "user";
      category?: MemoryCategory;
      tags?: string[];
    } = {}
  ): Promise<void> {
    const { scope = "project", category = "context", tags } = options;
    const memories = scope === "project" ? this.projectMemories : this.userMemories;

    const existing = memories.get(key);
    const memory: Memory = {
      key,
      value,
      category,
      createdAt: existing?.createdAt || new Date(),
      updatedAt: new Date(),
      accessCount: existing?.accessCount || 0,
      tags,
    };

    memories.set(key, memory);
    await this.saveMemories(scope);

    this.emit("memory:remembered", { key, scope, category });
  }

  /**
   * Recall something from memory
   */
  recall(key: string, scope?: "project" | "user"): string | null {
    if (scope) {
      const memories = scope === "project" ? this.projectMemories : this.userMemories;
      const memory = memories.get(key);
      if (memory) {
        memory.accessCount++;
        return memory.value;
      }
      return null;
    }

    // Search both scopes, project first
    let memory = this.projectMemories.get(key);
    if (!memory) {
      memory = this.userMemories.get(key);
    }

    if (memory) {
      memory.accessCount++;
      return memory.value;
    }
    return null;
  }

  /**
   * Forget something (remove from memory)
   */
  async forget(key: string, scope: "project" | "user" = "project"): Promise<boolean> {
    const memories = scope === "project" ? this.projectMemories : this.userMemories;
    const deleted = memories.delete(key);

    if (deleted) {
      await this.saveMemories(scope);
      this.emit("memory:forgotten", { key, scope });
    }

    return deleted;
  }

  /**
   * Get memories relevant to a query (simple keyword matching)
   */
  getRelevantMemories(query: string, limit: number = 5): Memory[] {
    const queryLower = query.toLowerCase();
    const queryWords = queryLower.split(/\s+/);

    const allMemories = [
      ...this.projectMemories.values(),
      ...this.userMemories.values(),
    ];

    // Score memories by relevance
    const scored = allMemories.map((memory) => {
      const textLower = `${memory.key} ${memory.value}`.toLowerCase();
      let score = 0;

      for (const word of queryWords) {
        if (textLower.includes(word)) {
          score += 1;
        }
      }

      // Boost by access count
      score += memory.accessCount * 0.1;

      return { memory, score };
    });

    // Sort by score and return top results
    return scored
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((s) => s.memory);
  }

  /**
   * Get all memories for a category
   */
  getByCategory(category: MemoryCategory, scope?: "project" | "user"): Memory[] {
    const memories: Memory[] = [];

    if (!scope || scope === "project") {
      for (const memory of this.projectMemories.values()) {
        if (memory.category === category) {
          memories.push(memory);
        }
      }
    }

    if (!scope || scope === "user") {
      for (const memory of this.userMemories.values()) {
        if (memory.category === category) {
          memories.push(memory);
        }
      }
    }

    return memories;
  }

  /**
   * Clear old memories
   */
  async forgetOlderThan(days: number, scope: "project" | "user" = "project"): Promise<number> {
    const memories = scope === "project" ? this.projectMemories : this.userMemories;
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    let count = 0;

    for (const [key, memory] of memories) {
      if (memory.updatedAt < cutoff) {
        memories.delete(key);
        count++;
      }
    }

    if (count > 0) {
      await this.saveMemories(scope);
    }

    return count;
  }

  /**
   * Save memories to file
   */
  private async saveMemories(scope: "project" | "user"): Promise<void> {
    const memories = scope === "project" ? this.projectMemories : this.userMemories;
    const filePath = scope === "project"
      ? this.config.projectMemoryPath
      : this.config.userMemoryPath;

    // Group by category
    const byCategory = new Map<MemoryCategory, Memory[]>();
    for (const memory of memories.values()) {
      const list = byCategory.get(memory.category) || [];
      list.push(memory);
      byCategory.set(memory.category, list);
    }

    // Generate markdown
    let content = `# Grok Memory\n\n`;
    content += `This file stores persistent memory for the Grok CLI agent.\n`;
    content += `It is automatically managed but can be manually edited.\n\n`;

    const categoryNames: Record<MemoryCategory, string> = {
      project: "Project Context",
      preferences: "User Preferences",
      decisions: "Decisions",
      patterns: "Patterns",
      context: "Context",
      custom: "Custom",
    };

    for (const [category, name] of Object.entries(categoryNames)) {
      content += `## ${name}\n`;
      const categoryMemories = byCategory.get(category as MemoryCategory) || [];

      if (categoryMemories.length === 0) {
        content += `<!-- No memories in this category -->\n`;
      } else {
        for (const memory of categoryMemories) {
          content += `- **${memory.key}**: ${memory.value}\n`;
          if (memory.tags && memory.tags.length > 0) {
            content += `  Tags: ${memory.tags.join(", ")}\n`;
          }
        }
      }
      content += `\n`;
    }

    content += `---\n`;
    content += `*Last updated: ${new Date().toISOString()}*\n`;

    await fs.writeFile(filePath, content);
  }

  /**
   * Get context string for system prompt
   */
  getContextForPrompt(): string {
    const relevant = [
      ...this.getByCategory("project", "project"),
      ...this.getByCategory("preferences", "user"),
      ...this.getByCategory("decisions"),
      ...this.getByCategory("patterns"),
    ].slice(0, 20);

    if (relevant.length === 0) {
      return "";
    }

    let context = "\n--- PERSISTENT MEMORY ---\n";
    for (const memory of relevant) {
      context += `• ${memory.key}: ${memory.value}\n`;
    }
    context += "--- END MEMORY ---\n";

    return context;
  }

  /**
   * Auto-capture important information from conversation
   */
  async autoCapture(message: string, response: string): Promise<void> {
    if (!this.config.autoCapture) return;

    // Detect project context
    const projectPatterns = [
      /this (?:is|project) (?:a|an) ([^.]+)/i,
      /using ([^,.]+ (?:framework|library|stack))/i,
      /the (?:main|entry) (?:file|point) is ([^\s]+)/i,
    ];

    for (const pattern of projectPatterns) {
      const match = message.match(pattern) || response.match(pattern);
      if (match) {
        await this.remember(`auto-${Date.now()}`, match[0], {
          category: "project",
          tags: ["auto-captured"],
        });
      }
    }

    // Detect preferences
    const prefPatterns = [
      /(?:i |we )prefer ([^.]+)/i,
      /(?:always |never )([^.]+)/i,
      /use ([^.]+) (?:style|convention|format)/i,
    ];

    for (const pattern of prefPatterns) {
      const match = message.match(pattern);
      if (match) {
        await this.remember(`pref-${Date.now()}`, match[0], {
          category: "preferences",
          tags: ["auto-captured"],
        });
      }
    }

    // Detect decisions
    const decisionPatterns = [
      /(?:decided|choosing|going with) ([^.]+)/i,
      /(?:will|should) use ([^.]+) (?:for|because)/i,
    ];

    for (const pattern of decisionPatterns) {
      const match = message.match(pattern) || response.match(pattern);
      if (match) {
        await this.remember(`decision-${Date.now()}`, match[0], {
          category: "decisions",
          tags: ["auto-captured"],
        });
      }
    }
  }

  /**
   * Format memories for display
   */
  formatMemories(scope?: "project" | "user"): string {
    let output = `\n🧠 Persistent Memory\n${"═".repeat(50)}\n\n`;

    const formatScope = (name: string, memories: Map<string, Memory>) => {
      output += `📁 ${name}\n`;
      if (memories.size === 0) {
        output += `   (empty)\n`;
      } else {
        for (const [key, memory] of memories) {
          output += `   • ${key}: ${memory.value.slice(0, 50)}${memory.value.length > 50 ? "..." : ""}\n`;
          output += `     Category: ${memory.category} | Accessed: ${memory.accessCount}x\n`;
        }
      }
      output += `\n`;
    };

    if (!scope || scope === "project") {
      formatScope("Project Memory", this.projectMemories);
    }
    if (!scope || scope === "user") {
      formatScope("User Memory", this.userMemories);
    }

    output += `${"═".repeat(50)}\n`;
    output += `💡 Commands: /remember <key> <value>, /recall <key>, /forget <key>\n`;

    return output;
  }

  getStats(): { project: number; user: number; total: number } {
    return {
      project: this.projectMemories.size,
      user: this.userMemories.size,
      total: this.projectMemories.size + this.userMemories.size,
    };
  }
}

// Singleton instance
let memoryManagerInstance: PersistentMemoryManager | null = null;

export function getMemoryManager(config?: Partial<MemoryConfig>): PersistentMemoryManager {
  if (!memoryManagerInstance) {
    memoryManagerInstance = new PersistentMemoryManager(config);
  }
  return memoryManagerInstance;
}

export async function initializeMemory(config?: Partial<MemoryConfig>): Promise<PersistentMemoryManager> {
  const manager = getMemoryManager(config);
  await manager.initialize();
  return manager;
}
