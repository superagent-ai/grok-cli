# There are many coding agents. **This is Grok’s.**

[![CI](https://github.com/superagent-ai/grok-cli/actions/workflows/typecheck.yml/badge.svg)](https://github.com/superagent-ai/grok-cli/actions/workflows/typecheck.yml)
[![npm](https://img.shields.io/npm/v/grok-dev.svg)](https://www.npmjs.com/package/grok-dev)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Bun](https://img.shields.io/badge/Bun-1.x-000000?logo=bun&logoColor=white)](https://bun.sh/)

The rest borrowed from each other. We borrowed from *all of them*, then wired it to **Grok**—real-time **X search**, **web search**, **`grok-code-fast-1`** and the full Grok model lineup, **sub-agents on by default**, **remote control via Telegram** (pair once, drive the agent from your phone while the CLI runs), and a terminal UI that doesn’t feel like it was assembled in a hurry.

Open source. Terminal-native. Built with **Bun** and **OpenTUI**. If you want vibes *and* velocity, you’re in the right repo.

Community-built and unofficial. This project is not affiliated with or endorsed by xAI, and it is not the official Grok CLI.

https://github.com/user-attachments/assets/7ca4f6df-50ca-4e9c-91b2-d4abad5c66cb

---

## Install

```bash
npm i -g grok-dev
```

The CLI binary is **`grok`** (yes, the package name and the command differ—deal with it).

**Prerequisites:** Node 18+ (for the global install), a **Grok API key** from [x.ai](https://x.ai), and a modern terminal emulator for the interactive OpenTUI experience. Headless `--prompt` mode does not depend on terminal UI support.

---

## Run it

**Interactive (default)** — launches the OpenTUI coding agent:

```bash
grok
```

### Supported terminals

For the most reliable interactive OpenTUI experience, use a modern terminal emulator. We currently document and recommend:

- **WezTerm** (cross-platform)
- **Alacritty** (cross-platform)
- **Ghostty** (macOS and Linux)
- **Kitty** (macOS and Linux)

Other modern terminals may work, but these are the terminal apps we currently recommend and document for interactive use.

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
grok --verify
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

`--format json` emits a newline-delimited JSON event stream instead of the
default human-readable text output. Events are semantic, step-level records such
as `step_start`, `text`, `tool_use`, `step_finish`, and `error`.

### Scheduling

Schedules let Grok run a headless prompt on a recurring schedule or once. Ask
for it in natural language, for example:

```text
Create a schedule named daily-changelog-update that runs every weekday at 9am
and updates CHANGELOG.md from the latest merged commits.
```

Recurring schedules require the background daemon:

```bash
grok daemon --background
```

Use `/schedule` in the TUI to browse saved schedules. One-time schedules start
immediately in the background; recurring schedules keep running as long as the
daemon is active.

**List Grok models and pricing hints:**

```bash
grok models
```

**Pass an opening message without another prompt:**

```bash
grok fix the flaky test in src/foo.test.ts
```

**Generate images or short videos from chat:**

```bash
grok "Generate a retro-futuristic logo for my CLI called Grok Forge"
grok "Edit ./assets/hero.png into a watercolor poster"
grok "Animate ./assets/cover.jpg into a 6 second cinematic push-in"
```

Image and video generation are exposed as agent tools inside normal chat sessions.
You keep using a text model for the session, and Grok saves generated media under
`.grok/generated-media/` by default unless you ask for a specific output path.

---

## What you actually get

| Thing | What it means |
|--------|----------------|
| **Grok-native** | Defaults tuned for Grok; models like **`grok-code-fast-1`**, **`grok-4-1-fast-reasoning`**, **`grok-4.20-multi-agent-0309`**, plus flagship and fast variants—run `grok models` for the full menu. |
| **X + web search** | **`search_x`** and **`search_web`** tools—live posts and docs without pretending the internet stopped in 2023. |
| **Media generation** | Built-in **`generate_image`** and **`generate_video`** tools for text-to-image, image editing, text-to-video, and image-to-video flows. Generated files are saved locally so you can reuse them after the xAI URLs expire. |
| **Sub-agents (default behavior)** | Foreground **`task`** delegation (e.g. explore vs general) plus background **`delegate`** for read-only deep dives—parallelize like you mean it. |
| **Built-in verify flow** | **`/verify`** in the TUI or **`--verify`** on the CLI launches a verification-oriented sub-agent that auto-enables **Shuru**, inspects the repo, infers a run/test recipe across common ecosystems, and can optionally use **`agent-browser`** for localhost browser smoke tests. |
| **Custom sub-agents** | Define named agents with **`subAgents`** in **`~/.grok/user-settings.json`** and manage them from the TUI with **`/agents`**. |
| **Remote control** | Pair **Telegram** from the TUI (`/remote-control` → Telegram): DM your bot, **`/pair`**, approve the code in-terminal. Keep the CLI running while you ping it from your phone. |
| **No “mystery meat” UI** | OpenTUI React terminal UI—fast, keyboard-driven, not whatever glitchy thing you’re thinking of. |
| **Skills** | Agent Skills under **`.agents/skills/<name>/SKILL.md`** (project) or **`~/.agents/skills/`** (user). Use **`/skills`** in the TUI to list what’s installed. |
| **MCPs** | Extend with Model Context Protocol servers—configure via **`/mcps`** in the TUI or **`.grok/settings.json`** (`mcpServers`). |
| **Sessions** | Conversations persist; **`--session latest`** picks up where you left off. |
| **Headless** | **`--prompt`** / **`-p`** for non-interactive runs—pipe it, script it, bench it. |
| **Hackable** | TypeScript, clear agent loop, bash-first tools—fork it, shamelessly. |

### Coming soon

**Deeper autonomous agent testing** (think: longer-lived sandbox sessions, richer browser workflows, recorded runs, and stronger “prove it works” evidence). Phase 1 ships a local **`verify`** flow; the bigger version is still coming.

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

Optional **`subAgents`** — custom foreground sub-agents. Each entry needs **`name`**, **`model`**, and **`instruction`**:

```json
{
  "subAgents": [
    {
      "name": "security-review",
      "model": "grok-code-fast-1",
      "instruction": "Prioritize security implications and suggest concrete fixes."
    }
  ]
}
```

Names cannot be `general`, `explore`, `vision`, or `verify` because those are reserved for the built-in sub-agents.

Optional: **`GROK_BASE_URL`** (default `https://api.x.ai/v1`), **`GROK_MODEL`**, **`GROK_MAX_TOKENS`**.

---

## Telegram (remote control) — short version

1. Create a bot with [@BotFather](https://t.me/BotFather), copy the token.
2. Set **`TELEGRAM_BOT_TOKEN`** or add **`telegram.botToken`** in `~/.grok/user-settings.json` (the TUI **`/remote-control`** flow can save it).
3. Start **`grok`**, open **`/remote-control`** → **Telegram** if needed, then in Telegram DM your bot: **`/pair`**, enter the **6-character code** in the terminal when asked.
4. First user must be approved once; after that, it’s remembered. **Keep the CLI process running** while you use the bot (long polling lives in that process).

### Voice & audio messages

Send a voice note or audio attachment in Telegram and Grok will transcribe it locally with **[whisper.cpp](https://github.com/ggml-org/whisper.cpp)** before passing the text to the agent. No cloud STT service is involved — everything runs on your machine.

#### Prerequisites

| Dependency | Why | Install (macOS) |
|---|---|---|
| **whisper-cli** | Runs the actual speech-to-text inference | `brew install whisper-cpp` |
| **ffmpeg** | Converts Telegram voice notes (OGG/Opus) to WAV for whisper.cpp | `brew install ffmpeg` |

After installing, verify both are available:

```bash
whisper-cli -h
ffmpeg -version
```

#### Download a Whisper model

Grok CLI auto-downloads the configured model on first use, but you can pre-download it:

```bash
mkdir -p ~/.grok/models/stt/whisper.cpp
curl -L https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.en.bin \
  -o ~/.grok/models/stt/whisper.cpp/ggml-tiny.en.bin
```

Available models (trade size for accuracy): `tiny.en` (75 MB), `base.en` (142 MB), `small.en` (466 MB).

#### Configure in `~/.grok/user-settings.json`

```json
{
  "telegram": {
    "botToken": "YOUR_BOT_TOKEN",
    "audioInput": {
      "enabled": true,
      "binaryPath": "/opt/homebrew/bin/whisper-cli",
      "model": "tiny.en",
      "modelPath": "~/.grok/models/stt/whisper.cpp/ggml-tiny.en.bin",
      "autoDownloadModel": true,
      "language": "en"
    }
  }
}
```

| Setting | Default | Description |
|---|---|---|
| `enabled` | `true` | Set to `false` to ignore voice/audio messages entirely. |
| `binaryPath` | `whisper-cli` | Absolute path or command name for the whisper.cpp CLI binary. |
| `model` | `tiny.en` | Model alias used for auto-download resolution. |
| `modelPath` | _(auto-resolved)_ | Explicit path to a `.bin` model file. Overrides `model` + auto-download. |
| `autoDownloadModel` | `true` | Download the model into `~/.grok/models/stt/whisper.cpp` on first use. |
| `language` | `en` | Whisper language code passed to the CLI. |

Optional headless flow when you do not want the TUI open:

```bash
grok telegram-bridge
```

Treat the bot token like a password.

---

## Instructions & project brain

- **`AGENTS.md`** — merged from git root down to your cwd (Codex-style; see repo docs). **`AGENTS.override.md`** wins per directory when present.

---

## Project settings

Project file: **`.grok/settings.json`** — e.g. the current model for this project.

---

## Sandbox

Grok CLI can run shell commands inside a [Shuru](https://github.com/superhq-ai/shuru) microVM sandbox so the agent can't touch your host filesystem or network.

**Requires macOS 14+ on Apple Silicon.**

Enable it with `--sandbox` on the CLI, or toggle it from the TUI with `/sandbox`.

When sandbox mode is active you can configure:

- **Network** — off by default; enable with `--allow-net`, restrict with `--allow-host`
- **Port forwards** — `--port 8080:80`
- **Resource limits** — CPUs, memory, disk size (via settings or `/sandbox` panel)
- **Checkpoints** — start from a saved environment snapshot
- **Secrets** — inject API keys without exposing them inside the VM

All settings are saved in `~/.grok/user-settings.json` (user) and `.grok/settings.json` (project).

### Verify with Shuru

The built-in **`verify`** flow is meant for local confidence checks before you commit or open a PR.

Typical setup:

```bash
# Run verify against the current workspace
grok --verify
```

`verify` will auto-enable Shuru for the run, inspect the repo, infer a recipe for how to build/test/start it, and then execute that recipe in the sandbox. You can still set a checkpoint in the TUI under **`/sandbox`** using the **Checkpoint** field, then launch **`/verify`** interactively.

The intended phase-1 workflow is:

- Use a Shuru checkpoint to preinstall toolchains and runtime dependencies.
- Mount the current host workspace into `/workspace` so verify always runs against your latest code.
- If `verify` detects an app with an HTTP runtime, it can infer a default localhost port for smoke testing.
- You can still override the inferred port or other sandbox settings manually when needed.
- If the project-level **`agent-browser`** skill is available, verify may use it for a small localhost browser smoke test after the app boots.

Phase 1 stays intentionally narrow:

- browser smoke testing is optional
- multiple forwarded ports are treated as ambiguous unless you specify the target
- checkpoint creation and branching still happen outside Grok CLI
- Shuru runs stay ephemeral, so durable source edits should still happen through Grok’s file tools on the host

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
