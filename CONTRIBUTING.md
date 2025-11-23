# Contributing to Grok CLI

First off, thank you for considering contributing to Grok CLI! It's people like you that make Grok CLI such a great tool.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Process](#development-process)
- [Pull Request Process](#pull-request-process)
- [Coding Standards](#coding-standards)
- [Testing Guidelines](#testing-guidelines)
- [Commit Message Guidelines](#commit-message-guidelines)
- [Project Structure](#project-structure)

## Code of Conduct

This project and everyone participating in it is governed by the [Contributor Covenant Code of Conduct](https://www.contributor-covenant.org/version/2/0/code_of_conduct/). By participating, you are expected to uphold this code.

## Getting Started

### Prerequisites

- Node.js 16.0.0 or higher
- npm or yarn
- Git
- ripgrep (optional, for better search performance)

### Setting Up Your Development Environment

1. **Fork the repository** on GitHub

2. **Clone your fork** locally:
   ```bash
   git clone https://github.com/YOUR_USERNAME/grok-cli.git
   cd grok-cli
   ```

3. **Install dependencies**:
   ```bash
   npm install
   ```

4. **Set up environment variables**:
   ```bash
   cp .env.example .env
   # Add your GROK_API_KEY to .env
   ```

5. **Run the development build**:
   ```bash
   npm run dev
   ```

6. **Run tests**:
   ```bash
   npm test
   ```

## Development Process

### Creating a Branch

Always create a new branch for your work:

```bash
git checkout -b feature/your-feature-name
# or
git checkout -b fix/bug-description
```

Branch naming convention:
- `feature/` - New features
- `fix/` - Bug fixes
- `docs/` - Documentation changes
- `refactor/` - Code refactoring
- `test/` - Adding or updating tests
- `chore/` - Maintenance tasks

### Making Changes

1. Make your changes in your feature branch
2. Add tests for any new functionality
3. Ensure all tests pass: `npm test`
4. Ensure type checking passes: `npm run typecheck`
5. Ensure linting passes: `npm run lint`
6. Format your code: `npm run format`

### Running the Application Locally

```bash
# Development mode with hot reload
npm run dev

# Build and run
npm run build
npm start

# Run with specific directory
npm run dev -- -d /path/to/project
```

## Pull Request Process

1. **Update documentation** if you're adding or changing features

2. **Add tests** for new functionality:
   - Unit tests in `__tests__` directories
   - Aim for 80%+ code coverage
   - Test edge cases and error conditions

3. **Ensure all checks pass**:
   ```bash
   npm run typecheck  # TypeScript checks
   npm run lint       # Linting
   npm test           # Tests
   npm run format:check # Code formatting
   ```

4. **Update the README.md** with details of changes if applicable

5. **Commit your changes** following our [commit message guidelines](#commit-message-guidelines)

6. **Push to your fork**:
   ```bash
   git push origin feature/your-feature-name
   ```

7. **Create a Pull Request** from your fork to our `main` branch

8. **Address review feedback** - a maintainer will review your PR and may request changes

### Pull Request Guidelines

- Keep PRs focused on a single feature or fix
- Write clear PR descriptions explaining what and why
- Link related issues in the PR description
- Ensure CI/CD checks pass
- Be responsive to feedback
- Keep your PR up to date with the main branch

## Coding Standards

### TypeScript

- Use TypeScript for all new code
- Enable strict type checking (we're working towards full strict mode)
- Avoid `any` types - use `unknown` if type is truly unknown
- Prefer interfaces over types for object shapes
- Use const assertions where appropriate

### Code Style

We use Prettier and ESLint to maintain consistent code style:

```bash
# Auto-format code
npm run format

# Check formatting
npm run format:check

# Lint code
npm run lint

# Auto-fix linting issues
npm run lint:fix
```

**Key style points:**
- Use single quotes for strings
- Use semicolons
- 2 spaces for indentation
- Max line length: 100 characters
- Use arrow functions for callbacks
- Use async/await over promises

### File Organization

```
src/
├── agent/        # Core agent logic
├── grok/         # Grok API client and tools
├── tools/        # Tool implementations
├── ui/           # UI components
├── utils/        # Utility functions
├── types/        # TypeScript type definitions
└── hooks/        # React hooks
```

### Naming Conventions

- **Files**: kebab-case (e.g., `text-editor.ts`)
- **Components**: PascalCase (e.g., `ChatInterface.tsx`)
- **Functions**: camelCase (e.g., `processMessage`)
- **Constants**: UPPER_SNAKE_CASE (e.g., `MAX_RETRIES`)
- **Interfaces/Types**: PascalCase (e.g., `ToolDefinition`)

### Documentation

- Add JSDoc comments for all public functions and classes
- Include parameter descriptions and return types
- Add usage examples where helpful
- Document edge cases and assumptions

Example:
```typescript
/**
 * Validates a file path to prevent path traversal attacks
 *
 * @param inputPath - The path to validate (can be relative or absolute)
 * @param workingDir - The base working directory
 * @returns The resolved absolute path if valid
 * @throws {Error} If path traversal is detected
 *
 * @example
 * ```typescript
 * const safePath = validatePath('../config.json', '/home/user/project');
 * ```
 */
export function validatePath(inputPath: string, workingDir: string): string {
  // Implementation
}
```

## Testing Guidelines

### Test Structure

- Unit tests go in `__tests__` directories next to the code they test
- Name test files with `.test.ts` or `.spec.ts` extension
- Use descriptive test names that explain what is being tested

### Writing Tests

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

describe('MyModule', () => {
  describe('myFunction', () => {
    it('should handle normal case', () => {
      const result = myFunction('input');
      expect(result).toBe('expected');
    });

    it('should handle edge case', () => {
      const result = myFunction('');
      expect(result).toBe('');
    });

    it('should throw on invalid input', () => {
      expect(() => myFunction(null)).toThrow('Invalid input');
    });
  });
});
```

### Test Coverage

- Aim for 80%+ code coverage
- Test happy paths and edge cases
- Test error conditions
- Mock external dependencies (API calls, file system, etc.)

### Running Tests

```bash
# Run tests in watch mode
npm test

# Run tests once
npm run test:run

# Run with coverage
npm run test:coverage

# Run with UI
npm run test:ui
```

## Commit Message Guidelines

We follow the [Conventional Commits](https://www.conventionalcommits.org/) specification.

### Format

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Type

Must be one of:
- **feat**: New feature
- **fix**: Bug fix
- **docs**: Documentation only changes
- **style**: Code style changes (formatting, etc.)
- **refactor**: Code refactoring
- **perf**: Performance improvements
- **test**: Adding or updating tests
- **chore**: Maintenance tasks
- **ci**: CI/CD changes
- **build**: Build system changes

### Scope (optional)

The scope should be the name of the affected module:
- `agent`
- `tools`
- `ui`
- `api`
- `security`

### Examples

```
feat(tools): add new search tool with fuzzy matching

This adds a new search tool that uses ripgrep for fast searching
and includes fuzzy matching for file names.

Closes #123
```

```
fix(security): prevent path traversal attacks

Implement path validation to ensure all file operations stay
within the working directory.

BREAKING CHANGE: File paths outside working directory now throw errors
```

```
docs: update installation instructions

Add macOS-specific instructions and troubleshooting section.
```

### Commit Message Rules

- Use the imperative mood ("add feature" not "added feature")
- Don't capitalize the first letter of the subject
- No period at the end of the subject
- Limit subject line to 100 characters
- Separate subject from body with a blank line
- Wrap body at 72 characters
- Use body to explain what and why, not how

## Project Structure

```
grok-cli/
├── .github/              # GitHub workflows and templates
│   └── workflows/        # CI/CD workflows
├── .husky/               # Git hooks
├── src/
│   ├── agent/            # Core agent logic (GrokAgent)
│   ├── grok/             # Grok API client and tool definitions
│   ├── tools/            # Tool implementations
│   │   ├── bash-tool.ts
│   │   ├── file-tool.ts
│   │   ├── search-tool.ts
│   │   └── text-editor.ts
│   ├── ui/               # Ink/React UI components
│   │   ├── components/   # React components
│   │   └── utils/        # UI utilities
│   ├── utils/            # Utility functions
│   │   ├── path-validator.ts
│   │   ├── command-validator.ts
│   │   ├── confirmation-service.ts
│   │   ├── settings.ts
│   │   └── token-counter.ts
│   ├── types/            # TypeScript type definitions
│   ├── hooks/            # React hooks
│   └── index.ts          # CLI entry point
├── dist/                 # Compiled output
├── tests/                # Integration and E2E tests
├── AUDIT.md              # Technical audit report
├── CONTRIBUTING.md       # This file
├── ARCHITECTURE.md       # Architecture documentation
└── README.md             # User documentation
```

## Getting Help

- **Documentation**: Check the [README.md](README.md) and [ARCHITECTURE.md](ARCHITECTURE.md)
- **Issues**: Browse [existing issues](https://github.com/your-org/grok-cli/issues)
- **Discussions**: Join [GitHub Discussions](https://github.com/your-org/grok-cli/discussions)
- **Discord**: Join our [Discord community](#)

## Recognition

Contributors will be recognized in:
- The project README
- Release notes
- Our contributors page

Thank you for your contributions! 🎉
