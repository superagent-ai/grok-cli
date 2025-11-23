# Architecture Documentation - Grok CLI

> **Version**: 0.0.12
> **Last Updated**: November 14, 2025

This document provides a comprehensive overview of the Grok CLI architecture, design patterns, and technical decisions.

## Table of Contents

- [System Overview](#system-overview)
- [Architecture Layers](#architecture-layers)
- [Core Components](#core-components)
- [Design Patterns](#design-patterns)
- [Data Flow](#data-flow)
- [Security Architecture](#security-architecture)
- [Technology Stack](#technology-stack)
- [Extension Points](#extension-points)

---

## System Overview

Grok CLI is an AI-powered command-line interface that enables developers to interact with their codebase through natural language. It implements an agentic architecture where an AI agent can autonomously use tools to accomplish tasks.

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        User Input                            │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│                  CLI Entry Point                             │
│                  (Commander.js)                              │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│                 Chat Interface (Ink/React)                   │
│  ┌────────────┬────────────┬────────────┬────────────┐     │
│  │ History    │ Input      │ Spinner    │ Dialogs    │     │
│  └────────────┴────────────┴────────────┴────────────┘     │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│                    Grok Agent                                │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  • Message Processing                                  │  │
│  │  • Tool Orchestration                                  │  │
│  │  • Conversation History                                │  │
│  │  • Streaming Response                                  │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────┬───────────────────────┬───────────────────────────┘
          │                       │
          ▼                       ▼
┌──────────────────┐    ┌──────────────────────┐
│  Grok API Client │    │  Confirmation        │
│  (OpenAI SDK)    │    │  Service             │
└──────────────────┘    └──────────────────────┘
          │                       │
          ▼                       ▼
┌─────────────────────────────────────────────────────────────┐
│                         Tools                                │
│  ┌────────┬────────┬────────┬────────┬────────┬────────┐  │
│  │ View   │Create  │ Edit   │ Bash   │Search  │ Todos  │  │
│  │ File   │ File   │ Text   │        │        │        │  │
│  └────────┴────────┴────────┴────────┴────────┴────────┘  │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│                   File System / Shell                        │
└─────────────────────────────────────────────────────────────┘
```

---

## Architecture Layers

### 1. Presentation Layer (UI)

**Location**: `src/ui/`

**Responsibility**: User interaction and visual feedback

**Components**:
- `ChatInterface`: Main orchestrator component
- `ChatHistory`: Message display with markdown rendering
- `ChatInput`: User input handling
- `ConfirmationDialog`: User confirmation for actions
- `DiffRenderer`: Visual diff display
- `LoadingSpinner`: Processing indicator
- `ApiKeyInput`: Secure API key entry
- `ModelSelection`: Model chooser

**Technology**: React 17 + Ink 3

**Key Features**:
- Real-time streaming response rendering
- Markdown and code syntax highlighting
- Interactive confirmations with previews
- Token counting display
- Processing timer

### 2. Application Layer (Agent)

**Location**: `src/agent/`

**Responsibility**: Core business logic and orchestration

**Main Class**: `GrokAgent`

```typescript
class GrokAgent {
  processMessage(message: string): AsyncIterator<AgentEvent>
  handleToolCalls(toolCalls: ToolCall[]): Promise<ToolResult[]>
  streamResponse(messages: Message[]): AsyncIterator<Chunk>
}
```

**Responsibilities**:
- Message processing and routing
- Tool call orchestration
- Conversation history management
- Streaming coordination
- Error handling and recovery

**Key Features**:
- Agentic loop (max 30 rounds)
- Abort controller for cancellation
- Token counting integration
- Custom instructions support

### 3. API Layer (Grok Client)

**Location**: `src/grok/`

**Responsibility**: Communication with Grok API

**Components**:
- `GrokClient`: OpenAI SDK wrapper
- `tools.ts`: Tool definitions and schemas

**Configuration**:
- Base URL support for different providers
- Streaming support
- Timeout handling (360s)
- Search parameters integration

### 4. Tool Layer

**Location**: `src/tools/`

**Responsibility**: Implement specific capabilities

**Tools**:

#### view_file
- File viewing with line ranges
- Directory listing
- Auto-limiting for large files

#### create_file
- New file creation
- Automatic parent directory creation
- Confirmation required

#### str_replace_editor
- Text replacement with fuzzy matching
- Multi-line function matching
- Diff generation
- Replace all support

#### bash
- Shell command execution
- Persistent cd support
- Configurable timeout
- Output buffering

#### search
- Unified text and file search
- ripgrep backend
- Glob patterns and regex
- Fuzzy file scoring

#### create_todo_list / update_todo_list
- Visual task tracking
- Status and priority management
- Colored output

### 5. Utility Layer

**Location**: `src/utils/`

**Responsibility**: Cross-cutting concerns and services

**Modules**:

#### ConfirmationService (Singleton)
```typescript
class ConfirmationService extends EventEmitter {
  requestConfirmation(operation: Operation): Promise<boolean>
  setAutoApprove(enabled: boolean): void
  reset(): void
}
```

#### PathValidator
```typescript
validatePath(inputPath: string, workingDir: string): string
validateFilePath(path: string, workingDir: string): Promise<string>
isPathSafe(path: string, workingDir: string): boolean
```

#### CommandValidator
```typescript
validateCommand(command: string, config: Config): string
sanitizeCommandArgs(args: string[]): string
isCommandSafe(command: string): boolean
```

#### Settings
```typescript
loadUserSettings(): Promise<UserSettings>
loadProjectSettings(): Promise<ProjectSettings>
saveSettings(settings: Settings): Promise<void>
```

#### TokenCounter
```typescript
countTokens(text: string): number
```

---

## Core Components

### GrokAgent (src/agent/grok-agent.ts)

**Design**: Event-driven async iterator pattern

**State Management**:
```typescript
interface AgentState {
  messages: Message[];
  toolCallHistory: ToolCall[];
  tokenCount: number;
  round: number;
}
```

**Event Types**:
- `message_start`: AI starts responding
- `message_chunk`: Streaming chunk received
- `message_complete`: AI response complete
- `tool_call`: Tool execution requested
- `tool_result`: Tool execution complete
- `error`: Error occurred

**Agentic Loop**:
```
1. User sends message
2. AI processes message
3. If tool calls → Execute tools → Send results back to AI
4. Repeat step 3 up to 30 times
5. AI provides final response
6. Return to user
```

**Key Methods**:

```typescript
async *processMessage(message: string): AsyncIterator<AgentEvent> {
  // 1. Add user message to history
  // 2. Stream AI response
  // 3. Handle tool calls in loop
  // 4. Yield events for UI
  // 5. Return final response
}
```

### ConfirmationService (src/utils/confirmation-service.ts)

**Pattern**: Singleton + Event Emitter

**Purpose**: Centralize user confirmations for destructive operations

**Workflow**:
```
Tool wants to execute → Request confirmation →
Event emitted → UI shows dialog →
User approves/rejects → Promise resolves →
Tool proceeds/aborts
```

**Session Management**:
- Per-session approval flags
- "Don't ask again" support
- Auto-approve mode for headless

**Security Features**:
- Preview content before approval
- Reason capture for rejections
- VS Code integration attempt

### Tool System

**Interface**:
```typescript
interface Tool {
  name: string;
  description: string;
  parameters: JSONSchema;
  execute(args: ToolArgs): Promise<ToolResult>;
}
```

**Execution Flow**:
```
1. AI requests tool call
2. Agent validates tool exists
3. Confirmation requested (if needed)
4. Tool executes with validated args
5. Result returned to AI
6. History updated
```

**Error Handling**:
- Structured error messages
- Stack trace capture
- User-friendly formatting
- Recovery suggestions

---

## Design Patterns

### 1. Singleton Pattern

**Used in**:
- `ConfirmationService`
- `Settings` management

**Rationale**: Ensure single source of truth for global state

```typescript
class ConfirmationService {
  private static instance: ConfirmationService;

  static getInstance(): ConfirmationService {
    if (!this.instance) {
      this.instance = new ConfirmationService();
    }
    return this.instance;
  }
}
```

### 2. Observer Pattern

**Used in**:
- Event system (`EventEmitter`)
- Confirmation flow
- UI updates

**Rationale**: Decouple components and enable reactive updates

```typescript
confirmationService.on('confirmation-needed', (operation) => {
  showDialog(operation);
});
```

### 3. Strategy Pattern

**Used in**:
- Tool implementations
- Search backends (ripgrep vs fuzzy)

**Rationale**: Swap algorithms without changing interface

```typescript
interface SearchStrategy {
  search(pattern: string, options: Options): Promise<Results>;
}

class RipgrepSearch implements SearchStrategy {
  // Fast text search
}

class FuzzyFileSearch implements SearchStrategy {
  // File name matching
}
```

### 4. Iterator Pattern

**Used in**:
- Streaming responses (`AsyncIterator`)
- Message processing

**Rationale**: Handle asynchronous data streams elegantly

```typescript
async *streamResponse(): AsyncIterator<Chunk> {
  for await (const chunk of apiStream) {
    yield chunk;
  }
}
```

### 5. Factory Pattern

**Used in**:
- Tool creation
- Message construction

**Rationale**: Centralize object creation logic

```typescript
function createToolCall(name: string, args: Args): ToolCall {
  return {
    id: generateId(),
    type: 'function',
    function: { name, arguments: JSON.stringify(args) }
  };
}
```

---

## Data Flow

### Message Processing Flow

```
User Input
    │
    ▼
ChatInterface
    │
    ▼
GrokAgent.processMessage()
    │
    ├─▶ Add to conversation history
    │
    ├─▶ GrokClient.streamChat()
    │       │
    │       ▼
    │   Grok API (streaming)
    │       │
    │       ▼
    │   Stream chunks back
    │
    ├─▶ Parse tool calls
    │
    ├─▶ For each tool call:
    │       │
    │       ├─▶ ConfirmationService
    │       │       │
    │       │       ├─▶ UI Dialog
    │       │       │       │
    │       │       │       ▼
    │       │       │   User approval
    │       │       │
    │       │       ▼
    │       │   Approved/Rejected
    │       │
    │       ├─▶ Tool.execute()
    │       │       │
    │       │       ├─▶ Path/Command validation
    │       │       │
    │       │       ├─▶ File system / Shell
    │       │       │
    │       │       ▼
    │       │   Return result
    │       │
    │       ▼
    │   Add tool result to history
    │
    ├─▶ Send tool results to API
    │
    ▼
Final Response
    │
    ▼
Display to User
```

### Settings Resolution

```
1. Check CLI arguments (--api-key, --model, etc.)
   │
   ▼
2. Check environment variables (GROK_API_KEY, etc.)
   │
   ▼
3. Check project settings (.grok/settings.json)
   │
   ▼
4. Check user settings (~/.grok/user-settings.json)
   │
   ▼
5. Use defaults or prompt user
```

---

## Security Architecture

### Defense in Depth

**Layer 1: Input Validation**
- Path validation (prevent traversal)
- Command validation (whitelist/blacklist)
- Argument sanitization

**Layer 2: Confirmation System**
- User approval required for destructive ops
- Preview before execution
- Session-based approvals

**Layer 3: Sandboxing**
- Working directory restrictions
- Sensitive file blacklist
- Command timeout limits

**Layer 4: Monitoring**
- Operation history tracking
- Error logging
- Security event capture

### Path Validation

```typescript
// Block: ../../../etc/passwd
// Block: /etc/passwd
// Block: .env, credentials.json
// Block: .ssh/id_rsa
// Allow: src/index.ts
// Allow: ./config.json
```

### Command Validation

```typescript
// Whitelist mode (strict):
const ALLOWED = ['ls', 'git', 'npm', 'cat', ...];

// Blacklist mode (default):
const DANGEROUS = [
  /rm\s+-rf\s+\//,  // rm -rf /
  /:\(\)\{/,         // Fork bomb
  /curl.*\|\s*sh/,   // Pipe to shell
];
```

---

## Technology Stack

### Core Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `typescript` | 4.9.5 | Type safety |
| `react` | 17.0.2 | UI framework |
| `ink` | 3.2.0 | Terminal UI |
| `commander` | 11.1.0 | CLI parsing |
| `openai` | 5.10.1 | API client |
| `tiktoken` | 1.0.21 | Token counting |
| `ripgrep-node` | 1.0.0 | Fast search |
| `fs-extra` | 11.1.1 | File operations |

### Development Dependencies

| Package | Purpose |
|---------|---------|
| `vitest` | Testing framework |
| `prettier` | Code formatting |
| `eslint` | Linting |
| `husky` | Git hooks |
| `lint-staged` | Pre-commit checks |
| `@commitlint` | Commit message validation |

---

## Extension Points

### Adding a New Tool

1. **Define tool schema** in `src/grok/tools.ts`:
```typescript
{
  name: 'my_tool',
  description: 'Tool description',
  parameters: {
    type: 'object',
    properties: {
      param1: { type: 'string' }
    }
  }
}
```

2. **Implement tool** in `src/tools/my-tool.ts`:
```typescript
export async function executeTool(args: Args): Promise<Result> {
  // Validate args
  // Request confirmation if needed
  // Execute operation
  // Return result
}
```

3. **Register in agent** in `src/agent/grok-agent.ts`:
```typescript
case 'my_tool':
  return await executeMyTool(args);
```

### Adding a New UI Component

1. Create component in `src/ui/components/`:
```typescript
export const MyComponent: React.FC<Props> = (props) => {
  return <Box>...</Box>;
};
```

2. Use in `ChatInterface`:
```typescript
<MyComponent {...props} />
```

### Supporting a New Model

1. Add model to default list
2. Update base URL if needed
3. Test streaming compatibility
4. Update documentation

---

## Performance Considerations

### Optimizations Implemented

1. **Streaming**: Incremental response rendering
2. **ripgrep**: Sub-second search performance
3. **Lazy Loading**: Components loaded on demand
4. **Token Counting**: Cached calculations
5. **Fuzzy Matching**: Optimized algorithms

### Performance Limits

```typescript
const LIMITS = {
  MAX_TOOL_ROUNDS: 30,        // Prevent infinite loops
  API_TIMEOUT: 360_000,       // 360 seconds
  BASH_TIMEOUT: 30_000,       // 30 seconds
  BASH_BUFFER: 1_048_576,     // 1MB
  MAX_HISTORY: 100,           // Messages
};
```

---

## Future Architecture Considerations

### Planned Improvements

1. **Plugin System**
   - Dynamic tool loading
   - Third-party extensions
   - Plugin marketplace

2. **Workspace Awareness**
   - Git branch context
   - Project type detection
   - Auto-configuration

3. **Advanced Caching**
   - Response caching
   - Tool result caching
   - Prompt template caching

4. **Multi-Agent Support**
   - Parallel agent execution
   - Agent specialization
   - Agent communication

---

## Diagrams

### Component Dependency Graph

```
index.ts
    │
    ├─▶ ChatInterface
    │       │
    │       ├─▶ ChatHistory
    │       ├─▶ ChatInput
    │       ├─▶ ConfirmationDialog
    │       └─▶ DiffRenderer
    │
    └─▶ GrokAgent
            │
            ├─▶ GrokClient
            │
            ├─▶ ConfirmationService
            │
            └─▶ Tools
                    │
                    ├─▶ PathValidator
                    ├─▶ CommandValidator
                    └─▶ FileOperations
```

---

## Conclusion

Grok CLI's architecture prioritizes:
- **Modularity**: Clear separation of concerns
- **Security**: Multiple validation layers
- **Extensibility**: Easy to add new tools and features
- **User Experience**: Responsive UI with visual feedback
- **Reliability**: Comprehensive error handling

For questions or clarifications, please open an issue on GitHub.
