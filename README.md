# SuperGrok-CLI

**Enterprise-grade agentic coding platform** - A conversational AI CLI tool that synthesizes the best patterns from top open-source frameworks (Aider, Cline, Continue, Copilot, Goose) with intelligent text editor capabilities and tool usage.

**Repository:** [manutej/supergrok-cli](https://github.com/manutej/supergrok-cli)

<img width="980" height="435" alt="Screenshot 2025-07-21 at 13 35 41" src="https://github.com/user-attachments/assets/192402e3-30a8-47df-9fc8-a084c5696e78" />

## Features

- **🤖 Conversational AI**: Natural language interface powered by any LLM (Grok, Claude, GPT, local models)
- **🎭 Multi-Agent Orchestration**: NEW! Intelligent task decomposition with dual-account management for 2x speed
- **📝 Smart File Operations**: AI automatically uses tools to view, create, and edit files
- **⚡ Bash Integration**: Execute shell commands through natural conversation
- **🔧 Automatic Tool Selection**: AI intelligently chooses the right tools for your requests
- **🚀 Morph Fast Apply**: Optional high-speed code editing at 4,500+ tokens/sec with 98% accuracy
- **🔌 MCP Tools**: Extend capabilities with Model Context Protocol servers (Linear, GitHub, etc.)
- **💬 Interactive UI**: Beautiful terminal interface built with Ink
- **🌍 Global Installation**: Install and use anywhere with `bun add -g @manutej/supergrok-cli`
- **🎯 Multi-Mode System**: Plan, Act, Architect, Review, and Chat modes (v2.0)
- **🔐 Enterprise Ready**: RBAC, audit logs, compliance (SOC2/GDPR/HIPAA) - v2.0

## Installation

### Prerequisites
- Bun 1.0+ (or Node.js 18+ as fallback)
- Grok API key from X.AI
- (Optional, Recommended) Morph API key for Fast Apply editing

### Global Installation (Recommended)
```bash
bun add -g @manutej/supergrok-cli
```

Or with npm (fallback):
```bash
npm install -g @manutej/supergrok-cli
```

### Local Development
```bash
git clone https://github.com/manutej/supergrok-cli.git
cd supergrok-cli
bun install
bun run build
bun link
```

## Setup

1. Get your Grok API key from [X.AI](https://x.ai)

2. Set up your API key (choose one method):

**Method 1: Environment Variable**
```bash
export GROK_API_KEY=your_api_key_here
```

**Method 2: .env File**
```bash
cp .env.example .env
# Edit .env and add your API key
```

**Method 3: Command Line Flag**
```bash
grok --api-key your_api_key_here
```

**Method 4: User Settings File**
Create `~/.grok/user-settings.json`:
```json
{
  "apiKey": "your_api_key_here"
}
```

3. (Optional, Recommended) Get your Morph API key from [Morph Dashboard](https://morphllm.com/dashboard/api-keys)

4. Set up your Morph API key for Fast Apply editing (choose one method):

**Method 1: Environment Variable**
```bash
export MORPH_API_KEY=your_morph_api_key_here
```

**Method 2: .env File**
```bash
# Add to your .env file
MORPH_API_KEY=your_morph_api_key_here
```

### Custom Base URL (Optional)

By default, the CLI uses `https://api.x.ai/v1` as the Grok API endpoint. You can configure a custom endpoint if needed (choose one method):

**Method 1: Environment Variable**
```bash
export GROK_BASE_URL=https://your-custom-endpoint.com/v1
```

**Method 2: Command Line Flag**
```bash
grok --api-key your_api_key_here --base-url https://your-custom-endpoint.com/v1
```

**Method 3: User Settings File**
Add to `~/.grok/user-settings.json`:
```json
{
  "apiKey": "your_api_key_here",
  "baseURL": "https://your-custom-endpoint.com/v1"
}
```

## Configuration Files

Grok CLI uses two types of configuration files to manage settings:

### User-Level Settings (`~/.grok/user-settings.json`)

This file stores **global settings** that apply across all projects. These settings rarely change and include:

- **API Key**: Your Grok API key
- **Base URL**: Custom API endpoint (if needed)
- **Default Model**: Your preferred model (e.g., `grok-code-fast-1`)
- **Available Models**: List of models you can use

**Example:**
```json
{
  "apiKey": "your_api_key_here",
  "baseURL": "https://api.x.ai/v1",
  "defaultModel": "grok-code-fast-1",
  "models": [
    "grok-code-fast-1",
    "grok-4-latest",
    "grok-3-latest",
    "grok-3-fast",
    "grok-3-mini-fast"
  ]
}
```

### Project-Level Settings (`.grok/settings.json`)

This file stores **project-specific settings** in your current working directory. It includes:

- **Current Model**: The model currently in use for this project
- **MCP Servers**: Model Context Protocol server configurations

**Example:**
```json
{
  "model": "grok-3-fast",
  "mcpServers": {
    "linear": {
      "name": "linear",
      "transport": "stdio",
      "command": "npx",
      "args": ["@linear/mcp-server"]
    }
  }
}
```

### How It Works

1. **Global Defaults**: User-level settings provide your default preferences
2. **Project Override**: Project-level settings override defaults for specific projects
3. **Directory-Specific**: When you change directories, project settings are loaded automatically
4. **Fallback Logic**: Project model → User default model → System default (`grok-code-fast-1`)

This means you can have different models for different projects while maintaining consistent global settings like your API key.

### Using Other API Providers

**Important**: Grok CLI uses **OpenAI-compatible APIs**. You can use any provider that implements the OpenAI chat completions standard.

**Popular Providers**:
- **X.AI (Grok)**: `https://api.x.ai/v1` (default)
- **OpenAI**: `https://api.openai.com/v1`
- **OpenRouter**: `https://openrouter.ai/api/v1`
- **Groq**: `https://api.groq.com/openai/v1`

**Example with OpenRouter**:
```json
{
  "apiKey": "your_openrouter_key",
  "baseURL": "https://openrouter.ai/api/v1",
  "defaultModel": "anthropic/claude-3.5-sonnet",
  "models": [
    "anthropic/claude-3.5-sonnet",
    "openai/gpt-4o",
    "meta-llama/llama-3.1-70b-instruct"
  ]
}
```

## Usage

### Interactive Mode

Start the conversational AI assistant:
```bash
grok
```

Or specify a working directory:
```bash
grok -d /path/to/project
```

### Headless Mode

Process a single prompt and exit (useful for scripting and automation):
```bash
grok --prompt "show me the package.json file"
grok -p "create a new file called example.js with a hello world function"
grok --prompt "run bun test and show me the results" --directory /path/to/project
grok --prompt "complex task" --max-tool-rounds 50  # Limit tool usage for faster execution
```

This mode is particularly useful for:
- **CI/CD pipelines**: Automate code analysis and file operations
- **Scripting**: Integrate AI assistance into shell scripts
- **Terminal benchmarks**: Perfect for tools like Terminal Bench that need non-interactive execution
- **Batch processing**: Process multiple prompts programmatically

### Tool Execution Control

By default, Grok CLI allows up to 400 tool execution rounds to handle complex multi-step tasks. You can control this behavior:

```bash
# Limit tool rounds for faster execution on simple tasks
grok --max-tool-rounds 10 --prompt "show me the current directory"

# Increase limit for very complex tasks (use with caution)
grok --max-tool-rounds 1000 --prompt "comprehensive code refactoring"

# Works with all modes
grok --max-tool-rounds 20  # Interactive mode
grok git commit-and-push --max-tool-rounds 30  # Git commands
```

**Use Cases**:
- **Fast responses**: Lower limits (10-50) for simple queries
- **Complex automation**: Higher limits (500+) for comprehensive tasks
- **Resource control**: Prevent runaway executions in automated environments

### Model Selection

You can specify which AI model to use with the `--model` parameter or `GROK_MODEL` environment variable:

**Method 1: Command Line Flag**
```bash
# Use Grok models
grok --model grok-code-fast-1
grok --model grok-4-latest
grok --model grok-3-latest
grok --model grok-3-fast

# Use other models (with appropriate API endpoint)
grok --model gemini-2.5-pro --base-url https://api-endpoint.com/v1
grok --model claude-sonnet-4-20250514 --base-url https://api-endpoint.com/v1
```

**Method 2: Environment Variable**
```bash
export GROK_MODEL=grok-code-fast-1
grok
```

**Method 3: User Settings File**
Add to `~/.grok/user-settings.json`:
```json
{
  "apiKey": "your_api_key_here",
  "defaultModel": "grok-code-fast-1"
}
```

**Model Priority**: `--model` flag > `GROK_MODEL` environment variable > user default model > system default (grok-code-fast-1)

### Command Line Options

```bash
grok [options]

Options:
  -V, --version          output the version number
  -d, --directory <dir>  set working directory
  -k, --api-key <key>    Grok API key (or set GROK_API_KEY env var)
  -u, --base-url <url>   Grok API base URL (or set GROK_BASE_URL env var)
  -m, --model <model>    AI model to use (e.g., grok-code-fast-1, grok-4-latest) (or set GROK_MODEL env var)
  -p, --prompt <prompt>  process a single prompt and exit (headless mode)
  --max-tool-rounds <rounds>  maximum number of tool execution rounds (default: 400)
  -h, --help             display help for command
```

### Custom Instructions

You can provide custom instructions to tailor Grok's behavior to your project by creating a `.grok/GROK.md` file in your project directory:

```bash
mkdir .grok
```

Create `.grok/GROK.md` with your custom instructions:
```markdown
# Custom Instructions for Grok CLI

Always use TypeScript for any new code files.
When creating React components, use functional components with hooks.
Prefer const assertions and explicit typing over inference where it improves clarity.
Always add JSDoc comments for public functions and interfaces.
Follow the existing code style and patterns in this project.
```

Grok will automatically load and follow these instructions when working in your project directory. The custom instructions are added to Grok's system prompt and take priority over default behavior.

## Morph Fast Apply (Optional)

Grok CLI supports Morph's Fast Apply model for high-speed code editing at **4,500+ tokens/sec with 98% accuracy**. This is an optional feature that provides lightning-fast file editing capabilities.

**Setup**: Configure your Morph API key following the [setup instructions](#setup) above.

### How It Works

When `MORPH_API_KEY` is configured:
- **`edit_file` tool becomes available** alongside the standard `str_replace_editor`
- **Optimized for complex edits**: Use for multi-line changes, refactoring, and large modifications
- **Intelligent editing**: Uses abbreviated edit format with `// ... existing code ...` comments
- **Fallback support**: Standard tools remain available if Morph is unavailable

**When to use each tool:**
- **`edit_file`** (Morph): Complex edits, refactoring, multi-line changes
- **`str_replace_editor`**: Simple text replacements, single-line edits

### Example Usage

With Morph Fast Apply configured, you can request complex code changes:

```bash
grok --prompt "refactor this function to use async/await and add error handling"
grok -p "convert this class to TypeScript and add proper type annotations"
```

The AI will automatically choose between `edit_file` (Morph) for complex changes or `str_replace_editor` for simple replacements.

## MCP Tools

Grok CLI supports MCP (Model Context Protocol) servers, allowing you to extend the AI assistant with additional tools and capabilities.

### Adding MCP Tools

#### Add a custom MCP server:
```bash
# Add an stdio-based MCP server
grok mcp add my-server --transport stdio --command "bun" --args server.js

# Add an HTTP-based MCP server
grok mcp add my-server --transport http --url "http://localhost:3000"

# Add with environment variables
grok mcp add my-server --transport stdio --command "python" --args "-m" "my_mcp_server" --env "API_KEY=your_key"
```

#### Add from JSON configuration:
```bash
grok mcp add-json my-server '{"command": "bun", "args": ["server.js"], "env": {"API_KEY": "your_key"}}'
```

### Linear Integration Example

To add Linear MCP tools for project management:

```bash
# Add Linear MCP server
grok mcp add linear --transport sse --url "https://mcp.linear.app/sse"
```

This enables Linear tools like:
- Create and manage Linear issues
- Search and filter issues
- Update issue status and assignees
- Access team and project information

### Managing MCP Servers

```bash
# List all configured servers
grok mcp list

# Test server connection
grok mcp test server-name

# Remove a server
grok mcp remove server-name
```

### Available Transport Types

- **stdio**: Run MCP server as a subprocess (most common)
- **http**: Connect to HTTP-based MCP server
- **sse**: Connect via Server-Sent Events

## Multi-Agent Orchestration System 🎭

**NEW in v2.0!** Maximize your SuperGrok Heavy subscriptions with intelligent multi-agent task orchestration.

### Overview

The multi-agent orchestration system automatically breaks down complex tasks into 3-5 sub-tasks and executes them intelligently across multiple API keys for maximum speed and cost efficiency.

![Orchestration Architecture](docs/diagrams/orchestration-architecture.mmd)

### Quick Start

```bash
# Configure two API keys for dual-account orchestration
export GROK_API_KEY=xai-key-1
export GROK_API_KEY_2=xai-key-2

# Run a complex task with automatic orchestration
grok orchestrate run "Build a REST API with authentication" \
  --strategy adaptive \
  --save-doc
```

### Key Features

- **👥 Dual-Account Management**: Intelligent load balancing across 2 API keys
- **🧠 Smart Task Decomposition**: Automatically breaks tasks into optimal sub-tasks using `grok-3-fast`
- **⚡ Parallel Execution**: Execute independent sub-tasks concurrently for 2x speed
- **💰 Cost Optimization**: Automatic model selection based on task complexity:
  - Simple tasks → `grok-code-fast-1` ($0.005/1K tokens)
  - Medium tasks → `grok-3-fast` ($0.008/1K tokens)
  - Complex tasks → `grok-4` ($0.015/1K tokens)
- **📊 Real-time Tracking**: Monitor requests, tokens, and costs per account
- **💾 Persistent Storage**: SQLite database at `~/.supergrok/orchestration.db`
- **📚 Prompt Library**: 8 pre-loaded templates (code-review, bug-fix, refactor, etc.)

### Load Balancing Strategies

Choose from three intelligent strategies:

1. **Round-Robin** (default): Evenly distribute requests across accounts
   ```bash
   grok orchestrate run "..." --load-balancing round-robin
   ```

2. **Least-Loaded**: Route to the account with fewer requests
   ```bash
   grok orchestrate run "..." --load-balancing least-loaded
   ```

3. **Cost-Optimized**: Minimize total cost across accounts
   ```bash
   grok orchestrate run "..." --load-balancing cost-optimized
   ```

### Execution Strategies

Choose how sub-tasks are executed:

1. **Adaptive** (default): Smart mix of parallel and sequential
   ```bash
   grok orchestrate run "..." --strategy adaptive
   ```

2. **Parallel**: Maximum speed for independent tasks
   ```bash
   grok orchestrate run "..." --strategy parallel
   ```

3. **Sequential**: Context passing between dependent tasks
   ```bash
   grok orchestrate run "..." --strategy sequential
   ```

### Commands

#### Run Orchestration

```bash
grok orchestrate run <task-description> [options]

Options:
  -c, --context <text>         Additional context for the task
  -s, --strategy <type>        parallel|sequential|adaptive (default: adaptive)
  -l, --load-balancing <type>  round-robin|least-loaded|cost-optimized
  -m, --max-subtasks <number>  Maximum sub-tasks to create (default: 5)
  --save-doc                   Save result as a document
```

#### View Statistics

```bash
grok orchestrate stats
```

#### Prompt Management

```bash
# List all prompt templates
grok orchestrate prompt list

# Show a specific template
grok orchestrate prompt show code-review

# Render template with variables
grok orchestrate prompt render bug-fix \
  --vars code="..." error="..." language="typescript"
```

#### Document Management

```bash
# List saved documents
grok orchestrate docs --limit 10
```

### Example Use Cases

**1. Parallel Feature Development**
```bash
grok orchestrate run "Implement user auth, profile management, and notifications" \
  --strategy parallel \
  --max-subtasks 3
```

**2. Code Review**
```bash
grok orchestrate run "Review this TypeScript project for security issues" \
  --context "Focus on auth, input validation, and SQL injection" \
  --save-doc
```

**3. Sequential Refactoring**
```bash
grok orchestrate run "Refactor callback-based code to async/await" \
  --strategy sequential \
  --context "Maintain backward compatibility"
```

### Performance

Typical execution metrics:

| Complexity | Sub-Tasks | Strategy   | Time   | Cost    |
|------------|-----------|------------|--------|---------|
| Simple     | 3         | Parallel   | 10-15s | $0.02   |
| Medium     | 4         | Adaptive   | 20-30s | $0.05   |
| Complex    | 5         | Sequential | 40-60s | $0.10   |

### Complete Documentation

For comprehensive documentation, see:
- **[Orchestration Guide](docs/ORCHESTRATION.md)** - Complete reference
- **[Architecture Diagrams](docs/diagrams/)** - System diagrams
- **[Test Suite](tests/)** - 71 tests with full coverage

## Development

```bash
# Install dependencies
bun install

# Development mode
bun run dev

# Build project
bun run build

# Run tests
bun run test

# Run linter
bun run lint

# Type check
bun run typecheck
```

## Architecture

- **Agent**: Core command processing and execution logic
- **Tools**: Text editor and bash tool implementations
- **UI**: Ink-based terminal interface components
- **Types**: TypeScript definitions for the entire system

## License

MIT
