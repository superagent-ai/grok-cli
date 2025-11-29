# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Comprehensive test infrastructure with Jest
  - Unit tests for cache system
  - Unit tests for error utilities
  - Unit tests for model utilities
  - Test coverage reporting
  - Watch mode and coverage scripts
- Input sanitization utilities
  - File path sanitization (prevent directory traversal)
  - Command argument sanitization (prevent injection)
  - HTML/XSS sanitization
  - Email and URL validation
  - JSON parsing with validation
- Performance monitoring system
  - PerformanceMonitor class for timing operations
  - Async and sync function measurement
  - Performance reports and summaries
  - Metric export to JSON
  - Global monitor instance
- Centralized configuration management
  - Cascading config priority (CLI > ENV > User > Defaults)
  - Configuration validation
  - Help text generation
- Custom error class hierarchy
  - GrokError base class
  - Specialized errors (APIError, FileError, NetworkError, etc.)
  - withTimeout and withRetry utilities
- Model validation and utilities
  - Support for multiple providers (Grok, Claude, Gemini)
  - Model information and token limits
  - Fuzzy model suggestions
- Search result caching
  - 60-second TTL cache for search operations
  - Automatic expiration and cleanup
- Resource cleanup
  - dispose() method for GrokAgent
  - Proper cleanup in token counter
- GitHub Actions workflows
  - CI workflow for automated testing
  - Release workflow for automated publishing
- Contribution guidelines (CONTRIBUTING.md)
- Example configuration files
- Comprehensive documentation

### Changed
- Improved error handling across all tools
- Enhanced bash command validation
  - Dangerous command detection
  - Blocked command list
  - Command injection prevention
- Refactored configuration loading
  - Removed code duplication in index.ts
  - Unified config resolution
- Updated README with
  - Architecture section
  - Troubleshooting guide
  - Contributing guidelines
  - Roadmap
- Improved .npmignore to exclude development files

### Fixed
- Security improvements in bash command execution
- Better error messages throughout the application

## [0.0.12] - Previous Release

### Features
- Git commands support
- Model selection and persistence
- Improved UI components

## [0.0.11] - Previous Release

### Features
- Search tool with ripgrep integration
- Todo list management
- Confirmation dialogs

## [0.0.10] - Previous Release

### Features
- Basic file editing capabilities
- Bash command execution
- Initial release of Grok CLI

---

## Version History Guidelines

### Types of Changes

- **Added** for new features
- **Changed** for changes in existing functionality
- **Deprecated** for soon-to-be removed features
- **Removed** for now removed features
- **Fixed** for any bug fixes
- **Security** for vulnerability fixes

### Semantic Versioning

- **Major version (X.0.0)**: Breaking changes
- **Minor version (0.X.0)**: New features, backward compatible
- **Patch version (0.0.X)**: Bug fixes, backward compatible

### Release Process

1. Update this CHANGELOG with all changes since last release
2. Update version in package.json
3. Create git tag: `git tag v0.0.13`
4. Push tag: `git push origin v0.0.13`
5. GitHub Actions will automatically publish to npm

---

[Unreleased]: https://github.com/phuetz/grok-cli/compare/v0.0.12...HEAD
[0.0.12]: https://github.com/phuetz/grok-cli/compare/v0.0.11...v0.0.12
[0.0.11]: https://github.com/phuetz/grok-cli/compare/v0.0.10...v0.0.11
[0.0.10]: https://github.com/phuetz/grok-cli/releases/tag/v0.0.10
