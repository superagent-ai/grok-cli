# Custom Instructions for Grok CLI

This file contains custom instructions that will be loaded by Grok CLI when working in this directory.

Place this file at `.grok/GROK.md` in your project root to customize Grok's behavior.

## Code Style

- Always use TypeScript for new code files
- Use functional components with hooks for React
- Prefer const assertions and explicit typing over inference
- Follow the existing code style and patterns in this project
- Add JSDoc comments for all public functions and interfaces

## Testing

- Write tests for all new features
- Ensure tests pass before committing
- Aim for >80% code coverage
- Use descriptive test names that explain the behavior

## Documentation

- Update README.md when adding new features
- Add inline comments for complex logic
- Keep documentation up to date with code changes

## Git Workflow

- Use conventional commit messages (feat:, fix:, docs:, etc.)
- Create feature branches for new work
- Rebase before merging to keep history clean
- Squash commits when appropriate

## Security

- Never commit API keys or secrets
- Sanitize user input
- Validate file paths to prevent traversal attacks
- Use parameterized queries for any database operations
- Review security implications of new code

## Performance

- Consider performance implications of changes
- Use caching where appropriate
- Profile code for bottlenecks before optimizing
- Avoid premature optimization

## Project-Specific Guidelines

Add your project-specific instructions below:

```
<!-- Example:
- Use Redux for state management
- Follow the component structure in src/components/
- API calls should go through the api/ directory
- Use styled-components for styling
-->
```
