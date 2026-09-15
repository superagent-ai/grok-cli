import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { generateImageTool } from "./media";

describe("MiniMax image generation", () => {
  let directory: string;
  const request = vi.fn();

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), "minimax-image-"));
    vi.stubEnv("MINIMAX_API_KEY", "test-key");
    vi.stubEnv("MINIMAX_REGION", "global_en");
    vi.stubEnv("MINIMAX_IMAGE_MODEL", "image-01");
    request.mockReset();
    vi.stubGlobal("fetch", request);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  it("uses the global endpoint and saves every returned image", async () => {
    request
      .mockResolvedValueOnce(
        Response.json({
          base_resp: { status_code: 0 },
          data: { image_urls: ["https://example.com/a.png", "https://example.com/b.png"] },
          metadata: { failed_count: 1 },
        }),
      )
      .mockImplementation(() =>
        Promise.resolve(
          new Response(new Uint8Array([1, 2]), {
            headers: { "content-type": "image/png" },
          }),
        ),
      );
    const signal = new AbortController().signal;
    const result = await generateImageTool(
      {} as never,
      { prompt: "A lighthouse", n: 3, output_path: "art.png" },
      directory,
      signal,
    );
    expect(result.success).toBe(true);
    expect(request.mock.calls[0][0]).toBe("https://api.minimax.io/v1/image_generation");
    expect(request.mock.calls[0][1]).toMatchObject({
      signal,
      headers: { Authorization: "Bearer test-key" },
    });
    expect(JSON.parse(request.mock.calls[0][1].body)).toEqual({
      model: "image-01",
      prompt: "A lighthouse",
      n: 3,
      aspect_ratio: "1:1",
      response_format: "url",
    });
    expect(result.media).toHaveLength(2);
    expect(result.media?.map((asset) => path.basename(asset.path))).toEqual(["art-1.png", "art-2.png"]);
    expect(fs.readFileSync(result.media![0].path)).toEqual(Buffer.from([1, 2]));
    expect(result.output).toContain("could not generate 1");
    expect(request.mock.calls[1][1]).toEqual({ signal });
  });

  it("uses the CN endpoint and sends a local character reference with the selected model", async () => {
    vi.stubEnv("MINIMAX_REGION", "cn_zh");
    fs.writeFileSync(path.join(directory, "reference.png"), Buffer.from([3, 4]));
    request
      .mockResolvedValueOnce(
        Response.json({
          base_resp: { status_code: 0 },
          data: { image_urls: ["https://example.com/image.png"] },
        }),
      )
      .mockResolvedValueOnce(new Response(new Uint8Array([5])));
    const result = await generateImageTool(
      {} as never,
      {
        prompt: "A character portrait",
        model: "image-01-live",
        source: "reference.png",
        aspect_ratio: "3:4",
      },
      directory,
    );
    expect(result.success).toBe(true);
    expect(request.mock.calls[0][0]).toBe("https://api.minimaxi.com/v1/image_generation");
    expect(JSON.parse(request.mock.calls[0][1].body)).toMatchObject({
      model: "image-01-live",
      aspect_ratio: "3:4",
      subject_reference: [{ type: "character", image_file: "data:image/png;base64,AwQ=" }],
    });
    expect(result.media?.[0].sourcePath).toBe(path.join(directory, "reference.png"));
  });

  it.each([
    { base_resp: { status_code: 1004 }, data: { image_urls: ["https://example.com/image.png"] } },
    { base_resp: { status_code: 0 }, data: { image_urls: [] } },
    { base_resp: { status_code: 0 }, data: { image_urls: ["invalid"] } },
  ])("rejects API errors and unusable responses", async (payload) => {
    request.mockResolvedValueOnce(Response.json(payload));
    const result = await generateImageTool({} as never, { prompt: "A lighthouse" }, directory);
    expect(result.success).toBe(false);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("reports HTTP failure without attempting image downloads", async () => {
    request.mockResolvedValueOnce(new Response("", { status: 429 }));
    const result = await generateImageTool({} as never, { prompt: "A lighthouse" }, directory);
    expect(result.output).toContain("HTTP 429");
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("rejects unsupported options before network access", async () => {
    for (const input of [{ n: 10 }, { resolution: "2k" as const }, { aspect_ratio: "2:1" as const }]) {
      const result = await generateImageTool({} as never, { prompt: "A lighthouse", ...input }, directory);
      expect(result.success).toBe(false);
    }
    expect(request).not.toHaveBeenCalled();
  });
});
