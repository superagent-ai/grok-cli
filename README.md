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
