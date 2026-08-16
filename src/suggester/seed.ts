// Seed artifact shape adapted from pi-prompt-suggester (MIT)
// Copyright (c) 2026 Guido Witt-Dörring
// https://github.com/guwidoe/pi-prompt-suggester

import { createHash } from "crypto";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { projectKeyFor } from "./store.js";

export const CURRENT_SEED_VERSION = 1;
export const CURRENT_GENERATOR_VERSION = "2026-08-16.1";
export const BOOTSTRAP_GENERATOR_VERSION = "bootstrap";
export const SEEDER_PROMPT_VERSION = "2026-08-16.1";

export type ReseedReason = "initial_missing" | "manual" | "key_file_changed";

export type SeedKeyFileCategory = "vision" | "architecture" | "principles_guidelines" | "code_entrypoint" | "other";

export const REQUIRED_SEED_CATEGORIES = ["vision", "architecture", "principles_guidelines"] as const;

export interface SeedCategoryFinding {
  found: boolean;
  rationale: string;
  files: string[];
}

export type SeedCategoryFindings = Record<(typeof REQUIRED_SEED_CATEGORIES)[number], SeedCategoryFinding>;

export interface SeedKeyFile {
  path: string;
  hash: string;
  whyImportant: string;
  category: SeedKeyFileCategory;
}

export interface SeedArtifact {
  seedVersion: number;
  generatedAt: string;
  sourceCommit?: string;
  generatorVersion: string;
  seederPromptVersion: string;
  modelId?: string;
  projectIntentSummary: string;
  objectivesSummary: string;
  constraintsSummary: string;
  principlesGuidelinesSummary: string;
  implementationStatusSummary: string;
  topObjectives: string[];
  constraints: string[];
  keyFiles: SeedKeyFile[];
  categoryFindings: SeedCategoryFindings;
  openQuestions: string[];
  reseedNotes?: string;
  lastReseedReason?: ReseedReason;
  lastChangedFiles?: string[];
}

export interface SeedDraft {
  projectIntentSummary: string;
  objectivesSummary: string;
  constraintsSummary: string;
  principlesGuidelinesSummary: string;
  implementationStatusSummary: string;
  topObjectives: string[];
  constraints: string[];
  keyFiles: Array<Pick<SeedKeyFile, "path" | "whyImportant" | "category">>;
  categoryFindings: SeedCategoryFindings;
  openQuestions: string[];
  reseedNotes?: string;
}

export interface ReseedTrigger {
  reason: ReseedReason;
  changedFiles: string[];
}

export function seedPath(cwd: string, homeDir = os.homedir()): string {
  return path.join(homeDir, ".grok", "prompt-suggester", "projects", projectKeyFor(cwd), "seed.json");
}

export function loadSeed(cwd: string, homeDir = os.homedir()): SeedArtifact | null {
  const filePath = seedPath(cwd, homeDir);
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, "utf-8")) as SeedArtifact;
  } catch {
    return null;
  }
}

export function saveSeed(cwd: string, seed: SeedArtifact, homeDir = os.homedir()): void {
  const filePath = seedPath(cwd, homeDir);
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 });
    fs.writeFileSync(filePath, JSON.stringify(seed, null, 2), { mode: 0o600 });
  } catch {
    /* never block the TUI */
  }
}

export function hashFile(absolutePath: string): string {
  return createHash("sha256").update(fs.readFileSync(absolutePath)).digest("hex");
}

export function compactSeedForPrompt(seed: SeedArtifact | null): string {
  if (!seed) return "none";
  const files = seed.keyFiles
    .slice(0, 6)
    .map((file) => file.path)
    .join(", ");
  return [
    clip(seed.projectIntentSummary, 360),
    clip(seed.objectivesSummary, 200),
    clip(seed.constraintsSummary, 200),
    files ? `files: ${files}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function clip(value: string, max: number): string {
  const text = value.replace(/\s+/g, " ").trim();
  return text.length <= max ? text : text.slice(0, max).trimEnd();
}

export function validateSeedDraft(draft: SeedDraft): string | null {
  for (const category of REQUIRED_SEED_CATEGORIES) {
    const finding = draft.categoryFindings[category];
    if (!finding || typeof finding.found !== "boolean" || !finding.rationale.trim()) {
      return `missing categoryFindings.${category}`;
    }
    if (finding.found) {
      const tagged = draft.keyFiles.some((file) => file.category === category);
      if (!tagged) return `found ${category} but no key file is tagged with that category`;
    }
  }
  if (draft.keyFiles.length === 0) return "no keyFiles";
  return null;
}

export function parseSeedDraft(value: unknown): SeedDraft | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const findings = parseCategoryFindings(raw.categoryFindings);
  if (!findings) return null;
  const keyFiles = parseKeyFileDrafts(raw.keyFiles);
  if (!keyFiles) return null;
  return {
    projectIntentSummary: asString(raw.projectIntentSummary),
    objectivesSummary: asString(raw.objectivesSummary),
    constraintsSummary: asString(raw.constraintsSummary),
    principlesGuidelinesSummary: asString(raw.principlesGuidelinesSummary),
    implementationStatusSummary: asString(raw.implementationStatusSummary),
    topObjectives: asStringArray(raw.topObjectives),
    constraints: asStringArray(raw.constraints),
    keyFiles,
    categoryFindings: findings,
    openQuestions: asStringArray(raw.openQuestions),
    reseedNotes: asString(raw.reseedNotes) || undefined,
  };
}

function parseCategoryFindings(value: unknown): SeedCategoryFindings | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const findings = {} as SeedCategoryFindings;
  for (const category of REQUIRED_SEED_CATEGORIES) {
    const item = raw[category];
    if (!item || typeof item !== "object") return null;
    const row = item as Record<string, unknown>;
    findings[category] = {
      found: Boolean(row.found),
      rationale: asString(row.rationale),
      files: asStringArray(row.files),
    };
  }
  return findings;
}

function parseKeyFileDrafts(value: unknown): SeedDraft["keyFiles"] | null {
  if (!Array.isArray(value)) return null;
  const files: SeedDraft["keyFiles"] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const filePath = asString(row.path);
    const category = asCategory(row.category);
    if (!filePath || !category) continue;
    files.push({
      path: filePath,
      whyImportant: asString(row.whyImportant) || "High-signal repository file",
      category,
    });
  }
  return files;
}

function asCategory(value: unknown): SeedKeyFileCategory | null {
  if (
    value === "vision" ||
    value === "architecture" ||
    value === "principles_guidelines" ||
    value === "code_entrypoint" ||
    value === "other"
  ) {
    return value;
  }
  return null;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}

const BOOTSTRAP_FILES: Array<{ path: string; category: SeedKeyFileCategory }> = [
  { path: "README.md", category: "vision" },
  { path: "AGENTS.md", category: "principles_guidelines" },
  { path: "package.json", category: "code_entrypoint" },
];

export function bootstrapSeedFromRepo(cwd: string): SeedArtifact | null {
  const keyFiles: SeedKeyFile[] = [];
  const snippets: string[] = [];
  for (const file of BOOTSTRAP_FILES) {
    const absolute = path.resolve(cwd, file.path);
    try {
      if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) continue;
      const text = fs.readFileSync(absolute, "utf-8").slice(0, 1_200).replace(/\s+/g, " ").trim();
      keyFiles.push({
        path: file.path,
        hash: hashFile(absolute),
        whyImportant: "High-signal repo file used for instant seed",
        category: file.category,
      });
      if (text) snippets.push(`${file.path}: ${text.slice(0, 280)}`);
    } catch {
      /* skip unreadable files */
    }
  }
  if (keyFiles.length === 0) return null;

  const summary = snippets.join(" ").slice(0, 500) || "Local repository.";
  const emptyFinding = (found: boolean, files: string[]): SeedCategoryFinding => ({
    found,
    rationale: found ? "Present at repo root." : "Not found at repo root.",
    files,
  });

  return {
    seedVersion: CURRENT_SEED_VERSION,
    generatedAt: new Date().toISOString(),
    generatorVersion: BOOTSTRAP_GENERATOR_VERSION,
    seederPromptVersion: SEEDER_PROMPT_VERSION,
    projectIntentSummary: summary,
    objectivesSummary: summary,
    constraintsSummary: "",
    principlesGuidelinesSummary: keyFiles.some((file) => file.path === "AGENTS.md") ? "See AGENTS.md" : "",
    implementationStatusSummary: "Bootstrap seed; a background reseed will refine this.",
    topObjectives: [],
    constraints: [],
    keyFiles,
    categoryFindings: {
      vision: emptyFinding(
        keyFiles.some((file) => file.category === "vision"),
        keyFiles.filter((file) => file.category === "vision").map((file) => file.path),
      ),
      architecture: emptyFinding(false, []),
      principles_guidelines: emptyFinding(
        keyFiles.some((file) => file.category === "principles_guidelines"),
        keyFiles.filter((file) => file.category === "principles_guidelines").map((file) => file.path),
      ),
    },
    openQuestions: [],
    lastReseedReason: "initial_missing",
  };
}
