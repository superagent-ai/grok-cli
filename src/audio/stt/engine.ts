import type { ProviderKind } from "../../types/index";
import type { TelegramSettings } from "../../utils/settings";
import { getActiveProvider, getApiKey, getBaseURL, resolveTelegramAudioInputSettings } from "../../utils/settings";
import { GrokSttEngine, type GrokSttTranscriptionResult } from "./grok-stt";

export interface AudioTranscriptionInput {
  audioPath: string;
  fileName?: string;
  mimeType?: string;
}

export type AudioTranscriptionResult = GrokSttTranscriptionResult;

export interface AudioTranscriptionEngine {
  transcribe(input: AudioTranscriptionInput): Promise<AudioTranscriptionResult>;
}

export function createTelegramAudioInputEngine(
  telegramSettings: TelegramSettings | undefined,
  provider: ProviderKind = getActiveProvider(),
): AudioTranscriptionEngine {
  if (provider !== "xai") {
    throw new Error(`Telegram audio transcription is not supported by the ${provider} provider.`);
  }
  const resolved = resolveTelegramAudioInputSettings(telegramSettings);
  const apiKey = getApiKey(provider);
  if (!apiKey) {
    throw new Error(
      "Grok STT requires an API key. Set GROK_API_KEY or configure apiKey in ~/.grok/user-settings.json.",
    );
  }

  return new GrokSttEngine({
    apiKey,
    baseURL: getBaseURL(provider),
    language: resolved.language,
  });
}
