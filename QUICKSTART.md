# Quick Start Guide

Get up and running with Grok CLI in under 5 minutes!

## Installation

```bash
npm install -g @vibe-kit/grok-cli
```

## Setup

1. **Get your API key** from [X.AI](https://x.ai)

2. **Set your API key**:
   ```bash
   export GROK_API_KEY=your_api_key_here
   ```

3. **Verify installation**:
   ```bash
   grok --version
   ```

## First Steps

### Interactive Mode

Start a conversation:

```bash
grok
```

Try these commands:
- `"Show me the current directory contents"`
- `"Create a hello world script in JavaScript"`
- `"Explain what package.json is"`

Exit with `Ctrl+C` or type `exit`.

### Headless Mode

Process a single prompt:

```bash
grok --prompt "list all TypeScript files in src/"
```

## Common Use Cases

### 1. File Operations

```bash
# View a file
grok --prompt "show me the README.md file"

# Create a file
grok --prompt "create a new file called test.js with a hello world function"

# Edit a file
grok --prompt "add error handling to index.ts"
```

### 2. Code Search

```bash
# Find files
grok --prompt "find all files that import React"

# Search content
grok --prompt "search for TODO comments in the codebase"
```

### 3. Development Tasks

```bash
# Run tests
grok --prompt "run the test suite and show me the results"

# Git operations
grok git commit-and-push
```

## Configuration

### Save Your API Key

Create `~/.grok/user-settings.json`:

```json
{
  "apiKey": "your_api_key_here",
  "defaultModel": "grok-4-latest"
}
```

### Custom Instructions

Create `.grok/GROK.md` in your project:

```markdown
# Project Instructions

- Use TypeScript for all code
- Follow the existing code style
- Add tests for new features
```

## Tips

1. **Be Specific**: Clear instructions get better results
   - Good: "Create a React component called Button with TypeScript"
   - Bad: "Make a button"

2. **Review Before Confirming**: Always review generated code and commands

3. **Use Context**: Grok remembers your conversation
   ```
   You: "Show me index.ts"
   Grok: [shows file]
   You: "Add logging to that file"  ← References previous file
   ```

4. **Choose Right Model**:
   - `grok-4-latest` for complex tasks
   - `grok-3-fast` for simple operations

## Next Steps

- Read the full [README](README.md)
- Check out [Examples](examples/README.md)
- Review [Contributing Guidelines](CONTRIBUTING.md)
- Join the community discussions

## Troubleshooting

### "No API key found"
```bash
# Set environment variable
export GROK_API_KEY=your_key

# Or use flag
grok --api-key your_key
```

### "Command not found"
```bash
# Reinstall globally
npm install -g @vibe-kit/grok-cli

# Check npm global path
npm config get prefix
```

### Need Help?

- Check [README](README.md#troubleshooting)
- Search [Issues](https://github.com/vibe-kit/grok-cli/issues)
- Create a [new issue](https://github.com/vibe-kit/grok-cli/issues/new)

---

**Happy coding with Grok CLI! 🚀**
