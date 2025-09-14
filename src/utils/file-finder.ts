import * as fs from "fs";
import * as path from "path";

export interface FileSuggestion {
  file: string;
  relativePath: string;
  isDirectory: boolean;
}

export class FileFinder {
  private fileCache: Map<string, FileSuggestion[]> = new Map();
  private maxDepth: number = 4;
  private maxFiles: number = 5000;
  private includeDotfiles: boolean = false;

  constructor(private workingDirectory: string = process.cwd()) {
    const depthEnv = parseInt(process.env.GROK_FILEPICKER_MAX_DEPTH || "", 10);
    const filesEnv = parseInt(process.env.GROK_FILEPICKER_MAX_FILES || "", 10);
    const includeDotsEnv = (process.env.GROK_FILEPICKER_INCLUDE_DOTFILES || "").toLowerCase();

    if (!Number.isNaN(depthEnv) && depthEnv > 0) this.maxDepth = depthEnv;
    if (!Number.isNaN(filesEnv) && filesEnv > 0) this.maxFiles = filesEnv;
    this.includeDotfiles = includeDotsEnv === "1" || includeDotsEnv === "true";
  }

  /**
   * Get file suggestions based on query
   */
  getFileSuggestions(query: string): FileSuggestion[] {
    const cacheKey = this.workingDirectory;
    
    // Use cached results if available
    if (!this.fileCache.has(cacheKey)) {
      this.buildFileCache();
    }

    const allFiles = this.fileCache.get(cacheKey) || [];
    
    if (!query) {
      return allFiles.slice(0, 20); // Return first 20 files when no query
    }

    // Filter files based on query
    const filtered = allFiles.filter(file => 
      file.relativePath.toLowerCase().includes(query.toLowerCase()) ||
      path.basename(file.relativePath).toLowerCase().includes(query.toLowerCase())
    );

    // Sort by relevance (exact matches first, then partial matches)
    return filtered.sort((a, b) => {
      const aBasename = path.basename(a.relativePath).toLowerCase();
      const bBasename = path.basename(b.relativePath).toLowerCase();
      const queryLower = query.toLowerCase();

      // Exact basename matches first
      if (aBasename === queryLower && bBasename !== queryLower) return -1;
      if (bBasename === queryLower && aBasename !== queryLower) return 1;

      // Basename starts with query
      if (aBasename.startsWith(queryLower) && !bBasename.startsWith(queryLower)) return -1;
      if (bBasename.startsWith(queryLower) && !aBasename.startsWith(queryLower)) return 1;

      // Path starts with query
      if (a.relativePath.toLowerCase().startsWith(queryLower) && 
          !b.relativePath.toLowerCase().startsWith(queryLower)) return -1;
      if (b.relativePath.toLowerCase().startsWith(queryLower) && 
          !a.relativePath.toLowerCase().startsWith(queryLower)) return 1;

      // Shorter paths first
      return a.relativePath.length - b.relativePath.length;
    }).slice(0, 50);
  }

  /**
   * Build file cache by recursively scanning directories
   */
  private buildFileCache(): void {
    const files: FileSuggestion[] = [];
    const visited = new Set<string>();

    const shouldIgnore = (filePath: string): boolean => {
      const basename = path.basename(filePath);
      const ignoredPatterns = [
        // Hidden files (optional)
        ...(this.includeDotfiles ? [] : [/^\./]),
        /node_modules/,
        /\.git$/,
        /dist$/,
        /build$/,
        /coverage$/,
        /\.next$/,
        /\.nuxt$/,
        /\.output$/,
        /target$/, // Rust
        /__pycache__$/,
        /\.pyc$/,
        /\.DS_Store$/,
        /Thumbs\.db$/,
      ];

      return ignoredPatterns.some(
        (pattern) => pattern.test(basename) || pattern.test(filePath)
      );
    };

    const scanDirectory = (dir: string, depth: number = 0): void => {
      if (depth > this.maxDepth || files.length > this.maxFiles) return;

      try {
        const realPath = fs.realpathSync(dir);
        if (visited.has(realPath)) return; // Avoid circular references
        visited.add(realPath);

        const entries = fs.readdirSync(dir, { withFileTypes: true });

        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          const relativePath = path.relative(this.workingDirectory, fullPath);

          if (shouldIgnore(fullPath)) continue;

          const suggestion: FileSuggestion = {
            file: entry.name,
            relativePath: relativePath || entry.name,
            isDirectory: entry.isDirectory(),
          };

          files.push(suggestion);

          // Recursively scan subdirectories
          if (entry.isDirectory() && depth < this.maxDepth) {
            scanDirectory(fullPath, depth + 1);
          }
        }
      } catch (error) {
        // Silently ignore errors (permission issues, etc.)
      }
    };

    scanDirectory(this.workingDirectory);
    this.fileCache.set(this.workingDirectory, files);
  }

  /**
   * Clear the file cache (useful when files change)
   */
  clearCache(): void {
    this.fileCache.clear();
  }

  /**
   * Read file content for attaching to prompt
   */
  async readFileContent(relativePath: string): Promise<string | null> {
    try {
      const fullPath = path.resolve(this.workingDirectory, relativePath);
      
      // Security check - ensure file is within working directory
      const resolvedPath = path.resolve(fullPath);
      const resolvedWorkDir = path.resolve(this.workingDirectory);
      if (!resolvedPath.startsWith(resolvedWorkDir)) {
        throw new Error("File access outside working directory not allowed");
      }

      const stats = fs.statSync(fullPath);
      if (!stats.isFile()) {
        return null; // Not a file
      }

      // Don't read very large files (>1MB)
      if (stats.size > 1024 * 1024) {
        return `[File too large: ${relativePath} (${Math.round(stats.size / 1024)}KB)]`;
      }

      // Don't read binary files
      if (this.isBinaryFile(fullPath)) {
        return `[Binary file: ${relativePath}]`;
      }

      const content = fs.readFileSync(fullPath, "utf8");
      return content;
    } catch (error) {
      return `[Error reading file: ${relativePath}]`;
    }
  }

  /**
   * Simple binary file detection
   */
  private isBinaryFile(filePath: string): boolean {
    const binaryExtensions = [
      ".jpg", ".jpeg", ".png", ".gif", ".bmp", ".ico", ".svg",
      ".mp3", ".mp4", ".avi", ".mov", ".wmv", ".flv",
      ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx",
      ".zip", ".rar", ".7z", ".tar", ".gz",
      ".exe", ".dll", ".so", ".dylib",
      ".woff", ".woff2", ".ttf", ".otf",
    ];

    const ext = path.extname(filePath).toLowerCase();
    return binaryExtensions.includes(ext);
  }
}
