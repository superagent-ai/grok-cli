# QuietEnable CLI

A conversational AI CLI tool powered by GPT-5 with Grok fallback and intelligent text editor capabilities.

<img width="980" height="435" alt="Screenshot 2025-07-21 at 13 35 41" src="https://github.com/user-attachments/assets/192402e3-30a8-47df-9fc8-a084c5696e78" />

## Features

- **🤖 Conversational AI**: Natural language interface powered by GPT-5
- **📝 Smart File Operations**: AI automatically uses tools to view, create, and edit files
- **⚡ Bash Integration**: Execute shell commands through natural conversation
- **🔧 Automatic Tool Selection**: AI intelligently chooses the right tools for your requests
- **🚀 Morph Fast Apply**: Optional high-speed code editing at 4,500+ tokens/sec with 98% accuracy
- **🔌 MCP Tools**: Extend capabilities with Model Context Protocol servers (Linear, GitHub, etc.)
- **💬 Interactive UI**: Beautiful terminal interface built with Ink
- **🌍 Global Installation**: Install and use anywhere with `npm i -g quietenable`

## Installation

### Prerequisites
- Node.js 16+ 
- OpenAI API key
- (Optional, Recommended) Morph API key for Fast Apply editing

### Global Installation (Recommended)
```bash
npm install -g quietenable
```

### Local Development
```bash
git clone <repository>
cd quietenable
npm install
npm run build
npm link
```

## Setup

1. Get your OpenAI API key from [OpenAI](https://platform.openai.com)

2. Set up your API key (choose one method):

**Method 1: Environment Variable**
```bash
export QUIETENABLE_API_KEY=your_api_key_here
```

**Method 2: .env File**
```bash
cp .env.example .env
# Edit .env and add your API key
```

**Method 3: Command Line Flag**
```bash
quietenable --api-key your_api_key_here
```

**Method 4: User Settings File**
Create `~/.quietenable/user-settings.json`:
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

By default, the CLI uses `https://api.openai.com/v1` as the QuietEnable API endpoint. You can configure a custom endpoint if needed (choose one method):

**Method 1: Environment Variable**
```bash
export QUIETENABLE_BASE_URL=https://your-custom-endpoint.com/v1
```

**Method 2: Command Line Flag**
```bash
quietenable --api-key your_api_key_here --base-url https://your-custom-endpoint.com/v1
```

**Method 3: User Settings File**
Add to `~/.quietenable/user-settings.json`:
```json
{
  "apiKey": "your_api_key_here",
  "baseURL": "https://your-custom-endpoint.com/v1"
}
```

## Configuration Files

QuietEnable uses two types of configuration files to manage settings:

### User-Level Settings (`~/.quietenable/user-settings.json`)

This file stores **global settings** that apply across all projects. These settings rarely change and include:

- **API Key**: Your OpenAI API key
- **Base URL**: Custom API endpoint (if needed)
- **Default Model**: Your preferred model (e.g., `gpt-5`)
- **Available Models**: List of models you can use

**Example:**
```json
{
  "apiKey": "your_api_key_here",
  "baseURL": "https://api.openai.com/v1",
  "defaultModel": "gpt-5",
  "models": [
    "gpt-5",
    "grok-4-latest",
    "grok-3-latest",
    "grok-3-fast",
    "grok-3-mini-fast"
  ]
}
```

### Project-Level Settings (`.quietenable/settings.json`)

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
4. **Fallback Logic**: Project model → User default model → System default (`gpt-5`)

This means you can have different models for different projects while maintaining consistent global settings like your API key.

### Using Other API Providers

**Important**: QuietEnable uses **OpenAI-compatible APIs**. It defaults to OpenAI's endpoint but can target any provider that implements the chat completions standard.

**Popular Providers**:
- **OpenAI**: `https://api.openai.com/v1` (default)
- **X.AI (Grok)**: `https://api.x.ai/v1`
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
quietenable
```

Or specify a working directory:
```bash
quietenable -d /path/to/project
```

### Headless Mode

Process a single prompt and exit (useful for scripting and automation):
```bash
quietenable --prompt "show me the package.json file"
quietenable -p "create a new file called example.js with a hello world function"
quietenable --prompt "run npm test and show me the results" --directory /path/to/project
quietenable --prompt "complex task" --max-tool-rounds 50  # Limit tool usage for faster execution
```

This mode is particularly useful for:
- **CI/CD pipelines**: Automate code analysis and file operations
- **Scripting**: Integrate AI assistance into shell scripts
- **Terminal benchmarks**: Perfect for tools like Terminal Bench that need non-interactive execution
- **Batch processing**: Process multiple prompts programmatically

### Tool Execution Control

By default, QuietEnable allows up to 400 tool execution rounds to handle complex multi-step tasks. You can control this behavior:

```bash
# Limit tool rounds for faster execution on simple tasks
quietenable --max-tool-rounds 10 --prompt "show me the current directory"

# Increase limit for very complex tasks (use with caution)
quietenable --max-tool-rounds 1000 --prompt "comprehensive code refactoring"

# Works with all modes
quietenable --max-tool-rounds 20  # Interactive mode
quietenable git commit-and-push --max-tool-rounds 30  # Git commands
```

**Use Cases**:
- **Fast responses**: Lower limits (10-50) for simple queries
- **Complex automation**: Higher limits (500+) for comprehensive tasks
- **Resource control**: Prevent runaway executions in automated environments

### Model Selection

You can specify which AI model to use with the `--model` parameter or `QUIETENABLE_MODEL` environment variable:

**Method 1: Command Line Flag**
```bash
# Use GPT-5 (default)
quietenable --model gpt-5

# Use Grok models (requires X.AI endpoint)
quietenable --model grok-4-latest --base-url https://api.x.ai/v1
quietenable --model grok-3-latest --base-url https://api.x.ai/v1
quietenable --model grok-3-fast --base-url https://api.x.ai/v1

# Use other models (with appropriate API endpoint)
quietenable --model gemini-2.5-pro --base-url https://api-endpoint.com/v1
quietenable --model claude-sonnet-4-20250514 --base-url https://api-endpoint.com/v1
```

**Method 2: Environment Variable**
```bash
export QUIETENABLE_MODEL=gpt-5
quietenable
```

**Method 3: User Settings File**
Add to `~/.quietenable/user-settings.json`:
```json
{
  "apiKey": "your_api_key_here",
  "defaultModel": "gpt-5"
}
```

**Model Priority**: `--model` flag > `QUIETENABLE_MODEL` environment variable > user default model > system default (gpt-5)

### Response Controls

GPT-5 allows tuning responses for cost and accuracy. QuietEnable exposes two knobs:

- `QUIETENABLE_VERBOSITY`: `low`, `medium`, or `high` (default: `medium`)
- `QUIETENABLE_REASONING_EFFORT`: `minimal`, `low`, `medium`, or `high` (default: `medium`)

Set them as environment variables:

```bash
export QUIETENABLE_VERBOSITY=low
export QUIETENABLE_REASONING_EFFORT=minimal
```

or provide them via CLI flags:

```bash
quietenable --verbosity high --reasoning-effort high
```

### Command Line Options

```bash
quietenable [options]

Options:
  -V, --version          output the version number
  -d, --directory <dir>  set working directory
  -k, --api-key <key>    OpenAI API key (or set QUIETENABLE_API_KEY env var)
  -u, --base-url <url>   QuietEnable API base URL (or set QUIETENABLE_BASE_URL env var)
  -m, --model <model>    AI model to use (e.g., gpt-5, grok-4-latest) (or set QUIETENABLE_MODEL env var)
  -p, --prompt <prompt>  process a single prompt and exit (headless mode)
  --max-tool-rounds <rounds>  maximum number of tool execution rounds (default: 400)
  --verbosity <level>        response verbosity: low, medium, or high
  --reasoning-effort <level> reasoning effort: minimal, low, medium, or high
  -h, --help             display help for command
```

### Custom Instructions

You can provide custom instructions to tailor QuietEnable's behavior to your project by creating a `.quietenable/QUIETENABLE.md` file in your project directory:

```bash
mkdir .quietenable
```

Create `.quietenable/QUIETENABLE.md` with your custom instructions:
```markdown
# Custom Instructions for QuietEnable

Always use TypeScript for any new code files.
When creating React components, use functional components with hooks.
Prefer const assertions and explicit typing over inference where it improves clarity.
Always add JSDoc comments for public functions and interfaces.
Follow the existing code style and patterns in this project.
```

QuietEnable will automatically load and follow these instructions when working in your project directory. The custom instructions are added to QuietEnable's system prompt and take priority over default behavior.

## Morph Fast Apply (Optional)

QuietEnable supports Morph's Fast Apply model for high-speed code editing at **4,500+ tokens/sec with 98% accuracy**. This is an optional feature that provides lightning-fast file editing capabilities.

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
quietenable --prompt "refactor this function to use async/await and add error handling"
quietenable -p "convert this class to TypeScript and add proper type annotations"
```

The AI will automatically choose between `edit_file` (Morph) for complex changes or `str_replace_editor` for simple replacements.

## MCP Tools

QuietEnable supports MCP (Model Context Protocol) servers, allowing you to extend the AI assistant with additional tools and capabilities.

### Adding MCP Tools

#### Add a custom MCP server:
```bash
# Add an stdio-based MCP server
quietenable mcp add my-server --transport stdio --command "node" --args server.js

# Add an HTTP-based MCP server
quietenable mcp add my-server --transport http --url "http://localhost:3000"

# Add with environment variables
quietenable mcp add my-server --transport stdio --command "python" --args "-m" "my_mcp_server" --env "API_KEY=your_key"
```

#### Add from JSON configuration:
```bash
quietenable mcp add-json my-server '{"command": "node", "args": ["server.js"], "env": {"API_KEY": "your_key"}}'
```

### Linear Integration Example

To add Linear MCP tools for project management:

```bash
# Add Linear MCP server
quietenable mcp add linear --transport sse --url "https://mcp.linear.app/sse"
```

This enables Linear tools like:
- Create and manage Linear issues
- Search and filter issues
- Update issue status and assignees
- Access team and project information

### Managing MCP Servers

```bash
# List all configured servers
quietenable mcp list

# Test server connection
quietenable mcp test server-name

# Remove a server
quietenable mcp remove server-name
```

### Available Transport Types

- **stdio**: Run MCP server as a subprocess (most common)
- **http**: Connect to HTTP-based MCP server
- **sse**: Connect via Server-Sent Events

## Development

```bash
# Install dependencies
npm install

# Development mode
npm run dev

# Build project
npm run build

# Run linter
npm run lint

# Type check
npm run typecheck
```

## Architecture

- **Agent**: Core command processing and execution logic
- **Tools**: Text editor and bash tool implementations
- **UI**: Ink-based terminal interface components
- **Types**: TypeScript definitions for the entire system

## License

MIT
