import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { streamText, tool } from "ai";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { createProvider } from "./client";

/**
 * Regression test: llama.cpp streams tool-call argument deltas the same way
 * OpenAI does — only the FIRST delta carries `id` and `type`, continuation
 * deltas only carry `index` + `function.arguments`:
 *
 *   chunk 1  {"index":0,"id":"…","type":"function","function":{"name":"bash","arguments":"{"}}
 *   chunk 2  {"index":0,"function":{"arguments":"\"command"}}
 *   …
 *   chunk 9  {"index":0,"function":{"arguments":"}"}}
 *
 * @ai-sdk/xai validates every delta against a strict schema that requires
 * `id`/`type` on each `tool_calls[]` entry, so the stream breaks on chunk 2
 * and the accumulated arguments stay as `"{"`. For custom (non-xAI) base URLs,
 * createProvider must use the tolerant @ai-sdk/openai-compatible provider.
 *
 * The frames below are a verbatim capture from a llama-server streaming a
 * `bash` tool call (Gemma-4 12B, llama.cpp fork build b1-50df2c7), with the
 * local model path sanitized.
 */
const LLAMACPP_TOOLCALL_FRAMES = [
  `data: {"choices":[{"finish_reason":null,"index":0,"delta":{"tool_calls":[{"index":0,"id":"JLkuMJxGBlFkcKGttBRVOZnp1q4EeUvc","type":"function","function":{"name":"bash","arguments":"{"}}]}}],"created":1790554574,"id":"chatcmpl-caHtJkseyNitiaOQa8spRWLKSiCinPAq","model":"local-model","system_fingerprint":"b1-50df2c7","object":"chat.completion.chunk"}`,
  `data: {"choices":[{"finish_reason":null,"index":0,"delta":{"tool_calls":[{"index":0,"function":{"arguments":"\\"command"}}]}}],"created":1790554574,"id":"chatcmpl-caHtJkseyNitiaOQa8spRWLKSiCinPAq","model":"local-model","system_fingerprint":"b1-50df2c7","object":"chat.completion.chunk"}`,
  `data: {"choices":[{"finish_reason":null,"index":0,"delta":{"tool_calls":[{"index":0,"function":{"arguments":"\\":"}}]}}],"created":1790554574,"id":"chatcmpl-caHtJkseyNitiaOQa8spRWLKSiCinPAq","model":"local-model","system_fingerprint":"b1-50df2c7","object":"chat.completion.chunk"}`,
  `data: {"choices":[{"finish_reason":null,"index":0,"delta":{"tool_calls":[{"index":0,"function":{"arguments":"\\""}}]}}],"created":1790554574,"id":"chatcmpl-caHtJkseyNitiaOQa8spRWLKSiCinPAq","model":"local-model","system_fingerprint":"b1-50df2c7","object":"chat.completion.chunk"}`,
  `data: {"choices":[{"finish_reason":null,"index":0,"delta":{"tool_calls":[{"index":0,"function":{"arguments":"echo"}}]}}],"created":1790554574,"id":"chatcmpl-caHtJkseyNitiaOQa8spRWLKSiCinPAq","model":"local-model","system_fingerprint":"b1-50df2c7","object":"chat.completion.chunk"}`,
  `data: {"choices":[{"finish_reason":null,"index":0,"delta":{"tool_calls":[{"index":0,"function":{"arguments":" HOL"}}]}}],"created":1790554574,"id":"chatcmpl-caHtJkseyNitiaOQa8spRWLKSiCinPAq","model":"local-model","system_fingerprint":"b1-50df2c7","object":"chat.completion.chunk"}`,
  `data: {"choices":[{"finish_reason":null,"index":0,"delta":{"tool_calls":[{"index":0,"function":{"arguments":"A"}}]}}],"created":1790554574,"id":"chatcmpl-caHtJkseyNitiaOQa8spRWLKSiCinPAq","model":"local-model","system_fingerprint":"b1-50df2c7","object":"chat.completion.chunk"}`,
  `data: {"choices":[{"finish_reason":null,"index":0,"delta":{"tool_calls":[{"index":0,"function":{"arguments":"\\""}}]}}],"created":1790554574,"id":"chatcmpl-caHtJkseyNitiaOQa8spRWLKSiCinPAq","model":"local-model","system_fingerprint":"b1-50df2c7","object":"chat.completion.chunk"}`,
  `data: {"choices":[{"finish_reason":null,"index":0,"delta":{"tool_calls":[{"index":0,"function":{"arguments":"}"}}]}}],"created":1790554574,"id":"chatcmpl-caHtJkseyNitiaOQa8spRWLKSiCinPAq","model":"local-model","system_fingerprint":"b1-50df2c7","object":"chat.completion.chunk"}`,
  `data: {"choices":[{"finish_reason":"tool_calls","index":0,"delta":{}}],"created":1790554574,"id":"chatcmpl-caHtJkseyNitiaOQa8spRWLKSiCinPAq","model":"local-model","system_fingerprint":"b1-50df2c7","object":"chat.completion.chunk"}`,
];

describe("createProvider with a custom (non-xAI) baseURL", () => {
  let server: Server;
  let baseURL: string;

  beforeAll(async () => {
    server = createServer((req, res) => {
      req.resume();
      req.on("end", () => {
        res.writeHead(200, { "content-type": "text/event-stream" });
        for (const frame of LLAMACPP_TOOLCALL_FRAMES) {
          res.write(`${frame}\n\n`);
        }
        res.write("data: [DONE]\n\n");
        res.end();
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address() as AddressInfo;
    baseURL = `http://127.0.0.1:${port}/v1`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  });

  it("accumulates streamed tool-call argument deltas (llama.cpp format)", async () => {
    const provider = createProvider("test-key", baseURL);
    const result = streamText({
      model: provider("local-model"),
      tools: {
        bash: tool({
          description: "Executes a bash command",
          inputSchema: z.object({ command: z.string() }),
        }),
      },
      prompt: "run: echo HOLA",
      maxRetries: 0,
    });

    let toolCall: { toolName: string; input: unknown } | undefined;
    for await (const part of result.fullStream) {
      if (part.type === "tool-call") {
        toolCall = { toolName: part.toolName, input: part.input };
      }
    }

    expect(toolCall?.toolName).toBe("bash");
    expect(toolCall?.input).toEqual({ command: "echo HOLA" });
  });
});
