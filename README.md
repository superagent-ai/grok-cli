# Grok CLI

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

---

## Installation

### Prerequisites
- Bun 1.0+ (or Node.js 18+ as fallback)
- Grok API key from X.AI
- (Optional) Morph API key for Fast Apply editing

### Global Installation (Recommended)
```bash
bun add -g @vibe-kit/grok-cli
````

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

---

## Setup

1. Get your Grok API key from [X.AI](https://x.ai).

2. Set up your API key (choose one method):

**Environment Variable**

```bash
export GROK_API_KEY=your_api_key_here
```

**.env File**

```bash
cp .env.example .env
# Edit .env and add your API key
```

**Command Line Flag**

```bash
grok --api-key your_api_key_here
```

**User Settings File**

```json
~/.grok/user-settings.json
{
  "apiKey": "your_api_key_here"
}
```

3. (Optional) Get your Morph API key from [Morph Dashboard](https://morphllm.com/dashboard/api-keys) for Fast Apply editing.

4. Set up Morph API key (choose method):

```bash
export MORPH_API_KEY=your_morph_api_key_here
# or add to .env file
MORPH_API_KEY=your_morph_api_key_here
```

### Custom Base URL (Optional)

```bash
export GROK_BASE_URL=https://your-custom-endpoint.com/v1
# or via CLI flag
grok --api-key your_api_key_here --base-url https://your-custom-endpoint.com/v1
```

---

## Configuration Files

### User-Level Settings (`~/.grok/user-settings.json`)

Stores **global settings**:

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

Stores **project-specific settings**:

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

---

## Usage

### Interactive Mode

```bash
grok
grok -d /path/to/project
```

### Headless Mode

```bash
grok --prompt "show me the package.json file"
grok -p "create a new file called example.js with a hello world function"
grok --prompt "run bun test" --directory /path/to/project
grok --prompt "complex task" --max-tool-rounds 50
```

### Tool Execution Control

```bash
grok --max-tool-rounds 10 --prompt "show me the current directory"
grok --max-tool-rounds 1000 --prompt "comprehensive code refactoring"
```

### Model Selection

```bash
grok --model grok-code-fast-1
export GROK_MODEL=grok-code-fast-1
```

### Command Line Options

```bash
grok [options]

Options:
  -V, --version
  -d, --directory <dir>
  -k, --api-key <key>
  -u, --base-url <url>
  -m, --model <model>
  -p, --prompt <prompt>
  --max-tool-rounds <rounds>
  --dry-run
  --confirm
  -h, --help
```

---

## Safety Flags

* **`--dry-run`**: Simulate commands without executing.

```bash
grok --prompt "delete old logs" --dry-run
```

* **`--confirm`**: Ask for confirmation before executing destructive operations.

```bash
grok --prompt "delete old logs" --confirm
```

* **Combined Usage**

```bash
grok --prompt "update config files" --dry-run --confirm
```

---

## Custom Instructions

```bash
mkdir .grok
```

Create `.grok/GROK.md`:

```markdown
# Custom Instructions for Grok CLI
Always use TypeScript for new files.
Use functional React components with hooks.
Add JSDoc for public functions.
Follow existing code style patterns.
```

---

## Morph Fast Apply (Optional)

* Lightning-fast code editing at **4,500+ tokens/sec**.
* Use `edit_file` (Morph) for complex edits, `str_replace_editor` for simple replacements.

---

## MCP Tools

* Extend AI assistant with additional tools.
* Add servers via `grok mcp add` or JSON config.
* Example: Linear MCP integration.
* Available transports: `stdio`, `http`, `sse`.

---

## Using Other API Providers

Supports **OpenAI-compatible APIs**:

* X.AI (default)
* OpenAI
* OpenRouter
* Groq

Example:

```json
{
  "apiKey": "your_openrouter_key",
  "baseURL": "https://openrouter.ai/api/v1",
  "defaultModel": "anthropic/claude-3.5-sonnet"
}
```

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for contribution guidelines.

---

## Security & Privacy

* See `SECURITY.md` for vulnerability reporting.
* See `PRIVACY.md` for data collection details.
* See `SAFE_MODE.md` for safe execution and safety flags.

---

## Development

```bash
bun install
bun run dev
bun run build
bun run lint
bun run typecheck
```

---

## Architecture

* **Agent**: Core command processing
* **Tools**: Text editor & bash implementations
* **UI**: Ink-based terminal components
* **Types**: TypeScript definitions

---

## License

MIT

