import { describe, expect, it } from "vitest";
import {
  DEFAULT_TELEGRAM_AUDIO_INPUT_BINARY,
  DEFAULT_TELEGRAM_AUDIO_INPUT_MODEL,
  resolveTelegramAudioInputSettings,
} from "./settings";

describe("resolveTelegramAudioInputSettings", () => {
  it("returns whisper.cpp defaults when audio input is unset", () => {
    expect(resolveTelegramAudioInputSettings(undefined)).toEqual({
      enabled: true,
      engine: "whisper.cpp",
      binaryPath: DEFAULT_TELEGRAM_AUDIO_INPUT_BINARY,
      model: DEFAULT_TELEGRAM_AUDIO_INPUT_MODEL,
      modelPath: undefined,
      autoDownloadModel: true,
      language: "en",
    });
  });

  it("preserves explicit telegram audio overrides", () => {
    expect(
      resolveTelegramAudioInputSettings({
        audioInput: {
          enabled: false,
          binaryPath: "/opt/whisper-cli",
          model: "base.en",
          modelPath: "/tmp/ggml-base.en.bin",
          autoDownloadModel: false,
          language: "fr",
        },
      }),
    ).toEqual({
      enabled: false,
      engine: "whisper.cpp",
      binaryPath: "/opt/whisper-cli",
      model: "base.en",
      modelPath: "/tmp/ggml-base.en.bin",
      autoDownloadModel: false,
      language: "fr",
    });
  });
});
