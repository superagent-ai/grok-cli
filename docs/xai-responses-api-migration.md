# xAI Responses API Migration Plan

The xAI Responses API is the recommended way to interact with Grok models. It offers:

- **Agentic Tools**: Native support for web_search, x_search, code_execution, MCP
- **Stateful Conversations**: `previous_response_id` for continuing conversations without resending full history
- **Billing Optimization**: Automatic caching of conversation history
- **Future Features**: All new capabilities delivered to Responses API first

## Key API Differences

| Chat Completions (Current) | Responses API |
|---------------------------|---------------|
| `client.chat.completions.create` | `client.responses.create` |
| `messages` | `input` |
| `max_tokens` | `max_output_tokens` |
| Response: `choices[0].message` | Response: `output` array |

## Migration Steps (When Implementing)

1. **Update GrokClient** (`src/grok/client.ts`):
   - Add `responses.create` calls (OpenAI SDK v6 supports this with xAI base URL)
   - Map `messages` → `input`
   - Parse new response format: `output` array with `output_text`, `tool_call` items

2. **Adapt Response Parsing**:
   - Chat Completions: `response.choices[0].message.content`
   - Responses API: Iterate `response.output[]` for `type: "message"` and `content[].text`

3. **Tool Call Handling**:
   - Responses API may use different structure for tool calls in the output stream
   - Built-in tools (web_search, x_search) execute server-side — no local execution needed
   - Function tools still require local execution and result submission

4. **Streaming**:
   - Responses API streaming format differs; check xAI docs for SSE/stream structure

## References

- [xAI Responses API - Generate Text](https://docs.x.ai/developers/model-capabilities/text/generate-text)
- [Comparison: Chat Completions vs Responses API](https://docs.x.ai/developers/model-capabilities/text/comparison)
- [Web Search Tool](https://docs.x.ai/developers/tools/web-search)
