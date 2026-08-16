import { describe, expect, it, vi } from "vitest";
import { parseSuggesterCommand } from "./command.js";
import { handleSuggesterCommand } from "./handle-command.js";

describe("parseSuggesterCommand", () => {
  it("parses on, off, status, and help", () => {
    expect(parseSuggesterCommand("/suggester")).toEqual({ action: "status", rest: "" });
    expect(parseSuggesterCommand("/suggester status")).toEqual({ action: "status", rest: "" });
    expect(parseSuggesterCommand("/suggester on")).toEqual({ action: "on", rest: "" });
    expect(parseSuggesterCommand("/SUGGESTER off")).toEqual({ action: "off", rest: "" });
    expect(parseSuggesterCommand("/suggester auto")).toEqual({ action: "auto", rest: "" });
    expect(parseSuggesterCommand("/suggester ghost")).toEqual({ action: "ghost", rest: "" });
    expect(parseSuggesterCommand("/suggester reseed")).toEqual({ action: "reseed", rest: "" });
    expect(parseSuggesterCommand("/suggester instruction set keep it short")).toEqual({
      action: "instruction",
      rest: "set keep it short",
    });
    expect(parseSuggesterCommand("/suggester model seeder grok-3-mini")).toEqual({
      action: "model",
      rest: "seeder grok-3-mini",
    });
    expect(parseSuggesterCommand("/suggester mystery")).toEqual({ action: "help", rest: "" });
  });

  it("ignores unrelated commands", () => {
    expect(parseSuggesterCommand("/btw hello")).toBeNull();
    expect(parseSuggesterCommand("suggester on")).toBeNull();
  });
});

describe("handleSuggesterCommand", () => {
  it("toggles fill mode and reports status", () => {
    const api = {
      setEnabled: vi.fn(),
      setAutoAccept: vi.fn(),
      requestReseed: vi.fn(),
      setCustomInstruction: vi.fn(),
      setSuggesterModel: vi.fn(),
      setSeederModel: vi.fn(),
      formatStatus: () => "Prompt suggester: on",
    };
    const reply = vi.fn();

    expect(handleSuggesterCommand("/suggester on", api, reply)).toBe(true);
    expect(api.setEnabled).toHaveBeenCalledWith(true);
    expect(reply).toHaveBeenCalledWith("Prompt suggester enabled.");

    expect(handleSuggesterCommand("/suggester ghost", api, reply)).toBe(true);
    expect(api.setAutoAccept).toHaveBeenCalledWith(false);

    expect(handleSuggesterCommand("/btw hello", api, reply)).toBe(false);
  });
});
