# Phase 1 Implementation Guide: Foundation (Months 1-3)

## Overview

This guide provides actionable steps to implement the foundational features of SuperGrok-CLI v2.0, focusing on the multi-mode agent system, git-native operations, and plugin architecture.

---

## Goals

By the end of Phase 1, we will have:

✅ Multi-mode agent system (Plan/Act/Architect/Review/Chat modes)
✅ Git-native operations with atomic commits and transactions
✅ Plugin SDK with 3 example plugins
✅ Enhanced MCP integration
✅ 100% backward compatibility with v1.x
✅ Comprehensive documentation

---

## Week-by-Week Breakdown

### Weeks 1-2: Multi-Mode Agent System

#### Architecture Changes

**1. Create Mode System**

```typescript
// src/agent/modes/types.ts
export enum AgentMode {
  PLAN = 'plan',           // Read-only strategic planning
  ACT = 'act',             // Read-write execution
  ARCHITECT = 'architect', // High-level design
  REVIEW = 'review',       // Code review
  CHAT = 'chat'            // General Q&A
}

export interface ModeConfig {
  mode: AgentMode
  allowedTools: string[]
  systemPrompt: string
  modelOverride?: string
  requiresApproval?: boolean
}

export interface ModeTransition {
  from: AgentMode
  to: AgentMode
  requiresApproval: boolean
  reason?: string
}
```

**2. Implement Mode Manager**

```typescript
// src/agent/mode-manager.ts
export class ModeManager {
  private currentMode: AgentMode = AgentMode.CHAT
  private modeHistory: ModeTransition[] = []

  async switchMode(to: AgentMode, reason?: string): Promise<boolean> {
    const transition: ModeTransition = {
      from: this.currentMode,
      to,
      requiresApproval: this.requiresApproval(this.currentMode, to),
      reason
    }

    if (transition.requiresApproval) {
      const approved = await this.requestApproval(transition)
      if (!approved) return false
    }

    this.currentMode = to
    this.modeHistory.push(transition)
    return true
  }

  getModeConfig(mode: AgentMode): ModeConfig {
    return MODE_CONFIGS[mode]
  }

  private requiresApproval(from: AgentMode, to: AgentMode): boolean {
    // PLAN → ACT always requires approval
    if (from === AgentMode.PLAN && to === AgentMode.ACT) return true

    // Any mode → ACT requires approval
    if (to === AgentMode.ACT) return true

    return false
  }

  private async requestApproval(transition: ModeTransition): Promise<boolean> {
    // Integrate with ConfirmationService
    return await ConfirmationService.requestModeSwitch(transition)
  }
}
```

**3. Mode-Specific System Prompts**

```typescript
// src/agent/modes/prompts.ts
export const MODE_PROMPTS: Record<AgentMode, string> = {
  [AgentMode.PLAN]: `
You are in PLAN mode (read-only). Your role is to:
- Analyze the codebase and gather information
- Ask clarifying questions
- Design comprehensive solutions
- Create detailed implementation plans
- NEVER make any code changes

You can use read-only tools: view_file, search, list_files
You CANNOT use: edit_file, create_file, bash commands

When ready to implement, suggest switching to ACT mode.
  `,

  [AgentMode.ACT]: `
You are in ACT mode (read-write). Your role is to:
- Execute the agreed-upon plan
- Make code changes
- Run tests and validations
- Commit changes with clear messages

You have access to all tools including file editing and bash commands.
Always confirm destructive operations with the user.
  `,

  [AgentMode.ARCHITECT]: `
You are in ARCHITECT mode. Your role is to:
- Discuss high-level system design
- Review architectural patterns
- Propose technology choices
- Consider scalability and maintainability
- Create architectural diagrams and documentation

Focus on "why" and "what" rather than "how".
  `,

  [AgentMode.REVIEW]: `
You are in REVIEW mode. Your role is to:
- Review code changes for quality
- Check for bugs and security issues
- Suggest improvements
- Verify tests and coverage
- Ensure coding standards compliance

Be thorough but constructive in feedback.
  `,

  [AgentMode.CHAT]: `
You are in CHAT mode. Your role is to:
- Answer general questions
- Provide explanations
- Help debug issues
- Offer suggestions

This is the default conversational mode.
  `
}
```

**4. Update GrokAgent**

```typescript
// src/agent/grok-agent.ts
export class GrokAgent {
  private modeManager: ModeManager

  constructor(config: GrokAgentConfig) {
    // ... existing initialization
    this.modeManager = new ModeManager()
  }

  async processUserMessage(message: string): Promise<ChatEntry> {
    // Check for mode switch commands
    const modeSwitch = this.detectModeSwitch(message)
    if (modeSwitch) {
      const switched = await this.modeManager.switchMode(modeSwitch)
      if (switched) {
        return this.createModeChangeResponse(modeSwitch)
      }
    }

    // Get current mode config
    const modeConfig = this.modeManager.getModeConfig(
      this.modeManager.currentMode
    )

    // Filter tools based on mode
    const availableTools = this.filterToolsByMode(modeConfig)

    // Build system prompt with mode-specific instructions
    const systemPrompt = this.buildSystemPrompt(modeConfig)

    // Continue with existing message processing...
  }

  private filterToolsByMode(config: ModeConfig): GrokTool[] {
    return GROK_TOOLS.filter(tool =>
      config.allowedTools.includes(tool.function.name)
    )
  }

  private detectModeSwitch(message: string): AgentMode | null {
    const lower = message.toLowerCase()
    if (lower.includes('switch to plan mode') || lower.includes('/plan')) {
      return AgentMode.PLAN
    }
    if (lower.includes('switch to act mode') || lower.includes('/act')) {
      return AgentMode.ACT
    }
    // ... other mode switches
    return null
  }
}
```

**5. CLI Commands**

```bash
# Usage examples
grok --mode plan            # Start in plan mode
grok --mode act             # Start in act mode (requires confirmation)
grok                        # Default: chat mode

# In interactive mode
> /plan                     # Switch to plan mode
> /act                      # Switch to act mode
> /architect                # Switch to architect mode
> /review                   # Switch to review mode
> /chat                     # Switch to chat mode
```

---

### Weeks 3-4: Git-Native Operations

#### 1. Repository Indexer

```typescript
// src/git/repo-indexer.ts
import { simpleGit, SimpleGit } from 'simple-git'
import * as fs from 'fs-extra'
import * as path from 'path'

export interface RepoIndex {
  files: FileEntry[]
  structure: DirectoryTree
  gitInfo: GitInfo
  summary: RepoSummary
}

export interface FileEntry {
  path: string
  language: string
  lines: number
  lastModified: Date
  author: string
}

export class RepoIndexer {
  private git: SimpleGit

  constructor(private repoPath: string) {
    this.git = simpleGit(repoPath)
  }

  async buildIndex(): Promise<RepoIndex> {
    const [files, structure, gitInfo] = await Promise.all([
      this.indexFiles(),
      this.buildStructure(),
      this.getGitInfo()
    ])

    const summary = this.generateSummary(files)

    return { files, structure, gitInfo, summary }
  }

  private async indexFiles(): Promise<FileEntry[]> {
    // Get all tracked files
    const trackedFiles = await this.git.raw(['ls-files'])
    const files = trackedFiles.split('\n').filter(Boolean)

    return await Promise.all(
      files.map(file => this.indexFile(file))
    )
  }

  private async indexFile(filePath: string): Promise<FileEntry> {
    const fullPath = path.join(this.repoPath, filePath)
    const content = await fs.readFile(fullPath, 'utf-8')
    const lines = content.split('\n').length

    // Get last author
    const log = await this.git.log({ file: filePath, maxCount: 1 })
    const author = log.latest?.author_name || 'unknown'

    return {
      path: filePath,
      language: this.detectLanguage(filePath),
      lines,
      lastModified: new Date(log.latest?.date || Date.now()),
      author
    }
  }

  private detectLanguage(filePath: string): string {
    const ext = path.extname(filePath)
    const LANG_MAP: Record<string, string> = {
      '.ts': 'typescript',
      '.js': 'javascript',
      '.py': 'python',
      '.go': 'go',
      '.rs': 'rust',
      // ... more mappings
    }
    return LANG_MAP[ext] || 'unknown'
  }
}
```

#### 2. Git Transaction System

```typescript
// src/git/transaction.ts
export class GitTransaction {
  private changes: FileChange[] = []
  private branchName: string
  private originalBranch: string

  constructor(
    private git: SimpleGit,
    private transactionId: string
  ) {}

  async begin(): Promise<void> {
    // Save current branch
    const status = await this.git.status()
    this.originalBranch = status.current || 'main'

    // Create transaction branch
    this.branchName = `grok-transaction-${this.transactionId}`
    await this.git.checkoutBranch(this.branchName, this.originalBranch)
  }

  async addChange(change: FileChange): Promise<void> {
    this.changes.push(change)

    // Apply change to filesystem
    if (change.type === 'edit') {
      await fs.writeFile(change.path, change.newContent)
    } else if (change.type === 'create') {
      await fs.writeFile(change.path, change.content)
    } else if (change.type === 'delete') {
      await fs.remove(change.path)
    }

    // Stage the change
    await this.git.add(change.path)
  }

  async commit(message: string): Promise<void> {
    if (this.changes.length === 0) {
      throw new Error('No changes to commit')
    }

    // Create commit
    await this.git.commit(message)

    // Merge back to original branch
    await this.git.checkout(this.originalBranch)
    await this.git.merge([this.branchName])

    // Delete transaction branch
    await this.git.deleteLocalBranch(this.branchName)
  }

  async rollback(): Promise<void> {
    // Switch back to original branch
    await this.git.checkout(this.originalBranch)

    // Delete transaction branch (discards all changes)
    await this.git.deleteLocalBranch(this.branchName, true)
  }
}
```

#### 3. Atomic Commit Tool

```typescript
// src/tools/git-commit-tool.ts
export class GitCommitTool {
  async createAtomicCommit(
    files: string[],
    description: string
  ): Promise<CommitResult> {
    const git = simpleGit(process.cwd())

    // Generate commit message using LLM
    const message = await this.generateCommitMessage(files, description)

    // Stage files
    await git.add(files)

    // Create commit
    const commit = await git.commit(message)

    return {
      hash: commit.commit,
      message,
      files
    }
  }

  private async generateCommitMessage(
    files: string[],
    description: string
  ): Promise<string> {
    // Get diff for files
    const git = simpleGit(process.cwd())
    const diff = await git.diff(['--cached', '--', ...files])

    // Use LLM to generate message
    const prompt = `
Generate a clear, concise git commit message for these changes:

Description: ${description}

Files changed:
${files.join('\n')}

Diff:
${diff}

Format:
<type>: <short summary>

<optional detailed description>
    `

    // Call LLM (use existing GrokClient)
    const response = await this.client.generateCommitMessage(prompt)
    return response
  }
}
```

---

### Weeks 5-7: Plugin Architecture

#### 1. Plugin SDK

```typescript
// src/plugins/sdk.ts

export interface PluginContext {
  // Access to core services
  agent: GrokAgent
  git: SimpleGit
  workspace: WorkspaceManager
  logger: Logger

  // Utilities
  registerTool(tool: GrokTool): void
  registerCommand(name: string, handler: CommandHandler): void
  registerContextProvider(provider: ContextProvider): void
}

export interface GrokPlugin {
  // Metadata
  name: string
  version: string
  description: string
  author: string
  type: PluginType

  // Lifecycle hooks
  onLoad(ctx: PluginContext): Promise<void>
  onUnload(): Promise<void>
}

export type PluginType = 'tool' | 'context' | 'model' | 'ui' | 'workflow'

// Example tool plugin
export interface ToolPlugin extends GrokPlugin {
  type: 'tool'
  tools: GrokTool[]
  execute(toolName: string, args: any, ctx: PluginContext): Promise<ToolResult>
}

// Example context plugin
export interface ContextPlugin extends GrokPlugin {
  type: 'context'
  getContext(query: string, ctx: PluginContext): Promise<ContextChunk[]>
}
```

#### 2. Plugin Manager

```typescript
// src/plugins/manager.ts
export class PluginManager {
  private plugins: Map<string, GrokPlugin> = new Map()
  private context: PluginContext

  async loadPlugin(pluginPath: string): Promise<void> {
    // Import plugin module
    const pluginModule = await import(pluginPath)
    const plugin: GrokPlugin = new pluginModule.default()

    // Validate plugin
    this.validatePlugin(plugin)

    // Call onLoad
    await plugin.onLoad(this.context)

    // Store plugin
    this.plugins.set(plugin.name, plugin)

    // If tool plugin, register tools
    if (plugin.type === 'tool') {
      this.registerToolPlugin(plugin as ToolPlugin)
    }

    console.log(`✅ Loaded plugin: ${plugin.name} v${plugin.version}`)
  }

  async unloadPlugin(name: string): Promise<void> {
    const plugin = this.plugins.get(name)
    if (!plugin) return

    await plugin.onUnload()
    this.plugins.delete(name)

    console.log(`✅ Unloaded plugin: ${name}`)
  }

  private registerToolPlugin(plugin: ToolPlugin): void {
    for (const tool of plugin.tools) {
      // Add to global tools array
      GROK_TOOLS.push(tool)

      // Register execution handler
      this.registerToolHandler(tool.function.name, async (args) => {
        return await plugin.execute(tool.function.name, args, this.context)
      })
    }
  }
}
```

#### 3. Example Plugins

**Plugin 1: Jira Integration**

```typescript
// .grok/plugins/jira-integration/index.ts
import { ToolPlugin, PluginContext, GrokTool, ToolResult } from '@vibe-kit/grok-cli/plugins'

export default class JiraPlugin implements ToolPlugin {
  name = 'jira-integration'
  version = '1.0.0'
  description = 'Integrate with Jira for issue management'
  author = 'Community'
  type: 'tool' as const

  tools: GrokTool[] = [
    {
      type: 'function',
      function: {
        name: 'create_jira_issue',
        description: 'Create a new Jira issue',
        parameters: {
          type: 'object',
          properties: {
            summary: { type: 'string' },
            description: { type: 'string' },
            issueType: { type: 'string', enum: ['Bug', 'Story', 'Task'] }
          },
          required: ['summary', 'description', 'issueType']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'search_jira_issues',
        description: 'Search Jira issues by JQL',
        parameters: {
          type: 'object',
          properties: {
            jql: { type: 'string' }
          },
          required: ['jql']
        }
      }
    }
  ]

  private jiraClient: any

  async onLoad(ctx: PluginContext): Promise<void> {
    // Initialize Jira client
    const config = await this.loadConfig()
    this.jiraClient = new JiraApi(config)

    ctx.logger.info('Jira plugin loaded')
  }

  async onUnload(): Promise<void> {
    // Cleanup
  }

  async execute(toolName: string, args: any, ctx: PluginContext): Promise<ToolResult> {
    if (toolName === 'create_jira_issue') {
      const issue = await this.jiraClient.addNewIssue({
        fields: {
          summary: args.summary,
          description: args.description,
          issuetype: { name: args.issueType }
        }
      })

      return {
        success: true,
        output: `Created issue: ${issue.key}`
      }
    }

    if (toolName === 'search_jira_issues') {
      const results = await this.jiraClient.searchJira(args.jql)
      return {
        success: true,
        output: JSON.stringify(results.issues, null, 2)
      }
    }

    return { success: false, error: 'Unknown tool' }
  }

  private async loadConfig() {
    // Load from .grok/plugins/jira-integration/config.json
  }
}
```

**Plugin 2: Company API Docs Context Provider**

```typescript
// .grok/plugins/company-docs/index.ts
import { ContextPlugin, PluginContext, ContextChunk } from '@vibe-kit/grok-cli/plugins'

export default class CompanyDocsPlugin implements ContextPlugin {
  name = 'company-docs'
  version = '1.0.0'
  description = 'Provide context from company API documentation'
  author = 'Internal'
  type: 'context' as const

  private docsIndex: any

  async onLoad(ctx: PluginContext): Promise<void> {
    // Load and index company docs
    this.docsIndex = await this.buildDocsIndex()
    ctx.logger.info('Company docs plugin loaded')
  }

  async onUnload(): Promise<void> {}

  async getContext(query: string, ctx: PluginContext): Promise<ContextChunk[]> {
    // Search docs index
    const results = this.docsIndex.search(query)

    return results.map(result => ({
      content: result.text,
      source: result.file,
      relevance: result.score
    }))
  }

  private async buildDocsIndex() {
    // Load markdown files from .grok/contexts/api-docs/
    // Build search index
  }
}
```

**Plugin 3: Custom Linter**

```typescript
// .grok/plugins/custom-linter/index.ts
import { ToolPlugin, PluginContext, GrokTool, ToolResult } from '@vibe-kit/grok-cli/plugins'

export default class CustomLinterPlugin implements ToolPlugin {
  name = 'custom-linter'
  version = '1.0.0'
  description = 'Run custom linting rules on code'
  author = 'Team'
  type: 'tool' as const

  tools: GrokTool[] = [
    {
      type: 'function',
      function: {
        name: 'lint_code',
        description: 'Run custom linter on code files',
        parameters: {
          type: 'object',
          properties: {
            files: { type: 'array', items: { type: 'string' } }
          },
          required: ['files']
        }
      }
    }
  ]

  async onLoad(ctx: PluginContext): Promise<void> {}
  async onUnload(): Promise<void> {}

  async execute(toolName: string, args: any, ctx: PluginContext): Promise<ToolResult> {
    if (toolName === 'lint_code') {
      const results = []
      for (const file of args.files) {
        const issues = await this.lintFile(file)
        results.push({ file, issues })
      }

      return {
        success: true,
        output: JSON.stringify(results, null, 2)
      }
    }

    return { success: false, error: 'Unknown tool' }
  }

  private async lintFile(filePath: string) {
    // Custom linting logic
    return []
  }
}
```

---

### Week 8: Integration & Testing

#### 1. CLI Commands for Plugin Management

```bash
# List installed plugins
grok plugin list

# Install plugin from local directory
grok plugin install ./.grok/plugins/jira-integration

# Install plugin from npm
grok plugin install @company/grok-plugin-jira

# Uninstall plugin
grok plugin uninstall jira-integration

# Enable/disable plugin
grok plugin enable jira-integration
grok plugin disable jira-integration
```

#### 2. Plugin Configuration

```json
// .grok/settings.json
{
  "plugins": {
    "jira-integration": {
      "enabled": true,
      "config": {
        "host": "https://company.atlassian.net",
        "apiToken": "${JIRA_API_TOKEN}"
      }
    },
    "company-docs": {
      "enabled": true,
      "docsPath": ".grok/contexts/api-docs"
    }
  }
}
```

#### 3. Testing

```typescript
// tests/plugin-system.test.ts
describe('Plugin System', () => {
  it('should load plugin successfully', async () => {
    const manager = new PluginManager()
    await manager.loadPlugin('./plugins/example')
    expect(manager.getPlugin('example')).toBeDefined()
  })

  it('should register tools from plugin', async () => {
    const manager = new PluginManager()
    await manager.loadPlugin('./plugins/jira-integration')

    const tools = manager.getRegisteredTools()
    expect(tools).toContain('create_jira_issue')
  })

  it('should execute plugin tool', async () => {
    const result = await pluginManager.executeTool('create_jira_issue', {
      summary: 'Test issue',
      description: 'Test',
      issueType: 'Bug'
    })

    expect(result.success).toBe(true)
  })
})
```

---

### Week 9: Documentation & Polish

#### 1. Plugin Developer Guide

Create `docs/PLUGIN_GUIDE.md` with:
- Plugin SDK API reference
- Example plugins
- Best practices
- Publishing to plugin registry

#### 2. User Documentation

Update `README.md` with:
- Multi-mode usage examples
- Git operations guide
- Plugin installation instructions

#### 3. Migration Guide

Create `docs/MIGRATION_V1_TO_V2.md`:
- Breaking changes (none expected)
- New features overview
- Configuration migration
- Plugin migration

---

## Success Criteria

### Phase 1 Complete When:

- ✅ All 5 agent modes implemented and functional
- ✅ Mode switching with approval gates working
- ✅ Per-mode system prompts and tool filtering
- ✅ Repository indexing functional
- ✅ Git transaction system with commit/rollback
- ✅ Atomic commits with auto-generated messages
- ✅ Plugin SDK published as separate package
- ✅ Plugin manager can load/unload plugins
- ✅ 3 example plugins fully functional
- ✅ CLI commands for plugin management
- ✅ 100% test coverage for new features
- ✅ Documentation complete
- ✅ Alpha release tagged

---

## Dependencies & Resources

### Required Packages

```json
{
  "dependencies": {
    "simple-git": "^3.x",
    "tree-sitter": "^0.20.x",
    "tiktoken": "^1.x"
  },
  "devDependencies": {
    "@types/node": "^20.x",
    "vitest": "^1.x"
  }
}
```

### Team Roles

- **Lead Engineer**: Architecture, code review, integration
- **Backend Developer**: Plugin system, git operations
- **DevOps**: CI/CD, testing infrastructure
- **Technical Writer**: Documentation

---

## Next Steps After Phase 1

Once Phase 1 is complete:

1. ✅ Tag alpha release (v2.0.0-alpha.1)
2. ✅ Gather feedback from early adopters
3. ✅ Fix critical bugs
4. ✅ Begin Phase 2 (Enterprise Features)
5. ✅ Start desktop app prototyping in parallel

---

**Ready to start building? Let's go! 🚀**

---

*Last Updated: 2025-10-26*
*Phase: Planning Complete → Implementation Ready*
