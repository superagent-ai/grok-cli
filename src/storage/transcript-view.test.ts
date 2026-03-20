import type { ModelMessage } from "ai";
import { describe, expect, it } from "vitest";
import { createCompactionSummaryMessage } from "../agent/compaction";
import { buildEffectiveTranscript, type PersistedCompaction } from "./transcript-view";

function user(text: string): ModelMessage {
  return { role: "user", content: text } as ModelMessage;
}

describe("buildEffectiveTranscript", () => {
  it("returns shallow copies when there is no persisted compaction", () => {
    const messages = [user("first"), user("second")];
    const seqs = [1, 2];
    const timestamps = [new Date("2026-03-20T00:00:01.000Z"), new Date("2026-03-20T00:00:02.000Z")];

    const transcript = buildEffectiveTranscript(messages, seqs, timestamps, null);

    expect(transcript).toEqual({
      messages,
      seqs,
      timestamps,
      compaction: null,
    });
    expect(transcript.messages).not.toBe(messages);
    expect(transcript.seqs).not.toBe(seqs);
    expect(transcript.timestamps).not.toBe(timestamps);
  });

  it("prepends the summary and keeps messages starting from the first matching sequence", () => {
    const messages = [user("first"), user("second"), user("third")];
    const seqs = [10, 11, 12];
    const timestamps = [
      new Date("2026-03-20T00:00:10.000Z"),
      new Date("2026-03-20T00:00:11.000Z"),
      new Date("2026-03-20T00:00:12.000Z"),
    ];
    const compaction: PersistedCompaction = {
      firstKeptSeq: 10,
      summary: "Previous work",
      tokensBefore: 500,
      createdAt: new Date("2026-03-20T00:00:20.000Z"),
    };

    const transcript = buildEffectiveTranscript(messages, seqs, timestamps, compaction);

    expect(transcript.messages).toEqual([createCompactionSummaryMessage("Previous work"), ...messages]);
    expect(transcript.seqs).toEqual([null, 10, 11, 12]);
    expect(transcript.timestamps).toEqual([compaction.createdAt, ...timestamps]);
    expect(transcript.compaction).toEqual(compaction);
  });

  it("returns only the synthetic summary message when no remaining sequence matches the checkpoint", () => {
    const messages = [user("first"), user("second")];
    const seqs = [1, 2];
    const timestamps = [new Date("2026-03-20T00:00:01.000Z"), new Date("2026-03-20T00:00:02.000Z")];
    const compaction: PersistedCompaction = {
      firstKeptSeq: 99,
      summary: "Compacted history",
      tokensBefore: 500,
      createdAt: new Date("2026-03-20T00:00:30.000Z"),
    };

    const transcript = buildEffectiveTranscript(messages, seqs, timestamps, compaction);

    expect(transcript.messages).toEqual([createCompactionSummaryMessage("Compacted history")]);
    expect(transcript.seqs).toEqual([null]);
    expect(transcript.timestamps).toEqual([compaction.createdAt]);
  });
});
