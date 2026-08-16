import { generateText } from "ai";
import { execFileSync } from "child_process";
import { resolve } from "path";
import { resolveModelRuntime, type XaiProvider } from "../grok/client.js";
import {
  CURRENT_GENERATOR_VERSION,
  CURRENT_SEED_VERSION,
  hashFile,
  parseSeedDraft,
  type ReseedTrigger,
  SEEDER_PROMPT_VERSION,
  type SeedArtifact,
  type SeedDraft,
  saveSeed,
  validateSeedDraft,
} from "./seed.js";
import { fileExistsInRepo, runSeederTool, type SeederToolName, toRepoRelative } from "./seed-tools.js";
import { extractJsonObject, renderSeederSystemPrompt, renderSeederUserPrompt } from "./seeder-prompt.js";
import type { SuggestionTokenUsage } from "./types.js";

const MAX_SEEDER_STEPS = 4;

export interface SeederRunResult {
  seed?: SeedArtifact;
  error?: string;
  usage: SuggestionTokenUsage;
  modelId: string;
}

export async function generateProjectSeed(
  provider: XaiProvider,
  cwd: string,
  trigger: ReseedTrigger,
  previousSeed: SeedArtifact | null,
  modelId: string,
  signal?: AbortSignal,
): Promise<SeederRunResult> {
  const runtime = resolveModelRuntime(provider, modelId);
  const history: Array<{ modelResponse: string; toolResult?: string }> = [];
  const usage: SuggestionTokenUsage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };

  for (let step = 1; step <= MAX_SEEDER_STEPS + 1; step++) {
    if (signal?.aborted) return { error: "aborted", usage, modelId: runtime.modelId };
    const forceFinal = step > MAX_SEEDER_STEPS;
    const { text, stepUsage } = await callSeederModel(
      runtime,
      renderSeederUserPrompt({
        cwd,
        trigger,
        previousSeed,
        step: Math.min(step, MAX_SEEDER_STEPS),
        maxSteps: MAX_SEEDER_STEPS,
        history: history.slice(-2),
        forceFinal,
      }),
      signal,
    );
    addTokens(usage, stepUsage);
    const parsed = extractJsonObject(text);
    if (!parsed || typeof parsed !== "object") {
      history.push({ modelResponse: text, toolResult: "Could not parse JSON." });
      if (forceFinal) break;
      continue;
    }

    const row = parsed as Record<string, unknown>;
    if (row.type === "tool" && !forceFinal) {
      const tool = row.tool;
      if (tool !== "ls" && tool !== "find" && tool !== "grep" && tool !== "read") {
        history.push({ modelResponse: text, toolResult: `Unknown tool: ${String(tool)}` });
        continue;
      }
      const args = row.arguments && typeof row.arguments === "object" ? (row.arguments as Record<string, unknown>) : {};
      const toolResult = await runSeederTool(cwd, { tool: tool as SeederToolName, arguments: args });
      history.push({ modelResponse: text, toolResult });
      continue;
    }

    if (row.type === "final") {
      const draft = parseSeedDraft(row.seed);
      if (!draft) {
        history.push({ modelResponse: text, toolResult: "Final seed JSON was invalid." });
        if (forceFinal) break;
        continue;
      }
      const invalid = validateSeedDraft(draft);
      if (invalid) {
        history.push({ modelResponse: text, toolResult: `Seed validation failed: ${invalid}` });
        if (forceFinal) break;
        continue;
      }
      try {
        const seed = finalizeSeed(cwd, draft, trigger, runtime.modelId);
        saveSeed(cwd, seed);
        return { seed, usage, modelId: runtime.modelId };
      } catch (error) {
        return { error: error instanceof Error ? error.message : String(error), usage, modelId: runtime.modelId };
      }
    }

    history.push({ modelResponse: text, toolResult: "Expected type=tool or type=final." });
    if (forceFinal) break;
  }

  return { error: "seeder exhausted without a valid seed", usage, modelId: runtime.modelId };
}

async function callSeederModel(
  runtime: ReturnType<typeof resolveModelRuntime>,
  prompt: string,
  signal?: AbortSignal,
): Promise<{ text: string; stepUsage: SuggestionTokenUsage }> {
  const { text, usage } = await generateText({
    model: runtime.model,
    abortSignal: signal,
    temperature: 0.2,
    ...(runtime.modelInfo?.supportsMaxOutputTokens === false ? {} : { maxOutputTokens: 1800 }),
    ...(runtime.providerOptions ? { providerOptions: runtime.providerOptions } : {}),
    system: renderSeederSystemPrompt(),
    prompt,
  });
  return {
    text: text ?? "",
    stepUsage: {
      inputTokens: usage?.inputTokens,
      outputTokens: usage?.outputTokens,
      totalTokens: usage?.totalTokens,
    },
  };
}

function finalizeSeed(cwd: string, draft: SeedDraft, trigger: ReseedTrigger, modelId: string): SeedArtifact {
  const keyFiles = [];
  for (const file of draft.keyFiles.slice(0, 32)) {
    const rel = toRepoRelative(cwd, file.path);
    if (!rel || !fileExistsInRepo(cwd, rel)) continue;
    keyFiles.push({
      path: rel,
      hash: hashFile(resolve(cwd, rel)),
      whyImportant: file.whyImportant,
      category: file.category,
    });
  }
  if (keyFiles.length === 0) {
    throw new Error("Seeder returned keyFiles, but none could be resolved on disk.");
  }

  return {
    seedVersion: CURRENT_SEED_VERSION,
    generatedAt: new Date().toISOString(),
    sourceCommit: gitHead(cwd),
    generatorVersion: CURRENT_GENERATOR_VERSION,
    seederPromptVersion: SEEDER_PROMPT_VERSION,
    modelId,
    projectIntentSummary: draft.projectIntentSummary,
    objectivesSummary: draft.objectivesSummary,
    constraintsSummary: draft.constraintsSummary,
    principlesGuidelinesSummary: draft.principlesGuidelinesSummary,
    implementationStatusSummary: draft.implementationStatusSummary,
    topObjectives: draft.topObjectives,
    constraints: draft.constraints,
    keyFiles,
    categoryFindings: draft.categoryFindings,
    openQuestions: draft.openQuestions,
    reseedNotes: draft.reseedNotes,
    lastReseedReason: trigger.reason,
    lastChangedFiles: trigger.changedFiles,
  };
}

function gitHead(cwd: string): string | undefined {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { cwd, encoding: "utf-8", timeout: 2000 }).trim() || undefined;
  } catch {
    return undefined;
  }
}

function addTokens(total: SuggestionTokenUsage, delta: SuggestionTokenUsage): void {
  total.inputTokens = (total.inputTokens ?? 0) + (delta.inputTokens ?? 0);
  total.outputTokens = (total.outputTokens ?? 0) + (delta.outputTokens ?? 0);
  total.totalTokens = (total.totalTokens ?? 0) + (delta.totalTokens ?? 0);
}
