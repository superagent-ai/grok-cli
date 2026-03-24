import { spawn } from "child_process";
import { createWriteStream, existsSync } from "fs";
import { access, mkdir, mkdtemp, readFile, rename, rm } from "fs/promises";
import os from "os";
import path from "path";
import { Readable } from "stream";
import { pipeline } from "stream/promises";

export const DEFAULT_WHISPER_CPP_BINARY = "whisper-cli";
export const DEFAULT_WHISPER_CPP_MODEL = "tiny.en";
const DEFAULT_WHISPER_LANGUAGE = "en";
const MODEL_ID_PATTERN = /^[a-z0-9][a-z0-9._-]*$/i;

export interface WhisperCppSttEngineConfig {
  binaryPath?: string;
  model?: string;
  modelPath?: string;
  autoDownloadModel?: boolean;
  language?: string;
}

export interface WhisperCppTranscriptionResult {
  text: string;
  engine: "whisper.cpp";
  model: string;
  modelPath: string;
}

export class WhisperCppSttEngine {
  constructor(private readonly config: WhisperCppSttEngineConfig) {}

  async transcribe(input: { audioPath: string }): Promise<WhisperCppTranscriptionResult> {
    const binaryPath = this.config.binaryPath?.trim() || DEFAULT_WHISPER_CPP_BINARY;
    const model = normalizeWhisperCppModel(this.config.model);
    const modelPath = await resolveWhisperCppModelPath({
      model,
      modelPath: this.config.modelPath,
      autoDownloadModel: this.config.autoDownloadModel !== false,
    });
    const language = this.config.language?.trim() || DEFAULT_WHISPER_LANGUAGE;
    const workDir = await mkdtemp(path.join(os.tmpdir(), "grok-whisper-"));

    try {
      const text = await transcribeWithOptionalFfmpegFallback({
        binaryPath,
        modelPath,
        language,
        audioPath: input.audioPath,
        workDir,
      });

      return {
        text,
        engine: "whisper.cpp",
        model,
        modelPath,
      };
    } finally {
      await rm(workDir, { recursive: true, force: true });
    }
  }
}

export function getWhisperCppModelCacheDir(homeDir = os.homedir()): string {
  return path.join(homeDir, ".grok", "models", "stt", "whisper.cpp");
}

export function getWhisperCppModelFileName(model = DEFAULT_WHISPER_CPP_MODEL): string {
  return `ggml-${normalizeWhisperCppModel(model)}.bin`;
}

export function getWhisperCppModelCachePath(model = DEFAULT_WHISPER_CPP_MODEL, homeDir = os.homedir()): string {
  return path.join(getWhisperCppModelCacheDir(homeDir), getWhisperCppModelFileName(model));
}

export function getWhisperCppModelDownloadUrl(model = DEFAULT_WHISPER_CPP_MODEL): string {
  return `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/${getWhisperCppModelFileName(model)}`;
}

export function normalizeWhisperTranscript(text: string): string {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n")
    .trim();
}

export async function resolveWhisperCppModelPath(opts: {
  model?: string;
  modelPath?: string;
  autoDownloadModel?: boolean;
}): Promise<string> {
  const model = normalizeWhisperCppModel(opts.model);
  const overridePath = opts.modelPath?.trim();
  if (overridePath) {
    await ensureFileReadable(overridePath, `Configured whisper.cpp model not found: ${overridePath}`);
    return overridePath;
  }

  const cachePath = getWhisperCppModelCachePath(model);
  if (existsSync(cachePath)) {
    return cachePath;
  }

  if (opts.autoDownloadModel === false) {
    throw new Error(
      `Whisper.cpp model ${getWhisperCppModelFileName(model)} is missing. ` +
        `Set telegram.audioInput.modelPath or enable autoDownloadModel.`,
    );
  }

  await downloadWhisperCppModel(model, cachePath);
  return cachePath;
}

async function transcribeWithOptionalFfmpegFallback(opts: {
  binaryPath: string;
  modelPath: string;
  language: string;
  audioPath: string;
  workDir: string;
}): Promise<string> {
  const directOutputBase = path.join(opts.workDir, "transcript");

  try {
    return await runWhisperCpp({
      binaryPath: opts.binaryPath,
      modelPath: opts.modelPath,
      language: opts.language,
      audioPath: opts.audioPath,
      outputBase: directOutputBase,
    });
  } catch (directError: unknown) {
    const convertedPath = await maybeConvertAudioWithFfmpeg(opts.audioPath, opts.workDir);
    if (!convertedPath) {
      throw directError;
    }

    try {
      return await runWhisperCpp({
        binaryPath: opts.binaryPath,
        modelPath: opts.modelPath,
        language: opts.language,
        audioPath: convertedPath,
        outputBase: path.join(opts.workDir, "transcript-converted"),
      });
    } catch (convertedError: unknown) {
      const directMessage = directError instanceof Error ? directError.message : String(directError);
      const convertedMessage = convertedError instanceof Error ? convertedError.message : String(convertedError);
      throw new Error(`${directMessage}\nffmpeg fallback failed: ${convertedMessage}`);
    }
  }
}

async function runWhisperCpp(opts: {
  binaryPath: string;
  modelPath: string;
  language: string;
  audioPath: string;
  outputBase: string;
}): Promise<string> {
  const args = [
    "--model",
    opts.modelPath,
    "--file",
    opts.audioPath,
    "--language",
    opts.language,
    "--output-txt",
    "--output-file",
    opts.outputBase,
  ];

  await runCommand(opts.binaryPath, args);
  const transcriptPath = `${opts.outputBase}.txt`;
  const transcript = normalizeWhisperTranscript(await readFile(transcriptPath, "utf8"));

  if (!transcript) {
    throw new Error("whisper.cpp returned an empty transcript.");
  }

  return transcript;
}

async function maybeConvertAudioWithFfmpeg(audioPath: string, workDir: string): Promise<string | null> {
  if (path.extname(audioPath).toLowerCase() === ".wav") {
    return null;
  }

  const convertedPath = path.join(workDir, "input.wav");
  try {
    await runCommand("ffmpeg", ["-y", "-i", audioPath, "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le", convertedPath]);
    return convertedPath;
  } catch {
    return null;
  }
}

async function downloadWhisperCppModel(model: string, destinationPath: string): Promise<void> {
  await mkdir(path.dirname(destinationPath), { recursive: true, mode: 0o700 });
  const response = await fetch(getWhisperCppModelDownloadUrl(model));
  if (!response.ok || !response.body) {
    throw new Error(`Failed to download whisper.cpp model ${model}: ${response.status} ${response.statusText}`);
  }

  // Keep the temp file on the target filesystem so the final rename stays atomic.
  const tempDir = await mkdtemp(path.join(path.dirname(destinationPath), ".grok-whisper-model-"));
  const tempPath = path.join(tempDir, getWhisperCppModelFileName(model));

  try {
    const stream = createWriteStream(tempPath, { mode: 0o600 });
    await pipeline(Readable.fromWeb(response.body as globalThis.ReadableStream<Uint8Array>), stream);
    await rename(tempPath, destinationPath);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

async function ensureFileReadable(filePath: string, message: string): Promise<void> {
  try {
    await access(filePath);
  } catch {
    throw new Error(message);
  }
}

function normalizeWhisperCppModel(model = DEFAULT_WHISPER_CPP_MODEL): string {
  const normalized = model.trim() || DEFAULT_WHISPER_CPP_MODEL;
  if (!MODEL_ID_PATTERN.test(normalized)) {
    throw new Error(`Invalid whisper.cpp model name: ${model}`);
  }
  return normalized;
}

function runCommand(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout?.on("data", (chunk: Buffer | string) => {
      stdout += chunk.toString();
    });
    child.stderr?.on("data", (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });

    child.on("error", (error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") {
        reject(new Error(`Command not found: ${command}`));
        return;
      }
      reject(error);
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      const details = stderr.trim() || stdout.trim() || `exit code ${code ?? "unknown"}`;
      reject(new Error(`${command} failed: ${details}`));
    });
  });
}
