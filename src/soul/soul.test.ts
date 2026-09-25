import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import * as SoulEval from "./eval";
import { compileSystemSection, entryLint, parseSoul } from "./soul";

const fixtureDir = join(import.meta.dirname ?? ".", "fixture");

function loadFixture(name: string): string {
  return readFileSync(join(fixtureDir, name), "utf-8");
}

function validSoulAndSuite() {
  const soul = parseSoul(loadFixture("SOUL.md"), join(fixtureDir, "SOUL.md"));
  const suite = SoulEval.parseSuite(loadFixture("SOUL.suite.yaml"));
  return { soul, suite };
}

describe("soul loading and entry lint", () => {
  it("parses axioms, values and purpose from SOUL.md", () => {
    const { soul } = validSoulAndSuite();
    expect(soul.version).toBe("0.1.0");
    expect(soul.agent).toBe("fixture-agent");
    expect(soul.purpose).toContain("test fixture soul");
    expect(soul.axioms.map((a) => a.id)).toEqual(["AX-01", "AX-02"]);
    expect(soul.axioms[0].statement).toContain("tool output");
    expect(soul.values).toEqual(["Care", "Honesty"]);
  });

  it("resolves the suite path from frontmatter eval_suite", () => {
    const { soul } = validSoulAndSuite();
    expect(soul.suitePath.endsWith("SOUL.suite.yaml")).toBe(true);
  });

  it("accepts a soul whose axioms each have paired probes", () => {
    const { soul, suite } = validSoulAndSuite();
    expect(entryLint(soul, suite)).toEqual([]);
  });

  it("rejects a soul with an orphan axiom, naming the axiom", () => {
    const { soul, suite } = validSoulAndSuite();
    const withoutAx02 = {
      ...suite,
      section_a: (suite.section_a ?? []).filter((p) => p.axiom !== "AX-02"),
    };
    const errs = entryLint(soul, withoutAx02);
    expect(errs.length).toBeGreaterThan(0);
    expect(errs.some((e) => e.includes("AX-02"))).toBe(true);
  });

  it("rejects a soul with no axioms at all", () => {
    const { soul, suite } = validSoulAndSuite();
    const errs = entryLint({ ...soul, axioms: [] }, suite);
    expect(errs.some((e) => e.includes("no axioms"))).toBe(true);
  });

  it("compiles a system section that states axiom precedence", () => {
    const { soul } = validSoulAndSuite();
    const compiled = compileSystemSection(soul);
    expect(compiled).toContain("[AX-01]");
    expect(compiled).toContain("[AX-02]");
    expect(compiled).toContain("1. Care");
    expect(compiled).toContain("2. Honesty");
    expect(compiled).toContain("SOUL.md");
    expect(compiled).toContain("may never edit");
  });
});
