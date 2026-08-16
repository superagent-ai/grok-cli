import { describe, expect, it } from "vitest";
import { filterSlashMenuItems, SLASH_MENU_ITEMS } from "./slash-menu";

describe("filterSlashMenuItems", () => {
  it("finds the models command when searching with the full slash command", () => {
    expect(filterSlashMenuItems(SLASH_MENU_ITEMS, "/models")[0]?.id).toBe("models");
  });

  it("finds the models command from model and mode prefixes before description matches", () => {
    expect(filterSlashMenuItems(SLASH_MENU_ITEMS, "model")[0]?.id).toBe("models");
    expect(filterSlashMenuItems(SLASH_MENU_ITEMS, "mode")[0]?.id).toBe("models");
  });

  it("still includes description matches after stronger command matches", () => {
    const ids = filterSlashMenuItems(SLASH_MENU_ITEMS, "mode").map((item) => item.id);
    expect(ids).toContain("models");
    expect(ids).toContain("sandbox");
    expect(ids.indexOf("models")).toBeLessThan(ids.indexOf("sandbox"));
  });

  it("finds the recaps command from singular aliases", () => {
    expect(filterSlashMenuItems(SLASH_MENU_ITEMS, "recap")[0]?.id).toBe("recaps");
  });

  it("finds the install command", () => {
    expect(filterSlashMenuItems(SLASH_MENU_ITEMS, "/install")[0]?.id).toBe("install");
    expect(filterSlashMenuItems(SLASH_MENU_ITEMS, "plugin")[0]?.id).toBe("plugins");
  });

  it("finds the resume command from session aliases", () => {
    expect(filterSlashMenuItems(SLASH_MENU_ITEMS, "/resume")[0]?.id).toBe("resume");
    expect(filterSlashMenuItems(SLASH_MENU_ITEMS, "sessions")[0]?.id).toBe("resume");
    expect(filterSlashMenuItems(SLASH_MENU_ITEMS, "session")[0]?.id).toBe("resume");
  });

  it("ranks resume ahead of new session for the session alias", () => {
    const ids = filterSlashMenuItems(SLASH_MENU_ITEMS, "session").map((item) => item.id);
    expect(ids.indexOf("resume")).toBeLessThan(ids.indexOf("new"));
  });
});
