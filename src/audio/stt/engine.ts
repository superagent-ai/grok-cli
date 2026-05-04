import type { TelegramSettings } from "../../utils/settings";
import { getApiKey, getBaseURL, isVertexModeEnabled, resolveTelegramAudioInputSettings } from "../../utils/settings";
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
  const apiKey = getApiKey();
  if (!apiKey) {
    if (isVertexModeEnabled()) {
      throw new Error(
        "Telegram audio transcription uses the native xAI STT endpoint and is not available with Vertex ADC alone. Disable Telegram audio input, or unset GROK_USE_VERTEX and configure GROK_API_KEY.",
      );
    }

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
