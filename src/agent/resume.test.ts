import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { closeDatabase } from "../storage/db";
import { appendMessages, SessionStore } from "../storage/index";
import { Agent } from "./agent";

const originalHome = process.env.HOME;
const originalCwd = process.cwd();

describe("Agent.resumeSession", () => {
  const tempRoot = path.join(os.tmpdir(), "grok-resume-tests");
  let tempHome = "";
  let tempCwd = "";

  beforeEach(() => {
    fs.mkdirSync(tempRoot, { recursive: true });
    tempHome = fs.mkdtempSync(path.join(tempRoot, "grok-resume-home-"));
    tempCwd = fs.mkdtempSync(path.join(tempRoot, "grok-resume-cwd-"));
    process.env.HOME = tempHome;
    vi.spyOn(os, "homedir").mockReturnValue(tempHome);
    process.chdir(tempCwd);
    closeDatabase();
  });

  afterEach(() => {
    process.chdir(originalCwd);
    closeDatabase();
    vi.restoreAllMocks();
    process.env.HOME = originalHome;
    fs.rmSync(tempHome, { recursive: true, force: true });
    fs.rmSync(tempCwd, { recursive: true, force: true });
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it("returns null when session persistence is disabled", () => {
    const agent = new Agent(undefined, undefined, undefined, undefined, {
      persistSession: false,
    });
    expect(agent.resumeSession("latest")).toBeNull();
    expect(agent.listSessions()).toEqual([]);
  });

  it("reloads the saved transcript, model, and mode", () => {
    const store = new SessionStore(tempCwd);
    const saved = store.createSession("grok-4.20-non-reasoning", "plan", tempCwd);
    store.setTitle(saved.id, "Billing recap");
    appendMessages(saved.id, [{ role: "user", content: "continue the billing work" }]);

    const agent = new Agent(undefined, undefined, "grok-4.3", undefined, {
      persistSession: true,
    });
    expect(agent.getSessionId()).not.toBe(saved.id);
    expect(agent.getMode()).toBe("agent");

    Object.assign(agent as object, { sessionStartHookFired: true });
    const snapshot = agent.resumeSession(saved.id);

    expect(snapshot?.session.id).toBe(saved.id);
    expect(snapshot?.session.title).toBe("Billing recap");
    expect(agent.getMode()).toBe("plan");
    expect(agent.getModel()).toBe("grok-4.20-non-reasoning");
    expect(snapshot?.entries.map((entry) => entry.content)).toContain("continue the billing work");
    expect((agent as unknown as { sessionStartHookFired: boolean }).sessionStartHookFired).toBe(false);
  });

  it("is a no-op when the selector is the current session", () => {
    const agent = new Agent(undefined, undefined, undefined, undefined, {
      persistSession: true,
    });
    const currentId = agent.getSessionId();
    expect(currentId).toBeTruthy();
    Object.assign(agent as object, { sessionStartHookFired: true });

    const snapshot = agent.resumeSession(currentId!);
    expect(snapshot?.session.id).toBe(currentId);
    expect((agent as unknown as { sessionStartHookFired: boolean }).sessionStartHookFired).toBe(true);
  });

  it("skips the current session when latest is requested", () => {
    const store = new SessionStore(tempCwd);
    const previous = store.createSession("grok-4.20-non-reasoning", "ask", tempCwd);
    appendMessages(previous.id, [{ role: "user", content: "previous ask work" }]);

    const agent = new Agent(undefined, undefined, "grok-4.3", undefined, {
      persistSession: true,
    });
    const currentId = agent.getSessionId();
    expect(currentId).toBeTruthy();
    expect(currentId).not.toBe(previous.id);

    const snapshot = agent.resumeSession("LATEST");
    expect(snapshot?.session.id).toBe(previous.id);
    expect(snapshot?.session.id).not.toBe(currentId);
    expect(agent.getMode()).toBe("ask");
    expect(snapshot?.entries.map((entry) => entry.content)).toContain("previous ask work");
  });

  it("throws when the session does not exist", () => {
    const agent = new Agent(undefined, undefined, undefined, undefined, {
      persistSession: true,
    });
    expect(() => agent.resumeSession("missing-session")).toThrow('Session "missing-session" was not found.');
  });
});
