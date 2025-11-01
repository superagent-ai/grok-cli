# Contributing to SuperGrok-CLI

Thank you for your interest in contributing to SuperGrok-CLI! This document provides guidelines and information for contributors.

## Code of Conduct

This project follows a standard code of conduct. Please be respectful and constructive in all interactions.

## Getting Started

### Prerequisites

- **Bun 1.0+** or **Node.js 18+**
- **Git**
- **Grok API key** from [X.AI](https://x.ai)

### Setup Development Environment

1. **Fork the repository**
   ```bash
   # Visit https://github.com/manutej/supergrok-cli
   # Click "Fork" button
   ```

2. **Clone your fork**
   ```bash
   git clone https://github.com/YOUR_USERNAME/supergrok-cli.git
   cd supergrok-cli
   ```

3. **Install dependencies**
   ```bash
   bun install
   # or
   npm install
   ```

4. **Build the project**
   ```bash
   bun run build
   ```

5. **Run in development mode**
   ```bash
   bun run dev
   ```

## Development Workflow

### Branch Naming Convention

- `feature/your-feature-name` - New features
- `fix/bug-description` - Bug fixes
- `docs/documentation-update` - Documentation changes
- `refactor/what-you-refactored` - Code refactoring
- `test/test-description` - Test additions/updates

### Commit Message Format

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
type(scope): subject

body (optional)

footer (optional)
```

**Types:**
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, etc.)
- `refactor`: Code refactoring
- `test`: Test additions/changes
- `chore`: Build process, dependencies, etc.

**Examples:**
```
feat(modes): add PLAN mode for read-only strategic analysis
fix(git): resolve transaction rollback issue
docs(readme): update installation instructions
```

### Pull Request Process

1. **Create a feature branch**
   ```bash
   git checkout -b feature/your-feature
   ```

2. **Make your changes**
   - Write clear, readable code
   - Add tests for new functionality
   - Update documentation as needed

3. **Run tests and linting**
   ```bash
   bun run typecheck
   bun run lint
   # Add tests when test suite is available
   ```

4. **Commit your changes**
   ```bash
   git add .
   git commit -m "feat(scope): description"
   ```

5. **Push to your fork**
   ```bash
   git push origin feature/your-feature
   ```

6. **Create Pull Request**
   - Go to [github.com/manutej/supergrok-cli](https://github.com/manutej/supergrok-cli)
   - Click "New Pull Request"
   - Select your branch
   - Fill in PR template

## Project Structure

```
supergrok-cli/
├── src/
│   ├── agent/          # Agent orchestration and modes
│   ├── grok/           # Grok API client
│   ├── mcp/            # Model Context Protocol
│   ├── tools/          # Tool implementations
│   ├── ui/             # Terminal UI components
│   ├── utils/          # Utilities and config
│   └── types/          # TypeScript types
├── docs/               # Documentation
│   ├── diagrams/       # Architecture diagrams
│   └── *.md           # Professional docs
├── tests/             # Test files (coming soon)
└── .grok/             # Example configuration
```

## Development Guidelines

### Code Style

- Use **TypeScript** for all new code
- Follow existing code style
- Use **async/await** over callbacks
- Prefer **functional patterns** where appropriate
- Add **JSDoc comments** for public APIs

### Testing

- Write tests for new features (test framework coming in Phase 1)
- Ensure existing tests pass
- Aim for >80% code coverage

### Documentation

- Update README.md for user-facing changes
- Update docs/ for architectural changes
- Add JSDoc comments for public APIs
- Update diagrams if architecture changes

## Version 2.0 Contribution Areas

### Phase 1: Foundation (Current)

- [ ] Multi-mode agent system (Plan/Act/Architect/Review/Chat)
- [ ] Git-native operations with atomic commits
- [ ] Plugin SDK development
- [ ] Repository indexing

### Phase 2: Enterprise

- [ ] RBAC implementation
- [ ] Audit logging
- [ ] Policy engine
- [ ] Local LLM support

### Phase 3: Advanced

- [ ] Multi-agent orchestration
- [ ] Desktop application (Tauri/Electron)
- [ ] RAG implementation
- [ ] Advanced context management

### Phase 4: Innovation

- [ ] Multi-model routing
- [ ] Visual workflow builder
- [ ] Team collaboration features
- [ ] Industry-specific extensions

## Plugin Development

Want to create a plugin? See:
- [Phase 1 Implementation Guide](./PHASE1_IMPLEMENTATION_GUIDE.md#weeks-5-7-plugin-architecture)
- Example plugins in `.grok/plugins/` (coming soon)

## Questions?

- Open an issue with the `question` label
- Check [Documentation Index](./docs/INDEX.md)
- Review [v2.0 Roadmap](./docs/ROADMAP_V2.0_PROFESSIONAL.md)

## License

By contributing, you agree that your contributions will be licensed under the MIT License.

---

Thank you for contributing to SuperGrok-CLI! 🚀
