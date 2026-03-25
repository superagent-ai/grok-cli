import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getWhisperCppModelCacheDir,
  getWhisperCppModelCachePath,
  getWhisperCppModelDownloadUrl,
  getWhisperCppModelFileName,
  normalizeWhisperTranscript,
  resolveWhisperCppModelPath,
} from "./whisper-cpp";

describe("whisper.cpp helpers", () => {
  let tempDir: string;
  const originalHome = process.env.HOME;
  const originalFetch = global.fetch;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "grok-whisper-test-"));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
    process.env.HOME = originalHome;
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("builds stable cache paths for whisper.cpp models", () => {
    expect(getWhisperCppModelCacheDir(tempDir)).toBe(path.join(tempDir, ".grok", "models", "stt", "whisper.cpp"));
    expect(getWhisperCppModelFileName("base.en")).toBe("ggml-base.en.bin");
    expect(getWhisperCppModelCachePath("base.en", tempDir)).toBe(
      path.join(tempDir, ".grok", "models", "stt", "whisper.cpp", "ggml-base.en.bin"),
    );
    expect(getWhisperCppModelDownloadUrl("base.en")).toBe(
      "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin",
    );
  });

  it("normalizes multi-line whisper transcripts without blank lines", () => {
    expect(normalizeWhisperTranscript("  hello world \n\n second line  \n")).toBe("hello world\nsecond line");
  });

  it("uses an explicit model path when provided", async () => {
    const modelPath = path.join(tempDir, "custom-model.bin");
    fs.writeFileSync(modelPath, "model");

    await expect(
      resolveWhisperCppModelPath({
        modelPath,
        autoDownloadModel: false,
      }),
    ).resolves.toBe(modelPath);
  });

  it("fails clearly when auto download is disabled and the model is missing", async () => {
    process.env.HOME = tempDir;
    await expect(
      resolveWhisperCppModelPath({
        model: "tiny.en",
        autoDownloadModel: false,
      }),
    ).rejects.toThrow("Whisper.cpp model ggml-tiny.en.bin is missing.");
  });

  it("downloads a missing model into the cache directory and cleans up temp files", async () => {
    process.env.HOME = tempDir;
    const fetchMock = vi.fn().mockResolvedValue(
      new Response("model-bytes", {
        status: 200,
        headers: { "Content-Type": "application/octet-stream" },
      }),
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    const modelPath = await resolveWhisperCppModelPath({
      model: "tiny.en",
    });

    expect(modelPath).toBe(path.join(tempDir, ".grok", "models", "stt", "whisper.cpp", "ggml-tiny.en.bin"));
    expect(fs.readFileSync(modelPath, "utf8")).toBe("model-bytes");
    expect(fs.readdirSync(path.dirname(modelPath)).filter((entry) => entry.startsWith(".grok-whisper-model-"))).toEqual(
      [],
    );
  });
});
