# Grok CLI Examples

This directory contains example configuration files and usage examples for Grok CLI.

## Configuration Examples

### User Settings

Copy `user-settings.json` to `~/.grok/user-settings.json`:

```bash
mkdir -p ~/.grok
cp examples/user-settings.json ~/.grok/user-settings.json
# Edit the file with your settings
```

### Custom Instructions

Copy `GROK.md` to `.grok/GROK.md` in your project:

```bash
mkdir -p .grok
cp examples/GROK.md .grok/GROK.md
# Customize the instructions for your project
```

## Usage Examples

### Basic Usage

```bash
# Interactive mode
grok

# Headless mode with a single prompt
grok --prompt "show me the package.json file"

# Specify a working directory
grok -d /path/to/project

# Use a specific model
grok --model grok-3-latest
```

### Advanced Usage

```bash
# Use custom base URL (for proxies)
grok --base-url https://your-proxy.com/v1

# Combine options
grok --model claude-sonnet-4-20250514 \
     --base-url https://api.example.com/v1 \
     --api-key your_key \
     -d /path/to/project
```

### Git Integration

```bash
# Auto-commit and push changes
grok git commit-and-push
```

### Environment Variables

```bash
# Set API key via environment
export GROK_API_KEY=your_key_here
grok

# Use custom model
export GROK_MODEL=grok-4-latest
grok

# Set working directory
export GROK_WORKING_DIR=/path/to/project
grok
```

## Example Prompts

### File Operations

```
"Show me the contents of src/index.ts"
"Create a new file called utils/helpers.ts with a formatDate function"
"Replace all instances of 'oldFunction' with 'newFunction' in src/"
```

### Code Analysis

```
"Find all TODO comments in the codebase"
"Show me all functions that use the database"
"Explain what the main() function does"
```

### Development Tasks

```
"Run the tests and show me the results"
"Find files that import React but don't use it"
"Add error handling to the API client"
```

### Search Operations

```
"Find all TypeScript files in src/components/"
"Search for 'export default' in all JavaScript files"
"Show me where the API key is used"
```

## Configuration Priority

Grok CLI resolves configuration in this order (highest to lowest priority):

1. **Command-line arguments** (`--api-key`, `--model`, etc.)
2. **Environment variables** (`GROK_API_KEY`, `GROK_MODEL`, etc.)
3. **User settings file** (`~/.grok/user-settings.json`)
4. **Default values**

## Custom Instructions

Custom instructions in `.grok/GROK.md` are loaded automatically and guide Grok's behavior for your specific project.

Example use cases:
- Enforce coding standards
- Specify preferred libraries or patterns
- Define project-specific workflows
- Set documentation requirements

## Tips and Tricks

### 1. Session Persistence

Grok remembers your conversation within a session. You can reference previous responses:

```
You: "Show me the main.ts file"
Grok: [shows file]
You: "Add error handling to that file"
```

### 2. Model Selection

Choose the right model for your task:
- `grok-4-latest` - Most capable, best for complex tasks
- `grok-3-latest` - Balanced performance and speed
- `grok-3-fast` - Fastest, good for simple tasks

### 3. Batch Operations

Process multiple files or tasks in one prompt:

```
"For each file in src/components/, add a header comment with the filename and description"
```

### 4. Git Workflows

Combine file operations with git:

```
"Create a new React component called Button, add tests, and commit the changes"
```

### 5. Performance

Use caching to speed up repeated searches:
- Search results are cached for 60 seconds
- Identical searches return instantly from cache
- Cache is automatically cleared after TTL

## Troubleshooting

### API Key Not Found

If you see "No API key found":

1. Check environment variable: `echo $GROK_API_KEY`
2. Check user settings: `cat ~/.grok/user-settings.json`
3. Provide via CLI: `grok --api-key your_key`

### Command Blocked

If a bash command is blocked:

1. Check if it's in the dangerous commands list
2. Confirm the operation when prompted
3. Consider if there's a safer alternative

### Performance Issues

If searches are slow:

1. Limit search scope with patterns
2. Exclude large directories
3. Use more specific search queries
4. Check if ripgrep is installed

## More Examples

Check the main [README.md](../README.md) for more detailed usage examples and documentation.
