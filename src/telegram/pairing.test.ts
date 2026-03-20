import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { randomBytesMock } = vi.hoisted(() => ({
  randomBytesMock: vi.fn(),
}));

vi.mock("node:crypto", () => ({
  randomBytes: randomBytesMock,
}));

import { approvePairingCode, clearPairingStore, registerPairingCode } from "./pairing";

describe("pairing code flow", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-21T00:00:00.000Z"));
    randomBytesMock.mockReturnValue(Buffer.from("a1b2c3d4", "hex"));
    clearPairingStore();
  });

  afterEach(() => {
    clearPairingStore();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("registers a deterministic uppercase code and approves it once", () => {
    const code = registerPairingCode(42);

    expect(code).toBe("A1B2C3");
    expect(approvePairingCode("  a1b2c3 ")).toEqual({ ok: true, userId: 42 });
    expect(approvePairingCode(code)).toEqual({ ok: false, error: "Unknown or expired code." });
  });

  it("rejects expired codes and removes them from the store", () => {
    const code = registerPairingCode(7);

    vi.setSystemTime(new Date("2026-03-21T01:00:00.001Z"));

    expect(approvePairingCode(code)).toEqual({
      ok: false,
      error: "Code expired. Send /pair again in Telegram.",
    });
    expect(approvePairingCode(code)).toEqual({ ok: false, error: "Unknown or expired code." });
  });

  it("clears pending codes explicitly", () => {
    const code = registerPairingCode(99);

    clearPairingStore();

    expect(approvePairingCode(code)).toEqual({ ok: false, error: "Unknown or expired code." });
  });
});
