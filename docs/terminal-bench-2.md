# Terminal Bench 2

This repo now includes a Harbor adapter that can run `grok-cli` headlessly inside a
Terminal Bench / Harbor task container.

## What Was Added

- A benchmark-safe headless mode in `grok-cli`:
  - `--benchmark` disables optional web/X search tools.
  - headless fatal errors now exit non-zero.
  - `--output-file` writes the headless stdout stream to a stable file.
- A Harbor custom agent at `integrations.harbor.grok_cli_agent:GrokCliInstalledAgent`.
- A JSONL trajectory artifact written to `/logs/agent/grok-headless.jsonl` inside Harbor
  and parsed back into Harbor's `AgentContext`.

## Prerequisites

- Docker installed and running.
- `uv` installed.
- Harbor installed:

```bash
uv tool install harbor
```

- A valid Grok API key:

```bash
export GROK_API_KEY="<your-grok-api-key>"
```

- Optional model override:

```bash
export GROK_MODEL="xai/grok-code-fast-1"
```

When invoking Harbor from this repo, make sure Python can import the local adapter:

```bash
export PYTHONPATH="$PWD"
```

## Validate The CLI First

Build `grok-cli` locally and verify the benchmark-safe headless path before using Harbor:

```bash
bun install
bun run build
bun dist/index.js \
  --prompt "print the current working directory and explain what files are here" \
  --benchmark \
  --format json \
  --output-file /tmp/grok-headless.jsonl
```

Expected behavior:

- fatal headless failures return a non-zero exit code,
- the JSONL stream ends with a `run_finish` event,
- `/tmp/grok-headless.jsonl` contains the same JSONL stdout stream.

## Harbor Smoke Test

For a quick integration test, point Harbor at a single local task directory:

```bash
PYTHONPATH="$PWD" harbor run \
  -p "/path/to/single/task" \
  -m "xai/grok-code-fast-1" \
  --agent-import-path integrations.harbor.grok_cli_agent:GrokCliInstalledAgent
```

The adapter will:

- upload a minimal source bundle from this repo into the task container,
- install Bun if needed,
- build `grok-cli`,
- run it in benchmark-safe headless mode,
- write `grok-headless.jsonl` and `grok-headless-summary.json` into the Harbor trial's
  `agent/` directory.

## Harbor Terminal Bench 2 Run

Once the smoke test passes, run the Harbor Terminal Bench dataset:

```bash
PYTHONPATH="$PWD" harbor run \
  -d "terminal-bench@2.0" \
  -m "xai/grok-code-fast-1" \
  --agent-import-path integrations.harbor.grok_cli_agent:GrokCliInstalledAgent
```

If you want to control the tool budget used by the adapter, export:

```bash
export GROK_CLI_MAX_TOOL_ROUNDS=400
```

## Artifacts

Each Harbor trial should include:

- `agent/grok-headless.jsonl`: the raw structured headless event stream.
- `agent/grok-headless-summary.json`: parsed summary used to populate Harbor metadata.
- `agent/command-0/stdout.txt` and `agent/command-0/stderr.txt`: raw command logs from Harbor.

## Leaderboard Notes

The current docs are split across Harbor and Terminal Bench:

- Harbor's Terminal Bench tutorial uses `harbor run -d "terminal-bench@2.0" ...`.
- Terminal Bench leaderboard docs currently reference `tb run` and the
  `terminal-bench-core==0.1.1` dataset.

Because of that split, treat the Harbor command above as the supported local evaluation
path from this repo, and verify the final submission command against the latest leaderboard
documentation before doing a large benchmark run.

The adapter intentionally runs `dist/index.js` with Bun rather than Node because the current
repo still emits extensionless ESM imports in `dist/`, which are not yet Node-runnable.

For leaderboard-oriented runs:

- keep the default task and verifier timeouts,
- do not override CPU, memory, or storage if the benchmark forbids it,
- validate the adapter on a smoke task before running the full dataset.
