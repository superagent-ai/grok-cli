# Grok CLI

A conversational AI CLI tool powered by Grok with intelligent text editor capabilities and tool usage.

<img width="980" height="435" alt="Screenshot 2025-07-21 at 13 35 41" src="https://github.com/user-attachments/assets/192402e3-30a8-47df-9fc8-a084c5696e78" />

## Features

- **🤖 Conversational AI**: Natural language interface powered by Grok-3
- **📝 Smart File Operations**: AI automatically uses tools to view, create, and edit files
- **⚡ Bash Integration**: Execute shell commands through natural conversation
- **🔧 Automatic Tool Selection**: AI intelligently chooses the right tools for your requests
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

## Usage

Start the conversational AI assistant:
```bash
grok
```

Or specify a working directory:
```bash
grok -d /path/to/project
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
