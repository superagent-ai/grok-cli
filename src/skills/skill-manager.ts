import * as fs from "fs-extra";
import * as path from "path";
import { EventEmitter } from "events";

export interface Skill {
  name: string;
  description: string;
  triggers: string[];           // Keywords/patterns that activate this skill
  systemPrompt: string;         // The skill's system prompt
  tools?: string[];             // Restricted tools (empty = all)
  model?: string;               // Specific model for this skill
  priority?: number;            // Higher priority skills match first
  autoActivate?: boolean;       // Auto-activate when triggers match
  scripts?: SkillScript[];      // Optional scripts to run
}

export interface SkillScript {
  name: string;
  command: string;
  runOn: "activate" | "complete" | "both";
  timeout?: number;
}

export interface SkillMatch {
  skill: Skill;
  score: number;
  matchedTriggers: string[];
}

const PREDEFINED_SKILLS: Record<string, Skill> = {
  "typescript-expert": {
    name: "typescript-expert",
    description: "Expert TypeScript developer for complex type issues",
    triggers: ["typescript", "type error", "generic", "infer", "ts error", "tsc", "type inference"],
    systemPrompt: `You are a TypeScript expert. Focus on:
1. Complex generic types and type inference
2. Declaration file (.d.ts) issues
3. Type guards and narrowing
4. Conditional types and mapped types
5. Module resolution and imports

Provide precise type solutions with explanations.`,
    tools: ["view_file", "search", "str_replace_editor"],
    priority: 10,
    autoActivate: true,
  },

  "react-specialist": {
    name: "react-specialist",
    description: "React and frontend development specialist",
    triggers: ["react", "component", "hook", "usestate", "useeffect", "jsx", "tsx", "props", "context"],
    systemPrompt: `You are a React specialist. Focus on:
1. Component architecture and patterns
2. Hooks and state management
3. Performance optimization (memo, useMemo, useCallback)
4. Context and prop drilling solutions
5. Testing React components

Follow React best practices and modern patterns.`,
    tools: ["view_file", "search", "str_replace_editor", "create_file"],
    priority: 10,
    autoActivate: true,
  },

  "api-designer": {
    name: "api-designer",
    description: "REST and GraphQL API design specialist",
    triggers: ["api", "rest", "graphql", "endpoint", "route", "schema", "openapi", "swagger"],
    systemPrompt: `You are an API design specialist. Focus on:
1. RESTful design principles
2. GraphQL schema design
3. Authentication and authorization
4. Rate limiting and pagination
5. API documentation

Design clean, consistent, and well-documented APIs.`,
    tools: ["view_file", "search", "str_replace_editor", "create_file"],
    priority: 8,
    autoActivate: true,
  },

  "database-expert": {
    name: "database-expert",
    description: "Database design and query optimization",
    triggers: ["database", "sql", "query", "migration", "schema", "index", "postgres", "mysql", "mongodb", "prisma"],
    systemPrompt: `You are a database expert. Focus on:
1. Schema design and normalization
2. Query optimization and indexing
3. Migration strategies
4. Data integrity and constraints
5. ORM best practices (Prisma, TypeORM, etc.)

Optimize for performance while maintaining data integrity.`,
    tools: ["view_file", "search", "str_replace_editor", "bash"],
    priority: 8,
    autoActivate: true,
  },

  "security-auditor": {
    name: "security-auditor",
    description: "Security vulnerability detection and prevention",
    triggers: ["security", "vulnerability", "xss", "sql injection", "auth", "csrf", "encryption", "password"],
    systemPrompt: `You are a security auditor. Focus on:
1. Common vulnerabilities (OWASP Top 10)
2. Authentication and authorization flaws
3. Input validation and sanitization
4. Secure data handling
5. Security best practices

Identify vulnerabilities and provide secure solutions.`,
    tools: ["view_file", "search"],
    priority: 9,
    autoActivate: true,
  },

  "performance-optimizer": {
    name: "performance-optimizer",
    description: "Performance analysis and optimization",
    triggers: ["performance", "slow", "optimize", "memory", "cpu", "bottleneck", "profil", "latency"],
    systemPrompt: `You are a performance optimization specialist. Focus on:
1. Identifying performance bottlenecks
2. Memory leak detection
3. Algorithm optimization
4. Caching strategies
5. Async/parallel processing

Provide measurable performance improvements.`,
    tools: ["view_file", "search", "bash", "str_replace_editor"],
    priority: 8,
    autoActivate: true,
  },

  "testing-expert": {
    name: "testing-expert",
    description: "Testing strategy and implementation",
    triggers: ["test", "jest", "vitest", "mocha", "coverage", "mock", "unit test", "integration test", "e2e"],
    systemPrompt: `You are a testing expert. Focus on:
1. Test strategy and architecture
2. Unit, integration, and E2E testing
3. Mocking and stubbing
4. Test coverage optimization
5. Test-driven development (TDD)

Write maintainable, reliable tests.`,
    tools: ["view_file", "search", "str_replace_editor", "create_file", "bash"],
    priority: 8,
    autoActivate: true,
  },

  "devops-engineer": {
    name: "devops-engineer",
    description: "DevOps, CI/CD, and infrastructure",
    triggers: ["docker", "kubernetes", "ci", "cd", "deploy", "pipeline", "github actions", "jenkins", "terraform"],
    systemPrompt: `You are a DevOps engineer. Focus on:
1. Container and orchestration (Docker, K8s)
2. CI/CD pipeline design
3. Infrastructure as Code
4. Monitoring and logging
5. Cloud deployment strategies

Automate and optimize deployment workflows.`,
    tools: ["view_file", "search", "str_replace_editor", "create_file", "bash"],
    priority: 7,
    autoActivate: true,
  },
};

/**
 * Skill Manager - Auto-activating specialized abilities
 * Inspired by Claude Code's Skills system
 */
export class SkillManager extends EventEmitter {
  private skills: Map<string, Skill> = new Map();
  private skillsDir: string;
  private activeSkill: Skill | null = null;

  constructor(projectRoot: string = process.cwd()) {
    super();
    this.skillsDir = path.join(projectRoot, ".grok", "skills");

    // Load predefined skills
    for (const [name, skill] of Object.entries(PREDEFINED_SKILLS)) {
      this.skills.set(name, skill);
    }
  }

  /**
   * Initialize and load custom skills from filesystem
   */
  async initialize(): Promise<void> {
    await this.loadCustomSkills();
    this.emit("skills:initialized", { count: this.skills.size });
  }

  /**
   * Load custom skills from .grok/skills/ directory
   */
  private async loadCustomSkills(): Promise<void> {
    if (!(await fs.pathExists(this.skillsDir))) {
      return;
    }

    try {
      const entries = await fs.readdir(this.skillsDir, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isDirectory()) {
          const skillPath = path.join(this.skillsDir, entry.name, "SKILL.md");
          if (await fs.pathExists(skillPath)) {
            const skill = await this.parseSkillFile(skillPath, entry.name);
            if (skill) {
              this.skills.set(skill.name, skill);
            }
          }
        }
      }
    } catch (error) {
      // Ignore errors loading custom skills
    }
  }

  /**
   * Parse a SKILL.md file
   */
  private async parseSkillFile(filePath: string, dirName: string): Promise<Skill | null> {
    try {
      const content = await fs.readFile(filePath, "utf-8");

      // Parse YAML frontmatter
      const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
      if (!frontmatterMatch) {
        return null;
      }

      const frontmatter = frontmatterMatch[1];
      const body = content.slice(frontmatterMatch[0].length).trim();

      // Simple YAML parsing
      const config: Partial<Skill> = {
        name: dirName,
        systemPrompt: body,
      };

      for (const line of frontmatter.split("\n")) {
        const [key, ...valueParts] = line.split(":");
        const value = valueParts.join(":").trim();

        switch (key.trim()) {
          case "name":
            config.name = value;
            break;
          case "description":
            config.description = value;
            break;
          case "triggers":
            config.triggers = value.replace(/[\[\]"']/g, "").split(",").map((t) => t.trim());
            break;
          case "tools":
            config.tools = value.replace(/[\[\]"']/g, "").split(",").map((t) => t.trim());
            break;
          case "model":
            config.model = value;
            break;
          case "priority":
            config.priority = parseInt(value);
            break;
          case "autoActivate":
            config.autoActivate = value === "true";
            break;
        }
      }

      if (!config.name || !config.triggers || !config.systemPrompt) {
        return null;
      }

      return config as Skill;
    } catch (error) {
      return null;
    }
  }

  /**
   * Register a skill programmatically
   */
  registerSkill(skill: Skill): void {
    this.skills.set(skill.name, skill);
    this.emit("skill:registered", { name: skill.name });
  }

  /**
   * Get all available skills
   */
  getAvailableSkills(): string[] {
    return Array.from(this.skills.keys());
  }

  /**
   * Get a skill by name
   */
  getSkill(name: string): Skill | null {
    return this.skills.get(name) || null;
  }

  /**
   * Match skills based on input text
   */
  matchSkills(input: string, topN: number = 3): SkillMatch[] {
    const inputLower = input.toLowerCase();
    const matches: SkillMatch[] = [];

    for (const skill of this.skills.values()) {
      if (!skill.autoActivate) continue;

      const matchedTriggers: string[] = [];
      let score = 0;

      for (const trigger of skill.triggers) {
        if (inputLower.includes(trigger.toLowerCase())) {
          matchedTriggers.push(trigger);
          score += trigger.length; // Longer matches score higher
        }
      }

      if (matchedTriggers.length > 0) {
        // Boost by priority
        score += (skill.priority || 0) * 2;

        matches.push({
          skill,
          score,
          matchedTriggers,
        });
      }
    }

    // Sort by score descending
    return matches
      .sort((a, b) => b.score - a.score)
      .slice(0, topN);
  }

  /**
   * Auto-select the best skill for an input
   */
  autoSelectSkill(input: string): Skill | null {
    const matches = this.matchSkills(input, 1);

    if (matches.length > 0 && matches[0].score >= 5) {
      this.activeSkill = matches[0].skill;
      this.emit("skill:activated", {
        skill: this.activeSkill.name,
        triggers: matches[0].matchedTriggers,
      });
      return this.activeSkill;
    }

    return null;
  }

  /**
   * Manually activate a skill
   */
  activateSkill(name: string): Skill | null {
    const skill = this.skills.get(name);
    if (skill) {
      this.activeSkill = skill;
      this.emit("skill:activated", { skill: name, manual: true });
    }
    return skill || null;
  }

  /**
   * Deactivate the current skill
   */
  deactivateSkill(): void {
    if (this.activeSkill) {
      this.emit("skill:deactivated", { skill: this.activeSkill.name });
      this.activeSkill = null;
    }
  }

  /**
   * Get the currently active skill
   */
  getActiveSkill(): Skill | null {
    return this.activeSkill;
  }

  /**
   * Get system prompt enhancement from active skill
   */
  getSkillPromptEnhancement(): string {
    if (!this.activeSkill) {
      return "";
    }

    return `\n--- ACTIVE SKILL: ${this.activeSkill.name} ---\n${this.activeSkill.systemPrompt}\n--- END SKILL ---\n`;
  }

  /**
   * Get tool restrictions from active skill
   */
  getSkillToolRestrictions(): string[] | null {
    if (!this.activeSkill || !this.activeSkill.tools || this.activeSkill.tools.length === 0) {
      return null;
    }
    return this.activeSkill.tools;
  }

  /**
   * Format skills for display
   */
  formatAvailableSkills(): string {
    let output = `\n🎯 Available Skills\n${"═".repeat(50)}\n\n`;

    const sortedSkills = Array.from(this.skills.values())
      .sort((a, b) => (b.priority || 0) - (a.priority || 0));

    for (const skill of sortedSkills) {
      const active = this.activeSkill?.name === skill.name ? " 🟢" : "";
      output += `  🔹 ${skill.name}${active}\n`;
      output += `     ${skill.description}\n`;
      output += `     Triggers: ${skill.triggers.slice(0, 5).join(", ")}${skill.triggers.length > 5 ? "..." : ""}\n`;
      if (skill.tools && skill.tools.length > 0) {
        output += `     Tools: ${skill.tools.join(", ")}\n`;
      }
      output += `\n`;
    }

    output += `${"═".repeat(50)}\n`;
    output += `💡 Skills auto-activate based on your input, or use /skill <name>\n`;

    return output;
  }

  /**
   * Create a new skill template
   */
  async createSkillTemplate(name: string): Promise<string> {
    const skillDir = path.join(this.skillsDir, name);
    const skillFile = path.join(skillDir, "SKILL.md");

    await fs.ensureDir(skillDir);

    const template = `---
name: ${name}
description: Description of what this skill does
triggers: ["keyword1", "keyword2", "keyword3"]
tools: ["view_file", "search", "str_replace_editor"]
priority: 5
autoActivate: true
---

You are a specialist in [area]. Focus on:

1. First focus area
2. Second focus area
3. Third focus area

Provide clear, actionable guidance.
`;

    await fs.writeFile(skillFile, template);

    return skillFile;
  }
}

// Singleton instance
let skillManagerInstance: SkillManager | null = null;

export function getSkillManager(projectRoot?: string): SkillManager {
  if (!skillManagerInstance) {
    skillManagerInstance = new SkillManager(projectRoot);
  }
  return skillManagerInstance;
}

export async function initializeSkills(projectRoot?: string): Promise<SkillManager> {
  const manager = getSkillManager(projectRoot);
  await manager.initialize();
  return manager;
}
