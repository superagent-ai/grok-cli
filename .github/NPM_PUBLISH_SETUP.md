# NPM Publishing Setup Guide

This guide explains how to set up automated NPM publishing for AX CLI using GitHub Actions.

## Prerequisites

1. **NPM Account**: You need an NPM account with publishing permissions
2. **GitHub Repository**: Admin access to the GitHub repository
3. **NPM Organization**: Access to the `@defai.digital` organization on NPM

## Setup Steps

### 1. Create NPM Access Token

1. Go to [npmjs.com](https://www.npmjs.com/) and log in
2. Click on your profile picture → **Access Tokens**
3. Click **Generate New Token** → **Classic Token**
4. Select **Automation** token type (for CI/CD)
5. Give it a name: `github-actions-ax-cli`
6. Click **Generate Token**
7. **Copy the token immediately** (you won't see it again!)

### 2. Add NPM Token to GitHub Secrets

1. Go to your GitHub repository
2. Navigate to **Settings** → **Secrets and variables** → **Actions**
3. Click **New repository secret**
4. Name: `NPM_TOKEN`
5. Value: Paste the NPM token you copied
6. Click **Add secret**

### 3. Verify Package Configuration

Ensure `package.json` has the correct settings:

```json
{
  "name": "@defai.digital/ax-cli",
  "version": "0.0.34",
  "publishConfig": {
    "access": "public"
  }
}
```

### 4. Test the Workflow

You can test the workflow in two ways:

#### Method 1: Create a Version Tag (Recommended)

```bash
# Bump version
npm version patch  # For bug fixes (0.0.34 → 0.0.35)
# or
npm version minor  # For new features (0.0.34 → 0.1.0)
# or
npm version major  # For breaking changes (0.0.34 → 1.0.0)

# Push the tag to GitHub
git push origin main --tags
```

The workflow will automatically trigger when you push the tag.

#### Method 2: Manual Trigger

1. Go to **Actions** tab in GitHub
2. Select **Publish to NPM** workflow
3. Click **Run workflow**
4. Optionally specify a version (e.g., `0.0.35`)
5. Click **Run workflow**

## Workflow Features

### ✅ Automated Testing
- Runs linter (`npm run lint`)
- Type checking (`npm run typecheck`)
- Test suite (`npm test`)
- Build verification (`npm run build`)

### ✅ Version Management
- Checks if version already exists on NPM
- Skips publishing if version exists
- Supports manual version bumping
- Creates Git tags automatically

### ✅ NPM Publishing
- **Provenance**: Publishes with npm provenance for supply chain security
- **Public Access**: Automatically sets package to public
- **Scoped Package**: Publishes to `@defai.digital` organization

### ✅ GitHub Release
- Automatically creates GitHub release
- Includes installation instructions
- Links to NPM package

### ✅ Safety Features
- Only publishes if all tests pass
- Checks for existing versions
- Requires Node.js 24+
- Uses `npm ci` for reproducible builds

## Publishing Process

### Automated Publishing (Recommended)

```bash
# 1. Make your changes and commit
git add .
git commit -m "feat: add new feature"

# 2. Bump version and create tag
npm version patch  # or minor/major

# 3. Push to GitHub
git push origin main --tags

# 4. GitHub Actions will automatically:
#    - Run tests
#    - Build the project
#    - Publish to NPM (if version is new)
#    - Create GitHub release
```

### Manual Publishing

```bash
# 1. Update version in package.json manually
# Edit package.json: "version": "0.0.35"

# 2. Build the project
npm run build

# 3. Run tests
npm test

# 4. Publish to NPM
npm publish --access public

# 5. Create and push tag
git tag v0.0.35
git push origin v0.0.35
```

## Version Numbering

We follow [Semantic Versioning](https://semver.org/):

- **Patch** (0.0.X): Bug fixes, minor changes
  ```bash
  npm version patch  # 0.0.34 → 0.0.35
  ```

- **Minor** (0.X.0): New features, backwards compatible
  ```bash
  npm version minor  # 0.0.34 → 0.1.0
  ```

- **Major** (X.0.0): Breaking changes
  ```bash
  npm version major  # 0.0.34 → 1.0.0
  ```

## Workflow Triggers

The workflow runs on:

1. **Version Tag Push**: When you push a tag like `v0.0.35`
   ```bash
   git tag v0.0.35
   git push origin v0.0.35
   ```

2. **Manual Dispatch**: From GitHub Actions UI
   - Go to Actions → Publish to NPM → Run workflow

## Troubleshooting

### Error: "Version already exists"

**Solution**: The version in `package.json` already exists on NPM. Bump the version:

```bash
npm version patch
git push origin main --tags
```

### Error: "NPM_TOKEN not found"

**Solution**: Ensure the NPM token is added to GitHub secrets:
1. Go to Settings → Secrets and variables → Actions
2. Add `NPM_TOKEN` secret with your NPM access token

### Error: "Permission denied"

**Solution**: Ensure you have publishing rights to `@defai.digital` organization:
1. Go to npmjs.com
2. Navigate to organization settings
3. Add your user as a member with publish permissions

### Error: "Tests failed"

**Solution**: The workflow stops if tests fail. Fix the failing tests:

```bash
# Run tests locally
npm test

# Fix issues and commit
git add .
git commit -m "fix: resolve test failures"
git push
```

### Error: "Build failed"

**Solution**: Ensure the build works locally:

```bash
# Clean and rebuild
rm -rf dist node_modules
npm install
npm run build
```

## Security Best Practices

### 1. NPM Token Security
- ✅ Use **Automation** token type (not Classic token for personal use)
- ✅ Store token in GitHub Secrets (never commit to code)
- ✅ Rotate tokens periodically (every 90 days recommended)
- ✅ Use separate tokens for different projects

### 2. Package Provenance
- ✅ Workflow uses `--provenance` flag for supply chain security
- ✅ Verifies package authenticity on NPM
- ✅ Links package to GitHub repository and workflow

### 3. Two-Factor Authentication
- ✅ Enable 2FA on your NPM account
- ✅ Enable 2FA on your GitHub account
- ✅ Require 2FA for organization members

## Monitoring

### Check Publish Status

1. **GitHub Actions**:
   - Go to Actions tab
   - View workflow runs
   - Check logs for each step

2. **NPM Package**:
   - Visit https://www.npmjs.com/package/@defai.digital/ax-cli
   - Verify version is updated
   - Check download statistics

3. **GitHub Releases**:
   - Go to Releases tab
   - Verify new release was created
   - Check release notes

## Advanced Configuration

### Publish to Multiple Registries

To publish to both NPM and GitHub Packages, modify the workflow:

```yaml
- name: Publish to GitHub Packages
  run: npm publish --registry=https://npm.pkg.github.com
  env:
    NODE_AUTH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

### Custom Release Notes

Edit the workflow to customize release notes:

```yaml
- name: Create GitHub Release
  with:
    body: |
      ## What's Changed
      - Feature 1
      - Feature 2

      **Full Changelog**: ${{ github.event.compare }}
```

### Beta/Alpha Releases

For pre-release versions:

```bash
# Create beta version
npm version prerelease --preid=beta
# Results in: 0.0.35-beta.0

# Publish with beta tag
npm publish --tag beta
```

## Support

If you encounter issues:

1. Check workflow logs in GitHub Actions
2. Review NPM package settings
3. Verify GitHub secrets are configured
4. Open an issue on GitHub

---

## Quick Reference

```bash
# One-time setup
1. Create NPM token at npmjs.com
2. Add token to GitHub secrets as NPM_TOKEN

# Publishing workflow
1. git add . && git commit -m "feat: changes"
2. npm version patch  # or minor/major
3. git push origin main --tags
4. Wait for GitHub Actions to complete

# Verify
- Check GitHub Actions for workflow status
- Visit npmjs.com to see published package
- Check GitHub Releases for new release
```

---

**Remember**: Always test locally before publishing!

```bash
npm run build && npm test && npm run typecheck
```
