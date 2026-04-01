# Batch API support

This repo now has an opt-in batch execution path for Grok model calls.

The short version: batch mode is useful anywhere nobody is waiting on a token stream. Headless runs, scheduled jobs, long research tasks, and benchmark/eval workflows all fit that pattern. Those are the cases where cutting token cost in half matters more than getting the first answer back immediately.

## Why it is worth having

The regular CLI flow is built for interactive use. You send a request, the model starts streaming, the agent calls tools, and the whole thing feels responsive. That is exactly what you want in the TUI.

Headless runs are different.

When the CLI is running in the background, or inside a benchmark harness, or on a schedule overnight, there usually is no human sitting there waiting for each intermediate step. In those cases the main trade-off changes:

- Real-time API: faster first token, full price, counts against live rate limits
- Batch API: delayed completion, half price, does not count against live rate limits

That makes batch mode a good fit for:

- `grok --prompt ...` jobs launched from scripts
- scheduled runs
- long unattended refactors or code review passes
- benchmark and eval pipelines
- delegated/background work where turnaround can be delayed

The wall-clock result is best thought of as delayed, not slower. The model still does the same work. It just sits in xAI's batch queue first.

## What changed

The CLI already had a strong internal separation between:

- prompt building
- tool construction
- the main agent loop
- child `task` loops
- headless output / JSONL reporting

The new batch path keeps the same tool layer and swaps only the model-call transport:

1. Build the same system prompt and tool set.
2. Submit one model step to xAI's Batch API.
3. Poll until that step finishes.
4. Parse tool calls from the response.
5. Execute tools locally.
6. Append tool results to the conversation.
7. Repeat until the model stops.

That means the agent still uses the same `bash`, `read_file`, `edit_file`, `task`, `delegate`, MCP, and schedule tooling. The change is in how model calls are sent, not in how the agent thinks about work.

## Current shape of the implementation

- `--batch-api` enables batch mode in the CLI.
- Headless runs can now use batch mode directly.
- Foreground child `task` calls inherit the batch path.
- Background `delegate` jobs persist the batch flag and reuse it in the spawned child process.
- Headless JSONL still reports `step_start`, `tool_use`, `step_finish`, and errors, so external runners can keep parsing metrics the same way.

## Trade-offs

Batch mode is not a drop-in improvement for every workflow.

- It is worse for interactive use. Waiting on each model step would feel bad in the TUI.
- It is better for unattended work where cost matters more than latency.
- Each agent round still waits for the previous round to finish, because local tool results must be fed back into the next request.
- Creating one batch per session is simple and robust, but not the final word on efficiency.

## Known limitations

- The current batch path is for chat-completions-compatible models. Responses-only models still need a separate `/v1/responses` batch path if we want full coverage there.
- This implementation creates one batch per agent session. That is fine for now, but large benchmark runs may eventually benefit from a shared coordinator or pooled batches.
- xAI currently rejects `grok-code-fast-1` on the batch endpoint even though the model works in real time. That looks like an upstream model/endpoint limitation, not a CLI bug. The batch path works with supported models such as `grok-4-1-fast-reasoning`, and the CLI/harness plumbing is in place for `grok-code-fast-1` as soon as xAI enables it.

## Follow-up work that would pay off

If this feature sticks, the next improvements are pretty clear:

1. Add a `/v1/responses` batch path for responses-only models.
2. Share batches across concurrent workers instead of creating one batch per task.
3. Add batch-aware retry / backoff metrics so rate-limit behavior is visible during large runs.
4. Consider making scheduled runs default to batch mode.

## How to use it

Regular headless run:

```bash
grok --prompt "review the test failures"
```

Batch-backed headless run:

```bash
grok --prompt "review the test failures" --batch-api
```

If you are debugging interactively, stick to the default real-time path. If you are kicking off background work and plan to check back later, batch mode is usually the better trade.
