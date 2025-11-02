# 🚀 SuperGrok-CLI Quick Start Guide

Get started with SuperGrok-CLI and multi-agent orchestration in 5 minutes!

---

## 📦 Step 1: Installation (2 minutes)

### Option A: Install from NPM (Recommended)

```bash
npm install -g @manutej/supergrok-cli
```

### Option B: Install from Source

```bash
# Clone the repository
git clone https://github.com/manutej/supergrok-cli.git
cd supergrok-cli

# Install dependencies
npm install

# Build
npm run build

# Link globally (optional)
npm link
```

### Verify Installation

```bash
grok --version
```

Expected output: `2.0.0-alpha.1` or higher

---

## 🔑 Step 2: Get API Keys (1 minute)

### Required: Grok API Key

1. Visit [https://x.ai/](https://x.ai/)
2. Sign up or log in
3. Navigate to API section
4. Create a new API key
5. Copy your API key (starts with `xai-`)

### Optional: Second API Key for Orchestration

For multi-agent orchestration, get a second API key following the same steps.

---

## ⚙️ Step 3: Configuration (1 minute)

### Quick Setup (Environment Variables)

```bash
# Add to your shell profile (~/.bashrc, ~/.zshrc, etc.)
export GROK_API_KEY=xai-your-primary-key-here
export GROK_API_KEY_2=xai-your-secondary-key-here  # Optional

# Reload your shell
source ~/.bashrc  # or source ~/.zshrc
```

### Alternative: Configuration File

Create `~/.grok/user-settings.json`:

```json
{
  "apiKey": "xai-your-primary-key-here",
  "baseURL": "https://api.x.ai/v1",
  "defaultModel": "grok-4"
}
```

---

## ✅ Step 4: Test Basic Functionality (30 seconds)

### Test Interactive Mode

```bash
grok
```

Try typing: `Hello! Can you help me with coding?`

Press `Ctrl+C` to exit.

### Test Headless Mode

```bash
grok --prompt "What is 2+2?"
```

---

## 🎭 Step 5: Try Multi-Agent Orchestration (30 seconds)

### Check Orchestration Setup

```bash
grok orchestrate stats
```

You should see:
```
📊 Orchestration Statistics

Conversations: 0
Documents: 0
Prompts: 8
Agents: 0
```

### Run Your First Orchestration Task

```bash
grok orchestrate run "Create a simple REST API endpoint in Express.js" \
  --strategy adaptive \
  --save-doc
```

**What happens:**
1. Task is decomposed into 3-5 sub-tasks
2. Sub-tasks execute in parallel/sequential based on dependencies
3. Results are aggregated
4. Final result is displayed and saved

Expected output:
```
🚀 Starting multi-agent orchestration with 2 account(s)...

✅ Orchestration Complete

Task: Create a simple REST API endpoint in Express.js
Strategy: adaptive
Success: ✅
Execution Time: 18.23s
Total Tokens: 8,450
Total Cost: $0.0523

Sub-Tasks:
  ✅ subtask-1: Set up Express.js project structure
     Model: grok-3-fast | Tokens: 2,100 | Cost: $0.0168
  ✅ subtask-2: Create REST API endpoint
     Model: grok-code-fast-1 | Tokens: 1,850 | Cost: $0.0093
  ✅ subtask-3: Add error handling and validation
     Model: grok-3-fast | Tokens: 4,500 | Cost: $0.0360

Final Result:
[Complete implementation with code examples]

Account Usage:
  account-1: 2 requests, 4,225 tokens, $0.0261
  account-2: 2 requests, 4,225 tokens, $0.0262
```

---

## 📚 Common Use Cases

### 1. Code Review

```bash
grok orchestrate run "Review my TypeScript code for best practices" \
  --context "Focus on type safety and performance"
```

### 2. Feature Implementation

```bash
grok orchestrate run "Implement user authentication with JWT" \
  --strategy parallel \
  --max-subtasks 4
```

### 3. Bug Fixing

```bash
grok orchestrate run "Find and fix memory leaks in this Node.js app" \
  --strategy sequential
```

### 4. Documentation

```bash
grok orchestrate run "Generate API documentation" \
  --save-doc
```

---

## 🎨 Using Prompt Templates

### List Available Templates

```bash
grok orchestrate prompt list
```

Output:
```
📝 Prompt Templates

code-review
  Comprehensive code review with security and quality analysis
  Variables: code, language, focus

documentation-generator
  Generate comprehensive documentation for code
  Variables: code, language, audience

bug-fix
  Analyze and fix bugs in code
  Variables: code, language, error, context
...
```

### Use a Template

```bash
grok orchestrate prompt render code-review \
  --vars code="function add(a,b){return a+b}" \
         language="javascript" \
         focus="best practices"
```

---

## 💡 Tips for Best Results

### 1. Choose the Right Strategy

- **Adaptive** (default): Best for most tasks
- **Parallel**: When sub-tasks are independent (fastest)
- **Sequential**: When sub-tasks depend on each other (better context)

### 2. Optimize Costs

- Use `--load-balancing cost-optimized` for budget constraints
- Set `--max-subtasks 3` for simpler tasks
- Monitor usage with `grok orchestrate stats`

### 3. Provide Context

```bash
grok orchestrate run "Refactor this code" \
  --context "Use TypeScript, maintain backwards compatibility, focus on readability"
```

### 4. Save Important Results

```bash
grok orchestrate run "..." --save-doc
grok orchestrate docs  # List saved documents
```

---

## 🔧 Troubleshooting

### Error: "API key required"

**Solution:** Set environment variable or create config file

```bash
export GROK_API_KEY=xai-your-key-here
```

### Error: "All accounts are currently rate-limited"

**Solution:** Wait 60 seconds or add more API keys

Rate limit: 60 requests/minute per account

### Error: "Template not found"

**Solution:** List available templates

```bash
grok orchestrate prompt list
```

### Slow Performance

**Solutions:**
- Reduce `--max-subtasks`
- Use `--strategy parallel` for independent tasks
- Use faster models for simple tasks

---

## 📖 Next Steps

### Learn More

- **[Complete Documentation](docs/ORCHESTRATION.md)** - In-depth guide
- **[Architecture](docs/diagrams/)** - System diagrams
- **[Test Suite](tests/)** - 71 tests with examples

### Advanced Features

- **MCP Integration**: Extend with custom tools
  ```bash
  grok mcp add my-server --command npx --args server.js
  ```

- **Custom Instructions**: Add `.grok/GROK.md` in your project
  ```markdown
  Always use TypeScript for new files.
  Follow functional programming principles.
  ```

- **Interactive Mode**: Full-featured chat interface
  ```bash
  grok -d /path/to/project
  ```

### Community

- **GitHub Issues**: [Report bugs or request features](https://github.com/manutej/supergrok-cli/issues)
- **Discussions**: [Ask questions and share ideas](https://github.com/manutej/supergrok-cli/discussions)

---

## 🎯 Example Workflow

Here's a complete workflow from installation to orchestration:

```bash
# 1. Install
npm install -g @manutej/supergrok-cli

# 2. Configure
export GROK_API_KEY=xai-your-key-1
export GROK_API_KEY_2=xai-your-key-2

# 3. Verify
grok --version
grok orchestrate stats

# 4. Run a task
grok orchestrate run "Build a todo list API with CRUD operations" \
  --strategy adaptive \
  --context "Use Express.js, SQLite, and RESTful design" \
  --save-doc

# 5. View results
grok orchestrate docs

# 6. Check usage
grok orchestrate stats
```

---

## 🆘 Getting Help

**Interactive Help:**
```bash
grok --help
grok orchestrate --help
grok orchestrate run --help
```

**Quick Reference:**
```bash
# Basic usage
grok                                    # Interactive mode
grok --prompt "..."                     # Headless mode

# Orchestration
grok orchestrate run "..."              # Run task
grok orchestrate stats                  # View stats
grok orchestrate prompt list            # List templates
grok orchestrate docs                   # List documents

# MCP Tools
grok mcp list                           # List servers
grok mcp add <name>                     # Add server
```

---

**Ready to build? Start orchestrating! 🎭**

```bash
grok orchestrate run "Your amazing idea here"
```
