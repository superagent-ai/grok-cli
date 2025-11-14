# Contributing to Grok CLI

Thank you for your interest in contributing to Grok CLI! This document provides guidelines and instructions for contributing.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Making Changes](#making-changes)
- [Code Style](#code-style)
- [Testing](#testing)
- [Submitting Changes](#submitting-changes)
- [Reporting Bugs](#reporting-bugs)
- [Feature Requests](#feature-requests)

## Code of Conduct

### Our Pledge

We are committed to providing a welcoming and inclusive environment for all contributors, regardless of experience level, background, or identity.

### Expected Behavior

- Be respectful and considerate
- Welcome newcomers and help them get started
- Provide constructive feedback
- Focus on what is best for the community
- Show empathy towards other contributors

### Unacceptable Behavior

- Harassment, discrimination, or offensive comments
- Personal attacks or insults
- Publishing others' private information
- Trolling or inflammatory comments
- Other conduct that could be considered inappropriate

## Getting Started

1. **Fork the repository** on GitHub
2. **Clone your fork** locally:
   ```bash
   git clone https://github.com/YOUR_USERNAME/grok-cli.git
   cd grok-cli
   ```
3. **Add upstream remote**:
   ```bash
   git remote add upstream https://github.com/vibe-kit/grok-cli.git
   ```

## Development Setup

### Prerequisites

- Node.js 16 or higher
- npm or yarn
- Git
- A Grok API key (for testing)

### Installation

```bash
# Install dependencies
npm install

# Set up your API key
cp .env.example .env
# Edit .env and add your GROK_API_KEY

# Build the project
npm run build

# Run in development mode
npm run dev

# Run tests
npm test
```

### Project Structure

```
grok-cli/
├── src/
│   ├── agent/          # Core agent logic
│   ├── config/         # Configuration constants
│   ├── grok/           # Grok API client
│   ├── tools/          # Tool implementations
│   ├── ui/             # Terminal UI components
│   ├── utils/          # Utility functions
│   └── index.ts        # CLI entry point
├── tests/              # Test files
├── dist/               # Built files (git-ignored)
└── docs/               # Documentation
```

## Making Changes

### Creating a Branch

Always create a new branch for your changes:

```bash
# Update your local main branch
git checkout main
git pull upstream main

# Create a new branch
git checkout -b feature/your-feature-name
# or
git checkout -b fix/your-bug-fix
```

### Branch Naming Convention

- `feature/` - New features
- `fix/` - Bug fixes
- `docs/` - Documentation changes
- `refactor/` - Code refactoring
- `test/` - Adding or updating tests
- `chore/` - Maintenance tasks

Examples:
- `feature/add-search-caching`
- `fix/command-validation-error`
- `docs/update-api-examples`

### Commit Messages

Follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:

```
<type>(<scope>): <subject>

<body>

<footer>
```

**Types:**
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, etc.)
- `refactor`: Code refactoring
- `test`: Adding or updating tests
- `chore`: Maintenance tasks
- `perf`: Performance improvements

**Examples:**

```
feat(search): add caching for search results

Implement LRU cache for search results with 60s TTL to improve
performance for repeated searches.

Closes #123
```

```
fix(bash): prevent command injection in arguments

Add validation to sanitize bash command arguments and prevent
injection attacks.
```

## Code Style

### TypeScript

- Use TypeScript for all code
- Enable strict type checking
- Avoid `any` types when possible
- Use interfaces for complex types

### Formatting

- 2 spaces for indentation
- Single quotes for strings
- Semicolons required
- Use ESLint configuration

```bash
# Check linting
npm run lint

# Fix auto-fixable issues
npm run lint -- --fix
```

### Best Practices

1. **Error Handling**
   - Use custom error classes from `src/utils/errors.ts`
   - Provide descriptive error messages
   - Always handle edge cases

2. **Configuration**
   - Use constants from `src/config/constants.ts`
   - Never hardcode magic numbers
   - Document configuration options

3. **Documentation**
   - Add JSDoc comments to public APIs
   - Include examples in comments
   - Update README when adding features

4. **Security**
   - Sanitize user input
   - Validate file paths
   - Use secure coding practices
   - Never commit API keys or secrets

## Testing

### Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Generate coverage report
npm run test:coverage
```

### Writing Tests

- Place tests in `tests/` directory
- Use `.test.ts` suffix for test files
- Aim for >80% code coverage
- Test both happy paths and edge cases

**Example Test:**

```typescript
import { myFunction } from '../../src/utils/my-module';

describe('myFunction', () => {
  it('should handle valid input', () => {
    const result = myFunction('input');
    expect(result).toBe('expected');
  });

  it('should throw on invalid input', () => {
    expect(() => myFunction(null)).toThrow(ValidationError);
  });
});
```

### Test Requirements

- All new features must include tests
- Bug fixes should include regression tests
- Maintain or improve code coverage
- All tests must pass before merging

## Submitting Changes

### Pull Request Process

1. **Update your branch**:
   ```bash
   git checkout main
   git pull upstream main
   git checkout your-branch
   git rebase main
   ```

2. **Ensure quality**:
   ```bash
   npm run typecheck  # Check types
   npm run lint       # Check code style
   npm test           # Run tests
   npm run build      # Verify build works
   ```

3. **Push your changes**:
   ```bash
   git push origin your-branch
   ```

4. **Create a Pull Request** on GitHub

### Pull Request Template

```markdown
## Description

Brief description of the changes.

## Type of Change

- [ ] Bug fix (non-breaking change which fixes an issue)
- [ ] New feature (non-breaking change which adds functionality)
- [ ] Breaking change (fix or feature that would cause existing functionality to not work as expected)
- [ ] Documentation update

## Testing

Describe the tests you ran and how to reproduce them.

## Checklist

- [ ] My code follows the style guidelines
- [ ] I have performed a self-review
- [ ] I have commented my code, particularly in hard-to-understand areas
- [ ] I have made corresponding changes to the documentation
- [ ] My changes generate no new warnings
- [ ] I have added tests that prove my fix is effective or that my feature works
- [ ] New and existing unit tests pass locally
- [ ] Any dependent changes have been merged and published

## Related Issues

Closes #(issue number)
```

### Review Process

1. Maintainers will review your PR
2. Address any requested changes
3. Once approved, a maintainer will merge your PR
4. Your contribution will be included in the next release!

## Reporting Bugs

### Before Submitting

- Check existing issues to avoid duplicates
- Verify the bug exists in the latest version
- Collect relevant information

### Bug Report Template

```markdown
**Describe the bug**
A clear and concise description.

**To Reproduce**
Steps to reproduce:
1. Run command '...'
2. Enter input '...'
3. See error

**Expected behavior**
What you expected to happen.

**Actual behavior**
What actually happened.

**Environment:**
- Grok CLI version: [e.g., 0.0.12]
- Node.js version: [e.g., 18.0.0]
- OS: [e.g., macOS 13.0]

**Additional context**
Any other relevant information.
```

## Feature Requests

We welcome feature requests! Please:

1. Check if the feature already exists
2. Search existing feature requests
3. Describe the feature clearly
4. Explain the use case
5. Provide examples if possible

### Feature Request Template

```markdown
**Is your feature request related to a problem?**
A clear description of the problem.

**Describe the solution you'd like**
What you want to happen.

**Describe alternatives you've considered**
Any alternative solutions or features.

**Additional context**
Any other relevant information.
```

## Development Tips

### Useful Commands

```bash
# Watch for changes and rebuild
npm run dev

# Type check without building
npm run typecheck

# Generate test coverage report
npm run test:coverage

# Run specific test file
npm test -- cache.test.ts

# Debug tests
node --inspect-brk node_modules/.bin/jest --runInBand
```

### IDE Setup

**VS Code** (recommended):
- Install ESLint extension
- Install Prettier extension
- Use workspace settings from `.vscode/settings.json`

**WebStorm/IntelliJ**:
- Enable ESLint
- Enable TypeScript support
- Configure code style to match project

### Common Issues

**Tests failing locally:**
- Ensure dependencies are up to date: `npm install`
- Clear Jest cache: `npm test -- --clearCache`

**Type errors:**
- Run `npm run typecheck` to see all errors
- Check that types are properly imported

**Build errors:**
- Clean build artifacts: `rm -rf dist/`
- Rebuild: `npm run build`

## Recognition

Contributors will be:
- Listed in the repository contributors
- Mentioned in release notes
- Given credit for their contributions

## Questions?

- Check the [README](README.md) first
- Review [existing issues](https://github.com/vibe-kit/grok-cli/issues)
- Ask in discussions or open a new issue

## License

By contributing, you agree that your contributions will be licensed under the MIT License.

---

Thank you for contributing to Grok CLI! 🚀
