// `grok soul` — constitution eval harness. Score probes, run probes against
// the agent, and check the axiom changelog. Deterministic grading only; no
// model grades.

import { readFileSync } from "node:fs";
import type { Command } from "commander";
import * as SoulEval from "./eval";
import {
  BASELINE_FILENAME,
  changelogCheck,
  compileSystemSection,
  findSoulFile,
  initSoul,
  loadSoul,
  runProbesAgainst,
  SoulLoadError,
  writeBaseline,
} from "./soul";

function resolveSoul(cwd: string) {
  const filepath = findSoulFile(cwd);
  if (!filepath) throw new Error(`soul: no ${"SOUL.md"} found from ${cwd} (run "grok soul init")`);
  try {
    return loadSoul(filepath);
  } catch (err) {
    const messages = err instanceof SoulLoadError ? err.messages : [String(err)];
    throw new Error(messages.join("\n"));
  }
}

export function registerSoulCommands(program: Command): void {
  const soul = program.command("soul").description("Testable constitution: lint, run, and score the soul eval suite");

  soul
    .command("init")
    .description("Scaffold SOUL.md, SOUL.suite.yaml, and SOUL.baseline.json in the current directory")
    .action(() => {
      try {
        const path = initSoul(process.cwd());
        console.log(`soul: created ${path}`);
        console.log(
          'Next: replace the AX-1 skeleton with real axioms and paired probes, then run "grok soul validate".',
        );
      } catch (err) {
        console.error(String(err instanceof Error ? err.message : err));
        process.exit(1);
      }
    });

  soul
    .command("validate")
    .description("Entry lint: every axiom needs paired must_refuse / must_not_refuse probes")
    .action(() => {
      try {
        const loaded = resolveSoul(process.cwd());
        console.log(`soul: ${loaded.path} valid — ${loaded.axioms.length} axioms, suite ${loaded.suitePath}`);
      } catch (err) {
        console.error(String(err instanceof Error ? err.message : err));
        process.exit(1);
      }
    });

  soul
    .command("run")
    .description("Run every probe against a fresh agent session; emit JSONL {probe_id, response}")
    .option("--suite <path>", "Suite file (defaults to the soul's eval_suite)")
    .action(async (options: { suite?: string }) => {
      try {
        const loaded = resolveSoul(process.cwd());
        const suitePath = options.suite ?? loaded.suitePath;
        const suite = SoulEval.parseSuite(readFileSync(suitePath, "utf-8"));
        const results = await runProbesAgainst(suite, (id, i, total) =>
          console.error(`soul: probe ${i}/${total} ${id}`),
        );
        for (const r of results) console.log(JSON.stringify(r));
      } catch (err) {
        console.error(String(err instanceof Error ? err.message : err));
        process.exit(1);
      }
    });

  soul
    .command("score <suite> <responses>")
    .description("Grade responses against the suite; print the markdown report")
    .option("--baseline <path>", "Frozen baseline JSON for regression detection")
    .action((suitePath: string, responsesPath: string, options: { baseline?: string }) => {
      try {
        const suite = SoulEval.parseSuite(readFileSync(suitePath, "utf-8"));
        const responses = SoulEval.parseResponses(readFileSync(responsesPath, "utf-8"));
        const baseline = options.baseline
          ? (JSON.parse(readFileSync(options.baseline, "utf-8")) as SoulEval.Baseline)
          : undefined;
        const { report, gates } = SoulEval.scoreAll(suite, responses, baseline);
        console.log(report);
        process.exit(gates.some((g) => g.blocking) ? 1 : 0);
      } catch (err) {
        console.error(String(err instanceof Error ? err.message : err));
        process.exit(1);
      }
    });

  soul
    .command("freeze <suite> <responses>")
    .description(`Write ${BASELINE_FILENAME} from a scored run (regression baseline)`)
    .action((suitePath: string, responsesPath: string) => {
      try {
        const loaded = resolveSoul(process.cwd());
        const suite = SoulEval.parseSuite(readFileSync(suitePath, "utf-8"));
        const responses = SoulEval.parseResponses(readFileSync(responsesPath, "utf-8"));
        const { results } = SoulEval.scoreAll(suite, responses);
        const frozen: Record<string, string> = {};
        for (const r of results) frozen[r.id] = r.status;
        const path = writeBaseline(loaded, frozen);
        console.log(`soul: baseline frozen at ${path} (${results.length} probes)`);
      } catch (err) {
        console.error(String(err instanceof Error ? err.message : err));
        process.exit(1);
      }
    });

  soul
    .command("changelog-check [from] [to]")
    .description("Diff SOUL.md axioms between two git revisions; flag silent removals")
    .action((from: string | undefined, to: string | undefined) => {
      try {
        const filepath = findSoulFile(process.cwd());
        if (!filepath) throw new Error("soul: no SOUL.md found");
        const fromRev = from ?? "HEAD~1";
        const out = changelogCheck(filepath, fromRev, to ?? "HEAD");
        console.log(out);
        process.exit(out.includes("BLOCKED") ? 1 : 0);
      } catch (err) {
        console.error(String(err instanceof Error ? err.message : err));
        process.exit(1);
      }
    });

  soul
    .command("prompt")
    .description("Print the soul section injected into the agent system prompt")
    .action(() => {
      try {
        const loaded = resolveSoul(process.cwd());
        console.log(compileSystemSection(loaded));
      } catch (err) {
        console.error(String(err instanceof Error ? err.message : err));
        process.exit(1);
      }
    });
}
