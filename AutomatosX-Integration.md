# AutomatosX Integration Guide

**Version**: 8.4.15
**Last Updated**: 2025-11-18

This is the complete integration guide for AutomatosX - an AI agent orchestration platform with persistent memory, multi-agent collaboration, and policy-driven routing.

**For AI assistants**: This file contains all AutomatosX commands, agent capabilities, memory features, and workflows. Read this file completely to understand how to use AutomatosX effectively.

---

## What is AutomatosX?

AutomatosX is an AI Agent Orchestration Platform that:
- **Orchestrates 20+ specialized AI agents** for different domains (backend, frontend, security, quality, etc.)
- **Maintains persistent memory** using SQLite FTS5 for instant context retrieval
- **Routes requests intelligently** across multiple AI providers (Claude, Gemini, OpenAI, Grok)
- **Optimizes costs** by prioritizing free tiers and cheaper providers
- **Enables spec-driven workflows** with YAML-based task definitions
- **Supports multi-agent collaboration** with automatic delegation

**Repository**: https://github.com/defai-digital/automatosx

---

## Quick Start

### Installation Check

```bash
# Verify AutomatosX is installed
ax --version

# Check system status
ax status

# List available agents
ax list agents
```

### Basic Commands

```bash
# Run an agent with a task
# Note: You can use either the agent's ID (e.g., 'backend') or display name (e.g., 'Bob')
ax run <agent-name> "task description"

# Example: Backend implementation
ax run backend "create a REST API for user management"

# Example: Code review
ax run quality "review the authentication code"

# Example: Security audit
ax run security "audit the API endpoints for vulnerabilities"

# Search memory for past work
ax memory search "keyword"

# View configuration
ax config show

# Check free-tier usage and status
ax free-tier status
```

---

## Available Agents

AutomatosX includes 20+ specialized agents for different domains:

### Development Agents

- **backend** (Bob) - Backend development (Go/Rust/Node.js systems)
- **frontend** (Frank) - Frontend development (React/Next.js/Swift)
- **fullstack** (Felix) - Full-stack development (Node.js/TypeScript)
- **mobile** (Maya) - Mobile development (iOS/Android, Swift/Kotlin/Flutter)
- **devops** (Oliver) - DevOps and infrastructure automation

### Quality & Security

- **quality** (Queenie) - QA, testing, and code quality assurance
- **security** (Steve) - Security auditing and threat modeling

### Architecture & Design

- **architecture** (Avery) - System architecture and ADR management
- **design** (Debbee) - UX/UI design and interaction patterns

### Data & Science

- **data** (Daisy) - Data engineering and ETL pipelines
- **data-scientist** (Dana) - Machine learning and data science
- **researcher** (Rodman) - Research and analysis

### Leadership & Strategy

- **cto** (Tony) - Technical strategy and technology decisions
- **ceo** (Eric) - Business leadership and strategic direction
- **product** (Paris) - Product management and roadmap planning

### Specialized Domains

- **aerospace-scientist** (Astrid) - Aerospace engineering and mission design
- **quantum-engineer** (Quinn) - Quantum computing and algorithms
- **creative-marketer** (Candy) - Creative marketing and content strategy
- **writer** (Wendy) - Technical writing and documentation
- **standard** (Stan) - Standards and best practices expert

### View All Agents

```bash
# List all agents with descriptions
ax list agents

# JSON format with full capabilities
ax list agents --format json

# Show specific agent details
ax agent show backend
```

---

## Agent Capabilities

Each agent has specialized knowledge and can:

1. **Execute Tasks**: Implement features, write code, create designs
2. **Delegate Work**: Automatically delegate tasks to other agents
3. **Access Memory**: Retrieve past decisions and context
4. **Collaborate**: Work with multiple agents in sessions
5. **Use Tools**: File operations, code analysis, testing

### Example: Backend Agent (Bob)

**Specialization**:
- Go, Rust, Node.js backend systems
- API design and implementation
- Database schema design
- Microservices architecture

**Example Tasks**:
```bash
ax run backend "create a REST API for user authentication"
ax run backend "design a database schema for e-commerce"
ax run backend "implement JWT token validation"
```

### Example: Security Agent (Steve)

**Specialization**:
- Security auditing and vulnerability scanning
- Threat modeling and risk assessment
- OWASP Top 10 compliance
- Authentication and authorization review

**Example Tasks**:
```bash
ax run security "audit the authentication system"
ax run security "review API endpoints for SQL injection"
ax run security "create a threat model for the payment system"
```

---

## Memory System

AutomatosX maintains persistent memory of all agent interactions.

### How Memory Works

- **Automatic**: All agent conversations are saved automatically
- **Fast**: SQLite FTS5 full-text search (< 1ms queries)
- **Local**: 100% private, data never leaves your machine
- **Cost**: $0 (no API calls for memory operations)
- **Storage**: `.automatosx/memory/memories.db`

### Memory Commands

```bash
# Search for past conversations
ax memory search "authentication"
ax memory search "API design"

# List recent memories
ax memory list --limit 10

# Export memory for backup
ax memory export > backup.json

# Import memory
ax memory import < backup.json

# Clear old memories
ax memory clear --before "2024-01-01"

# View memory statistics
ax cache stats
```

### Memory in Action

```bash
# First task - design is saved to memory
ax run product "Design a calculator with add/subtract features"

# Later task - automatically retrieves the design from memory
ax run backend "Implement the calculator API based on the product design"

# Agent automatically finds the product design in memory
# and uses it as context for implementation
```

---

## Multi-Agent Collaboration

Agents can work together through delegation and sessions.

### Automatic Delegation

Agents can delegate tasks to other specialized agents:

```bash
ax run product "Build a complete user authentication feature"

# Flow:
# 1. Product agent designs the system
# 2. Automatically delegates implementation to backend agent
# 3. Automatically delegates security audit to security agent
# 4. Results are combined and saved to memory
```

### Sessions

Create collaborative sessions with multiple agents:

```bash
# Create a session
ax session create auth-work backend security quality

# Add tasks to the session
ax session task auth-work "Implement and audit authentication"

# View session status
ax session show auth-work

# List all sessions
ax session list

# Close session
ax session close auth-work
```

---

## Provider Routing

AutomatosX supports multiple AI providers with intelligent routing.

### Supported Providers

- **Claude** (Anthropic) - Best for code implementation and reasoning
- **Gemini** (Google) - Best for creative work and UI/UX
- **OpenAI** (GPT) - Best for planning and architecture
- **Codex** (OpenAI) - Best for code generation and completion
- **Grok** (X.AI / Z.AI) - Best for debugging and fast analysis

### Provider Priority

Configured in `automatosx.config.json`:

```json
{
  "providers": {
    "claude-code": {
      "enabled": true,
      "priority": 1
    },
    "grok": {
      "enabled": true,
      "priority": 2
    },
    "codex": {
      "enabled": true,
      "priority": 3
    },
    "gemini-cli": {
      "enabled": true,
      "priority": 4
    }
  }
}
```

**Priority**: 1 = highest (tried first), 4 = lowest (last fallback)

### Free-Tier Optimization

AutomatosX automatically prioritizes free-tier providers when available. Specific free-tier details (like request limits) can vary and are best checked directly.

Check current free-tier status and usage:
```bash
ax free-tier status
ax free-tier history
```

### Manual Provider Selection

Override automatic routing:

```bash
# Use specific provider
ax run backend "task" --provider gemini-cli
ax run backend "task" --provider claude-code
ax run backend "task" --provider grok

# Provider diagnostics
ax doctor gemini-cli
ax doctor claude-code
```

---

## Spec-Driven Workflows

For complex projects, use YAML specs to define workflows.

### Creating Specs

```bash
# Create spec from natural language
ax spec create "Build authentication with database, API, JWT, and tests"

# Or manually create .specify/tasks.md
```

### Spec Structure

```yaml
# workflow.ax.yaml
name: Authentication System
version: 1.0.0

tasks:
  - id: design
    agent: product
    description: Design authentication system

  - id: implement
    agent: backend
    description: Implement authentication API
    depends_on: [design]

  - id: test
    agent: quality
    description: Write tests for authentication
    depends_on: [implement]

  - id: audit
    agent: security
    description: Security audit
    depends_on: [implement]
```

### Running Specs

```bash
# Generate execution plan
ax spec plan workflow.ax.yaml

# Generate DAG visualization
ax gen dag workflow.ax.yaml

# Execute workflow
ax spec run workflow.ax.yaml

# Parallel execution
ax spec run workflow.ax.yaml --parallel

# Check progress
ax spec status
```

### Spec Generators

```bash
# Generate plan from spec
ax gen plan workflow.ax.yaml

# Generate dependency DAG
ax gen dag workflow.ax.yaml
```

---

## Workspace Conventions

AutomatosX uses specific directories for organized file management.

### Directory Structure

- **`automatosx/PRD/`** - Product Requirements Documents, design specs, planning
  - Use for: Architecture designs, feature specs, technical requirements
  - Example: `automatosx/PRD/auth-system-design.md`
  - **In .gitignore**: Private planning documents

- **`automatosx/tmp/`** - Temporary files, scratch work, intermediate outputs
  - Use for: Draft code, test outputs, temporary analysis
  - Auto-cleaned periodically
  - Example: `automatosx/tmp/draft-api-endpoints.ts`
  - **In .gitignore**: Temporary working files

### Using Conventions

```bash
# Product agent saves design to PRD
ax run product "Design authentication system and save to automatosx/PRD/auth-design.md"

# Backend agent creates draft in tmp
ax run backend "Create draft implementation in automatosx/tmp/auth-draft.ts"

# After review, implement in actual location
ax run backend "Implement the spec from automatosx/PRD/auth-design.md in src/auth/"
```

---

## Configuration

### Main Configuration File

Edit `automatosx.config.json` to customize behavior:

```json
{
  "providers": {
    "claude-code": {
      "enabled": true,
      "priority": 1,
      "timeout": 120000
    },
    "gemini-cli": {
      "enabled": true,
      "priority": 2,
      "command": "gemini"
    }
  },
  "execution": {
    "defaultTimeout": 150000,
    "maxRetries": 3,
    "concurrency": {
      "maxConcurrentAgents": 4
    }
  },
  "memory": {
    "enabled": true,
    "maxEntries": 10000,
    "persistence": {
      "debounceMs": 1000
    }
  },
  "orchestration": {
    "delegation": {
      "enabled": true,
      "maxDepth": 2
    }
  },
  "router": {
    "healthCheck": {
      "intervalMs": 300000
    },
    "freeTier": {
      "prioritize": true
    }
  }
}
```

### View Configuration

```bash
# Show current configuration
ax config show

# Show specific section
ax config show providers

# Edit configuration (opens in $EDITOR)
ax config edit
```

### Custom Agents

Create custom agents:

```bash
# Interactive creation
ax agent create my-agent --template developer --interactive

# From file
# For details on the my-agent.yaml structure, refer to the agent configuration documentation.
ax agent create my-agent --from my-agent.yaml

# List custom agents
ax agent list --custom

# Show agent profile
ax agent show my-agent

# Remove agent
ax agent remove my-agent
```

---

## Common Workflows

### 1. Feature Implementation

```bash
# Design phase
ax run product "Design user authentication feature with JWT"

# Implementation phase
ax run backend "Implement the authentication API"

# Testing phase
ax run quality "Write comprehensive tests for authentication"

# Security phase
ax run security "Audit authentication for vulnerabilities"

# All context is automatically shared via memory!
```

### 2. Bug Fixing

```bash
# Find bugs
ax run quality "Review src/auth.ts for bugs"

# Fix bugs
ax run backend "Fix the bugs found in authentication"

# Verify fix
ax run quality "Test the authentication fixes"
```

### 3. Code Review

```bash
# Review code
ax run quality "Review the pull request changes"

# Security review
ax run security "Security review of PR changes"

# Architecture review
ax run architecture "Review architecture decisions in PR"
```

### 4. Documentation

```bash
# API documentation
ax run writer "Document the authentication API"

# Technical specs
ax run writer "Create ADR for authentication approach"

# User guides
ax run writer "Write user guide for authentication"
```

---

## Debugging & Troubleshooting

### Debug Mode

```bash
# Enable debug logging
ax --debug run backend "task"

# Set log level
export AUTOMATOSX_LOG_LEVEL=debug
ax run backend "task"

# Quiet mode (errors only)
ax --quiet run backend "task"
```

### Diagnostics

```bash
# Check system status
ax status

# Provider diagnostics
ax doctor
ax doctor claude-code
ax doctor gemini-cli

# View trace logs
ax providers trace
ax providers trace --follow  # Real-time
ax providers trace --provider gemini-cli

# Memory diagnostics
ax cache stats
```

### Common Issues

**"Agent not found"**
```bash
# List available agents (case-sensitive!)
ax list agents

# Correct: ax run backend "task"
# Wrong: ax run Backend "task"
```

**"Provider not available"**
```bash
# Check which providers are working
ax status
ax doctor

# Try specific provider
ax run backend "task" --provider gemini-cli
```

**"Out of memory"**
```bash
# Clear old memories
ax memory clear --before "2024-01-01"

# View memory usage
ax cache stats

# Export and backup before clearing
ax memory export > backup-$(date +%Y%m%d).json
```

**"Timeout"**
```bash
# Increase timeout for specific run
ax run backend "complex task" --timeout 300000

# Or edit automatosx.config.json:
# "execution": { "defaultTimeout": 300000 }
```

---

## Advanced Features

### Parallel Execution (v5.6.0+)

```bash
# Run multiple agents in parallel
ax run product "Design feature" --parallel

# Spec-driven parallel execution
ax spec run workflow.ax.yaml --parallel
```

### Resumable Runs (v5.3.0+)

```bash
# Start long-running task with checkpoints
ax run backend "Refactor entire codebase" --resumable

# If interrupted, resume
ax resume <run-id>

# List all runs
ax runs list

# Show run details
ax runs show <run-id>
```

### Streaming Output (v5.6.5+)

```bash
# Real-time streaming from AI providers
ax run backend "Explain this codebase" --streaming

# Works with Grok CLI (JSONL output)
ax run backend "task" --provider grok --streaming
```

### Cost Estimation

Cost estimation is **disabled by default** (pricing changes frequently).

To enable, edit `automatosx.config.json`:
```json
{
  "costEstimation": {
    "enabled": true,
    "disclaimer": "Cost estimates are approximate and may be outdated."
  }
}
```

When enabled:
```bash
# View estimated costs in plan
ax spec plan workflow.ax.yaml

# Check provider costs
ax providers info gemini-cli
```

---

## Best Practices

### 1. Use the Right Agent

Match tasks to agent specializations:
- **Code implementation** → backend, frontend, fullstack
- **Code quality** → quality agent
- **Security** → security agent
- **Design** → design agent (UI/UX)
- **Planning** → product, architecture agents

### 2. Leverage Memory

Reference past work explicitly:
```bash
ax run backend "Implement based on the auth design we discussed yesterday"
```

Agents automatically search memory, but explicit references help.

### 3. Start Simple

Test with small tasks before complex workflows:
```bash
# Good: Start simple
ax run backend "create a hello world API endpoint"

# Then: Build complexity
ax run backend "add authentication to the API"
```

### 4. Review Configurations

Check timeouts and retries match your needs:
```bash
ax config show execution
ax config show providers
```

### 5. Use Sessions for Complex Work

For multi-agent workflows:
```bash
ax session create feature-work backend frontend quality security
ax session task feature-work "Build complete feature"
```

### 6. Monitor Provider Health

Regularly check provider status:
```bash
ax status
ax doctor
```

### 7. Clean Up Memory Periodically

Prevent memory bloat:
```bash
# Monthly cleanup
ax memory clear --before "30 days ago"

# After major project milestones
ax memory export > milestone-backup.json
ax memory clear --before "2024-06-01"
```

### 8. Non-Interactive Mode Behavior

When running AutomatosX in non-interactive or background mode, agents proceed automatically without asking for permission or confirmation.

- Execute tasks directly without prompting.
- If a task cannot be completed, the agent will explain why and provide workarounds.
- Agents will NOT output messages like "need to know if you want me to proceed".

---

## Integration with AI Assistants

AutomatosX is designed to work seamlessly with AI assistants:

### Supported AI Assistants

- **Claude Code** - Primary integration with MCP support
- **Gemini CLI** - Natural language support
- **OpenAI Codex** - Development assistant integration
- **Grok CLI** - Fast debugging and analysis

### Natural Language Usage

Talk naturally to your AI assistant to use AutomatosX:

**Claude Code Examples**:
```
"Please use the ax backend agent to implement user authentication"
"Ask the ax security agent to audit this code"
"Have the ax quality agent write tests for this feature"
```

**Gemini CLI Examples**:
```bash
gemini "Use ax agent backend to create a REST API"
gemini "Ask ax agent quality to review this code"
```

**Codex Examples**:
```bash
codex exec "Use ax backend agent to implement feature"
```

**Grok CLI Examples**:
```bash
grok -p "Use ax quality agent to find bugs in this code"
```

### Direct CLI Access

For terminal usage:
```bash
ax run backend "implement feature"
ax memory search "authentication"
ax session create work backend quality
```

---

## Documentation & Support

### Documentation Locations

**External Documentation:**
- **GitHub Repository**: https://github.com/defai-digital/automatosx
- **NPM Package**: https://www.npmjs.com/package/@defai-digital/ax-cli

**Internal Configuration & Definitions:**
- **Agent Profiles**: `.automatosx/agents/` (definitions of specialized agents)
- **Project Configuration**: `automatosx.config.json` (main project settings)

### Getting Help

```bash
# Command help
ax --help
ax run --help
ax memory --help

# Agent information
ax agent show <agent-name>
ax list agents

# System diagnostics
ax status
ax doctor

# Search for similar past work
ax memory search "similar task"
```

### Support Channels

- **Issues**: https://github.com/defai-digital/automatosx/issues
- **Email**: support@defai.digital

---

## Version History

### v8.4.15 (Current)
- Streamlined for AI assistant integration
- Removed standalone chatbot (focus on Claude Code, Gemini CLI, Codex)
- Improved non-interactive mode behavior
- Added workspace conventions (automatosx/PRD/, automatosx/tmp/)

### v8.0.0+
- Grok CLI integration
- Enhanced provider routing
- Workspace directory conventions

### v7.0.0+
- Natural language integration
- Removed custom slash commands
- Multi-agent collaboration improvements

---

**This is the complete AutomatosX Integration Guide. For AI-specific tips and setup instructions, see the respective integration files (CLAUDE.md, GEMINI.md, CODEX.md, GROK.md).**
