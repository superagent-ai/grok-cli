# There are many coding agents. **This is Grok’s.**

[![CI](https://github.com/superagent-ai/grok-cli/actions/workflows/typecheck.yml/badge.svg)](https://github.com/superagent-ai/grok-cli/actions/workflows/typecheck.yml)
[![npm](https://img.shields.io/npm/v/grok-dev.svg)](https://www.npmjs.com/package/grok-dev)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Bun](https://img.shields.io/badge/Bun-1.x-000000?logo=bun&logoColor=white)](https://bun.sh/)

The rest borrowed from each other. We borrowed from *all of them*, then wired it to **Grok**—real-time **X search**, **web search**, **`grok-code-fast-1`** and the full Grok model lineup, **sub-agents on by default**, **remote control via Telegram** (pair once, drive the agent from your phone while the CLI runs), and a terminal UI that doesn’t feel like it was assembled in a hurry.

Open source. Terminal-native. Built with **Bun** and **OpenTUI**. If you want vibes *and* velocity, you’re in the right repo.

https://github.com/user-attachments/assets/7ca4f6df-50ca-4e9c-91b2-d4abad5c66cb

---

## Install

```bash
npm i -g grok-dev
```

The CLI binary is **`grok`** (yes, the package name and the command differ—deal with it).

**Prerequisites:** Node 18+ (for the global install), and a **Grok API key** from [x.ai](https://x.ai).

---

## Run it

**Interactive (default)** — launches the OpenTUI coding agent:

```bash
grok
```

**Pick a project directory:**

```bash
grok -d /path/to/your/repo
```

**Headless** — one prompt, then exit (scripts, CI, automation):

```bash
grok --prompt "run the test suite and summarize failures"
grok -p "show me package.json" --directory /path/to/project
grok --prompt "refactor X" --max-tool-rounds 30
grok --prompt "summarize the repo state" --format json
```

**Continue a saved session:**

```bash
grok --session latest
grok -s <session-id>
```

Works in interactive mode too—same flag.

**Structured headless output:**

```bash
grok --prompt "summarize the repo state" --format json
```

`--format json` emits newline-delimited `StreamChunk` objects instead of the
default human-readable text stream.

**List Grok models and pricing hints:**

```bash
grok models
```

**Pass an opening message without another prompt:**

```bash
grok fix the flaky test in src/foo.test.ts
```

---

## What you actually get

| Thing | What it means |
|--------|----------------|
| **Grok-native** | Defaults tuned for Grok; models like **`grok-code-fast-1`**, **`grok-4-1-fast`**, flagship and fast variants—run `grok models` for the full menu. |
| **X + web search** | **`search_x`** and **`search_web`** tools—live posts and docs without pretending the internet stopped in 2023. |
| **Sub-agents (default behavior)** | Foreground **`task`** delegation (e.g. explore vs general) plus background **`delegate`** for read-only deep dives—parallelize like you mean it. |
| **Remote control** | Pair **Telegram** from the TUI (`/remote-control` → Telegram): DM your bot, **`/pair`**, approve the code in-terminal. Keep the CLI running while you ping it from your phone. |
| **No “mystery meat” UI** | OpenTUI React terminal UI—fast, keyboard-driven, not whatever glitchy thing you’re thinking of. |
| **Skills** | Agent Skills under **`.agents/skills/<name>/SKILL.md`** (project) or **`~/.agents/skills/`** (user). Use **`/skills`** in the TUI to list what’s installed. |
| **MCPs** | Extend with Model Context Protocol servers—configure via **`/mcps`** in the TUI or **`.grok/settings.json`** (`mcpServers`). |
| **Sessions** | Conversations persist; **`--session latest`** picks up where you left off. |
| **Headless** | **`--prompt`** / **`-p`** for non-interactive runs—pipe it, script it, bench it. |
| **Hackable** | TypeScript, clear agent loop, bash-first tools—fork it, shamelessly. |

### Coming soon

**Autonomous agent testing** (think: sandboxed machine, recorded runs, Replit-style “prove it works”—the kind of thing that makes flaky human QA nervous). Not shipped yet; when it lands, we’ll be insufferable about it.

---

## API key (pick one)

**Environment (good for CI):**

```bash
export GROK_API_KEY=your_key_here
```

**`.env`** in the project (see `.env.example` if present):

```bash
GROK_API_KEY=your_key_here
```

**CLI once:**

```bash
grok -k your_key_here
```

**Saved in user settings** — `~/.grok/user-settings.json`:

```json
{ "apiKey": "your_key_here" }
```

Optional: **`GROK_BASE_URL`** (default `https://api.x.ai/v1`), **`GROK_MODEL`**, **`GROK_MAX_TOKENS`**.

---

## Telegram (remote control) — short version

1. Create a bot with [@BotFather](https://t.me/BotFather), copy the token.
2. Set **`TELEGRAM_BOT_TOKEN`** or add **`telegram.botToken`** in `~/.grok/user-settings.json` (the TUI **`/remote-control`** flow can save it).
3. Start **`grok`**, open **`/remote-control`** → **Telegram** if needed, then in Telegram DM your bot: **`/pair`**, enter the **6-character code** in the terminal when asked.
4. First user must be approved once; after that, it’s remembered. **Keep the CLI process running** while you use the bot (long polling lives in that process).

Treat the bot token like a password.

---

## Instructions & project brain

- **`AGENTS.md`** — merged from git root down to your cwd (Codex-style; see repo docs). **`AGENTS.override.md`** wins per directory when present.

---

## Project settings

Project file: **`.grok/settings.json`** — e.g. the current model for this project.

---

## Development

From a clone:

```bash
bun install
bun run build
bun run start
# or: node dist/index.js
```

Other useful commands:

```bash
bun run dev      # run from source (Bun)
bun run typecheck
bun run lint
```

---

## License

MIT
