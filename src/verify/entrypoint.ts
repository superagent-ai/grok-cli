import * as fs from "fs";
import * as path from "path";
import type { TaskRequest, VerifyRecipe } from "../types/index";
import { mergeSandboxSettings, type SandboxSettings } from "../utils/settings";
import { ensureVerifyCheckpoint } from "./checkpoint";

export const VERIFY_SUBAGENT_ID = "verify";
export const VERIFY_TASK_DESCRIPTION = "Run local verification";

type VerifyAppKind =
  | "nextjs"
  | "vite"
  | "astro"
  | "sveltekit"
  | "remix"
  | "cra"
  | "node"
  | "django"
  | "python"
  | "go"
  | "rust"
  | "maven"
  | "gradle"
  | "make"
  | "unknown";

function normalizeVerifyAppKind(value: string): VerifyAppKind {
  return (
    [
      "nextjs",
      "vite",
      "astro",
      "sveltekit",
      "remix",
      "cra",
      "node",
      "django",
      "python",
      "go",
      "rust",
      "maven",
      "gradle",
      "make",
      "unknown",
    ] as const
  ).includes(value as VerifyAppKind)
    ? (value as VerifyAppKind)
    : "unknown";
}

interface PackageJsonLike {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  scripts?: Record<string, string>;
}

export interface VerifyProjectProfile {
  appKind: VerifyAppKind;
  appLabel: string;
  packageManager: string | null;
  availableScripts: string[];
  hasNodeModules: boolean;
  sandboxSettings: SandboxSettings;
  recipe: VerifyRecipe;
}

export interface VerifyRuntimeConfig {
  sandboxMode: "shuru";
  sandboxSettings: SandboxSettings;
  taskRequest: TaskRequest;
  profile: VerifyProjectProfile;
  checkpointCreated?: boolean;
}

function fileExists(cwd: string, file: string): boolean {
  return fs.existsSync(path.join(cwd, file));
}

function readTextFile(cwd: string, file: string): string | null {
  try {
    return fs.readFileSync(path.join(cwd, file), "utf8");
  } catch {
    return null;
  }
}

function parseHostPort(mapping: string): string | null {
  const match = mapping.trim().match(/^(\d+):(\d+)$/);
  return match ? match[1] : null;
}

function readPackageJson(cwd: string): PackageJsonLike | null {
  const raw = readTextFile(cwd, "package.json");
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PackageJsonLike;
  } catch {
    return null;
  }
}

function detectPackageManager(cwd: string): string | null {
  const candidates: Array<[string, string]> = [
    ["pnpm-lock.yaml", "pnpm"],
    ["bun.lock", "bun"],
    ["bun.lockb", "bun"],
    ["yarn.lock", "yarn"],
    ["package-lock.json", "npm"],
    ["uv.lock", "uv"],
    ["poetry.lock", "poetry"],
    ["Pipfile.lock", "pipenv"],
  ];

  for (const [file, manager] of candidates) {
    if (fileExists(cwd, file)) {
      return manager;
    }
  }

  return null;
}

function dedupe(values: Array<string | undefined | null>): string[] {
  return [...new Set(values.map((v) => v?.trim()).filter((v): v is string => Boolean(v)))];
}

function bootstrapWhenMissing(check: string, install: string): string {
  return `command -v ${check} >/dev/null 2>&1 || (${install})`;
}

function getBaseShellInitCommands(): string[] {
  return ["export DEBIAN_FRONTEND=noninteractive"];
}

function getNodeBootstrapCommands(packageManager: string | null): string[] {
  const ensureNode = bootstrapWhenMissing("node", "apt-get update && apt-get install -y nodejs npm");
  const ensureBun =
    "command -v bun >/dev/null 2>&1 || (apt-get update && apt-get install -y curl unzip ca-certificates && curl -fsSL https://bun.sh/install | bash)";
  const ensurePnpm = `${ensureNode} && command -v pnpm >/dev/null 2>&1 || npm install -g pnpm`;
  const ensureYarn = `${ensureNode} && command -v yarn >/dev/null 2>&1 || npm install -g yarn`;

  if (packageManager === "bun") return [ensureBun];
  if (packageManager === "pnpm") return [ensurePnpm];
  if (packageManager === "yarn") return [ensureYarn];
  return [ensureNode];
}

function getNodeShellInitCommands(packageManager: string | null): string[] {
  const base = getBaseShellInitCommands();
  if (packageManager === "bun") {
    return [...base, 'export PATH="$HOME/.bun/bin:$PATH"'];
  }
  return base;
}

function getPythonBootstrapCommands(packageManager: string | null): string[] {
  const ensurePython = bootstrapWhenMissing(
    "python3",
    "apt-get update && apt-get install -y python3 python3-pip python3-venv",
  );
  if (packageManager === "uv") {
    return [ensurePython, "command -v uv >/dev/null 2>&1 || (python3 -m pip install --break-system-packages uv)"];
  }
  if (packageManager === "poetry") {
    return [
      ensurePython,
      "command -v poetry >/dev/null 2>&1 || (python3 -m pip install --break-system-packages poetry)",
    ];
  }
  if (packageManager === "pipenv") {
    return [
      ensurePython,
      "command -v pipenv >/dev/null 2>&1 || (python3 -m pip install --break-system-packages pipenv)",
    ];
  }
  return [ensurePython];
}

function getPythonShellInitCommands(packageManager: string | null): string[] {
  const base = getBaseShellInitCommands();
  if (packageManager === "uv" || packageManager === "poetry" || packageManager === "pipenv") {
    return [...base, 'export PATH="$HOME/.local/bin:$PATH"'];
  }
  return base;
}

function getGoBootstrapCommands(): string[] {
  return [bootstrapWhenMissing("go", "apt-get update && apt-get install -y golang-go")];
}

function getRustBootstrapCommands(): string[] {
  return [bootstrapWhenMissing("cargo", "apt-get update && apt-get install -y cargo rustc")];
}

function getJavaBootstrapCommands(appKind: VerifyAppKind): string[] {
  if (appKind === "maven") {
    return [
      bootstrapWhenMissing("java", "apt-get update && apt-get install -y default-jdk"),
      bootstrapWhenMissing("mvn", "apt-get update && apt-get install -y maven"),
    ];
  }
  if (appKind === "gradle") {
    return [
      bootstrapWhenMissing("java", "apt-get update && apt-get install -y default-jdk"),
      bootstrapWhenMissing("gradle", "apt-get update && apt-get install -y gradle"),
    ];
  }
  return [];
}

function inferPortFromCommand(command: string | undefined): string | undefined {
  if (!command) return undefined;
  const flagMatch = command.match(/(?:--port|-p)\s+(\d{2,5})/);
  if (flagMatch) return flagMatch[1];
  const envMatch = command.match(/\bPORT=(\d{2,5})\b/);
  if (envMatch) return envMatch[1];
  return undefined;
}

function parseTargetNames(raw: string): string[] {
  return raw
    .split(/\r?\n/)
    .map((line) => line.match(/^([A-Za-z0-9_.-]+):(?:\s|$)/)?.[1])
    .filter((target): target is string => Boolean(target));
}

function detectMakeRecipe(cwd: string): VerifyRecipe | null {
  const makefile = readTextFile(cwd, "Makefile");
  if (!makefile) return null;
  const targets = parseTargetNames(makefile);
  const has = (names: string[]) => names.find((name) => targets.includes(name));
  const install = has(["install", "setup", "bootstrap"]);
  const build = has(["build", "compile"]);
  const test = has(["test", "check"]);
  const run = has(["run", "start", "serve", "dev"]);

  return {
    ecosystem: "make",
    appKind: "make",
    appLabel: "Makefile-driven project",
    shellInitCommands: getBaseShellInitCommands(),
    bootstrapCommands: [],
    installCommands: install ? [`make ${install}`] : [],
    buildCommands: build ? [`make ${build}`] : [],
    testCommands: test ? [`make ${test}`] : [],
    startCommand: run ? `make ${run}` : undefined,
    smokeKind: "none",
    evidence: ["Detected Makefile", `Targets: ${targets.join(", ") || "(none)"}`],
    notes: [],
  };
}

function detectNodeRecipe(cwd: string, pkg: PackageJsonLike, packageManager: string | null): VerifyRecipe {
  const scripts = pkg.scripts ?? {};
  const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
  let appKind: VerifyAppKind = "node";
  let appLabel = "Node.js app";
  let defaultPort: string | undefined;

  if (deps.next) {
    appKind = "nextjs";
    appLabel = "Next.js";
    defaultPort = "3000";
  } else if (deps["@sveltejs/kit"]) {
    appKind = "sveltekit";
    appLabel = "SvelteKit";
    defaultPort = "5173";
  } else if (deps.astro) {
    appKind = "astro";
    appLabel = "Astro";
    defaultPort = "4321";
  } else if (deps["@remix-run/dev"] || deps["@remix-run/react"]) {
    appKind = "remix";
    appLabel = "Remix";
    defaultPort = "3000";
  } else if (deps["react-scripts"]) {
    appKind = "cra";
    appLabel = "Create React App";
    defaultPort = "3000";
  } else if (deps.vite) {
    appKind = "vite";
    appLabel = "Vite";
    defaultPort = "5173";
  }

  const install = packageManager
    ? packageManager === "pnpm"
      ? "pnpm install"
      : packageManager === "bun"
        ? "bun install"
        : packageManager === "yarn"
          ? "yarn install"
          : "npm install"
    : undefined;
  const startCommand = scripts.dev ?? scripts.start;
  const startPort = inferPortFromCommand(startCommand) ?? defaultPort;
  const smokeKind: VerifyRecipe["smokeKind"] = startCommand && startPort ? "http" : "none";

  return {
    ecosystem: "node",
    appKind,
    appLabel,
    shellInitCommands: getNodeShellInitCommands(packageManager),
    bootstrapCommands: getNodeBootstrapCommands(packageManager),
    installCommands: dedupe([install]),
    buildCommands: dedupe(
      [scripts.build, scripts.typecheck].map((script) => script && pickPackageScript(packageManager, scripts, script)),
    ),
    testCommands: dedupe(
      ["test", "check", "lint"]
        .filter((name) => scripts[name])
        .map((name) => pickPackageScript(packageManager, scripts, scripts[name]!)),
    ),
    startCommand: startCommand ? pickPackageScript(packageManager, scripts, startCommand) : undefined,
    startPort,
    smokeKind,
    evidence: [`Detected package.json`, `Scripts: ${Object.keys(scripts).join(", ") || "(none)"}`],
    notes: [],
  };
}

function pickPackageScript(packageManager: string | null, scripts: Record<string, string>, body: string): string {
  const entry = Object.entries(scripts).find(([, scriptBody]) => scriptBody === body)?.[0];
  if (!entry) return body;
  const runner =
    packageManager === "pnpm"
      ? "pnpm"
      : packageManager === "bun"
        ? "bun"
        : packageManager === "yarn"
          ? "yarn"
          : "npm run";
  return runner === "yarn" ? `yarn ${entry}` : runner === "bun" ? `bun run ${entry}` : `${runner} ${entry}`;
}

function detectPythonRecipe(cwd: string): VerifyRecipe | null {
  const pyproject = readTextFile(cwd, "pyproject.toml");
  const requirements = readTextFile(cwd, "requirements.txt");
  const managePy = fileExists(cwd, "manage.py");
  if (!pyproject && !requirements && !managePy && !fileExists(cwd, "setup.py")) {
    return null;
  }

  const lower = `${pyproject ?? ""}\n${requirements ?? ""}`.toLowerCase();
  const packageManager = detectPackageManager(cwd);
  const isDjango = managePy || lower.includes("django");
  const isFastApi = lower.includes("fastapi") || lower.includes("uvicorn");

  let install = "pip install -r requirements.txt";
  if (packageManager === "uv") install = "uv sync";
  else if (packageManager === "poetry") install = "poetry install";
  else if (packageManager === "pipenv") install = "pipenv install";
  else if (pyproject && !requirements) install = "pip install -e .";

  if (isDjango) {
    return {
      ecosystem: "python",
      appKind: "django",
      appLabel: "Django app",
      shellInitCommands: getPythonShellInitCommands(packageManager),
      bootstrapCommands: getPythonBootstrapCommands(packageManager),
      installCommands: [install],
      buildCommands: [],
      testCommands: ["python manage.py test"],
      startCommand: "python manage.py runserver 0.0.0.0:8000",
      startPort: "8000",
      smokeKind: "http",
      evidence: ["Detected manage.py", pyproject ? "Detected pyproject.toml" : undefined].filter(Boolean) as string[],
      notes: [],
    };
  }

  if (isFastApi) {
    const appModule = fileExists(cwd, "main.py") ? "main:app" : fileExists(cwd, "app.py") ? "app:app" : "main:app";
    return {
      ecosystem: "python",
      appKind: "python",
      appLabel: "Python web app",
      shellInitCommands: getPythonShellInitCommands(packageManager),
      bootstrapCommands: getPythonBootstrapCommands(packageManager),
      installCommands: [install],
      buildCommands: [],
      testCommands: fileExists(cwd, "tests") ? ["pytest"] : [],
      startCommand: `uvicorn ${appModule} --host 0.0.0.0 --port 8000`,
      startPort: "8000",
      smokeKind: "http",
      evidence: ["Detected Python project", "Detected FastAPI/Uvicorn dependency"],
      notes: [],
    };
  }

  return {
    ecosystem: "python",
    appKind: "python",
    appLabel: "Python project",
    shellInitCommands: getPythonShellInitCommands(packageManager),
    bootstrapCommands: getPythonBootstrapCommands(packageManager),
    installCommands: [install],
    buildCommands: [],
    testCommands: fileExists(cwd, "tests") ? ["pytest"] : ["python -m unittest discover"],
    smokeKind: "none",
    evidence: ["Detected Python project"],
    notes: [],
  };
}

function detectGoRecipe(cwd: string): VerifyRecipe | null {
  if (!fileExists(cwd, "go.mod")) return null;
  return {
    ecosystem: "go",
    appKind: "go",
    appLabel: "Go project",
    shellInitCommands: getBaseShellInitCommands(),
    bootstrapCommands: getGoBootstrapCommands(),
    installCommands: [],
    buildCommands: ["go build ./..."],
    testCommands: ["go test ./..."],
    startCommand: fileExists(cwd, "main.go") ? "go run ." : undefined,
    smokeKind: "none",
    evidence: ["Detected go.mod"],
    notes: [],
  };
}

function detectRustRecipe(cwd: string): VerifyRecipe | null {
  if (!fileExists(cwd, "Cargo.toml")) return null;
  return {
    ecosystem: "rust",
    appKind: "rust",
    appLabel: "Rust project",
    shellInitCommands: getBaseShellInitCommands(),
    bootstrapCommands: getRustBootstrapCommands(),
    installCommands: [],
    buildCommands: ["cargo build"],
    testCommands: ["cargo test"],
    startCommand: fileExists(cwd, path.join("src", "main.rs")) ? "cargo run" : undefined,
    smokeKind: "none",
    evidence: ["Detected Cargo.toml"],
    notes: [],
  };
}

function detectJavaRecipe(cwd: string): VerifyRecipe | null {
  if (fileExists(cwd, "pom.xml")) {
    return {
      ecosystem: "java",
      appKind: "maven",
      appLabel: "Maven project",
      shellInitCommands: getBaseShellInitCommands(),
      bootstrapCommands: getJavaBootstrapCommands("maven"),
      installCommands: [],
      buildCommands: ["mvn package"],
      testCommands: ["mvn test"],
      smokeKind: "none",
      evidence: ["Detected pom.xml"],
      notes: [],
    };
  }

  if (fileExists(cwd, "build.gradle") || fileExists(cwd, "build.gradle.kts")) {
    const gradle = fileExists(cwd, "gradlew") ? "./gradlew" : "gradle";
    return {
      ecosystem: "java",
      appKind: "gradle",
      appLabel: "Gradle project",
      shellInitCommands: getBaseShellInitCommands(),
      bootstrapCommands: getJavaBootstrapCommands("gradle"),
      installCommands: [],
      buildCommands: [`${gradle} build`],
      testCommands: [`${gradle} test`],
      smokeKind: "none",
      evidence: ["Detected Gradle build file"],
      notes: [],
    };
  }

  return null;
}

function detectFallbackRecipe(cwd: string): VerifyRecipe {
  const makeRecipe = detectMakeRecipe(cwd);
  if (makeRecipe) return makeRecipe;
  return {
    ecosystem: "unknown",
    appKind: "unknown",
    appLabel: "Unknown project type",
    shellInitCommands: getBaseShellInitCommands(),
    bootstrapCommands: [],
    installCommands: [],
    buildCommands: [],
    testCommands: [],
    smokeKind: "none",
    evidence: ["No known app metadata detected"],
    notes: ["The verify sub-agent should inspect the repo directly and derive commands from the codebase."],
  };
}

function inferFallbackRecipe(cwd: string, pkg: PackageJsonLike | null, packageManager: string | null): VerifyRecipe {
  if (pkg) return detectNodeRecipe(cwd, pkg, packageManager);
  return (
    detectPythonRecipe(cwd) ??
    detectGoRecipe(cwd) ??
    detectRustRecipe(cwd) ??
    detectJavaRecipe(cwd) ??
    detectFallbackRecipe(cwd)
  );
}

export function normalizeVerifyRecipe(value: unknown): VerifyRecipe | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const asStrings = (input: unknown): string[] =>
    Array.isArray(input)
      ? input.filter((v): v is string => typeof v === "string" && v.trim() !== "").map((v) => v.trim())
      : [];
  const ecosystem = typeof raw.ecosystem === "string" ? raw.ecosystem.trim() : "";
  const appKind = typeof raw.appKind === "string" ? raw.appKind.trim() : "";
  const appLabel = typeof raw.appLabel === "string" ? raw.appLabel.trim() : "";
  const smokeKind =
    raw.smokeKind === "http" || raw.smokeKind === "cli" || raw.smokeKind === "none" ? raw.smokeKind : "none";
  if (!ecosystem || !appKind || !appLabel) return null;
  return {
    ecosystem,
    appKind,
    appLabel,
    shellInitCommands: asStrings(raw.shellInitCommands),
    bootstrapCommands: asStrings(raw.bootstrapCommands),
    installCommands: asStrings(raw.installCommands),
    buildCommands: asStrings(raw.buildCommands),
    testCommands: asStrings(raw.testCommands),
    startCommand: typeof raw.startCommand === "string" && raw.startCommand.trim() ? raw.startCommand.trim() : undefined,
    startPort: typeof raw.startPort === "string" && raw.startPort.trim() ? raw.startPort.trim() : undefined,
    smokeKind,
    smokeTarget: typeof raw.smokeTarget === "string" && raw.smokeTarget.trim() ? raw.smokeTarget.trim() : undefined,
    evidence: asStrings(raw.evidence),
    notes: asStrings(raw.notes),
  };
}

export function inferVerifySmokeUrl(settings?: SandboxSettings): string | null {
  const ports = settings?.ports ?? [];
  if (ports.length !== 1) {
    return null;
  }

  const hostPort = parseHostPort(ports[0]);
  return hostPort ? `http://127.0.0.1:${hostPort}` : null;
}

export function inferVerifyProjectProfile(
  cwd: string,
  baseSettings: SandboxSettings = {},
  recipeOverride?: VerifyRecipe | null,
): VerifyProjectProfile {
  const pkg = readPackageJson(cwd);
  const packageManager = detectPackageManager(cwd);
  const recipe = recipeOverride ?? inferFallbackRecipe(cwd, pkg, packageManager);
  const inferredDefaults: SandboxSettings =
    recipe.smokeKind === "http" && recipe.startPort ? { ports: [`${recipe.startPort}:${recipe.startPort}`] } : {};
  const sandboxSettings = mergeSandboxSettings(inferredDefaults, baseSettings);
  const smokeUrl = inferVerifySmokeUrl(sandboxSettings);

  const recipeWithRuntime: VerifyRecipe = {
    ...recipe,
    smokeTarget: recipe.smokeKind === "http" ? (smokeUrl ?? recipe.smokeTarget) : undefined,
  };

  if (!fs.existsSync(path.join(cwd, "node_modules")) && recipeWithRuntime.ecosystem === "node") {
    recipeWithRuntime.notes = dedupe([
      ...recipeWithRuntime.notes,
      "Host dependencies are not installed in node_modules. Verification may be limited unless a Shuru checkpoint already contains the needed runtime dependencies.",
    ]);
  }

  return {
    appKind: normalizeVerifyAppKind(recipeWithRuntime.appKind),
    appLabel: recipeWithRuntime.appLabel,
    packageManager,
    availableScripts: Object.keys(pkg?.scripts ?? {}),
    hasNodeModules: fs.existsSync(path.join(cwd, "node_modules")),
    sandboxSettings,
    recipe: recipeWithRuntime,
  };
}

function buildBrowserGuidance(profile: VerifyProjectProfile): string[] {
  if (profile.recipe.smokeKind === "http" && profile.recipe.smokeTarget) {
    return [
      `- REQUIRED: After the dev server is running, you MUST run browser smoke tests against ${profile.recipe.smokeTarget}.`,
      "- The agent-browser command runs on the HOST, not inside the sandbox. It WILL work. Do not skip it or assume it is unavailable.",
      "- Run this exact sequence using the bash tool:",
      `    mkdir -p .grok/verify-artifacts && agent-browser record start .grok/verify-artifacts/verify-smoke.webm && agent-browser --screenshot-dir .grok/verify-artifacts open ${profile.recipe.smokeTarget} && agent-browser wait --load networkidle && agent-browser --screenshot-dir .grok/verify-artifacts screenshot && agent-browser get title && agent-browser record stop && agent-browser close`,
      "- IMPORTANT: Use --screenshot-dir .grok/verify-artifacts to control where screenshots are saved. Do NOT pass a filename as a positional arg to the screenshot command.",
      "- IMPORTANT: Use `agent-browser record start <path>` and `agent-browser record stop` to capture a video recording of the smoke test flow.",
      "- If that command fails, report the exact error output. Do not preemptively skip browser checks.",
      "- Include both the screenshot and video file paths from the output in the Evidence section.",
    ];
  }

  if ((profile.sandboxSettings.ports?.length ?? 0) > 1) {
    return [
      "- Multiple forwarded ports are configured, so browser smoke testing is ambiguous.",
      "- Skip browser checks unless the user clearly identifies which forwarded localhost URL to verify.",
    ];
  }

  if (profile.recipe.smokeKind === "cli") {
    return ["- This project appears to need CLI-style runtime validation rather than browser smoke testing."];
  }

  return [
    "- No unambiguous forwarded localhost URL is configured, so browser smoke testing is optional and should usually be skipped.",
    "- If the app can still be verified with bash-only checks, do that and explain why browser checks were skipped.",
  ];
}

function formatRecipeCommands(title: string, commands: string[]): string {
  return commands.length > 0 ? `- ${title}: ${commands.join(" ; ")}` : `- ${title}: (none inferred)`;
}

function buildProjectContextLines(profile: VerifyProjectProfile): string[] {
  const lines = [`- Detected app type: ${profile.appLabel}.`, `- Recipe ecosystem: ${profile.recipe.ecosystem}.`];
  if (profile.packageManager) {
    lines.push(`- Likely package manager: ${profile.packageManager}.`);
  }
  if (profile.availableScripts.length > 0) {
    lines.push(`- Available package.json scripts: ${profile.availableScripts.join(", ")}.`);
  }
  lines.push(...profile.recipe.evidence.map((evidence) => `- Evidence: ${evidence}.`));
  lines.push(formatRecipeCommands("Shell init", profile.recipe.shellInitCommands));
  lines.push(formatRecipeCommands("Bootstrap commands", profile.recipe.bootstrapCommands));
  lines.push(formatRecipeCommands("Install commands", profile.recipe.installCommands));
  lines.push(formatRecipeCommands("Build commands", profile.recipe.buildCommands));
  lines.push(formatRecipeCommands("Test commands", profile.recipe.testCommands));
  lines.push(`- Start command: ${profile.recipe.startCommand ?? "(none inferred)"}.`);
  if (profile.recipe.smokeTarget) {
    lines.push(`- Smoke target: ${profile.recipe.smokeTarget}.`);
  }
  lines.push(...profile.recipe.notes.map((note) => `- Note: ${note}`));
  return lines;
}

export function buildVerifyTaskPrompt(
  cwd: string,
  settings?: SandboxSettings,
  recipeOverride?: VerifyRecipe | null,
): string {
  const profile = inferVerifyProjectProfile(cwd, settings, recipeOverride);
  const checkpoint = profile.sandboxSettings.from?.trim();
  const network = profile.sandboxSettings.allowNet
    ? profile.sandboxSettings.allowedHosts?.length
      ? `enabled but restricted to: ${profile.sandboxSettings.allowedHosts.join(", ")}`
      : "enabled"
    : "disabled";

  return [
    "Run a local verification pass for the current workspace.",
    "",
    "Goals:",
    "- Prove the current changes work as well as possible in phase 1.",
    "- First derive and sanity-check a runnable verification recipe from the repository.",
    "- Then execute that recipe inside the active Shuru sandbox and report the result.",
    "",
    "Detected project context and inferred recipe:",
    ...buildProjectContextLines(profile),
    "",
    "Environment:",
    "- Sandbox mode should be Shuru with workspace mounted at /workspace.",
    `- Network is ${network}.`,
    checkpoint
      ? `- Start from the configured Shuru checkpoint: ${checkpoint}.`
      : "- No Shuru checkpoint is configured; use the current sandbox settings as-is.",
    "- Shuru runs are ephemeral in this version. Shell-side workspace edits do not persist back to the host.",
    "",
    "Required workflow:",
    "- Quickly inspect the code and config files to confirm or correct the inferred recipe before executing it.",
    "- If the inferred recipe is wrong, say what you changed and why before proceeding.",
    "- Prefer the recipe commands as the default execution plan.",
    "- In verify mode, ephemeral dependency installs are allowed inside the sandbox.",
    "- If the recipe needs install/setup work and no checkpoint already provides it, prefer chaining install + build/test/start in the same sandbox command so the installed dependencies remain available for that command.",
    "- Use background bash only when a dev server or watcher must stay alive while you continue verifying.",
    "- If an inferred install/setup step is blocked by sandbox persistence rules, explain the blocker clearly and continue with any valid non-setup checks.",
    "- IMPORTANT: agent-browser commands run on the HOST, not inside the sandbox. They WILL work. Do not skip browser checks or assume agent-browser is unavailable. Just run the command via the bash tool.",
    "- Always save a screenshot and include the screenshot file path in the final report so the user can verify visually.",
    ...buildBrowserGuidance(profile),
    "",
    "Reporting requirements:",
    "- Return a concise structured report with these sections:",
    "  Summary",
    "  Recipe",
    "  Environment",
    "  Commands Run",
    "  Browser Checks",
    "  Evidence",
    "  Results",
    "  Failures or Blockers",
    "  Residual Risk",
    "- The Recipe section must say what recipe you used and whether you changed the inferred one.",
    "- If you captured screenshots or other browser artifacts, include their exact workspace-relative file paths in the Evidence section.",
    "- Use markdown links for screenshot paths when practical, otherwise include the plain relative paths.",
  ].join("\n");
}

export function createVerifyTaskRequest(
  cwd: string,
  settings?: SandboxSettings,
  recipeOverride?: VerifyRecipe | null,
): TaskRequest {
  return {
    agent: VERIFY_SUBAGENT_ID,
    description: VERIFY_TASK_DESCRIPTION,
    prompt: buildVerifyTaskPrompt(cwd, settings, recipeOverride),
  };
}

export function buildVerifyDetectPrompt(cwd: string, settings?: SandboxSettings): string {
  const fallbackProfile = inferVerifyProjectProfile(cwd, settings);
  return [
    "Inspect this repository and produce a structured verification recipe.",
    "",
    "Your job:",
    "- Read the codebase, config files, and any relevant docs or AGENTS guidance.",
    "- Infer how the project should be installed, built, tested, and started.",
    "- Infer whether verification should use HTTP/browser smoke checks, CLI checks, or no runtime smoke step.",
    "- Prefer concrete commands that are likely to work in a Linux dev environment.",
    "- Use the fallback hints below only as clues, not as the final answer.",
    "",
    "Fallback hints from static detection:",
    ...buildProjectContextLines(fallbackProfile),
    "",
    "Return ONLY valid JSON with this exact shape:",
    "{",
    '  "ecosystem": string,',
    '  "appKind": string,',
    '  "appLabel": string,',
    '  "shellInitCommands": string[],',
    '  "bootstrapCommands": string[],',
    '  "installCommands": string[],',
    '  "buildCommands": string[],',
    '  "testCommands": string[],',
    '  "startCommand": string | undefined,',
    '  "startPort": string | undefined,',
    '  "smokeKind": "http" | "cli" | "none",',
    '  "smokeTarget": string | undefined,',
    '  "evidence": string[],',
    '  "notes": string[]',
    "}",
    "",
    "Rules:",
    "- Do not wrap the JSON in markdown.",
    "- Do not include explanatory prose outside the JSON.",
    "- If you are uncertain, put that uncertainty into `notes` and `evidence`.",
  ].join("\n");
}

export function createVerifyRuntimeConfig(
  cwd: string,
  baseSettings: SandboxSettings = {},
  recipeOverride?: VerifyRecipe | null,
): VerifyRuntimeConfig {
  const profile = inferVerifyProjectProfile(cwd, baseSettings, recipeOverride);
  const sandboxSettings = {
    ...profile.sandboxSettings,
    allowNet: true,
    allowedHosts: undefined,
    allowEphemeralInstall: true,
    hostBrowserCommandsOnHost: true,
  };
  sandboxSettings.shellInit = profile.recipe.shellInitCommands;
  return {
    sandboxMode: "shuru",
    sandboxSettings,
    taskRequest: createVerifyTaskRequest(cwd, sandboxSettings, profile.recipe),
    profile: { ...profile, sandboxSettings },
  };
}

export async function prepareVerifyRuntimeConfig(
  cwd: string,
  baseSettings: SandboxSettings = {},
  recipeOverride?: VerifyRecipe | null,
): Promise<VerifyRuntimeConfig> {
  const runtime = createVerifyRuntimeConfig(cwd, baseSettings, recipeOverride);
  const prepared = await ensureVerifyCheckpoint(cwd, runtime.profile, runtime.sandboxSettings);

  if (!prepared.checkpointName) {
    return runtime;
  }

  const sandboxSettings: SandboxSettings = {
    ...runtime.sandboxSettings,
    from: prepared.checkpointName,
    guestWorkdir: prepared.guestWorkdir,
    syncHostWorkspace: true,
  };

  return {
    sandboxMode: "shuru",
    sandboxSettings,
    taskRequest: createVerifyTaskRequest(cwd, sandboxSettings, runtime.profile.recipe),
    profile: { ...runtime.profile, sandboxSettings },
    checkpointCreated: prepared.created,
  };
}

export const VERIFY_PROMPT = [
  "Verify this project locally. Follow these steps in order using the `task` tool:",
  "",
  "Step 1: Run the `verify-detect` sub-agent to inspect the repository and produce a verification recipe.",
  "- agent: verify-detect",
  '- description: "Detect verification recipe"',
  "- The prompt should ask it to read config files, package manifests, scripts, and source layout, then return ONLY a JSON VerifyRecipe object.",
  "- The JSON must include: ecosystem, appKind, appLabel, shellInitCommands, bootstrapCommands, installCommands, buildCommands, testCommands, startCommand, startPort, smokeKind, smokeTarget, evidence, notes.",
  "",
  "Step 2: Once you have the recipe JSON from step 1, run the `verify` sub-agent to execute it.",
  "- agent: verify",
  '- description: "Run local verification"',
  "- You MUST include the complete recipe JSON from step 1 in the verify prompt.",
  "- You MUST also include these execution instructions in the verify prompt:",
  "  - The verify agent runs inside a Shuru sandbox with full network access enabled.",
  "  - Ephemeral dependency installs are allowed inside the sandbox.",
  "  - agent-browser commands run on the HOST, not inside the sandbox. They WILL work.",
  "  - If the recipe has a startCommand and startPort, start the app in the background and run browser smoke tests with agent-browser against http://127.0.0.1:<startPort>.",
  "  - Use `agent-browser record start .grok/verify-artifacts/verify-smoke.webm` before opening the page and `agent-browser record stop` after to capture video.",
  "  - Use `agent-browser --screenshot-dir .grok/verify-artifacts screenshot` to capture screenshots.",
  "  - Produce a structured verification report with: Summary, Recipe, Environment, Commands Run, Browser Checks, Evidence (with file paths), Results, Failures or Blockers, Residual Risk.",
  "",
  "Important:",
  "- Do NOT perform verification work yourself. Delegate each step to the respective sub-agent using the `task` tool.",
  "- Run step 1 first, then step 2. Do not skip or combine them.",
  "- After step 2 completes, relay the verification report back to the user.",
].join("\n");

export function getVerifyCliError(options: { hasPrompt?: boolean; hasMessageArgs?: boolean }): string | null {
  if (options.hasPrompt) {
    return "Cannot combine --verify with --prompt.";
  }

  if (options.hasMessageArgs) {
    return "Cannot combine --verify with an opening message.";
  }

  return null;
}
