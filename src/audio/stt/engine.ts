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
): AudioTranscriptionEngine {
  const resolved = resolveTelegramAudioInputSettings(telegramSettings);
  const provider = getActiveProvider();
  if (provider !== "xai") {
    throw new Error(
      `Telegram audio transcription via Grok STT is only available with the xAI provider; the active provider is ${provider}. Disable telegram.audioInput.enabled or switch to provider=xai.`,
    );
  }
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error(
      "Grok STT requires an API key. Set GROK_API_KEY or configure apiKey in ~/.grok/user-settings.json.",
    );
  }

  return new GrokSttEngine({
    apiKey,
    baseURL: getBaseURL(),
    language: resolved.language,
  });
}
