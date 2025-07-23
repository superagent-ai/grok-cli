# Grok CLI

A conversational AI CLI tool powered by Grok with intelligent text editor capabilities and tool usage.

<img width="980" height="435" alt="Screenshot 2025-07-21 at 13 35 41" src="https://github.com/user-attachments/assets/192402e3-30a8-47df-9fc8-a084c5696e78" />

## Features

- **🤖 Conversational AI**: Natural language interface powered by Grok-3
- **📝 Smart File Operations**: AI automatically uses tools to view, create, and edit files
- **⚡ Bash Integration**: Execute shell commands through natural conversation
- **🔧 Automatic Tool Selection**: AI intelligently chooses the right tools for your requests
- **🔌 MCP Integration**: Extensible with Model Context Protocol (MCP) servers for additional capabilities
- **💬 Interactive UI**: Beautiful terminal interface built with Ink
- **🌍 Global Installation**: Install and use anywhere with `npm i -g @vibe-kit/grok-cli`
- **🔌 MCP Support**: Full Model Context Protocol (MCP) support for Resources, Prompts, and Roots

## Installation

### Prerequisites
- Node.js 16+ 
- Grok API key from X.AI

### Global Installation (Recommended)
```bash
npm install -g @vibe-kit/grok-cli
```

### Local Development
```bash
git clone <repository>
cd grok-cli
npm install
npm run build
npm link
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

### Custom Base URL (Optional)

You can configure a custom Grok API endpoint (choose one method):

**Method 1: Environment Variable**
```bash
export GROK_BASE_URL=https://your-custom-endpoint.com/v1
```

**Method 2: Command Line Flag**
```bash
grok --api-key your_api_key_here --baseurl https://your-custom-endpoint.com/v1
```

**Method 3: User Settings File**
Add to `~/.grok/user-settings.json`:
```json
{
  "apiKey": "your_api_key_here",
  "baseURL": "https://your-custom-endpoint.com/v1"
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
grok --prompt "run npm test and show me the results" --directory /path/to/project
```

This mode is particularly useful for:
- **CI/CD pipelines**: Automate code analysis and file operations
- **Scripting**: Integrate AI assistance into shell scripts
- **Terminal benchmarks**: Perfect for tools like Terminal Bench that need non-interactive execution
- **Batch processing**: Process multiple prompts programmatically

### Model Selection

You can specify which AI model to use with the `--model` parameter:

```bash
# Use Grok models
grok --model grok-4-latest
grok --model grok-3-latest
grok --model grok-3-fast

# Use other models (with appropriate API endpoint)
grok --model gemini-2.5-pro --base-url https://api-endpoint.com/v1
grok --model claude-sonnet-4-20250514 --base-url https://api-endpoint.com/v1
```

### Command Line Options

```bash
grok [options]

Options:
  -V, --version          output the version number
  -d, --directory <dir>  set working directory
  -k, --api-key <key>    Grok API key (or set GROK_API_KEY env var)
  -u, --base-url <url>   Grok API base URL (or set GROK_BASE_URL env var)
  -m, --model <model>    AI model to use (e.g., grok-4-latest, grok-3-latest)
  -p, --prompt <prompt>  process a single prompt and exit (headless mode)
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

## MCP (Model Context Protocol) Integration

Grok CLI supports MCP servers to extend its capabilities with additional tools and resources. MCP servers can provide file system access, git operations, web search, database connections, and much more.

### MCP Configuration

MCP servers are configured via `mcpConfig.json` files. Grok CLI follows this configuration hierarchy:

1. **Project scope**: `.grok/mcpConfig.json` in your project directory
2. **User scope**: `~/.grok/mcpConfig.json` in your home directory  
3. **Local scope**: `mcpConfig.json` in current directory (legacy)
4. **Fallback**: `~/.config/grok-cli/mcpConfig.json`

### Configuration Scopes and Colors

Grok CLI uses a color-coded system to distinguish between different configuration scopes:

- **🔵 Project** (Cyan): Project-specific servers in `.grok/mcpConfig.json`
- **🟢 User** (Green): Personal servers in `~/.grok/mcpConfig.json`
- **🟡 Local** (Yellow): Legacy servers in `mcpConfig.json`
- **⚪ Fallback** (Gray): System-wide servers in `~/.config/grok-cli/mcpConfig.json`

The startup display shows server counts by scope: `0 MCP Servers (Project:1 User:2 Local:0)` and the `/mcp` command provides colorized output with scope indicators like `[project]`, `[user]`, etc.

### Setting Up MCP Servers

**Global Configuration** (recommended for personal tools):
```bash
mkdir -p ~/.grok
cp global-mcpConfig.json.example ~/.grok/mcpConfig.json
# Edit ~/.grok/mcpConfig.json with your preferred servers
```

**Project-specific Configuration**:
```bash
mkdir -p .grok
cp .grok/mcpConfig.json.example .grok/mcpConfig.json
# Edit .grok/mcpConfig.json for project-specific tools
```

### Example Configuration

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["@modelcontextprotocol/server-filesystem", "/path/to/allowed/directory"],
      "transport": "stdio",
      "enabled": true
    },
    "git": {
      "command": "npx",
      "args": ["@modelcontextprotocol/server-git"],
      "transport": "stdio",
      "enabled": true
    },
    "web-search": {
      "url": "https://api.example.com/mcp",
      "transport": "https",
      "headers": {
        "Authorization": "Bearer ${API_KEY}"
      },
      "enabled": true
    }
  },
  "globalSettings": {
    "timeout": 10000,
    "retryAttempts": 3,
    "logLevel": "info"
  }
}
```

### Available MCP Commands

- **`/mcp`**: Show MCP server status and available tools (colorized output with scope information)
- **`/mcp --detailed`**: Show detailed server and tool information with scope indicators
- **`/mcp --tools`**: List all available tools grouped by server and scope
- **`/mcp --servers`**: Show server status only with scope information
- **Tab key**: Expand MCP status for detailed view with scope counts

### CLI Commands for MCP Management

- **`grok mcp add <name> [options]`**: Add a new MCP server
  - `--scope <scope>`: Configuration scope (project, user, local) - defaults to 'user'
  - `--type <type>`: Server type (stdio, sse, https)
  - `--command <command>`: Command to run (for stdio servers)
  - `--url <url>`: Server URL (for sse/https servers)
  - `--args <args...>`: Command arguments
  - `--env <env...>`: Environment variables (KEY=VALUE format)

- **`grok mcp remove <name> [options]`**: Remove an MCP server
  - `--scope <scope>`: Configuration scope (project, user, local) - defaults to 'user'

- **`grok mcp list`**: List all configured MCP servers
- **`grok mcp status`**: Show status of all MCP servers
- **`grok mcp test <name>`**: Test connection to a specific MCP server

### Popular MCP Servers

- **@modelcontextprotocol/server-filesystem**: File system operations
- **@modelcontextprotocol/server-git**: Git repository management
- **@modelcontextprotocol/server-sqlite**: SQLite database access
- **@modelcontextprotocol/server-brave-search**: Web search capabilities
- **@modelcontextprotocol/server-github**: GitHub API integration

### Environment Variables

MCP configurations support environment variable substitution using `${VARIABLE_NAME}` syntax:

```json
{
  "mcpServers": {
    "api-server": {
      "url": "https://api.example.com",
      "headers": {
        "Authorization": "Bearer ${API_TOKEN}"
      }
    }
  }
}
```

### Configuration Priority

When multiple configuration files exist, Grok CLI uses this priority order:

1. **Workspace `.grok/mcpConfig.json`** - Highest priority, project-specific
2. **Global `~/.grok/mcpConfig.json`** - User-wide configuration
3. **Legacy `mcpConfig.json`** - Current directory (for backward compatibility)
4. **Fallback `~/.config/grok-cli/mcpConfig.json`** - System default location

### Troubleshooting MCP

**Check MCP Status:**
```bash
grok
# Then type: /mcp
```

**Common Issues:**
- **Server not starting**: Check if the MCP server package is installed (`npm install -g @modelcontextprotocol/server-*`)
- **Permission errors**: Ensure file paths in configuration are accessible
- **Environment variables**: Verify required environment variables are set
- **Timeout errors**: Increase timeout values in globalSettings

**Debug Mode:**
Set `logLevel` to `"debug"` in your configuration for detailed logging.

## Example Conversations

Instead of typing commands, just tell Grok what you want to do:

```
💬 "Show me the contents of package.json"
💬 "Create a new file called hello.js with a simple console.log"
💬 "Find all TypeScript files in the src directory"
💬 "Replace 'oldFunction' with 'newFunction' in all JS files"
💬 "Run the tests and show me the results"
💬 "What's the current directory structure?"
```

## Model Context Protocol (MCP) Support

Grok CLI now includes full support for the Model Context Protocol, enabling standardized access to resources, prompts, and file system roots.

### MCP Resources

Resources are read-only data sources that can be accessed by the AI:

```
💬 "List all available MCP resources"
💬 "Read the grok://config resource"
💬 "Show me the chat history resource"
💬 "Register all files in the src directory as resources"
```

Built-in resources:
- `grok://config` - Current Grok CLI configuration
- `grok://history` - Chat history and interactions
- `grok://tools` - Available tools and descriptions

### MCP Prompts

Pre-defined prompt templates for common tasks:

```
💬 "List all available prompts"
💬 "Use the code-review prompt on main.js and utils.js"
💬 "Apply the refactor prompt to database.js with repository pattern"
💬 "Get the debug prompt for this error message"
```

Built-in prompts:
- `code-review` - Perform code reviews with optional focus areas
- `refactor` - Suggest refactoring improvements
- `debug` - Help debug issues with error context

### MCP Roots

Define allowed file system paths for operations:

```
💬 "Show me the configured MCP roots"
💬 "Add /home/user/projects as a new root"
💬 "List all roots and their names"
```

Default roots:
- Current working directory
- User home directory

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
- **MCP**: Model Context Protocol implementation for Resources, Prompts, and Roots
  - **MCPService**: Core service managing all MCP functionality
  - **Resources**: Read-only data sources accessible by the AI
  - **Prompts**: Pre-defined templates for common interactions
  - **Roots**: File system boundary management

## License

MIT
