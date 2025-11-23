# Security Policy

## Supported Versions

We release patches for security vulnerabilities in the following versions:

| Version | Supported          |
| ------- | ------------------ |
| 0.0.x   | :white_check_mark: |
| < 0.0.10| :x:                |

## Reporting a Vulnerability

We take the security of Grok CLI seriously. If you believe you have found a security vulnerability, please report it to us as described below.

### Please DO NOT

- **Do not** open a public GitHub issue for security vulnerabilities
- **Do not** publicly disclose the vulnerability until it has been addressed
- **Do not** attempt to exploit the vulnerability beyond what is necessary to demonstrate it

### Please DO

**Report security vulnerabilities privately** using one of these methods:

1. **GitHub Security Advisories** (Preferred)
   - Go to the [Security tab](https://github.com/vibe-kit/grok-cli/security/advisories)
   - Click "Report a vulnerability"
   - Fill out the form with details

2. **Email**
   - Send an email to: security@example.com (replace with actual security contact)
   - Use the subject line: `[SECURITY] Grok CLI Vulnerability Report`

### What to Include

Please include the following information in your report:

- **Type of vulnerability** (e.g., XSS, command injection, etc.)
- **Full paths** of source file(s) related to the vulnerability
- **Location** of the affected source code (tag/branch/commit or direct URL)
- **Step-by-step instructions** to reproduce the issue
- **Proof-of-concept or exploit code** (if possible)
- **Impact** of the vulnerability
- **Suggested fix** (if you have one)

### What to Expect

- **Acknowledgment**: We will acknowledge receipt of your vulnerability report within 48 hours
- **Communication**: We will keep you informed about our progress in addressing the vulnerability
- **Credit**: We will credit you in the security advisory unless you prefer to remain anonymous
- **Timeline**: We aim to address critical vulnerabilities within 7 days and other vulnerabilities within 30 days

## Security Measures

### Current Security Features

Grok CLI implements several security measures:

1. **Input Validation**
   - All user inputs are validated and sanitized
   - File paths are checked for directory traversal attacks
   - Command arguments are validated to prevent injection

2. **Command Validation**
   - Dangerous commands are flagged and require explicit confirmation
   - Blocked commands (like fork bombs) are prevented
   - Command whitelist/blacklist system

3. **API Key Protection**
   - API keys are never logged or displayed
   - Environment variables are recommended over hardcoded keys
   - Settings files use appropriate file permissions

4. **Dependency Security**
   - Regular dependency audits via `npm audit`
   - Automated security scanning in CI/CD
   - Prompt updates for vulnerable dependencies

### Security Best Practices for Users

1. **API Keys**
   ```bash
   # Good: Use environment variables
   export GROK_API_KEY=your_key_here

   # Bad: Don't hardcode in scripts
   grok --api-key "hardcoded_key"  # Avoid this
   ```

2. **File Permissions**
   ```bash
   # Ensure your settings file is not world-readable
   chmod 600 ~/.grok/user-settings.json
   ```

3. **Command Execution**
   - Review commands before confirming execution
   - Be cautious with bash tool usage
   - Don't blindly trust AI-generated commands

4. **Updates**
   - Keep Grok CLI updated to the latest version
   - Check CHANGELOG.md for security fixes
   - Subscribe to security advisories

## Known Security Considerations

### Bash Command Execution

Grok CLI can execute arbitrary bash commands. While we implement validation:

- ⚠️ **Always review** commands before execution
- ⚠️ **Be cautious** in production environments
- ⚠️ **Use confirmation prompts** (don't bypass them)

### AI-Generated Code

AI-generated code should be reviewed:

- ⚠️ **Review all code** before running or committing
- ⚠️ **Test in safe environments** first
- ⚠️ **Understand what code does** before execution

### API Key Storage

- ⚠️ Keys in `~/.grok/user-settings.json` are stored in **plaintext**
- ⚠️ Ensure proper file permissions
- ⚠️ Consider using environment variables for sensitive environments

## Security Audit History

| Date | Version | Auditor | Findings | Status |
|------|---------|---------|----------|--------|
| TBD  | -       | -       | -        | -      |

## Vulnerability Disclosure Timeline

When a security vulnerability is reported and confirmed:

1. **Day 0**: Vulnerability reported
2. **Day 1-2**: Acknowledgment sent
3. **Day 3-7**: Investigation and fix development
4. **Day 7-14**: Testing and verification
5. **Day 14-21**: Prepare security advisory and patch release
6. **Day 21-30**: Public disclosure with patch release

Critical vulnerabilities may have an accelerated timeline.

## Security Updates

Security updates will be:

- Released as patch versions (0.0.x)
- Documented in CHANGELOG.md with `[SECURITY]` tag
- Announced via GitHub Security Advisories
- Highlighted in release notes

## Contact

For security-related questions or concerns:

- **Security Email**: security@example.com (replace with actual)
- **General Issues**: https://github.com/vibe-kit/grok-cli/issues
- **Discussions**: https://github.com/vibe-kit/grok-cli/discussions

## Attribution

We would like to thank the following individuals for responsibly disclosing security vulnerabilities:

<!-- List will be updated as vulnerabilities are reported and fixed -->

---

**Remember**: Security is everyone's responsibility. If you see something, say something.
