# Multi-Agent Orchestration System

**Version:** 1.0.0
**Status:** Phase 3 - Advanced Features
**Last Updated:** 2025-11-01

---

## Overview

The Multi-Agent Orchestration System is a comprehensive framework for maximizing your SuperGrok Heavy subscriptions through intelligent task decomposition, parallel execution, and smart account management.

### Key Features

- **Dual Account Management**: Intelligent load balancing across 2 API keys
- **Task Decomposition**: Automatically break complex tasks into 3-5 sub-tasks
- **Parallel Execution**: Execute sub-tasks concurrently for maximum speed
- **Smart Model Selection**: Automatic model selection based on task complexity
- **Rate Limiting**: 60 requests/min per account with automatic failover
- **Cost Tracking**: Real-time usage and cost monitoring
- **Persistent Storage**: SQLite database for conversations and documents
- **Prompt Library**: 8 pre-loaded prompt templates with variable substitution

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    CLI Interface                             │
│              grok orchestrate <command>                      │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    SuperAgent                                │
│  • Task Decomposition (grok-3-fast)                         │
│  • Strategy Selection (parallel/sequential/adaptive)        │
│  • Result Aggregation (grok-4)                              │
└─────────────────────────────────────────────────────────────┘
                              │
                    ┌─────────┴─────────┐
                    ▼                   ▼
┌───────────────────────────┐  ┌───────────────────────────┐
│       SubAgent #1         │  │       SubAgent #2         │
│  • Model: grok-code-fast  │  │  • Model: grok-3-fast     │
│  • Complexity: Simple     │  │  • Complexity: Medium     │
└───────────────────────────┘  └───────────────────────────┘
                    │                   │
                    └─────────┬─────────┘
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                 Account Manager                              │
│  • Load Balancing (round-robin/least-loaded/cost-optimized) │
│  • Rate Limiting (60 req/min per account)                   │
│  • Usage Tracking (requests, tokens, costs)                 │
└─────────────────────────────────────────────────────────────┘
                              │
                    ┌─────────┴─────────┐
                    ▼                   ▼
┌───────────────────────────┐  ┌───────────────────────────┐
│      Account 1            │  │      Account 2            │
│  GROK_API_KEY             │  │  GROK_API_KEY_2           │
└───────────────────────────┘  └───────────────────────────┘
```

---

## Components

### 1. AccountManager

Manages multiple API keys with intelligent load balancing and rate limiting.

**Features:**
- Three load balancing strategies:
  - `round-robin`: Evenly distribute requests
  - `least-loaded`: Route to account with fewer requests
  - `cost-optimized`: Route to account with lower total cost
- Automatic rate limiting (60 requests/minute)
- Real-time usage tracking (requests, tokens, costs)

**Usage:**
```typescript
const accounts = [
  { apiKey: process.env.GROK_API_KEY!, name: 'account-1' },
  { apiKey: process.env.GROK_API_KEY_2!, name: 'account-2' },
];

const manager = new AccountManager(accounts, 'round-robin');
const { client, accountName } = manager.getClient();
```

### 2. SuperAgent

Orchestrates complex tasks by decomposing them into sub-tasks and aggregating results.

**Features:**
- Task decomposition using grok-3-fast
- Three execution strategies:
  - `parallel`: All sub-tasks run concurrently
  - `sequential`: Sub-tasks run in order with context passing
  - `adaptive`: Smart mix of parallel and sequential
- Result aggregation using grok-4
- Automatic conversation and document saving

**Usage:**
```typescript
const superAgent = new SuperAgent(accountManager);
superAgent.setStrategy('adaptive');

const result = await superAgent.orchestrate({
  id: 'task-123',
  description: 'Build a REST API with authentication',
  context: 'Using Express.js and JWT',
  maxSubTasks: 5,
});
```

### 3. SubAgent

Executes individual sub-tasks with automatic model selection.

**Features:**
- Automatic model selection based on complexity:
  - Simple → grok-code-fast-1 ($0.005/1K tokens)
  - Medium → grok-3-fast ($0.008/1K tokens)
  - Complex → grok-4 ($0.015/1K tokens)
- Token and cost tracking
- Error handling and retries

**Usage:**
```typescript
const subAgent = new SubAgent(accountManager);

const result = await subAgent.executeTask({
  id: 'subtask-1',
  description: 'Create Express.js server setup',
  complexity: 'medium',
});
```

### 4. OrchestrationDatabase

SQLite database for persistent storage of conversations, documents, prompts, and agents.

**Location:** `~/.supergrok/orchestration.db`

**Tables:**
- `conversations`: All LLM conversations with metadata
- `documents`: Generated documents and results
- `prompts`: Reusable prompt templates
- `agents`: Agent execution history

**Usage:**
```typescript
const db = new OrchestrationDatabase();
await db.initialize();

// Save conversation
db.saveConversation({
  task_id: 'task-123',
  type: 'decomposition',
  messages: JSON.stringify(messages),
  model: 'grok-3-fast',
  tokens: 1500,
  cost: 0.012,
});

// Save document
db.saveDocument({
  task_id: 'task-123',
  title: 'API Implementation Guide',
  content: '# REST API...',
  format: 'markdown',
});
```

### 5. PromptLibrary

Reusable prompt templates with variable substitution.

**Features:**
- 8 pre-loaded templates
- Variable substitution with `{{variableName}}` syntax
- Template validation
- Custom template support

**Default Templates:**
1. `code-review` - Comprehensive code review
2. `documentation-generator` - Generate documentation
3. `bug-fix` - Analyze and fix bugs
4. `refactor` - Code refactoring
5. `test-generator` - Generate test cases
6. `security-audit` - Security analysis
7. `performance-optimization` - Performance optimization
8. `architecture-design` - System architecture design

**Usage:**
```typescript
const library = new PromptLibrary(db);
await library.initialize();

const rendered = library.render('code-review', {
  code: sourceCode,
  language: 'typescript',
  focus: 'security and performance',
});
```

---

## CLI Commands

### Run Orchestration Task

Execute a complex task using multi-agent orchestration:

```bash
grok orchestrate run "Build a REST API with authentication" \
  --context "Using Express.js and JWT" \
  --strategy adaptive \
  --load-balancing round-robin \
  --max-subtasks 5 \
  --save-doc
```

**Options:**
- `-c, --context <text>`: Additional context for the task
- `-s, --strategy <type>`: Execution strategy (parallel, sequential, adaptive)
- `-l, --load-balancing <type>`: Load balancing strategy (round-robin, least-loaded, cost-optimized)
- `-m, --max-subtasks <number>`: Maximum number of sub-tasks (default: 5)
- `--save-doc`: Save result as a document

### View Statistics

```bash
grok orchestrate stats
```

Shows:
- Total conversations
- Total documents
- Total prompts
- Total agents
- Database location

### Prompt Management

**List all prompt templates:**
```bash
grok orchestrate prompt list
```

**Show a specific template:**
```bash
grok orchestrate prompt show code-review
```

**Render a template with variables:**
```bash
grok orchestrate prompt render code-review \
  --vars code="console.log('hello')" \
         language="javascript" \
         focus="best practices"
```

### Document Management

**List saved documents:**
```bash
grok orchestrate docs --limit 10
```

---

## Configuration

### Environment Variables

```bash
# Required: First API key
export GROK_API_KEY=xai-your-api-key-1

# Optional: Second API key for dual-account orchestration
export GROK_API_KEY_2=xai-your-api-key-2

# Optional: Base URL
export GROK_BASE_URL=https://api.x.ai/v1
```

### User Settings

API keys can also be configured in `~/.grok/user-settings.json`:

```json
{
  "apiKey": "xai-your-api-key-1",
  "baseURL": "https://api.x.ai/v1"
}
```

---

## Usage Examples

### Example 1: Code Review with Documentation

```bash
grok orchestrate run "Review and document this TypeScript project" \
  --context "Focus on security vulnerabilities and best practices" \
  --strategy adaptive \
  --save-doc
```

### Example 2: Parallel Feature Implementation

```bash
grok orchestrate run "Implement user authentication, profile management, and notification system" \
  --strategy parallel \
  --max-subtasks 3
```

### Example 3: Sequential Refactoring

```bash
grok orchestrate run "Refactor legacy code to use modern patterns" \
  --context "Migrate from callbacks to async/await" \
  --strategy sequential
```

### Example 4: Cost-Optimized Architecture Design

```bash
grok orchestrate run "Design a microservices architecture for e-commerce platform" \
  --strategy adaptive \
  --load-balancing cost-optimized \
  --save-doc
```

---

## Model Selection Guide

### Complexity-Based Model Selection

| Complexity | Model | Cost (per 1K tokens) | Use Case |
|------------|-------|---------------------|----------|
| Simple | grok-code-fast-1 | $0.005 | Simple edits, formatting, minor changes |
| Medium | grok-3-fast | $0.008 | Feature implementation, debugging |
| Complex | grok-4 | $0.015 | Architecture design, complex refactoring |

### Orchestration Models

| Task | Model | Rationale |
|------|-------|-----------|
| Task Decomposition | grok-3-fast | Fast reasoning for breaking down tasks |
| Sub-task Execution | Auto-selected | Based on complexity |
| Result Aggregation | grok-4 | High-quality synthesis |

---

## Cost Optimization

### Load Balancing Strategies

**Round-Robin:**
- Best for: Even distribution of workload
- Use when: Both accounts should be utilized equally

**Least-Loaded:**
- Best for: Avoiding rate limits
- Use when: Unpredictable request patterns

**Cost-Optimized:**
- Best for: Budget constraints
- Use when: Minimizing costs is priority

### Tips for Cost Reduction

1. Use `parallel` strategy for independent tasks
2. Set appropriate `max-subtasks` (3-5 is optimal)
3. Use `cost-optimized` load balancing
4. Review task descriptions to avoid over-decomposition

---

## Database Schema

### Conversations Table

```sql
CREATE TABLE conversations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id TEXT NOT NULL,
  type TEXT NOT NULL,  -- 'decomposition', 'subtask', 'aggregation'
  messages TEXT NOT NULL,  -- JSON stringified
  model TEXT NOT NULL,
  tokens INTEGER DEFAULT 0,
  cost REAL DEFAULT 0.0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
```

### Documents Table

```sql
CREATE TABLE documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  format TEXT DEFAULT 'markdown',  -- 'markdown', 'text', 'json'
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
```

### Prompts Table

```sql
CREATE TABLE prompts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,
  template TEXT NOT NULL,
  variables TEXT DEFAULT '[]',  -- JSON array
  description TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
```

### Agents Table

```sql
CREATE TABLE agents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id TEXT NOT NULL,
  agent_type TEXT NOT NULL,  -- 'super', 'sub'
  status TEXT DEFAULT 'pending',  -- 'pending', 'running', 'completed', 'failed'
  result TEXT,
  error TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT
);
```

---

## Testing

### Run All Tests

```bash
npm test
```

### Run Tests in Watch Mode

```bash
npm run test:watch
```

### Generate Coverage Report

```bash
npm run test:coverage
```

### Test Files

- `tests/orchestration/account-manager.test.ts` - Account management tests
- `tests/orchestration/sub-agent.test.ts` - Sub-agent execution tests
- `tests/storage/database.test.ts` - Database operations tests
- `tests/storage/prompt-library.test.ts` - Prompt template tests

---

## Performance Metrics

### Typical Execution Times

| Task Complexity | Subtasks | Strategy | Execution Time |
|----------------|----------|----------|----------------|
| Simple | 3 | Parallel | 10-15s |
| Medium | 4 | Adaptive | 20-30s |
| Complex | 5 | Sequential | 40-60s |

### Token Usage

| Orchestration Phase | Typical Tokens | Model |
|---------------------|----------------|-------|
| Task Decomposition | 500-1000 | grok-3-fast |
| Simple Sub-task | 1000-2000 | grok-code-fast-1 |
| Medium Sub-task | 2000-4000 | grok-3-fast |
| Complex Sub-task | 4000-8000 | grok-4 |
| Result Aggregation | 2000-3000 | grok-4 |

---

## Roadmap

### Phase 3 (Current) - Advanced Features
- [x] Multi-agent orchestration
- [x] Account management and load balancing
- [x] Persistent storage with SQLite
- [x] Prompt library system
- [x] CLI commands

### Phase 4 (Planned) - Innovation
- [ ] Visual workflow builder
- [ ] Real-time collaboration features
- [ ] Advanced analytics dashboard
- [ ] Integration with CI/CD pipelines
- [ ] Custom plugin support

---

## Troubleshooting

### Error: "All accounts are currently rate-limited"

**Solution:** Wait 60 seconds or add more API keys

### Error: "Database not initialized"

**Solution:** Ensure `initialize()` is called before database operations

```typescript
const db = new OrchestrationDatabase();
await db.initialize();  // Required!
```

### Error: "Template not found"

**Solution:** List available templates first

```bash
grok orchestrate prompt list
```

### High Costs

**Solution:**
1. Use `cost-optimized` load balancing
2. Reduce `max-subtasks`
3. Review task complexity assignments

---

## Contributing

Contributions are welcome! Please:

1. Follow TypeScript best practices
2. Add tests for new features
3. Update documentation
4. Run `npm test` before submitting

---

## License

MIT License - See LICENSE file for details

---

## Support

For issues and feature requests, please use the GitHub issue tracker:
https://github.com/manutej/supergrok-cli/issues

---

**Document Version:** 1.0.0
**Last Updated:** 2025-11-01
