# There are many coding agents. **This is Grok’s.**

[CI](https://github.com/superagent-ai/grok-cli/actions/workflows/typecheck.yml)
[npm](https://www.npmjs.com/package/grok-dev)
[License: MIT](./LICENSE)
[TypeScript](https://www.typescriptlang.org/)
[Bun](https://bun.sh/)

The rest borrowed from each other. We borrowed from *all of them*, then wired it to **Grok**—real-time **X search**, **web search**, `grok-code-fast-1` and the full Grok model lineup, **sub-agents on by default**, **remote control via Telegram** (pair once, drive the agent from your phone while the CLI runs), and a terminal UI that doesn’t feel like it was assembled in a hurry.

Open source. Terminal-native. Built with **Bun** and **OpenTUI**. If you want vibes *and* velocity, you’re in the right repo.

Community-built and unofficial. This project is not affiliated with or endorsed by xAI, and it is not the official Grok CLI.

[https://github.com/user-attachments/assets/7ca4f6df-50ca-4e9c-91b2-d4abad5c66cb](https://github.com/user-attachments/assets/7ca4f6df-50ca-4e9c-91b2-d4abad5c66cb)

---

## Install

```bash
curl -fsSL https://raw.githubusercontent.com/superagent-ai/grok-cli/main/install.sh | bash
```

**Alternative installs** (requires Bun on PATH):

```bash
bun add -g grok-dev
```

**Self-management** (script-installed only):

```bash
grok update
grok uninstall
grok uninstall --dry-run
grok uninstall --keep-config
```

**Prerequisites:** a **Grok API key** from [x.ai](https://x.ai) and a modern terminal emulator for the interactive OpenTUI experience. Headless `--prompt` mode does not depend on terminal UI support. If you want host desktop automation via the built-in computer sub-agent, also enable **Accessibility** permission for your terminal app on macOS.

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
grok --prompt "review the repo overnight" --batch-api
grok --verify
```

`--batch-api` uses xAI's Batch API for lower-cost unattended runs. It is a good
fit for scripts, CI, schedules, and other non-interactive workflows where a
delayed result is fine.

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

### Computer sub-agent

Grok ships a built-in `**computer**` sub-agent backed by `[agent-desktop](https://github.com/lahfir/agent-desktop)` for host desktop automation on macOS.

Ask for it in natural language, for example:

```bash
grok "Use the computer sub-agent to take a screenshot of my host desktop and tell me what is open."
grok "Use the computer sub-agent to launch Google Chrome, snapshot the UI, and tell me which refs correspond to the address bar and tabs."
```

Notes:

- Screenshots are saved under `**.grok/computer/**` by default.
- The primary workflow is **snapshot -> refs -> action -> snapshot** using `agent-desktop` accessibility snapshots and stable refs like `@e1`.
- `computer_screenshot` is available for visual confirmation, but the preferred path is `computer_snapshot` plus ref-based actions such as `computer_click`, `computer_type`, and `computer_scroll`.
- macOS requires **System Settings → Privacy & Security → Accessibility** access for the terminal app running `grok`.
- `agent-desktop` currently targets **macOS**.
- If Bun blocks the native binary download during install, run:

```bash
node ./node_modules/agent-desktop/scripts/postinstall.js
```

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


| Thing                             | What it means                                                                                                                                                                                                              |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Grok-native**                   | Defaults tuned for Grok; models like `**grok-code-fast-1`**, `**grok-4-1-fast-reasoning`**, `**grok-4.20-multi-agent-0309**`, plus flagship and fast variants—run `grok models` for the full menu.                         |
| **X + web search**                | `**search_x`** and `**search_web`** tools—live posts and docs without pretending the internet stopped in 2023.                                                                                                             |
| **Media generation**              | Built-in `**generate_image`** and `**generate_video`** tools for text-to-image, image editing, text-to-video, and image-to-video flows. Generated files are saved locally so you can reuse them after the xAI URLs expire. |
| **Sub-agents (default behavior)** | Foreground `**task`** delegation (e.g. explore, general, or computer) plus background `**delegate`** for read-only deep dives—parallelize like you mean it.                                                                |
| **Verify**                        | `**/verify`** or `**--verify`** — inspects your app, builds, tests, boots it, and runs browser smoke checks in a sandboxed environment. Screenshots and video included.                                                    |
| **Computer use**                  | Built-in `**computer`** sub-agent for host desktop automation via `**agent-desktop`**. It prefers semantic accessibility snapshots and stable refs, with screenshots saved under `**.grok/computer/`** when requested.     |
| **Custom sub-agents**             | Define named agents with `**subAgents`** in `**~/.grok/user-settings.json`** and manage them from the TUI with `**/agents`**.                                                                                              |
| **Remote control**                | Pair **Telegram** from the TUI (`/remote-control` → Telegram): DM your bot, `**/pair`**, approve the code in-terminal. Keep the CLI running while you ping it from your phone.                                             |
| **No “mystery meat” UI**          | OpenTUI React terminal UI—fast, keyboard-driven, not whatever glitchy thing you’re thinking of.                                                                                                                            |
| **Skills**                        | Agent Skills under `**.agents/skills/<name>/SKILL.md`** (project) or `**~/.agents/skills/`** (user). Use `**/skills`** in the TUI to list what’s installed.                                                                |
| **MCPs**                          | Extend with Model Context Protocol servers—configure via `**/mcps`** in the TUI or `**.grok/settings.json`** (`mcpServers`).                                                                                               |
| **Sessions**                      | Conversations persist; `**--session latest`** picks up where you left off.                                                                                                                                                 |
| **Headless**                      | `**--prompt`** / `**-p`** for non-interactive runs—pipe it, script it, bench it.                                                                                                                                           |
| **x402 payments**                 | Built-in wallet and `**paid_request`** tool—the agent can autonomously pay for x402-protected APIs with USDC. Inline approval UI when auto-approve is off.                                                                 |
| **Hackable**                      | TypeScript, clear agent loop, bash-first tools—fork it, shamelessly.                                                                                                                                                       |


## API key (pick one)

**Environment (good for CI):**

```bash
export GROK_API_KEY=your_key_here
```

`**.env**` in the project (see `.env.example` if present):

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

Optional `**subAgents**` — custom foreground sub-agents. Each entry needs `**name**`, `**model**`, and `**instruction**`:

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

Names cannot be `general`, `explore`, `vision`, `verify`, or `computer` because those are reserved for the built-in sub-agents.

Optional: `**GROK_BASE_URL**` (default `https://api.x.ai/v1`), `**GROK_MODEL**`, `**GROK_MAX_TOKENS**`.

---

## Telegram (remote control) — short version

1. Create a bot with [@BotFather](https://t.me/BotFather), copy the token.
2. Set `**TELEGRAM_BOT_TOKEN**` or add `**telegram.botToken**` in `~/.grok/user-settings.json` (the TUI `**/remote-control**` flow can save it).
3. Start `**grok**`, open `**/remote-control**` → **Telegram** if needed, then in Telegram DM your bot: `**/pair`**, enter the **6-character code** in the terminal when asked.
4. First user must be approved once; after that, it’s remembered. **Keep the CLI process running** while you use the bot (long polling lives in that process).

### Voice & audio messages

Send a voice note or audio attachment in Telegram and Grok will transcribe it locally with **[whisper.cpp](https://github.com/ggml-org/whisper.cpp)** before passing the text to the agent. No cloud STT service is involved — everything runs on your machine.

#### Prerequisites


| Dependency      | Why                                                             | Install (macOS)            |
| --------------- | --------------------------------------------------------------- | -------------------------- |
| **whisper-cli** | Runs the actual speech-to-text inference                        | `brew install whisper-cpp` |
| **ffmpeg**      | Converts Telegram voice notes (OGG/Opus) to WAV for whisper.cpp | `brew install ffmpeg`      |


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


| Setting             | Default           | Description                                                              |
| ------------------- | ----------------- | ------------------------------------------------------------------------ |
| `enabled`           | `true`            | Set to `false` to ignore voice/audio messages entirely.                  |
| `binaryPath`        | `whisper-cli`     | Absolute path or command name for the whisper.cpp CLI binary.            |
| `model`             | `tiny.en`         | Model alias used for auto-download resolution.                           |
| `modelPath`         | *(auto-resolved)* | Explicit path to a `.bin` model file. Overrides `model` + auto-download. |
| `autoDownloadModel` | `true`            | Download the model into `~/.grok/models/stt/whisper.cpp` on first use.   |
| `language`          | `en`              | Whisper language code passed to the CLI.                                 |


Optional headless flow when you do not want the TUI open:

```bash
grok telegram-bridge
```

Treat the bot token like a password.

---

## Hooks

Hooks execute shell commands at key agent lifecycle events — enforce policies, run linters, trigger tests, or log activity.

Configure in `~/.grok/user-settings.json`:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "bash",
        "hooks": [
          {
            "type": "command",
            "command": "./scripts/lint-before-edit.sh",
            "timeout": 10
          }
        ]
      }
    ]
  }
}
```

Hook commands receive JSON on **stdin** (event details) and can return JSON on **stdout**. Exit code `0` = success, `2` = block the action, other = non-blocking error.

**Supported events:** `PreToolUse`, `PostToolUse`, `PostToolUseFailure`, `UserPromptSubmit`, `SessionStart`, `SessionEnd`, `Stop`, `StopFailure`, `SubagentStart`, `SubagentStop`, `TaskCreated`, `TaskCompleted`, `PreCompact`, `PostCompact`, `Notification`, `InstructionsLoaded`, `CwdChanged`.

---

## Instructions & project brain

- `**AGENTS.md`** — merged from git root down to your cwd (Codex-style; see repo docs). `**AGENTS.override.md`** wins per directory when present.

---

## Project settings

Project file: `**.grok/settings.json**` — e.g. the current model for this project.

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

### Verify

Run `**/verify`** in the TUI or `**--verify`** on the CLI to verify your app locally:

```bash
grok --verify
grok -d /path/to/your/app --verify
```

The agent inspects your project, figures out how to build and run it, spins up a sandbox, and produces a verification report with screenshots and video evidence. Works with any app type.

---

## x402 Payments

Grok CLI can autonomously pay for [x402](https://www.x402.org/)-protected APIs and resources using a local crypto wallet. When the agent hits a `402 Payment Required` response, it can inspect the payment terms and complete the transaction with USDC stablecoins.

### Setup

```bash
grok wallet init --chain base-sepolia
```

This generates a keypair, stores it at `~/.grok/wallet.json`, and enables payments in your settings. Fund the displayed address with testnet ETH (for gas) and USDC.

### Wallet commands

```bash
grok wallet init              # generate keypair, enable payments
grok wallet balance           # show ETH and USDC balances
grok wallet history           # show payment audit log
```

### Agent tools

The agent gets four payment-related tools:


| Tool                 | Purpose                                                       |
| -------------------- | ------------------------------------------------------------- |
| `wallet_info`        | Check wallet address and balances                             |
| `wallet_history`     | View recent payment audit log                                 |
| `fetch_payment_info` | Inspect x402 payment requirements for a URL without paying    |
| `paid_request`       | Access an x402-protected URL and handle payment automatically |


### Payment settings

Toggle from the TUI with `/wallet`, or edit `~/.grok/user-settings.json`:

```json
{
  "payments": {
    "enabled": true,
    "chain": "base-sepolia",
    "approval": {
      "autoApprove": false
    }
  }
}
```

When `autoApprove` is `false`, the TUI shows an inline approval panel before any payment is made. When `true`, payments proceed automatically within the agent's tool loop.

### Supported chains

- **Base Sepolia** (testnet) — for development and testing
- **Base** (mainnet) — for production use

### Audit trail

All payment attempts are logged to `~/.grok/payment_log.jsonl` — one JSON object per line with URL, amount, network, status, and transaction hash.

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