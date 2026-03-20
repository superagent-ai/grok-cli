import { describe, expect, it } from "vitest";
import { splitTelegramMessage, TELEGRAM_MAX_MESSAGE } from "./limits";

describe("splitTelegramMessage", () => {
  it("returns an empty array for empty input", () => {
    expect(splitTelegramMessage("")).toEqual([]);
  });

  it("keeps messages at or under the limit in a single chunk", () => {
    expect(splitTelegramMessage("short message")).toEqual(["short message"]);
    expect(splitTelegramMessage("x".repeat(TELEGRAM_MAX_MESSAGE))).toEqual(["x".repeat(TELEGRAM_MAX_MESSAGE)]);
  });

  it("splits messages longer than the limit into consecutive chunks", () => {
    const text = "a".repeat(TELEGRAM_MAX_MESSAGE) + "b".repeat(TELEGRAM_MAX_MESSAGE) + "tail";

    expect(splitTelegramMessage(text)).toEqual([
      "a".repeat(TELEGRAM_MAX_MESSAGE),
      "b".repeat(TELEGRAM_MAX_MESSAGE),
      "tail",
    ]);
  });
});
