import { describe, expect, it } from "vitest";
import { formatTelegramAudioTranscript, getTelegramAudioSource } from "./audio-input";

describe("telegram audio input helpers", () => {
  it("extracts a voice source from a telegram message payload", () => {
    expect(
      getTelegramAudioSource({
        voice: {
          file_id: "voice-file",
          mime_type: "audio/ogg",
        },
      }),
    ).toEqual({
      kind: "voice",
      fileId: "voice-file",
      mimeType: "audio/ogg",
    });
  });

  it("extracts an audio attachment source from a telegram message payload", () => {
    expect(
      getTelegramAudioSource({
        audio: {
          file_id: "audio-file",
          file_name: "song.mp3",
          mime_type: "audio/mpeg",
        },
      }),
    ).toEqual({
      kind: "audio",
      fileId: "audio-file",
      fileName: "song.mp3",
      mimeType: "audio/mpeg",
    });
  });

  it("formats user-visible transcript prefixes for voice and audio messages", () => {
    expect(formatTelegramAudioTranscript("voice", "hello there")).toBe("[Voice transcript] hello there");
    expect(formatTelegramAudioTranscript("audio", "demo")).toBe("[Audio transcript] demo");
  });
});
