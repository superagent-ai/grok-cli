import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { closeDatabase } from "./db";
import { SessionStore } from "./sessions";

const originalHome = process.env.HOME;

describe("SessionStore recap persistence", () => {
  const tempRoot = path.join(process.cwd(), ".tmp-session-tests");
  let tempHome = "";
  let tempCwd = "";

  beforeEach(() => {
    fs.mkdirSync(tempRoot, { recursive: true });
    tempHome = fs.mkdtempSync(path.join(tempRoot, "grok-session-home-"));
    tempCwd = fs.mkdtempSync(path.join(tempRoot, "grok-session-cwd-"));
    process.env.HOME = tempHome;
    vi.spyOn(os, "homedir").mockReturnValue(tempHome);
    closeDatabase();
  });

  afterEach(() => {
    closeDatabase();
    vi.restoreAllMocks();
    process.env.HOME = originalHome;
    fs.rmSync(tempHome, { recursive: true, force: true });
    fs.rmSync(tempCwd, { recursive: true, force: true });
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it("stores and reloads the latest recap metadata with the session", () => {
    const store = new SessionStore(tempCwd);
    const session = store.createSession("grok-4.3", "agent", tempCwd);
    const updatedAt = new Date("2026-04-22T15:00:00.000Z");

    store.setRecap(session.id, {
      text: "Migrated billing sessions to the new schema. Next step is wiring the prompt banner.",
      model: "grok-4.20-non-reasoning",
      updatedAt,
    });

    expect(store.getRequiredSession(session.id).recap).toEqual({
      text: "Migrated billing sessions to the new schema. Next step is wiring the prompt banner.",
      model: "grok-4.20-non-reasoning",
      updatedAt,
    });
  });

  it("clears recap metadata when the recap is removed", () => {
    const store = new SessionStore(tempCwd);
    const session = store.createSession("grok-4.3", "agent", tempCwd);

    store.setRecap(session.id, {
      text: "Temporary recap",
      model: "grok-4.20-non-reasoning",
      updatedAt: new Date("2026-04-22T15:00:00.000Z"),
    });
    store.setRecap(session.id, null);

    expect(store.getRequiredSession(session.id).recap).toBeNull();
  });
});

describe("SessionStore listing", () => {
  const tempRoot = path.join(os.tmpdir(), "grok-session-list-tests");
  let tempHome = "";
  let tempCwd = "";
  let otherCwd = "";

  beforeEach(() => {
    fs.mkdirSync(tempRoot, { recursive: true });
    tempHome = fs.mkdtempSync(path.join(tempRoot, "grok-session-home-"));
    tempCwd = fs.mkdtempSync(path.join(tempRoot, "grok-session-cwd-"));
    otherCwd = fs.mkdtempSync(path.join(tempRoot, "grok-session-other-"));
    process.env.HOME = tempHome;
    vi.spyOn(os, "homedir").mockReturnValue(tempHome);
    closeDatabase();
  });

  afterEach(() => {
    closeDatabase();
    vi.restoreAllMocks();
    process.env.HOME = originalHome;
    fs.rmSync(tempHome, { recursive: true, force: true });
    fs.rmSync(tempCwd, { recursive: true, force: true });
    fs.rmSync(otherCwd, { recursive: true, force: true });
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it("returns this workspace's sessions newest first", async () => {
    const store = new SessionStore(tempCwd);
    const older = store.createSession("grok-4.3", "agent", tempCwd);
    await new Promise((resolve) => setTimeout(resolve, 5));
    const newer = store.createSession("grok-4.20-non-reasoning", "plan", tempCwd);

    const listed = store.listSessions();
    expect(listed.map((session) => session.id)).toEqual([newer.id, older.id]);
    expect(listed[0]?.model).toBe("grok-4.20-non-reasoning");
    expect(listed[0]?.mode).toBe("plan");
  });

  it("respects a positive limit", () => {
    const store = new SessionStore(tempCwd);
    store.createSession("grok-4.3", "agent", tempCwd);
    store.createSession("grok-4.3", "agent", tempCwd);

    expect(store.listSessions({ limit: 1 })).toHaveLength(1);
  });

  it("does not include sessions from another workspace", () => {
    const store = new SessionStore(tempCwd);
    const otherStore = new SessionStore(otherCwd);
    const local = store.createSession("grok-4.3", "agent", tempCwd);
    otherStore.createSession("grok-4.3", "ask", otherCwd);

    expect(store.listSessions().map((session) => session.id)).toEqual([local.id]);
  });
});
