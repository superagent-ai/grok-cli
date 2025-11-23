import * as fs from "fs-extra";
import * as path from "path";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export interface FileInfo {
  path: string;
  relativePath: string;
  size: number;
  lines: number;
  language: string;
  lastModified: Date;
  imports: string[];
  exports: string[];
}

export interface SymbolInfo {
  name: string;
  type: "function" | "class" | "interface" | "type" | "variable" | "constant" | "enum";
  file: string;
  line: number;
  exported: boolean;
  signature?: string;
}

export interface DependencyEdge {
  from: string;
  to: string;
  type: "import" | "require" | "dynamic";
}

export interface CodebaseMap {
  rootDir: string;
  files: Map<string, FileInfo>;
  symbols: Map<string, SymbolInfo[]>;
  dependencies: DependencyEdge[];
  summary: CodebaseSummary;
  buildTime: Date;
}

export interface CodebaseSummary {
  totalFiles: number;
  totalLines: number;
  languages: Record<string, number>;
  topLevelDirs: string[];
  entryPoints: string[];
  testFiles: number;
  configFiles: string[];
}

const LANGUAGE_EXTENSIONS: Record<string, string> = {
  ts: "TypeScript",
  tsx: "TypeScript (React)",
  js: "JavaScript",
  jsx: "JavaScript (React)",
  py: "Python",
  go: "Go",
  rs: "Rust",
  java: "Java",
  rb: "Ruby",
  php: "PHP",
  c: "C",
  cpp: "C++",
  h: "C Header",
  hpp: "C++ Header",
  cs: "C#",
  swift: "Swift",
  kt: "Kotlin",
  scala: "Scala",
  md: "Markdown",
  json: "JSON",
  yaml: "YAML",
  yml: "YAML",
  toml: "TOML",
  xml: "XML",
  html: "HTML",
  css: "CSS",
  scss: "SCSS",
  less: "Less",
  sql: "SQL",
  sh: "Shell",
  bash: "Bash",
};

const IGNORED_DIRS = [
  "node_modules",
  ".git",
  "dist",
  "build",
  "target",
  ".next",
  ".nuxt",
  "__pycache__",
  ".venv",
  "venv",
  "vendor",
  ".cache",
  "coverage",
];

export class CodebaseMapper {
  private rootDir: string;
  private map: CodebaseMap | null = null;
  private maxFileSize = 1024 * 1024;  // 1MB max per file
  private maxFiles = 5000;

  constructor(rootDir?: string) {
    this.rootDir = rootDir || process.cwd();
  }

  async buildMap(options: { deep?: boolean } = {}): Promise<CodebaseMap> {
    const startTime = Date.now();

    const files = new Map<string, FileInfo>();
    const symbols = new Map<string, SymbolInfo[]>();
    const dependencies: DependencyEdge[] = [];

    // Get all files
    const allFiles = await this.getAllFiles();

    // Process each file
    for (const filePath of allFiles.slice(0, this.maxFiles)) {
      try {
        const fileInfo = await this.processFile(filePath);
        files.set(fileInfo.relativePath, fileInfo);

        // Extract symbols if doing deep analysis
        if (options.deep) {
          const fileSymbols = await this.extractSymbols(filePath);
          for (const symbol of fileSymbols) {
            const existing = symbols.get(symbol.name) || [];
            existing.push(symbol);
            symbols.set(symbol.name, existing);
          }

          // Extract dependencies
          const fileDeps = await this.extractDependencies(filePath);
          dependencies.push(...fileDeps);
        }
      } catch (error) {
        // Skip files that can't be processed
      }
    }

    // Build summary
    const summary = this.buildSummary(files);

    this.map = {
      rootDir: this.rootDir,
      files,
      symbols,
      dependencies,
      summary,
      buildTime: new Date(),
    };

    return this.map;
  }

  private async getAllFiles(): Promise<string[]> {
    const ignoreDirsArg = IGNORED_DIRS.map((d) => `--glob '!${d}'`).join(" ");

    try {
      const { stdout } = await execAsync(
        `rg --files ${ignoreDirsArg} "${this.rootDir}"`,
        { maxBuffer: 10 * 1024 * 1024 }
      );
      return stdout.trim().split("\n").filter(Boolean);
    } catch (error) {
      // Fallback to simpler find
      const { stdout } = await execAsync(
        `find "${this.rootDir}" -type f -not -path "*/node_modules/*" -not -path "*/.git/*" | head -${this.maxFiles}`,
        { maxBuffer: 10 * 1024 * 1024 }
      );
      return stdout.trim().split("\n").filter(Boolean);
    }
  }

  private async processFile(filePath: string): Promise<FileInfo> {
    const stats = await fs.stat(filePath);
    const relativePath = path.relative(this.rootDir, filePath);
    const ext = path.extname(filePath).slice(1);

    let lines = 0;
    let imports: string[] = [];
    let exports: string[] = [];

    if (stats.size < this.maxFileSize) {
      const content = await fs.readFile(filePath, "utf-8");
      lines = content.split("\n").length;

      // Quick extraction of imports/exports
      imports = this.extractImports(content, ext);
      exports = this.extractExports(content, ext);
    }

    return {
      path: filePath,
      relativePath,
      size: stats.size,
      lines,
      language: LANGUAGE_EXTENSIONS[ext] || ext || "Unknown",
      lastModified: stats.mtime,
      imports,
      exports,
    };
  }

  private extractImports(content: string, ext: string): string[] {
    const imports: string[] = [];

    if (["ts", "tsx", "js", "jsx"].includes(ext)) {
      // ES6 imports
      const importMatches = content.matchAll(/import\s+.*?\s+from\s+['"]([^'"]+)['"]/g);
      for (const match of importMatches) {
        imports.push(match[1]);
      }

      // Require
      const requireMatches = content.matchAll(/require\s*\(\s*['"]([^'"]+)['"]\s*\)/g);
      for (const match of requireMatches) {
        imports.push(match[1]);
      }
    } else if (ext === "py") {
      const importMatches = content.matchAll(/(?:from\s+(\S+)\s+)?import\s+(\S+)/g);
      for (const match of importMatches) {
        imports.push(match[1] || match[2]);
      }
    } else if (ext === "go") {
      const importMatches = content.matchAll(/import\s+(?:\(\s*)?"([^"]+)"/g);
      for (const match of importMatches) {
        imports.push(match[1]);
      }
    }

    return [...new Set(imports)];
  }

  private extractExports(content: string, ext: string): string[] {
    const exports: string[] = [];

    if (["ts", "tsx", "js", "jsx"].includes(ext)) {
      // Named exports
      const exportMatches = content.matchAll(/export\s+(?:const|let|var|function|class|interface|type|enum)\s+(\w+)/g);
      for (const match of exportMatches) {
        exports.push(match[1]);
      }

      // Default export
      if (content.includes("export default")) {
        exports.push("default");
      }
    }

    return exports;
  }

  private async extractSymbols(filePath: string): Promise<SymbolInfo[]> {
    const symbols: SymbolInfo[] = [];
    const ext = path.extname(filePath).slice(1);
    const relativePath = path.relative(this.rootDir, filePath);

    if (!["ts", "tsx", "js", "jsx"].includes(ext)) {
      return symbols;
    }

    try {
      const content = await fs.readFile(filePath, "utf-8");
      const lines = content.split("\n");

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // Functions
        const funcMatch = line.match(/(?:export\s+)?(?:async\s+)?function\s+(\w+)/);
        if (funcMatch) {
          symbols.push({
            name: funcMatch[1],
            type: "function",
            file: relativePath,
            line: i + 1,
            exported: line.includes("export"),
          });
        }

        // Classes
        const classMatch = line.match(/(?:export\s+)?class\s+(\w+)/);
        if (classMatch) {
          symbols.push({
            name: classMatch[1],
            type: "class",
            file: relativePath,
            line: i + 1,
            exported: line.includes("export"),
          });
        }

        // Interfaces
        const interfaceMatch = line.match(/(?:export\s+)?interface\s+(\w+)/);
        if (interfaceMatch) {
          symbols.push({
            name: interfaceMatch[1],
            type: "interface",
            file: relativePath,
            line: i + 1,
            exported: line.includes("export"),
          });
        }

        // Types
        const typeMatch = line.match(/(?:export\s+)?type\s+(\w+)/);
        if (typeMatch) {
          symbols.push({
            name: typeMatch[1],
            type: "type",
            file: relativePath,
            line: i + 1,
            exported: line.includes("export"),
          });
        }

        // Constants
        const constMatch = line.match(/(?:export\s+)?const\s+(\w+)/);
        if (constMatch && constMatch[1] === constMatch[1].toUpperCase()) {
          symbols.push({
            name: constMatch[1],
            type: "constant",
            file: relativePath,
            line: i + 1,
            exported: line.includes("export"),
          });
        }
      }
    } catch (error) {
      // Skip files that can't be parsed
    }

    return symbols;
  }

  private async extractDependencies(filePath: string): Promise<DependencyEdge[]> {
    const deps: DependencyEdge[] = [];
    const ext = path.extname(filePath).slice(1);
    const relativePath = path.relative(this.rootDir, filePath);

    if (!["ts", "tsx", "js", "jsx"].includes(ext)) {
      return deps;
    }

    try {
      const content = await fs.readFile(filePath, "utf-8");

      // ES6 imports
      const importMatches = content.matchAll(/import\s+.*?\s+from\s+['"]([^'"]+)['"]/g);
      for (const match of importMatches) {
        if (match[1].startsWith(".")) {
          const resolved = path.relative(
            this.rootDir,
            path.resolve(path.dirname(filePath), match[1])
          );
          deps.push({ from: relativePath, to: resolved, type: "import" });
        }
      }

      // Dynamic imports
      const dynamicMatches = content.matchAll(/import\s*\(\s*['"]([^'"]+)['"]\s*\)/g);
      for (const match of dynamicMatches) {
        if (match[1].startsWith(".")) {
          const resolved = path.relative(
            this.rootDir,
            path.resolve(path.dirname(filePath), match[1])
          );
          deps.push({ from: relativePath, to: resolved, type: "dynamic" });
        }
      }
    } catch (error) {
      // Skip files that can't be parsed
    }

    return deps;
  }

  private buildSummary(files: Map<string, FileInfo>): CodebaseSummary {
    const languages: Record<string, number> = {};
    const topLevelDirs = new Set<string>();
    const entryPoints: string[] = [];
    const configFiles: string[] = [];
    let totalLines = 0;
    let testFiles = 0;

    for (const [relativePath, info] of files) {
      // Count languages
      languages[info.language] = (languages[info.language] || 0) + 1;

      // Count lines
      totalLines += info.lines;

      // Track top-level directories
      const topDir = relativePath.split(path.sep)[0];
      if (topDir && !topDir.includes(".")) {
        topLevelDirs.add(topDir);
      }

      // Identify entry points
      const basename = path.basename(relativePath);
      if (["index.ts", "index.js", "main.ts", "main.js", "app.ts", "app.js"].includes(basename)) {
        entryPoints.push(relativePath);
      }

      // Identify test files
      if (relativePath.includes("test") || relativePath.includes("spec")) {
        testFiles++;
      }

      // Identify config files
      if (
        basename.includes("config") ||
        basename.endsWith(".json") ||
        basename.endsWith(".yaml") ||
        basename.endsWith(".yml") ||
        basename.endsWith(".toml")
      ) {
        configFiles.push(relativePath);
      }
    }

    return {
      totalFiles: files.size,
      totalLines,
      languages,
      topLevelDirs: Array.from(topLevelDirs),
      entryPoints,
      testFiles,
      configFiles: configFiles.slice(0, 20),  // Limit config files
    };
  }

  getMap(): CodebaseMap | null {
    return this.map;
  }

  async getRelevantContext(query: string, maxTokens: number = 4000): Promise<string> {
    if (!this.map) {
      await this.buildMap({ deep: false });
    }

    // Search for relevant files
    const relevantFiles: Array<{ path: string; score: number }> = [];
    const queryTerms = query.toLowerCase().split(/\s+/);

    for (const [relativePath, info] of this.map!.files) {
      let score = 0;

      // Score based on path matching
      for (const term of queryTerms) {
        if (relativePath.toLowerCase().includes(term)) {
          score += 10;
        }
      }

      // Score based on exports matching
      for (const exp of info.exports) {
        for (const term of queryTerms) {
          if (exp.toLowerCase().includes(term)) {
            score += 5;
          }
        }
      }

      if (score > 0) {
        relevantFiles.push({ path: relativePath, score });
      }
    }

    // Sort by score and take top results
    relevantFiles.sort((a, b) => b.score - a.score);
    const topFiles = relevantFiles.slice(0, 10);

    // Build context string
    let context = `Codebase: ${this.map!.summary.totalFiles} files, ${this.map!.summary.totalLines} lines\n`;
    context += `Languages: ${Object.entries(this.map!.summary.languages).map(([l, c]) => `${l}(${c})`).join(", ")}\n\n`;

    context += "Relevant files for query:\n";
    for (const { path: filePath } of topFiles) {
      context += `  - ${filePath}\n`;
    }

    return context;
  }

  formatSummary(): string {
    if (!this.map) {
      return "Codebase not mapped. Run buildMap() first.";
    }

    const s = this.map.summary;

    let output = `\n📊 CODEBASE MAP\n${"═".repeat(50)}\n\n`;
    output += `📁 Root: ${this.map.rootDir}\n`;
    output += `📄 Files: ${s.totalFiles}\n`;
    output += `📝 Lines: ${s.totalLines.toLocaleString()}\n`;
    output += `🧪 Test Files: ${s.testFiles}\n\n`;

    output += `Languages:\n`;
    const sortedLangs = Object.entries(s.languages).sort((a, b) => b[1] - a[1]);
    for (const [lang, count] of sortedLangs.slice(0, 10)) {
      const bar = "█".repeat(Math.min(20, Math.round((count / s.totalFiles) * 40)));
      output += `  ${lang.padEnd(20)} ${bar} ${count}\n`;
    }

    output += `\nTop-level directories:\n`;
    for (const dir of s.topLevelDirs) {
      output += `  📂 ${dir}\n`;
    }

    if (s.entryPoints.length > 0) {
      output += `\nEntry points:\n`;
      for (const entry of s.entryPoints.slice(0, 5)) {
        output += `  🚀 ${entry}\n`;
      }
    }

    output += `\n${"═".repeat(50)}\n`;
    output += `Built: ${this.map.buildTime.toISOString()}\n`;

    return output;
  }
}

// Singleton instance
let codebaseMapperInstance: CodebaseMapper | null = null;

export function getCodebaseMapper(rootDir?: string): CodebaseMapper {
  if (!codebaseMapperInstance || rootDir) {
    codebaseMapperInstance = new CodebaseMapper(rootDir);
  }
  return codebaseMapperInstance;
}
