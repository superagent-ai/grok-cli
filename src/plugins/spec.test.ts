import { describe, expect, it } from "vitest";
import { parsePluginSpec } from "./spec.js";

describe("parsePluginSpec", () => {
  it("treats known bundled ids as bundled", () => {
    expect(parsePluginSpec("suggester")).toEqual({ kind: "bundled", id: "suggester" });
    expect(parsePluginSpec("SUGGESTER")).toEqual({ kind: "bundled", id: "suggester" });
  });

  it("parses github owner/repo specs", () => {
    expect(parsePluginSpec("acme/weather")).toEqual({
      kind: "github",
      owner: "acme",
      repo: "weather",
      ref: "",
      subdir: "",
      spec: "acme/weather",
    });
    expect(parsePluginSpec("github.com/acme/weather")).toEqual({
      kind: "github",
      owner: "acme",
      repo: "weather",
      ref: "",
      subdir: "",
      spec: "github.com/acme/weather",
    });
    expect(parsePluginSpec("https://github.com/acme/weather")).toEqual({
      kind: "github",
      owner: "acme",
      repo: "weather",
      ref: "",
      subdir: "",
      spec: "https://github.com/acme/weather",
    });
  });

  it("parses refs and subdirs", () => {
    expect(parsePluginSpec("acme/weather@v1.2.0")).toMatchObject({
      kind: "github",
      owner: "acme",
      repo: "weather",
      ref: "v1.2.0",
      subdir: "",
    });
    expect(parsePluginSpec("acme/monorepo/plugins/weather@main")).toMatchObject({
      kind: "github",
      owner: "acme",
      repo: "monorepo",
      ref: "main",
      subdir: "plugins/weather",
    });
  });

  it("rejects empty, local, and non-github hosts", () => {
    expect(parsePluginSpec("")).toEqual({ kind: "invalid", input: "", reason: "missing" });
    expect(parsePluginSpec("nope")).toMatchObject({ kind: "invalid" });
    expect(parsePluginSpec("../evil")).toMatchObject({ kind: "invalid" });
    expect(parsePluginSpec("http://github.com/acme/weather")).toMatchObject({ kind: "invalid" });
    expect(parsePluginSpec("https://gitlab.com/acme/weather")).toMatchObject({ kind: "invalid" });
    expect(parsePluginSpec("file:///tmp/plugin")).toMatchObject({ kind: "invalid" });
  });
});
