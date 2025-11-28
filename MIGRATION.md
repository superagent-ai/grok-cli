# Migration Guide

This guide helps you migrate between major versions of Grok CLI.

## Table of Contents

- [General Update Process](#general-update-process)
- [Version-Specific Migrations](#version-specific-migrations)
- [Configuration Changes](#configuration-changes)
- [Breaking Changes](#breaking-changes)

## General Update Process

### For Global Installation

```bash
# Update to latest version
npm update -g @phuetz/grok-cli

# Or update to specific version
npm install -g @phuetz/grok-cli@x.x.x

# Verify installation
grok --version
```

### For Local Project

```bash
# Update to latest
npm update @phuetz/grok-cli

# Or specific version
npm install @phuetz/grok-cli@x.x.x
```

### Backup Your Configuration

Before major updates, backup your settings:

```bash
# Backup user settings
cp ~/.grok/user-settings.json ~/.grok/user-settings.json.backup

# Backup project settings
cp .grok/settings.json .grok/settings.json.backup
```

## Version-Specific Migrations

### From 0.0.x to 0.1.x (Future)

**Status**: Not yet released

When this version is released, check here for specific migration steps.

### From < 0.0.10 to 0.0.12+

No breaking changes. Update normally.

**New Features**:
- Git commands support
- Model selection and persistence
- Improved search with caching
- Enhanced security validation
- Performance monitoring
- Comprehensive testing infrastructure

**Recommended Actions**:
1. Update your `.env` file with new variables (see `.env.example`)
2. Review new configuration options in `examples/user-settings.json`
3. Run tests if you've contributed: `npm test`

## Configuration Changes

### Environment Variables

#### Added in 0.0.12+

```bash
# New optional variables
GROK_MODEL=grok-4-latest
GROK_PERFORMANCE_MONITORING=false
GROK_DEBUG=false
```

#### Deprecated Variables

None yet.

### User Settings File

The user settings file (`~/.grok/user-settings.json`) has been enhanced:

**Before (< 0.0.12)**:
```json
{
  "apiKey": "your_key",
  "baseURL": "https://api.x.ai/v1"
}
```

**After (0.0.12+)**:
```json
{
  "apiKey": "your_key",
  "baseURL": "https://api.x.ai/v1",
  "defaultModel": "grok-4-latest",
  "performanceMonitoring": false,
  "cacheEnabled": true,
  "cacheTTL": 60000
}
```

All new fields are optional and have sensible defaults.

### Custom Instructions

Custom instructions moved from `.grok/custom-instructions.md` to `.grok/GROK.md`:

```bash
# If you had custom instructions
mv .grok/custom-instructions.md .grok/GROK.md
```

## Breaking Changes

### Version 0.0.12

✅ **No breaking changes** - Fully backward compatible

### Future Versions

Breaking changes will be documented here when they occur.

## Common Migration Issues

### Issue: "Command not found" after update

**Solution**:
```bash
# Reinstall globally
npm uninstall -g @phuetz/grok-cli
npm install -g @phuetz/grok-cli

# Or fix npm global path
npm config get prefix
# Ensure this path is in your PATH
```

### Issue: API key not found after update

**Solution**:
```bash
# Check your settings file exists
cat ~/.grok/user-settings.json

# Or set via environment
export GROK_API_KEY=your_key_here
```

### Issue: Old configuration format

**Solution**:
```bash
# Backup old config
cp ~/.grok/user-settings.json ~/.grok/user-settings.json.old

# Use example as template
cp examples/user-settings.json ~/.grok/user-settings.json

# Edit with your API key
nano ~/.grok/user-settings.json
```

### Issue: Tests failing after update

**Solution**:
```bash
# Clear npm cache
npm cache clean --force

# Reinstall dependencies
rm -rf node_modules package-lock.json
npm install

# Run tests again
npm test
```

### Issue: Permission denied on hooks

**Solution**:
```bash
# Make hooks executable
chmod +x .husky/pre-commit
chmod +x .husky/pre-push
chmod +x .husky/install.sh
```

## Rollback Instructions

If you need to rollback to a previous version:

```bash
# Global installation
npm install -g @phuetz/grok-cli@0.0.11

# Local installation
npm install @phuetz/grok-cli@0.0.11

# Restore backup config
cp ~/.grok/user-settings.json.backup ~/.grok/user-settings.json
```

## Getting Help

If you encounter issues during migration:

1. **Check the CHANGELOG**: See [CHANGELOG.md](CHANGELOG.md) for detailed changes
2. **Review documentation**: Check updated [README.md](README.md)
3. **Search issues**: Look for similar problems in [GitHub Issues](https://github.com/phuetz/grok-cli/issues)
4. **Ask for help**: Create a new issue with the `help` label

## Automated Migration Scripts

For complex migrations, we may provide migration scripts:

```bash
# Future: Run migration script (when available)
npx @phuetz/grok-cli migrate
```

## Testing Your Migration

After migrating, verify everything works:

```bash
# Check version
grok --version

# Test basic functionality
grok --prompt "echo 'Migration successful!'"

# Run tests (if developing)
npm test

# Check configuration
grok --help
```

## Deprecation Timeline

We follow this deprecation policy:

1. **Deprecation announcement**: Feature marked as deprecated in documentation
2. **Warning period**: Minimum 2 major versions with warnings
3. **Removal**: Feature removed in next major version

Current deprecations: None

## Stay Updated

- **Watch releases**: Click "Watch" → "Releases only" on [GitHub](https://github.com/phuetz/grok-cli)
- **Read CHANGELOG**: Check [CHANGELOG.md](CHANGELOG.md) before updating
- **Follow announcements**: Subscribe to [GitHub Discussions](https://github.com/phuetz/grok-cli/discussions)

---

**Last Updated**: 2025-01-14
**Current Version**: 0.0.12
