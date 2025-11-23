# Grok CLI

[![npm version](https://img.shields.io/npm/v/@vibe-kit/grok-cli.svg)](https://www.npmjs.com/package/@vibe-kit/grok-cli)
[![CI](https://github.com/vibe-kit/grok-cli/workflows/CI/badge.svg)](https://github.com/vibe-kit/grok-cli/actions)
[![codecov](https://codecov.io/gh/vibe-kit/grok-cli/branch/main/graph/badge.svg)](https://codecov.io/gh/vibe-kit/grok-cli)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/node/v/@vibe-kit/grok-cli.svg)](https://nodejs.org)
[![Downloads](https://img.shields.io/npm/dm/@vibe-kit/grok-cli.svg)](https://www.npmjs.com/package/@vibe-kit/grok-cli)

A conversational AI CLI tool powered by Grok with intelligent text editor capabilities and tool usage.

<img width="980" height="435" alt="Screenshot 2025-07-21 at 13 35 41" src="https://github.com/user-attachments/assets/192402e3-30a8-47df-9fc8-a084c5696e78" />

## Features

- **🤖 Conversational AI**: Natural language interface powered by Grok-3
- **📝 Smart File Operations**: AI automatically uses tools to view, create, and edit files
- **⚡ Bash Integration**: Execute shell commands through natural conversation
- **🔧 Automatic Tool Selection**: AI intelligently chooses the right tools for your requests
- **🚀 Morph Fast Apply**: Optional high-speed code editing at 4,500+ tokens/sec with 98% accuracy
- **🔌 MCP Tools**: Extend capabilities with Model Context Protocol servers (Linear, GitHub, etc.)
- **💬 Interactive UI**: Beautiful terminal interface built with Ink
- **🌍 Global Installation**: Install and use anywhere with `bun add -g @vibe-kit/grok-cli`

## Installation

### Prerequisites
- Bun 1.0+ (or Node.js 18+ as fallback)
- Grok API key from X.AI
- (Optional, Recommended) Morph API key for Fast Apply editing

### Global Installation (Recommended)
```bash
bun add -g @vibe-kit/grok-cli
```

Or with npm (fallback):
```bash
npm install -g @vibe-kit/grok-cli
```

### Local Development
```bash
git clone <repository>
cd grok-cli
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

## Development

```bash
# Install dependencies
bun install

# Development mode
bun run dev

# Build project
bun run build

# Run linter
bun run lint

# Type check
bun run typecheck
```

## Architecture

- **Agent**: Core command processing and execution logic (`src/agent/`)
  - GrokAgent: Main orchestration and conversation management
  - Token counting and streaming support
  - Tool execution and result processing

- **Tools** (`src/tools/`): Modular tool implementations
  - TextEditorTool: File viewing, creation, and editing with fuzzy matching
  - BashTool: Command execution with safety validation
  - SearchTool: Fast code search using ripgrep with caching
  - TodoTool: Task management and tracking

- **UI** (`src/ui/`): Ink-based terminal interface components
  - ChatInterface: Main conversational UI
  - ConfirmationDialog: User approval for destructive operations
  - DiffRenderer: Visual diff display for file changes
  - ModelSelection: Interactive model switching

- **Utils** (`src/utils/`): Shared utilities and services
  - Error handling with custom error classes
  - Resource caching with TTL support
  - Settings management
  - Token counting and formatting

## Troubleshooting

### Common Issues

#### "No API key found"
**Solution**: Ensure you've set up your API key using one of the methods in the Setup section. Check that:
- Environment variable `GROK_API_KEY` is set
- Or `~/.grok/user-settings.json` exists with valid `apiKey`
- Or you're passing `--api-key` flag

#### "Command execution failed"
**Solution**: Some commands may be blocked for security reasons. The following commands require explicit confirmation:
- File deletion: `rm`, `rmdir`, `del`
- System operations: `shutdown`, `reboot`, `halt`
- Potentially destructive: `format`, `mkfs`, `dd`

Certain commands are completely blocked (e.g., fork bombs) for safety.

#### "Network error" or "Connection timeout"
**Solution**:
- Check your internet connection
- Verify the API endpoint is accessible
- If using a custom base URL, ensure it's correct and reachable
- Check if your API key is valid and has not expired

#### "File not found" errors
**Solution**:
- Verify the file path is correct (use absolute paths when possible)
- Check file permissions
- Ensure the file exists in the current working directory

#### Token/Rate limit errors
**Solution**:
- Each model has different token limits (see Configuration section)
- Break down large requests into smaller chunks
- Clear chat history if the conversation becomes too long
- Consider using a faster model for simple tasks

### Performance Issues

#### Search is slow
The search tool uses caching to improve performance. Results are cached for 60 seconds by default. If you're still experiencing slowness:
- Limit search scope with `--include-pattern` or `--exclude-pattern`
- Use more specific search queries
- Exclude large directories like `node_modules` (done automatically)

#### High memory usage
If the application is consuming too much memory:
- Restart the CLI to clear conversation history
- Use headless mode (`--prompt`) for single operations
- Limit the number of search results returned

### Getting Help

If you encounter issues not covered here:
1. Check existing [GitHub Issues](https://github.com/vibe-kit/grok-cli/issues)
2. Create a new issue with:
   - Grok CLI version (`grok --version`)
   - Node.js version (`node --version`)
   - Operating system
   - Complete error message
   - Steps to reproduce

## Contributing

We welcome contributions! Here's how to get started:

### Development Setup

1. **Fork and clone the repository**
   ```bash
   git clone https://github.com/YOUR_USERNAME/grok-cli.git
   cd grok-cli
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Create a branch for your feature**
   ```bash
   git checkout -b feature/your-feature-name
   ```

4. **Make your changes and test**
   ```bash
   npm run dev          # Run in development mode
   npm run typecheck    # Check TypeScript types
   npm run lint         # Lint your code
   npm run build        # Build the project
   ```

### Code Guidelines

- **TypeScript**: All code should be written in TypeScript with proper typing
- **Code Style**: Follow the existing code style (enforced by ESLint)
- **Error Handling**: Use custom error classes from `src/utils/errors.ts`
- **Documentation**: Add JSDoc comments for public APIs and complex logic
- **Constants**: Use centralized constants from `src/config/constants.ts`
- **Testing**: Add tests for new features (when test infrastructure is available)

### Adding New Tools

To add a new tool:

1. Create a new file in `src/tools/your-tool.ts`
2. Implement the tool class with proper error handling
3. Add the tool definition to `src/grok/tools.ts`
4. Register the tool in `src/agent/grok-agent.ts`
5. Update documentation

### Pull Request Process

1. **Update documentation** if you're adding/changing features
2. **Ensure all checks pass** (type checking, linting)
3. **Write clear commit messages** following conventional commits
4. **Create a pull request** with:
   - Clear description of changes
   - Motivation and context
   - Related issue numbers (if applicable)
   - Screenshots for UI changes

### Security

If you discover a security vulnerability:
- **Do NOT** create a public GitHub issue
- Email security concerns to the maintainers
- Include detailed information about the vulnerability
- Wait for confirmation before disclosing publicly

### Code of Conduct

- Be respectful and inclusive
- Welcome newcomers and help them get started
- Focus on constructive feedback
- Prioritize the community and project health

## Roadmap

Future improvements planned:
- [ ] Test infrastructure with comprehensive test coverage
- [ ] Plugin system for custom tools
- [ ] Configuration file support (`.grokrc`)
- [ ] Multi-model support improvements
- [ ] Enhanced diff visualization
- [ ] Conversation export/import
- [ ] Integration with popular editors

## License

MIT
