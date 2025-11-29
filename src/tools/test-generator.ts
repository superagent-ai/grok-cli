import * as fs from "fs-extra";
import * as path from "path";
import { exec } from "child_process";
import { promisify } from "util";
import { ToolResult } from "../types/index.js";

const execAsync = promisify(exec);

export interface TestGeneratorConfig {
  framework?: "jest" | "vitest" | "mocha" | "pytest" | "auto";
  style?: "unit" | "integration" | "e2e";
  coverage?: boolean;
  outputDir?: string;
  mockStrategy?: "auto" | "manual" | "none";
}

export interface TestTemplate {
  name: string;
  language: string;
  framework: string;
  template: string;
}

// Test templates for different frameworks - stored for future template-based generation
const _TEST_TEMPLATES: Record<string, TestTemplate> = {
  "jest-ts": {
    name: "Jest TypeScript",
    language: "typescript",
    framework: "jest",
    template: `import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { {{functionName}} } from '{{importPath}}';

describe('{{functionName}}', () => {
  {{#if needsSetup}}
  beforeEach(() => {
    // Setup before each test
  });

  afterEach(() => {
    // Cleanup after each test
  });
  {{/if}}

  it('should {{testDescription}}', () => {
    // Arrange
    {{arrangeCode}}

    // Act
    const result = {{actCode}};

    // Assert
    expect(result).{{assertion}};
  });

  {{#if hasEdgeCases}}
  describe('edge cases', () => {
    it('should handle empty input', () => {
      // Test empty input handling
    });

    it('should handle null/undefined', () => {
      // Test null/undefined handling
    });
  });
  {{/if}}
});
`,
  },

  "vitest-ts": {
    name: "Vitest TypeScript",
    language: "typescript",
    framework: "vitest",
    template: `import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { {{functionName}} } from '{{importPath}}';

describe('{{functionName}}', () => {
  {{#if needsSetup}}
  beforeEach(() => {
    // Setup before each test
  });

  afterEach(() => {
    // Cleanup after each test
  });
  {{/if}}

  it('should {{testDescription}}', () => {
    // Arrange
    {{arrangeCode}}

    // Act
    const result = {{actCode}};

    // Assert
    expect(result).{{assertion}};
  });
});
`,
  },

  "pytest": {
    name: "Pytest",
    language: "python",
    framework: "pytest",
    template: `import pytest
from {{importPath}} import {{functionName}}


class Test{{className}}:
    {{#if needsSetup}}
    @pytest.fixture(autouse=True)
    def setup(self):
        # Setup before each test
        yield
        # Cleanup after each test
    {{/if}}

    def test_{{testName}}(self):
        # Arrange
        {{arrangeCode}}

        # Act
        result = {{actCode}}

        # Assert
        assert result {{assertion}}

    {{#if hasEdgeCases}}
    def test_handles_empty_input(self):
        # Test empty input handling
        pass

    def test_handles_none(self):
        # Test None handling
        pass
    {{/if}}
`,
  },
};

/**
 * Test Generator Tool - Generate and run tests
 */
export class TestGeneratorTool {
  private projectRoot: string;

  constructor(projectRoot: string = process.cwd()) {
    this.projectRoot = projectRoot;
  }

  /**
   * Detect test framework from project
   */
  async detectFramework(): Promise<string> {
    const packageJsonPath = path.join(this.projectRoot, "package.json");

    if (await fs.pathExists(packageJsonPath)) {
      const packageJson = await fs.readJson(packageJsonPath);
      const devDeps = packageJson.devDependencies || {};
      const deps = packageJson.dependencies || {};
      const allDeps = { ...deps, ...devDeps };

      if (allDeps.vitest) return "vitest";
      if (allDeps.jest) return "jest";
      if (allDeps.mocha) return "mocha";
    }

    // Check for Python
    const requirementsPath = path.join(this.projectRoot, "requirements.txt");
    const pyprojectPath = path.join(this.projectRoot, "pyproject.toml");

    if (await fs.pathExists(requirementsPath) || await fs.pathExists(pyprojectPath)) {
      return "pytest";
    }

    return "jest"; // Default
  }

  /**
   * Get test command for framework
   */
  getTestCommand(framework: string, coverage: boolean = false): string {
    const commands: Record<string, { run: string; coverage: string }> = {
      jest: { run: "npx jest", coverage: "npx jest --coverage" },
      vitest: { run: "npx vitest run", coverage: "npx vitest run --coverage" },
      mocha: { run: "npx mocha", coverage: "npx nyc mocha" },
      pytest: { run: "pytest", coverage: "pytest --cov" },
    };

    const cmd = commands[framework] || commands.jest;
    return coverage ? cmd.coverage : cmd.run;
  }

  /**
   * Generate test file path
   */
  getTestFilePath(sourceFile: string, framework: string): string {
    const parsed = path.parse(sourceFile);
    const ext = parsed.ext;

    if (framework === "pytest") {
      return path.join(parsed.dir, `test_${parsed.name}.py`);
    }

    // Check for __tests__ directory convention
    const testsDir = path.join(parsed.dir, "__tests__");

    if (ext === ".ts" || ext === ".tsx") {
      return fs.existsSync(testsDir)
        ? path.join(testsDir, `${parsed.name}.test.ts`)
        : path.join(parsed.dir, `${parsed.name}.test.ts`);
    }

    return fs.existsSync(testsDir)
      ? path.join(testsDir, `${parsed.name}.test.js`)
      : path.join(parsed.dir, `${parsed.name}.test.js`);
  }

  /**
   * Analyze source file for testable exports
   */
  async analyzeSourceFile(filePath: string): Promise<{
    exports: string[];
    functions: string[];
    classes: string[];
  }> {
    const content = await fs.readFile(filePath, "utf-8");

    const exports: string[] = [];
    const functions: string[] = [];
    const classes: string[] = [];

    // Match export statements
    const exportMatches = content.matchAll(/export\s+(?:const|let|var|function|class|async function)\s+(\w+)/g);
    for (const match of exportMatches) {
      exports.push(match[1]);
    }

    // Match named exports
    const namedExportMatch = content.match(/export\s*\{([^}]+)\}/);
    if (namedExportMatch) {
      const names = namedExportMatch[1].split(",").map((n) => n.trim().split(/\s+as\s+/)[0]);
      exports.push(...names);
    }

    // Match function declarations
    const funcMatches = content.matchAll(/(?:export\s+)?(?:async\s+)?function\s+(\w+)/g);
    for (const match of funcMatches) {
      functions.push(match[1]);
    }

    // Match arrow functions assigned to const
    const arrowMatches = content.matchAll(/(?:export\s+)?const\s+(\w+)\s*=\s*(?:async\s*)?\([^)]*\)\s*(?::\s*[^=]+)?\s*=>/g);
    for (const match of arrowMatches) {
      functions.push(match[1]);
    }

    // Match class declarations
    const classMatches = content.matchAll(/(?:export\s+)?class\s+(\w+)/g);
    for (const match of classMatches) {
      classes.push(match[1]);
    }

    return {
      exports: [...new Set(exports)],
      functions: [...new Set(functions)],
      classes: [...new Set(classes)],
    };
  }

  /**
   * Generate test scaffold
   */
  async generateTestScaffold(
    sourceFile: string,
    config: TestGeneratorConfig = {}
  ): Promise<{ testFile: string; content: string }> {
    const framework = config.framework === "auto" || !config.framework
      ? await this.detectFramework()
      : config.framework;

    const analysis = await this.analyzeSourceFile(sourceFile);
    const testFile = this.getTestFilePath(sourceFile, framework);
    const relativePath = path.relative(path.dirname(testFile), sourceFile)
      .replace(/\\/g, "/")
      .replace(/\.[^.]+$/, "");

    let content = "";

    // Generate imports
    if (framework === "jest" || framework === "vitest") {
      const importName = framework === "vitest" ? "vitest" : "@jest/globals";
      content += `import { describe, it, expect, beforeEach, afterEach } from '${importName}';\n`;

      if (analysis.exports.length > 0) {
        content += `import { ${analysis.exports.join(", ")} } from './${relativePath}';\n`;
      }
      content += "\n";

      // Generate describe blocks
      for (const func of analysis.functions) {
        if (!analysis.exports.includes(func)) continue;

        content += `describe('${func}', () => {\n`;
        content += `  it('should work correctly', () => {\n`;
        content += `    // Arrange\n`;
        content += `    // TODO: Set up test data\n\n`;
        content += `    // Act\n`;
        content += `    // const result = ${func}();\n\n`;
        content += `    // Assert\n`;
        content += `    // expect(result).toBeDefined();\n`;
        content += `  });\n\n`;
        content += `  it('should handle edge cases', () => {\n`;
        content += `    // TODO: Add edge case tests\n`;
        content += `  });\n`;
        content += `});\n\n`;
      }

      for (const cls of analysis.classes) {
        if (!analysis.exports.includes(cls)) continue;

        content += `describe('${cls}', () => {\n`;
        content += `  let instance: ${cls};\n\n`;
        content += `  beforeEach(() => {\n`;
        content += `    instance = new ${cls}();\n`;
        content += `  });\n\n`;
        content += `  it('should be instantiated', () => {\n`;
        content += `    expect(instance).toBeInstanceOf(${cls});\n`;
        content += `  });\n\n`;
        content += `  // TODO: Add more tests for class methods\n`;
        content += `});\n\n`;
      }
    } else if (framework === "pytest") {
      content += `import pytest\n`;
      content += `from ${relativePath.replace(/\//g, ".")} import ${analysis.exports.join(", ")}\n\n`;

      for (const func of analysis.functions) {
        if (!analysis.exports.includes(func)) continue;

        content += `class Test${func.charAt(0).toUpperCase() + func.slice(1)}:\n`;
        content += `    def test_works_correctly(self):\n`;
        content += `        # Arrange\n`;
        content += `        # TODO: Set up test data\n\n`;
        content += `        # Act\n`;
        content += `        # result = ${func}()\n\n`;
        content += `        # Assert\n`;
        content += `        # assert result is not None\n`;
        content += `        pass\n\n`;
        content += `    def test_handles_edge_cases(self):\n`;
        content += `        # TODO: Add edge case tests\n`;
        content += `        pass\n\n`;
      }
    }

    return { testFile, content };
  }

  /**
   * Run tests
   */
  async runTests(config: TestGeneratorConfig = {}): Promise<ToolResult> {
    const framework = config.framework === "auto" || !config.framework
      ? await this.detectFramework()
      : config.framework;

    const command = this.getTestCommand(framework, config.coverage);

    try {
      const { stdout, stderr } = await execAsync(command, {
        cwd: this.projectRoot,
        maxBuffer: 10 * 1024 * 1024, // 10MB
      });

      return {
        success: true,
        output: `Test Results:\n\n${stdout}${stderr ? `\nStderr:\n${stderr}` : ""}`,
      };
    } catch (error: unknown) {
      // Tests may fail but still produce output
      const execError = error as { stdout?: string; stderr?: string; message?: string };
      const output = execError.stdout || "";
      const stderr = execError.stderr || "";

      return {
        success: false,
        output: `Test Results (some tests failed):\n\n${output}${stderr ? `\nErrors:\n${stderr}` : ""}`,
        error: execError.message || String(error),
      };
    }
  }

  /**
   * Run tests for specific file
   */
  async runTestsForFile(testFile: string, config: TestGeneratorConfig = {}): Promise<ToolResult> {
    const framework = config.framework === "auto" || !config.framework
      ? await this.detectFramework()
      : config.framework;

    let command: string;

    switch (framework) {
      case "jest":
        command = `npx jest "${testFile}" ${config.coverage ? "--coverage" : ""}`;
        break;
      case "vitest":
        command = `npx vitest run "${testFile}" ${config.coverage ? "--coverage" : ""}`;
        break;
      case "mocha":
        command = `npx mocha "${testFile}"`;
        break;
      case "pytest":
        command = `pytest "${testFile}" ${config.coverage ? "--cov" : ""} -v`;
        break;
      default:
        command = `npx jest "${testFile}"`;
    }

    try {
      const { stdout, stderr } = await execAsync(command, {
        cwd: this.projectRoot,
        maxBuffer: 10 * 1024 * 1024,
      });

      return {
        success: true,
        output: stdout + (stderr || ""),
      };
    } catch (error: unknown) {
      const execError = error as { stdout?: string; stderr?: string; message?: string };
      return {
        success: false,
        output: (execError.stdout || "") + (execError.stderr || ""),
        error: execError.message || String(error),
      };
    }
  }

  /**
   * Get coverage report
   */
  async getCoverageReport(): Promise<ToolResult> {
    const coverageDir = path.join(this.projectRoot, "coverage");

    if (!(await fs.pathExists(coverageDir))) {
      return {
        success: false,
        error: "No coverage report found. Run tests with --coverage first.",
      };
    }

    // Try to read lcov or summary
    const summaryPath = path.join(coverageDir, "coverage-summary.json");

    if (await fs.pathExists(summaryPath)) {
      const summary = await fs.readJson(summaryPath);
      const total = summary.total;

      let output = "📊 Coverage Summary\n";
      output += `\nLines:      ${total.lines.pct}%`;
      output += `\nStatements: ${total.statements.pct}%`;
      output += `\nBranches:   ${total.branches.pct}%`;
      output += `\nFunctions:  ${total.functions.pct}%`;

      return { success: true, output };
    }

    return {
      success: true,
      output: `Coverage report generated in ${coverageDir}`,
    };
  }

  /**
   * Format as tool result
   */
  formatToolResult(result: { testFile: string; content: string }): ToolResult {
    return {
      success: true,
      output: `Generated test file: ${result.testFile}\n\nContent:\n\`\`\`\n${result.content}\`\`\``,
    };
  }
}

// Tool definition for the agent
export const testGeneratorToolDefinition = {
  name: "generate_tests",
  description: "Generate test files for source code and run tests",
  parameters: {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: ["generate", "run", "run-file", "coverage"],
        description: "Action to perform",
      },
      target: {
        type: "string",
        description: "Source file to generate tests for, or test file to run",
      },
      framework: {
        type: "string",
        enum: ["jest", "vitest", "mocha", "pytest", "auto"],
        description: "Test framework to use",
      },
      coverage: {
        type: "boolean",
        description: "Include coverage report",
      },
    },
    required: ["action"],
  },
};
