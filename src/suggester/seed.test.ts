import { describe, expect, it } from "vitest";
import { parseSeedDraft, validateSeedDraft } from "./seed.js";
import { confinePath } from "./seed-tools.js";
import { extractJsonObject } from "./seeder-prompt.js";

describe("parseSeedDraft", () => {
  it("accepts a complete draft and rejects missing categories", () => {
    const raw = {
      projectIntentSummary: "Build a CLI",
      objectivesSummary: "Ship suggester",
      constraintsSummary: "Read-only seeder",
      principlesGuidelinesSummary: "Keep it simple",
      implementationStatusSummary: "In progress",
      topObjectives: ["seed"],
      constraints: ["no writes"],
      keyFiles: [{ path: "README.md", whyImportant: "vision", category: "vision" }],
      categoryFindings: {
        vision: { found: true, rationale: "README", files: ["README.md"] },
        architecture: { found: false, rationale: "none", files: [] },
        principles_guidelines: { found: false, rationale: "none", files: [] },
      },
      openQuestions: [],
    };
    const draft = parseSeedDraft(raw);
    expect(draft).not.toBeNull();
    expect(validateSeedDraft(draft!)).toBeNull();

    const incomplete = parseSeedDraft({ ...raw, categoryFindings: { vision: raw.categoryFindings.vision } });
    expect(incomplete).toBeNull();
  });
});

describe("extractJsonObject", () => {
  it("pulls JSON out of a fenced reply", () => {
    const parsed = extractJsonObject('```json\n{"type":"final","seed":{}}\n```');
    expect(parsed).toEqual({ type: "final", seed: {} });
  });
});

describe("confinePath", () => {
  it("rejects paths outside the workspace", () => {
    expect(confinePath("/tmp/repo", "../etc/passwd")).toBeNull();
    expect(confinePath("/tmp/repo", "src/app.ts")?.endsWith("/repo/src/app.ts")).toBe(true);
  });
});
