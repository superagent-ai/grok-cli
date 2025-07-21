# Grok CLI

A conversational AI CLI tool powered by Grok with intelligent text editor capabilities and tool usage.

<img width="980" height="435" alt="Screenshot 2025-07-21 at 13 35 41" src="https://github.com/user-attachments/assets/192402e3-30a8-47df-9fc8-a084c5696e78" />

## Features

- **🤖 Conversational AI**: Natural language interface powered by Grok-4 (with model switching)
- **📝 Smart File Operations**: AI automatically uses tools to view, create, and edit files
- **⚡ Bash Integration**: Execute shell commands through natural conversation
- **🔧 Automatic Tool Selection**: AI intelligently chooses the right tools for your requests
- **💬 Interactive UI**: Beautiful terminal interface built with Ink
- **📤 Export Conversations**: Save chat history as JSON or Markdown with interactive selection
- **🧠 Smart Context Management**: 128k context window with intelligent conversation pruning
- **💾 Persistent State**: Automatic saving of todos, settings, and bash session state
- **🌍 Global Installation**: Install and use anywhere with `npm i -g @vibe-kit/grok-cli`

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
git clone https://github.com/superagent-ai/grok-cli.git
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

## CLI Commands

In addition to natural language, Grok CLI provides built-in commands for quick actions:

### Built-in Commands
- **`/help`** - Show comprehensive help information
- **`/clear`** - Clear chat history and reset context
- **`/models`** - Interactive model selection (Grok-4, Grok-3, variants)
- **`/export`** - Interactive conversation export to JSON/Markdown
- **`/exit`** - Exit application
- **`exit`** or **`quit`** - Alternative exit commands

### Export Commands
The `/export` command provides an interactive experience:

1. **Format Selection**: Choose JSON (structured data) or Markdown (readable)
2. **Filename Input**: Custom name or auto-generated timestamp
3. **Save Location**: Files saved to current working directory with full path display

```bash
❯ /export
📤 Export Conversation
Choose format:
❯ json     - Structured JSON data
  md       - Readable Markdown format  
  cancel   - Cancel export

↑↓ navigate • Enter/Tab select • Esc cancel
```

### Direct Bash Commands
Execute common shell commands directly:
```bash
ls [path]       # List directory contents
pwd             # Show current directory
cd <path>       # Change directory
cat <file>      # View file contents
mkdir <dir>     # Create directory
touch <file>    # Create empty file
```

## Context Management

Grok CLI features intelligent context management for long conversations:

- **128k Token Limit**: Optimized for Grok's context window
- **Turn-based Tracking**: Groups messages into logical conversation turns
- **Smart Pruning**: Removes old content while preserving recent context
- **File Prioritization**: Keeps recently accessed files in context
- **Persistent State**: Maintains todos, bash session, and user settings across sessions

Files are automatically managed in `~/.grok/`:
- `user-settings.json` - API keys and preferences
- `todos.json` - Persistent todo list
- `bash-session.json` - Working directory and session state

## Interactive Features

Grok CLI provides a modern, user-friendly interface:

### Smart Command Suggestions
Type `/` to see available commands with descriptions:
```bash
❯ /help     - Show help information
  /clear    - Clear chat history
  /models   - Switch Grok Model  
  /export   - Export conversation to file
  /exit     - Exit the application
```

### Model Switching
Interactive model selection with real-time switching:
- **Grok-4 Latest** - Most capable model
- **Grok-3 Latest** - Reliable performance
- **Grok-3 Fast** - Quick responses
- **Grok-3 Mini Fast** - Fastest variant

### Conversation Export
Save your conversations in multiple formats:
- **JSON Format**: Structured data with metadata for programmatic use
- **Markdown Format**: Human-readable with timestamps and formatting
- **Custom Filenames**: Your choice or auto-generated timestamps
- **Clear File Paths**: Know exactly where your files are saved

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

- **Agent**: Core command processing with intelligent context management
- **Tools**: Text editor, bash, todo, and confirmation tool implementations
- **UI**: Ink-based terminal interface with interactive components
- **Context Management**: Turn-based conversation tracking with smart pruning
- **Persistence**: JSON-based state management for settings and session data
- **Types**: Comprehensive TypeScript definitions for the entire system

## License

MIT

## Author

Created by **homanp** (CTO [@superagent_ai](https://github.com/superagent-ai))
- GitHub: [@homanp](https://github.com/homanp)
- X/Twitter: [@pelaseyed](https://x.com/pelaseyed)
