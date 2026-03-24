import type { TelegramSettings } from "../../utils/settings";
import { resolveTelegramAudioInputSettings } from "../../utils/settings";
import { WhisperCppSttEngine, type WhisperCppSttEngineConfig, type WhisperCppTranscriptionResult } from "./whisper-cpp";

export interface AudioTranscriptionInput {
  audioPath: string;
}

export type AudioTranscriptionResult = WhisperCppTranscriptionResult;

export interface AudioTranscriptionEngine {
  transcribe(input: AudioTranscriptionInput): Promise<AudioTranscriptionResult>;
}

export function createTelegramAudioInputEngine(
  telegramSettings: TelegramSettings | undefined,
): AudioTranscriptionEngine {
  const resolved = resolveTelegramAudioInputSettings(telegramSettings);
  const config: WhisperCppSttEngineConfig = {
    binaryPath: resolved.binaryPath,
    model: resolved.model,
    modelPath: resolved.modelPath,
    autoDownloadModel: resolved.autoDownloadModel,
    language: resolved.language,
  };

  return new WhisperCppSttEngine(config);
}
