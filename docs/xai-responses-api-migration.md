# xAI Responses API Migration

The xAI Responses API is the recommended way to interact with Grok models. It offers:

- **Agentic Tools**: Native support for web_search, x_search, code_execution, MCP
- **Stateful Conversations**: `previous_response_id` for continuing conversations without resending full history
- **Billing Optimization**: Automatic caching of conversation history
- **Future Features**: All new capabilities delivered to Responses API first

## Implementation Status (Feb 2026)

Grok CLI **automatically uses the Responses API** when the base URL is an xAI endpoint (`x.ai` or `api.x.ai`). No configuration needed.

- **Non-streaming (`chat`)**: Uses `responses.create`, maps `messages` → `input`, parses `output` back to `GrokResponse`
- **Streaming (`chatStream`)**: Uses `responses.create` with `stream: true`, maps `response.output_text.delta` and `response.function_call_arguments.*` events to Chat Completions–style chunks
- **Tool calls**: Local function tools execute client-side; results submitted as `function_call_output` items
- **Stateful conversations**: `store: true` and `previous_response_id` for continuation; only delta (new user message or tool results) sent instead of full history
- **Native xAI tools**: `web_search` and `x_search` included in every request; server-side execution for real-time web and X (Twitter) data

## Key API Differences

| Chat Completions (Legacy) | Responses API |
|---------------------------|---------------|
| `client.chat.completions.create` | `client.responses.create` |
| `messages` | `input` |
| `max_tokens` | `max_output_tokens` |
| Response: `choices[0].message` | Response: `output` array |

## Stream Event Mapping

| Responses API Event | Chunk Yielded |
|---------------------|---------------|
| `response.output_text.delta` | `{ choices: [{ delta: { content } }] }` |
| `response.completed` (with tool calls) | `{ choices: [{ delta: { tool_calls } }] }` |

## References

- [xAI Responses API - Generate Text](https://docs.x.ai/developers/model-capabilities/text/generate-text)
- [Comparison: Chat Completions vs Responses API](https://docs.x.ai/developers/model-capabilities/text/comparison)
- [Web Search Tool](https://docs.x.ai/developers/tools/web-search)
