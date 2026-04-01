# AGENTS.md

## Cursor Cloud specific instructions

### Overview

Grok CLI (`@vibe-kit/grok-cli`) is a single-package TypeScript CLI tool — no databases, Docker, or background services. See `README.md` for full documentation and usage.

### Quick reference


| Action        | Command                                                               |
| ------------- | --------------------------------------------------------------------- |
| Install deps  | `bun install` (installs Husky; pre-commit runs Biome on staged files) |
| Typecheck     | `bun run typecheck`                                                   |
| Build         | `bun run build`                                                       |
| Run built CLI | `node dist/index.js`                                                  |
| Headless mode | `node dist/index.js --prompt "..." --max-tool-rounds N`               |
| CLI help      | `node dist/index.js --help`                                           |


### Known issues

- **ESLint config is broken**: The repo has `.eslintrc.js` (legacy format) but uses ESLint 9 (`^9.31.0`) + `@typescript-eslint` v8, which require flat config (`eslint.config.js`). Additionally, `.eslintrc.js` uses `module.exports` (CJS) but `package.json` has `"type": "module"` (ESM). Running `bun run lint` will fail. Use `bun run typecheck` as the primary code quality check (this is also what CI enforces).
- **Dev mode (`bun run dev` / `bun run dev:node`) fails at runtime**: `src/utils/model-config.ts` imports TypeScript interfaces (`UserSettings`, `ProjectSettings`) as value imports from `settings-manager.ts`. These type-only exports are erased at runtime by Bun and tsx, causing `SyntaxError: export '...' not found`. The fix is to use `import type` syntax, but this is a pre-existing repo issue. **Workaround**: build first (`bun run build`), then run the compiled version (`node dist/index.js`).

### Environment

- **Bun** must be installed (not pre-installed on Cloud VMs). The update script handles this.
- `GROK_API_KEY` environment variable is required for API calls. Set it as a secret.