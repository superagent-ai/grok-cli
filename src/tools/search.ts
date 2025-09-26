import { spawn } from "child_process";
import { ToolResult } from "../types/index.js";
import { ConfirmationService } from "../utils/confirmation-service.js";
import * as fs from "fs-extra";
import * as path from "path";

export interface SearchResult {
  file: string;
  line: number;
  column: number;
  text: string;
  match: string;
}

export interface FileSearchResult {
  path: string;
  name: string;
  score: number;
}

export interface UnifiedSearchResult {
  type: "text" | "file";
  file: string;
  line?: number;
  column?: number;
  text?: string;
  match?: string;
  score?: number;
}

export class SearchTool {
  private confirmationService = ConfirmationService.getInstance();
  private currentDirectory: string = process.cwd();

  /**
   * Unified search method that can search for text content or find files
   */
  async search(
    query: string,
    options: {
      searchType?: "text" | "files" | "both";
      includePattern?: string;
      excludePattern?: string;
      caseSensitive?: boolean;
      wholeWord?: boolean;
      regex?: boolean;
      maxResults?: number;
      fileTypes?: string[];
      excludeFiles?: string[];
      includeHidden?: boolean;
    } = {}
  ): Promise<ToolResult> {
    try {
      const searchType = options.searchType || "both";
      const results: UnifiedSearchResult[] = [];

      // Search for text content if requested
      if (searchType === "text" || searchType === "both") {
        const textResults = await this.executeRipgrep(query, options);
        results.push(
          ...textResults.map((r) => ({
            type: "text" as const,
            file: r.file,
            line: r.line,
            column: r.column,
            text: r.text,
            match: r.match,
          }))
        );
      }

      // Search for files if requested
      if (searchType === "files" || searchType === "both") {
        const fileResults = await this.findFilesByPattern(query, options);
        results.push(
          ...fileResults.map((r) => ({
            type: "file" as const,
            file: r.path,
            score: r.score,
          }))
        );
      }

      if (results.length === 0) {
        return {
          success: true,
          output: `No results found for "${query}"`,
        };
      }

      const formattedOutput = this.formatUnifiedResults(
        results,
        query,
        searchType
      );

      return {
        success: true,
        output: formattedOutput,
      };
    } catch (error: any) {
      return {
        success: false,
        error: `Search error: ${error.message}`,
      };
    }
  }

  /**
   * Execute ripgrep command with specified options
   */
  private async executeRipgrep(
    query: string,
    options: {
      includePattern?: string;
      excludePattern?: string;
      caseSensitive?: boolean;
      wholeWord?: boolean;
      regex?: boolean;
      maxResults?: number;
      fileTypes?: string[];
      excludeFiles?: string[];
    }
  ): Promise<SearchResult[]> {
    return new Promise((resolve, reject) => {
      const args = [
        "--json",
        "--with-filename",
        "--line-number",
        "--column",
        "--no-heading",
        "--color=never",
      ];

      // Add case sensitivity
      if (!options.caseSensitive) {
        args.push("--ignore-case");
      }

      // Add whole word matching
      if (options.wholeWord) {
        args.push("--word-regexp");
      }

      // Add regex mode
      if (!options.regex) {
        args.push("--fixed-strings");
      }

      // Add max results limit
      if (options.maxResults) {
        args.push("--max-count", options.maxResults.toString());
      }

      // Add file type filters
      if (options.fileTypes) {
        options.fileTypes.forEach((type) => {
          args.push("--type", type);
        });
      }

      // Add include pattern
      if (options.includePattern) {
        args.push("--glob", options.includePattern);
      }

      // Add exclude pattern
      if (options.excludePattern) {
        args.push("--glob", `!${options.excludePattern}`);
      }

      // Add exclude files
      if (options.excludeFiles) {
        options.excludeFiles.forEach((file) => {
          args.push("--glob", `!${file}`);
        });
      }

      // Respect gitignore and common ignore patterns
      args.push(
        "--no-require-git",
        "--follow",
        "--glob",
        "!.git/**",
        "--glob",
        "!node_modules/**",
        "--glob",
        "!.DS_Store",
        "--glob",
        "!*.log"
      );

      // Add query and search directory
      args.push(query, this.currentDirectory);

      const rg = spawn("rg", args);
      let output = "";
      let errorOutput = "";

      rg.stdout.on("data", (data) => {
        output += data.toString();
      });

      rg.stderr.on("data", (data) => {
        errorOutput += data.toString();
      });

      rg.on("close", (code) => {
        if (code === 0 || code === 1) {
          // 0 = found, 1 = not found
          const results = this.parseRipgrepOutput(output);
          resolve(results);
        } else {
          reject(new Error(`Ripgrep failed with code ${code}: ${errorOutput}`));
        }
      });

      rg.on("error", (error) => {
        reject(error);
      });
    });
  }

  /**
   * Parse ripgrep JSON output into SearchResult objects
   */
  private parseRipgrepOutput(output: string): SearchResult[] {
    const results: SearchResult[] = [];
    const lines = output
      .trim()
      .split("\n")
      .filter((line) => line.length > 0);

    for (const line of lines) {
      try {
        const parsed = JSON.parse(line);
        if (parsed.type === "match") {
          const data = parsed.data;
          results.push({
            file: data.path.text,
            line: data.line_number,
            column: data.submatches[0]?.start || 0,
            text: data.lines.text.trim(),
            match: data.submatches[0]?.match?.text || "",
          });
        }
      } catch (e) {
        // Skip invalid JSON lines
        continue;
      }
    }

    return results;
  }

  /**
   * Find files by pattern using a simple file walking approach
   */
  private async findFilesByPattern(
    pattern: string,
    options: {
      maxResults?: number;
      includeHidden?: boolean;
      excludePattern?: string;
    }
  ): Promise<FileSearchResult[]> {
    const files: FileSearchResult[] = [];
    const maxResults = options.maxResults || 50;
    const searchPattern = pattern.toLowerCase();

    const walkDir = async (dir: string, depth: number = 0): Promise<void> => {
      if (depth > 10 || files.length >= maxResults) return; // Prevent infinite recursion and limit results

      try {
        const entries = await fs.readdir(dir, { withFileTypes: true });

        for (const entry of entries) {
          if (files.length >= maxResults) break;

          const fullPath = path.join(dir, entry.name);
          const relativePath = path.relative(this.currentDirectory, fullPath);

          // Skip hidden files unless explicitly included
          if (!options.includeHidden && entry.name.startsWith(".")) {
            continue;
          }

          // Skip common directories
          if (
            entry.isDirectory() &&
            [
              "node_modules",
              ".git",
              ".svn",
              ".hg",
              "dist",
              "build",
              ".next",
              ".cache",
            ].includes(entry.name)
          ) {
            continue;
          }

          // Apply exclude pattern
          if (
            options.excludePattern &&
            relativePath.includes(options.excludePattern)
          ) {
            continue;
          }

          if (entry.isFile()) {
            const score = this.calculateFileScore(
              entry.name,
              relativePath,
              searchPattern
            );
            if (score > 0) {
              files.push({
                path: relativePath,
                name: entry.name,
                score,
              });
            }
          } else if (entry.isDirectory()) {
            await walkDir(fullPath, depth + 1);
          }
        }
      } catch (error) {
        // Skip directories we can't read
      }
    };

    await walkDir(this.currentDirectory);

    // Sort by score (descending) and return top results
    return files.sort((a, b) => b.score - a.score).slice(0, maxResults);
  }

  /**
   * Calculate fuzzy match score for file names
   */
  private calculateFileScore(
    fileName: string,
    filePath: string,
    pattern: string
  ): number {
    const lowerFileName = fileName.toLowerCase();
    const lowerFilePath = filePath.toLowerCase();

    // Exact matches get highest score
    if (lowerFileName === pattern) return 100;
    if (lowerFileName.includes(pattern)) return 80;

    // Path matches get medium score
    if (lowerFilePath.includes(pattern)) return 60;

    // Fuzzy matching - check if all characters of pattern exist in order
    let patternIndex = 0;
    for (
      let i = 0;
      i < lowerFileName.length && patternIndex < pattern.length;
      i++
    ) {
      if (lowerFileName[i] === pattern[patternIndex]) {
        patternIndex++;
      }
    }

    if (patternIndex === pattern.length) {
      // All characters found in order - score based on how close they are
      return Math.max(10, 40 - (fileName.length - pattern.length));
    }

    return 0;
  }

  /**
   * Format unified search results for display
   */
  private formatUnifiedResults(
    results: UnifiedSearchResult[],
    query: string,
    searchType: string
  ): string {
    if (results.length === 0) {
      return `No results found for "${query}"`;
    }

    let output = `Search results for "${query}":\n`;

    // Separate text and file results
    const textResults = results.filter((r) => r.type === "text");
    const fileResults = results.filter((r) => r.type === "file");

    // Show all unique files (from both text matches and file matches)
    const allFiles = new Set<string>();

    // Add files from text results
    textResults.forEach((result) => {
      allFiles.add(result.file);
    });

    // Add files from file search results
    fileResults.forEach((result) => {
      allFiles.add(result.file);
    });

    const fileList = Array.from(allFiles);
    const displayLimit = 8;

    // Show files in compact format
    fileList.slice(0, displayLimit).forEach((file) => {
      // Count matches in this file for text results
      const matchCount = textResults.filter((r) => r.file === file).length;
      const matchIndicator = matchCount > 0 ? ` (${matchCount} matches)` : "";
      output += `  ${file}${matchIndicator}\n`;
    });

    // Show "+X more" if there are additional results
    if (fileList.length > displayLimit) {
      const remaining = fileList.length - displayLimit;
      output += `  ... +${remaining} more\n`;
    }

    return output.trim();
  }

  /**
   * Update current working directory
   */
  setCurrentDirectory(directory: string): void {
    this.currentDirectory = directory;
  }

  /**
   * Get current working directory
   */
  getCurrentDirectory(): string {
    return this.currentDirectory;
  }
}
