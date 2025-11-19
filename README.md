# AX CLI

[![npm version](https://badge.fury.io/js/%40defai.digital%2Fax-cli.svg)](https://www.npmjs.com/package/@defai.digital/ax-cli)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Tests](https://github.com/defai-digital/ax-cli/actions/workflows/test.yml/badge.svg)](https://github.com/defai-digital/ax-cli/actions/workflows/test.yml)
[![codecov](https://codecov.io/gh/defai-digital/ax-cli/branch/main/graph/badge.svg)](https://codecov.io/gh/defai-digital/ax-cli)
[![GitHub stars](https://img.shields.io/github/stars/defai-digital/ax-cli?style=social)](https://github.com/defai-digital/ax-cli/stargazers)
[![GitHub forks](https://img.shields.io/github/forks/defai-digital/ax-cli?style=social)](https://github.com/defai-digital/ax-cli/network/members)
[![GitHub issues](https://img.shields.io/github/issues/defai-digital/ax-cli)](https://github.com/defai-digital/ax-cli/issues)

> **Note**: This project is a fork of [grok-cli](https://github.com/superagent-ai/grok-cli), reimagined for offline-first LLM support.

**An offline-first AI CLI tool powered by local LLM models with intelligent text editor capabilities and multi-agent orchestration.**

Primary focus: **GLM 4.6** - Run powerful AI assistance completely offline on your local machine.

![AX CLI Logo](.github/assets/ax-cli.png)

## Features

- **🔒 Offline-First**: Run GLM 4.6 and other LLM models locally - no internet required, complete privacy
- **🚀 GLM 4.6 Support**: Optimized for GLM-4-9B-Chat and GLM-4V-9B vision models
- **🤖 Conversational AI**: Natural language interface powered by local LLMs
- **📝 Smart File Operations**: AI automatically uses tools to view, create, and edit files
- **⚡ Bash Integration**: Execute shell commands through natural conversation
- **🔧 Automatic Tool Selection**: AI intelligently chooses the right tools for your requests
- **🌐 Multi-Provider Support**: Also supports cloud providers (OpenAI, Anthropic, Grok) when needed
- **🔌 MCP Tools**: Extend capabilities with Model Context Protocol servers (Linear, GitHub, etc.)
- **💬 Interactive UI**: Beautiful terminal interface built with Ink
- **🌍 Global Installation**: Install and use anywhere with `bun add -g @defai-digital/ax-cli`

## Installation

### Prerequisites

**For Offline LLM (GLM 4.6):**
- Bun 1.0+ (or Node.js 18+ as fallback)
- [Ollama](https://ollama.ai) or [llama.cpp](https://github.com/ggerganov/llama.cpp) for running local models
- GLM-4-9B-Chat model (download via Ollama: `ollama pull glm4:9b`)
- Minimum 16GB RAM recommended for optimal performance
- GPU recommended but not required (CPU inference supported)

**For Cloud Providers (Optional):**
- API key from your preferred provider (OpenAI, Anthropic, X.AI, etc.)
- (Optional) Morph API key for Fast Apply editing

### Global Installation (Recommended)
```bash
bun add -g @defai-digital/ax-cli
```

Or with npm (fallback):
```bash
npm install -g @defai-digital/ax-cli
```

### Local Development
```bash
git clone https://github.com/defai-digital/ax-cli
cd ax-cli
bun install
bun run build
bun link
```

## Setup

### Option 1: Offline Setup with GLM 4.6 (Recommended)

**Step 1: Install Ollama**

Download and install Ollama from [ollama.ai](https://ollama.ai):

```bash
# macOS / Linux
curl -fsSL https://ollama.ai/install.sh | sh

# Windows
# Download from https://ollama.ai/download
```

**Step 2: Download GLM 4.6 Model**

```bash
# Pull the GLM-4-9B-Chat model (9B parameters, ~5GB download)
ollama pull glm4:9b

# Or for the vision-capable model
ollama pull glm4v:9b

# Verify the model is available
ollama list
```

**Step 3: Start Ollama Server**

```bash
# Ollama runs as a background service by default
# If needed, start it manually:
ollama serve
```

**Step 4: Configure AX CLI for Local GLM**

Create `~/.ax/user-settings.json`:
```json
{
  "baseURL": "http://localhost:11434/v1",
  "defaultModel": "glm4:9b",
  "models": [
    "glm4:9b",
    "glm4v:9b"
  ]
}
```

**Step 5: Test Your Setup**

```bash
ax-cli --prompt "Hello, please introduce yourself"
```

You're now running completely offline! No API keys required, no internet connection needed, complete privacy.

---

### Option 2: Cloud Provider Setup

1. Get your API key from your preferred provider:
   - [X.AI (Grok)](https://x.ai)
   - [OpenAI](https://platform.openai.com)
   - [Anthropic (Claude)](https://console.anthropic.com)

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
ax-cli --api-key your_api_key_here
```

**Method 4: User Settings File**
Create `~/.ax/user-settings.json`:
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
ax-cli --api-key your_api_key_here --base-url https://your-custom-endpoint.com/v1
```

**Method 3: User Settings File**
Add to `~/.ax/user-settings.json`:
```json
{
  "apiKey": "your_api_key_here",
  "baseURL": "https://your-custom-endpoint.com/v1"
}
```

## Configuration Files

AX CLI uses two types of configuration files to manage settings:

### User-Level Settings (`~/.ax/user-settings.json`)

This file stores **global settings** that apply across all projects. These settings rarely change and include:

- **Base URL**: API endpoint (local Ollama or cloud provider)
- **API Key**: Only needed for cloud providers
- **Default Model**: Your preferred model
- **Available Models**: List of models you can use

**Example (Offline with GLM 4.6):**
```json
{
  "baseURL": "http://localhost:11434/v1",
  "defaultModel": "glm4:9b",
  "models": [
    "glm4:9b",
    "glm4v:9b",
    "llama3.1:8b",
    "qwen2.5:7b"
  ]
}
```

**Example (Cloud Provider - Grok):**
```json
{
  "apiKey": "your_api_key_here",
  "baseURL": "https://api.x.ai/v1",
  "defaultModel": "grok-code-fast-1",
  "models": [
    "grok-code-fast-1",
    "grok-4-latest",
    "grok-3-latest"
  ]
}
```

### Project-Level Settings (`.ax/settings.json`)

This file stores **project-specific settings** in your current working directory. It includes:

- **Current Model**: The model currently in use for this project
- **MCP Servers**: Model Context Protocol server configurations

**Example (Offline GLM):**
```json
{
  "model": "glm4:9b",
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

**Example (Cloud Provider):**
```json
{
  "model": "grok-3-fast",
  "mcpServers": {}
}
```

### How It Works

1. **Global Defaults**: User-level settings provide your default preferences
2. **Project Override**: Project-level settings override defaults for specific projects
3. **Directory-Specific**: When you change directories, project settings are loaded automatically
4. **Fallback Logic**: Project model → User default model → System default (`grok-code-fast-1`)

This means you can have different models for different projects while maintaining consistent global settings like your API key.

### Using Other API Providers

**Important**: AX CLI uses **OpenAI-compatible APIs**. You can use any provider that implements the OpenAI chat completions standard.

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
ax-cli
```

Or specify a working directory:
```bash
ax-cli -d /path/to/project
```

### Headless Mode

Process a single prompt and exit (useful for scripting and automation):
```bash
ax-cli --prompt "show me the package.json file"
ax-cli -p "create a new file called example.js with a hello world function"
ax-cli --prompt "run bun test and show me the results" --directory /path/to/project
ax-cli --prompt "complex task" --max-tool-rounds 50  # Limit tool usage for faster execution
```

This mode is particularly useful for:
- **CI/CD pipelines**: Automate code analysis and file operations
- **Scripting**: Integrate AI assistance into shell scripts
- **Terminal benchmarks**: Perfect for tools like Terminal Bench that need non-interactive execution
- **Batch processing**: Process multiple prompts programmatically

### Tool Execution Control

By default, AX CLI allows up to 400 tool execution rounds to handle complex multi-step tasks. You can control this behavior:

```bash
# Limit tool rounds for faster execution on simple tasks
ax-cli --max-tool-rounds 10 --prompt "show me the current directory"

# Increase limit for very complex tasks (use with caution)
ax-cli --max-tool-rounds 1000 --prompt "comprehensive code refactoring"

# Works with all modes
ax-cli --max-tool-rounds 20  # Interactive mode
ax-cli git commit-and-push --max-tool-rounds 30  # Git commands
```

**Use Cases**:
- **Fast responses**: Lower limits (10-50) for simple queries
- **Complex automation**: Higher limits (500+) for comprehensive tasks
- **Resource control**: Prevent runaway executions in automated environments

### Model Selection

You can specify which AI model to use with the `--model` parameter or `GROK_MODEL` environment variable:

**Method 1: Command Line Flag**
```bash
# GLM 4.6
ax-cli --model glm-4.6 --base-url https://api.z.ai/api/coding/paas/v4

# Use Grok models
ax-cli --model grok-code-fast-1
ax-cli --model grok-4-latest 

# Use other models (with appropriate API endpoint)
ax-cli --model gemini-3.0-pro --base-url https://api-endpoint.com/v1
ax-cli --model claude-sonnet-4-20250514 --base-url https://api-endpoint.com/v1
```

**Method 2: Environment Variable**
```bash
export GROK_MODEL=grok-code-fast-1
ax-cli
```

**Method 3: User Settings File**
Add to `~/.ax/user-settings.json`:
```json
{
  "apiKey": "your_api_key_here",
  "defaultModel": "grok-code-fast-1"
}
```

**Model Priority**: `--model` flag > `GROK_MODEL` environment variable > user default model > system default (grok-code-fast-1)

### Command Line Options

```bash
ax-cli [options]

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

You can provide custom instructions to tailor AX's behavior to your project by creating a `.ax/AX.md` file in your project directory:

```bash
mkdir .ax
```

Create `.ax/AX.md` with your custom instructions:
```markdown
# Custom Instructions for AX CLI

Always use TypeScript for any new code files.
When creating React components, use functional components with hooks.
Prefer const assertions and explicit typing over inference where it improves clarity.
Always add JSDoc comments for public functions and interfaces.
Follow the existing code style and patterns in this project.
```

AX will automatically load and follow these instructions when working in your project directory. The custom instructions are added to AX's system prompt and take priority over default behavior.

## Morph Fast Apply (Optional)

AX CLI supports Morph's Fast Apply model for high-speed code editing at **4,500+ tokens/sec with 98% accuracy**. This is an optional feature that provides lightning-fast file editing capabilities.

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
ax-cli --prompt "refactor this function to use async/await and add error handling"
ax-cli -p "convert this class to TypeScript and add proper type annotations"
```

The AI will automatically choose between `edit_file` (Morph) for complex changes or `str_replace_editor` for simple replacements.

## MCP Tools

AX CLI supports MCP (Model Context Protocol) servers, allowing you to extend the AI assistant with additional tools and capabilities.

### Adding MCP Tools

#### Add a custom MCP server:
```bash
# Add an stdio-based MCP server
ax-cli mcp add my-server --transport stdio --command "bun" --args server.js

# Add an HTTP-based MCP server
ax-cli mcp add my-server --transport http --url "http://localhost:3000"

# Add with environment variables
ax-cli mcp add my-server --transport stdio --command "python" --args "-m" "my_mcp_server" --env "API_KEY=your_key"
```

#### Add from JSON configuration:
```bash
ax-cli mcp add-json my-server '{"command": "bun", "args": ["server.js"], "env": {"API_KEY": "your_key"}}'
```

### Linear Integration Example

To add Linear MCP tools for project management:

```bash
# Add Linear MCP server
ax-cli mcp add linear --transport sse --url "https://mcp.linear.app/sse"
```

This enables Linear tools like:
- Create and manage Linear issues
- Search and filter issues
- Update issue status and assignees
- Access team and project information

### Managing MCP Servers

```bash
# List all configured servers
ax-cli mcp list

# Test server connection
ax-cli mcp test server-name

# Remove a server
ax-cli mcp remove server-name
```

### Available Transport Types

- **stdio**: Run MCP server as a subprocess (most common)
- **http**: Connect to HTTP-based MCP server
- **sse**: Connect via Server-Sent Events

## Architecture

- **Agent**: Core command processing and execution logic
- **Tools**: Text editor and bash tool implementations
- **UI**: Ink-based terminal interface components
- **Types**: TypeScript definitions for the entire system

## License

MIT
