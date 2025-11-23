import * as fs from "fs-extra";
import * as path from "path";
import { EventEmitter } from "events";

export type ProjectType =
  | "node"
  | "typescript"
  | "react"
  | "nextjs"
  | "vue"
  | "angular"
  | "python"
  | "rust"
  | "go"
  | "java"
  | "dotnet"
  | "ruby"
  | "php"
  | "mixed"
  | "unknown";

export type PackageManager = "npm" | "yarn" | "pnpm" | "bun" | "pip" | "cargo" | "go" | "unknown";

export interface WorkspaceConfig {
  type: ProjectType;
  subTypes: ProjectType[];
  packageManager: PackageManager;
  testFramework?: string;
  linter?: string;
  formatter?: string;
  buildTool?: string;
  language: string;
  frameworks: string[];
  configFiles: string[];
  scripts?: Record<string, string>;
  dependencies?: string[];
  devDependencies?: string[];
}

interface DetectionRule {
  files: string[];
  type: ProjectType;
  frameworks?: string[];
  weight: number;
}

const DETECTION_RULES: DetectionRule[] = [
  // Next.js (before generic React)
  { files: ["next.config.js", "next.config.mjs", "next.config.ts"], type: "nextjs", frameworks: ["next", "react"], weight: 100 },

  // Vue.js
  { files: ["vue.config.js", "vite.config.ts", "nuxt.config.ts"], type: "vue", frameworks: ["vue"], weight: 90 },

  // Angular
  { files: ["angular.json", ".angular-cli.json"], type: "angular", frameworks: ["angular"], weight: 90 },

  // React (generic)
  { files: ["src/App.tsx", "src/App.jsx", "src/index.tsx"], type: "react", frameworks: ["react"], weight: 80 },

  // TypeScript
  { files: ["tsconfig.json"], type: "typescript", weight: 70 },

  // Node.js
  { files: ["package.json"], type: "node", weight: 50 },

  // Python
  { files: ["setup.py", "pyproject.toml", "requirements.txt", "Pipfile"], type: "python", weight: 80 },

  // Rust
  { files: ["Cargo.toml"], type: "rust", weight: 90 },

  // Go
  { files: ["go.mod", "go.sum"], type: "go", weight: 90 },

  // Java
  { files: ["pom.xml", "build.gradle", "build.gradle.kts"], type: "java", weight: 90 },

  // .NET
  { files: ["*.csproj", "*.sln", "*.fsproj"], type: "dotnet", weight: 90 },

  // Ruby
  { files: ["Gemfile", "*.gemspec"], type: "ruby", weight: 90 },

  // PHP
  { files: ["composer.json", "artisan"], type: "php", weight: 90 },
];

const PACKAGE_MANAGER_FILES: Record<string, PackageManager> = {
  "package-lock.json": "npm",
  "yarn.lock": "yarn",
  "pnpm-lock.yaml": "pnpm",
  "bun.lockb": "bun",
  "requirements.txt": "pip",
  "Pipfile.lock": "pip",
  "Cargo.lock": "cargo",
  "go.sum": "go",
};

const TEST_FRAMEWORK_DEPS: Record<string, string> = {
  "jest": "jest",
  "vitest": "vitest",
  "mocha": "mocha",
  "@testing-library/react": "jest",
  "pytest": "pytest",
  "unittest": "unittest",
};

const LINTER_DEPS: Record<string, string> = {
  "eslint": "eslint",
  "@typescript-eslint/eslint-plugin": "eslint",
  "tslint": "tslint",
  "pylint": "pylint",
  "flake8": "flake8",
  "clippy": "clippy",
  "golangci-lint": "golangci-lint",
};

const FORMATTER_DEPS: Record<string, string> = {
  "prettier": "prettier",
  "black": "black",
  "autopep8": "autopep8",
  "rustfmt": "rustfmt",
  "gofmt": "gofmt",
};

/**
 * Workspace Detector - Automatically detect project configuration
 */
export class WorkspaceDetector extends EventEmitter {
  private projectRoot: string;
  private cachedConfig: WorkspaceConfig | null = null;

  constructor(projectRoot: string = process.cwd()) {
    super();
    this.projectRoot = projectRoot;
  }

  /**
   * Detect workspace configuration
   */
  async detect(): Promise<WorkspaceConfig> {
    if (this.cachedConfig) {
      return this.cachedConfig;
    }

    const config: WorkspaceConfig = {
      type: "unknown",
      subTypes: [],
      packageManager: "unknown",
      language: "unknown",
      frameworks: [],
      configFiles: [],
    };

    // Detect project type
    await this.detectProjectType(config);

    // Detect package manager
    await this.detectPackageManager(config);

    // Detect dependencies and tools
    await this.detectDependencies(config);

    // Detect test framework
    await this.detectTestFramework(config);

    // Detect linter and formatter
    await this.detectLinterFormatter(config);

    // Detect build tool
    await this.detectBuildTool(config);

    // Detect language
    this.detectLanguage(config);

    // Find config files
    await this.findConfigFiles(config);

    this.cachedConfig = config;
    this.emit("detection:complete", config);

    return config;
  }

  private async detectProjectType(config: WorkspaceConfig): Promise<void> {
    const matches: Array<{ type: ProjectType; weight: number; frameworks: string[] }> = [];

    for (const rule of DETECTION_RULES) {
      for (const filePattern of rule.files) {
        const exists = filePattern.includes("*")
          ? await this.globExists(filePattern)
          : await fs.pathExists(path.join(this.projectRoot, filePattern));

        if (exists) {
          matches.push({
            type: rule.type,
            weight: rule.weight,
            frameworks: rule.frameworks || [],
          });
          break;
        }
      }
    }

    if (matches.length > 0) {
      // Sort by weight
      matches.sort((a, b) => b.weight - a.weight);

      config.type = matches[0].type;
      config.subTypes = matches.slice(1).map((m) => m.type);
      config.frameworks = [...new Set(matches.flatMap((m) => m.frameworks))];
    }
  }

  private async globExists(pattern: string): Promise<boolean> {
    try {
      const files = await fs.readdir(this.projectRoot);
      const regex = new RegExp("^" + pattern.replace(/\*/g, ".*") + "$");
      return files.some((f) => regex.test(f));
    } catch {
      return false;
    }
  }

  private async detectPackageManager(config: WorkspaceConfig): Promise<void> {
    for (const [file, manager] of Object.entries(PACKAGE_MANAGER_FILES)) {
      if (await fs.pathExists(path.join(this.projectRoot, file))) {
        config.packageManager = manager;
        return;
      }
    }
  }

  private async detectDependencies(config: WorkspaceConfig): Promise<void> {
    const packageJsonPath = path.join(this.projectRoot, "package.json");

    if (await fs.pathExists(packageJsonPath)) {
      try {
        const pkg = await fs.readJson(packageJsonPath);
        config.dependencies = Object.keys(pkg.dependencies || {});
        config.devDependencies = Object.keys(pkg.devDependencies || {});
        config.scripts = pkg.scripts || {};

        // Detect frameworks from dependencies
        const allDeps = [...(config.dependencies || []), ...(config.devDependencies || [])];

        if (allDeps.includes("next")) config.frameworks.push("next");
        if (allDeps.includes("react")) config.frameworks.push("react");
        if (allDeps.includes("vue")) config.frameworks.push("vue");
        if (allDeps.includes("@angular/core")) config.frameworks.push("angular");
        if (allDeps.includes("express")) config.frameworks.push("express");
        if (allDeps.includes("fastify")) config.frameworks.push("fastify");
        if (allDeps.includes("nestjs")) config.frameworks.push("nestjs");
        if (allDeps.includes("svelte")) config.frameworks.push("svelte");

        config.frameworks = [...new Set(config.frameworks)];
      } catch {
        // Ignore JSON errors
      }
    }

    // Python dependencies
    const requirementsPath = path.join(this.projectRoot, "requirements.txt");
    if (await fs.pathExists(requirementsPath)) {
      try {
        const content = await fs.readFile(requirementsPath, "utf-8");
        const deps = content.split("\n")
          .map((line) => line.split("==")[0].split(">=")[0].trim())
          .filter(Boolean);
        config.dependencies = deps;

        if (deps.includes("django")) config.frameworks.push("django");
        if (deps.includes("flask")) config.frameworks.push("flask");
        if (deps.includes("fastapi")) config.frameworks.push("fastapi");
      } catch {
        // Ignore
      }
    }
  }

  private async detectTestFramework(config: WorkspaceConfig): Promise<void> {
    const allDeps = [...(config.dependencies || []), ...(config.devDependencies || [])];

    for (const [dep, framework] of Object.entries(TEST_FRAMEWORK_DEPS)) {
      if (allDeps.includes(dep)) {
        config.testFramework = framework;
        return;
      }
    }

    // Check for config files
    const testConfigs = [
      { file: "jest.config.js", framework: "jest" },
      { file: "jest.config.ts", framework: "jest" },
      { file: "vitest.config.ts", framework: "vitest" },
      { file: "vitest.config.js", framework: "vitest" },
      { file: ".mocharc.json", framework: "mocha" },
      { file: "pytest.ini", framework: "pytest" },
      { file: "setup.cfg", framework: "pytest" },
    ];

    for (const { file, framework } of testConfigs) {
      if (await fs.pathExists(path.join(this.projectRoot, file))) {
        config.testFramework = framework;
        return;
      }
    }
  }

  private async detectLinterFormatter(config: WorkspaceConfig): Promise<void> {
    const allDeps = [...(config.dependencies || []), ...(config.devDependencies || [])];

    // Detect linter
    for (const [dep, linter] of Object.entries(LINTER_DEPS)) {
      if (allDeps.includes(dep)) {
        config.linter = linter;
        break;
      }
    }

    // Detect formatter
    for (const [dep, formatter] of Object.entries(FORMATTER_DEPS)) {
      if (allDeps.includes(dep)) {
        config.formatter = formatter;
        break;
      }
    }

    // Check config files
    const lintConfigs = [
      { file: ".eslintrc.js", linter: "eslint" },
      { file: ".eslintrc.json", linter: "eslint" },
      { file: "eslint.config.js", linter: "eslint" },
      { file: ".pylintrc", linter: "pylint" },
    ];

    for (const { file, linter } of lintConfigs) {
      if (!config.linter && await fs.pathExists(path.join(this.projectRoot, file))) {
        config.linter = linter;
        break;
      }
    }

    const formatConfigs = [
      { file: ".prettierrc", formatter: "prettier" },
      { file: ".prettierrc.js", formatter: "prettier" },
      { file: "prettier.config.js", formatter: "prettier" },
    ];

    for (const { file, formatter } of formatConfigs) {
      if (!config.formatter && await fs.pathExists(path.join(this.projectRoot, file))) {
        config.formatter = formatter;
        break;
      }
    }
  }

  private async detectBuildTool(config: WorkspaceConfig): Promise<void> {
    const buildTools = [
      { file: "vite.config.ts", tool: "vite" },
      { file: "vite.config.js", tool: "vite" },
      { file: "webpack.config.js", tool: "webpack" },
      { file: "rollup.config.js", tool: "rollup" },
      { file: "esbuild.config.js", tool: "esbuild" },
      { file: "turbo.json", tool: "turbo" },
      { file: "nx.json", tool: "nx" },
    ];

    for (const { file, tool } of buildTools) {
      if (await fs.pathExists(path.join(this.projectRoot, file))) {
        config.buildTool = tool;
        return;
      }
    }
  }

  private detectLanguage(config: WorkspaceConfig): void {
    const typeToLanguage: Record<ProjectType, string> = {
      node: "javascript",
      typescript: "typescript",
      react: "typescript",
      nextjs: "typescript",
      vue: "typescript",
      angular: "typescript",
      python: "python",
      rust: "rust",
      go: "go",
      java: "java",
      dotnet: "csharp",
      ruby: "ruby",
      php: "php",
      mixed: "mixed",
      unknown: "unknown",
    };

    config.language = typeToLanguage[config.type] || "unknown";
  }

  private async findConfigFiles(config: WorkspaceConfig): Promise<void> {
    const commonConfigs = [
      "package.json",
      "tsconfig.json",
      ".eslintrc.js",
      ".eslintrc.json",
      ".prettierrc",
      "jest.config.js",
      "vitest.config.ts",
      ".env.example",
      "Dockerfile",
      "docker-compose.yml",
      ".github/workflows",
      ".gitignore",
    ];

    for (const configFile of commonConfigs) {
      if (await fs.pathExists(path.join(this.projectRoot, configFile))) {
        config.configFiles.push(configFile);
      }
    }
  }

  /**
   * Generate recommended .grok/settings.json
   */
  async generateRecommendedSettings(config?: WorkspaceConfig): Promise<Record<string, any>> {
    const detected = config || await this.detect();

    const settings: Record<string, any> = {
      projectType: detected.type,
      language: detected.language,
      frameworks: detected.frameworks,
    };

    // Test command
    if (detected.scripts?.test) {
      settings.testCommand = `${detected.packageManager} test`;
    } else if (detected.testFramework) {
      const testCommands: Record<string, string> = {
        jest: "npx jest",
        vitest: "npx vitest run",
        pytest: "pytest",
        mocha: "npx mocha",
      };
      settings.testCommand = testCommands[detected.testFramework];
    }

    // Lint command
    if (detected.scripts?.lint) {
      settings.lintCommand = `${detected.packageManager} run lint`;
    } else if (detected.linter) {
      const lintCommands: Record<string, string> = {
        eslint: "npx eslint .",
        pylint: "pylint **/*.py",
      };
      settings.lintCommand = lintCommands[detected.linter];
    }

    // Format command
    if (detected.formatter) {
      const formatCommands: Record<string, string> = {
        prettier: "npx prettier --write .",
        black: "black .",
      };
      settings.formatCommand = formatCommands[detected.formatter];
    }

    // Build command
    if (detected.scripts?.build) {
      settings.buildCommand = `${detected.packageManager} run build`;
    }

    return settings;
  }

  /**
   * Format detection results
   */
  formatDetectionResults(config?: WorkspaceConfig): string {
    const c = config || this.cachedConfig;
    if (!c) {
      return "No workspace detection performed yet. Run detect() first.";
    }

    let output = `\n🔍 Workspace Detection Results\n${"═".repeat(50)}\n\n`;

    output += `📦 Project Type: ${c.type}\n`;
    if (c.subTypes.length > 0) {
      output += `   Also: ${c.subTypes.join(", ")}\n`;
    }
    output += `🗣️  Language: ${c.language}\n`;
    output += `📋 Package Manager: ${c.packageManager}\n`;

    if (c.frameworks.length > 0) {
      output += `\n🛠️  Frameworks:\n`;
      for (const fw of c.frameworks) {
        output += `   • ${fw}\n`;
      }
    }

    output += `\n🧪 Tools:\n`;
    output += `   Test: ${c.testFramework || "not detected"}\n`;
    output += `   Lint: ${c.linter || "not detected"}\n`;
    output += `   Format: ${c.formatter || "not detected"}\n`;
    output += `   Build: ${c.buildTool || "not detected"}\n`;

    if (c.configFiles.length > 0) {
      output += `\n📄 Config Files:\n`;
      for (const f of c.configFiles.slice(0, 10)) {
        output += `   • ${f}\n`;
      }
      if (c.configFiles.length > 10) {
        output += `   ... and ${c.configFiles.length - 10} more\n`;
      }
    }

    output += `\n${"═".repeat(50)}\n`;

    return output;
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cachedConfig = null;
  }
}

// Singleton instance
let workspaceDetectorInstance: WorkspaceDetector | null = null;

export function getWorkspaceDetector(projectRoot?: string): WorkspaceDetector {
  if (!workspaceDetectorInstance) {
    workspaceDetectorInstance = new WorkspaceDetector(projectRoot);
  }
  return workspaceDetectorInstance;
}

export async function detectWorkspace(projectRoot?: string): Promise<WorkspaceConfig> {
  const detector = getWorkspaceDetector(projectRoot);
  return detector.detect();
}
