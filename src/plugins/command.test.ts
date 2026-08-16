import { describe, expect, it } from "vitest";
import { formatPluginList, parsePluginCommand, runPluginCommand } from "./command.js";

describe("parsePluginCommand", () => {
  it("parses install, uninstall, and plugins", () => {
    expect(parsePluginCommand("/install")).toEqual({ action: "install", id: "" });
    expect(parsePluginCommand("/install suggester")).toEqual({ action: "install", id: "suggester" });
    expect(parsePluginCommand("/install acme/weather@v1")).toEqual({ action: "install", id: "acme/weather@v1" });
    expect(parsePluginCommand("/uninstall suggester")).toEqual({ action: "uninstall", id: "suggester" });
    expect(parsePluginCommand("/plugins")).toEqual({ action: "list", id: "" });
    expect(parsePluginCommand("/plugin")).toEqual({ action: "list", id: "" });
  });

  it("ignores unrelated commands", () => {
    expect(parsePluginCommand("/suggester on")).toBeNull();
    expect(parsePluginCommand("/btw hello")).toBeNull();
    expect(parsePluginCommand("install suggester")).toBeNull();
  });
});

describe("runPluginCommand", () => {
  it("installs a bundled plugin once", () => {
    const first = runPluginCommand({ action: "install", id: "suggester" }, []);
    expect(first.installed).toEqual(["suggester"]);
    expect(first.message).toContain("Installed suggester");

    const again = runPluginCommand({ action: "install", id: "suggester" }, ["suggester"]);
    expect(again.installed).toEqual(["suggester"]);
    expect(again.message).toContain("already installed");
  });

  it("rejects unknown plugins and lists the catalog", () => {
    const result = runPluginCommand({ action: "install", id: "nope" }, []);
    expect(result.installed).toEqual([]);
    expect(result.message).toContain("Unknown plugin");
    expect(result.message).toContain("suggester");
  });

  it("uninstalls only what is installed", () => {
    const missing = runPluginCommand({ action: "uninstall", id: "suggester" }, []);
    expect(missing.installed).toEqual([]);
    expect(missing.message).toContain("not installed");

    const removed = runPluginCommand({ action: "uninstall", id: "suggester" }, ["suggester"]);
    expect(removed.installed).toEqual([]);
    expect(removed.message).toContain("Uninstalled suggester");
  });

  it("lists installable plugins", () => {
    const text = formatPluginList([]);
    expect(text).toContain("suggester");
    expect(text).toContain("not installed");
    expect(text).toContain("/install <id> or /install owner/repo");
  });
});
