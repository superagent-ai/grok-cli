import fs from 'fs';
import path from 'path';
import { glob } from 'fast-glob';
import ignore, { Ignore } from 'ignore';

export interface ContextFile {
  path: string;
  relativePath: string;
  content: string;
  mtime: number;
  size: number;
  language?: string;
}

export interface ContextLoaderOptions {
  patterns?: string[];
  excludePatterns?: string[];
  respectGitignore?: boolean;
  maxFileSize?: number;
  maxTotalSize?: number;
  includeHidden?: boolean;
  compressWhitespace?: boolean;
  removeLockFiles?: boolean;
  removeComments?: boolean;
}

const DEFAULT_OPTIONS: ContextLoaderOptions = {
  respectGitignore: true,
  maxFileSize: 100 * 1024,
  maxTotalSize: 1024 * 1024,
  includeHidden: false,
  compressWhitespace: true,
  removeLockFiles: true,
  removeComments: false,
};

const ALWAYS_EXCLUDE = [
  '**/.git/**',
  '**/node_modules/**',
  '**/.env',
  '**/.env.*',
  '**/credentials.json',
  '**/secrets.json',
  '**/*.pem',
  '**/*.key',
  '**/id_rsa*',
  '**/.ssh/**',
  '**/package-lock.json',
  '**/bun.lockb',
  '**/bun.lock',
  '**/yarn.lock',
  '**/pnpm-lock.yaml',
  '**/composer.lock',
  '**/Gemfile.lock',
  '**/Cargo.lock',
  '**/poetry.lock',
  '**/*.min.js',
  '**/*.min.css',
  '**/dist/**',
  '**/build/**',
  '**/.next/**',
  '**/.nuxt/**',
  '**/coverage/**',
  '**/__pycache__/**',
  '**/*.pyc',
  '**/.pytest_cache/**',
  '**/.DS_Store',
  '**/Thumbs.db',
];

const LANGUAGE_MAP: Record<string, string> = {
  '.ts': 'typescript',
  '.tsx': 'tsx',
  '.js': 'javascript',
  '.jsx': 'jsx',
  '.py': 'python',
  '.rb': 'ruby',
  '.go': 'go',
  '.rs': 'rust',
  '.java': 'java',
  '.kt': 'kotlin',
  '.swift': 'swift',
  '.c': 'c',
  '.cpp': 'cpp',
  '.h': 'c',
  '.hpp': 'cpp',
  '.cs': 'csharp',
  '.php': 'php',
  '.vue': 'vue',
  '.svelte': 'svelte',
  '.html': 'html',
  '.css': 'css',
  '.scss': 'scss',
  '.sass': 'sass',
  '.less': 'less',
  '.json': 'json',
  '.yaml': 'yaml',
  '.yml': 'yaml',
  '.toml': 'toml',
  '.xml': 'xml',
  '.md': 'markdown',
  '.sql': 'sql',
  '.sh': 'bash',
  '.bash': 'bash',
  '.zsh': 'zsh',
  '.fish': 'fish',
  '.ps1': 'powershell',
  '.dockerfile': 'dockerfile',
  '.tf': 'terraform',
  '.proto': 'protobuf',
  '.graphql': 'graphql',
  '.gql': 'graphql',
};

export class ContextLoader {
  private workingDirectory: string;
  private options: Required<ContextLoaderOptions>;
  private gitignore: Ignore | null = null;

  constructor(workingDirectory: string = process.cwd(), options: ContextLoaderOptions = {}) {
    this.workingDirectory = workingDirectory;
    this.options = { ...DEFAULT_OPTIONS, ...options } as Required<ContextLoaderOptions>;

    if (this.options.respectGitignore) {
      this.loadGitignore();
    }
  }

  private loadGitignore(): void {
    const gitignorePath = path.join(this.workingDirectory, '.gitignore');

    try {
      if (fs.existsSync(gitignorePath)) {
        const content = fs.readFileSync(gitignorePath, 'utf-8');
        this.gitignore = ignore().add(content);
      }
    } catch (_error) {
      // Ignore errors
    }
  }

  private shouldIgnore(relativePath: string): boolean {
    for (const pattern of ALWAYS_EXCLUDE) {
      if (this.matchPattern(relativePath, pattern)) {
        return true;
      }
    }

    if (this.options.excludePatterns) {
      for (const pattern of this.options.excludePatterns) {
        if (this.matchPattern(relativePath, pattern)) {
          return true;
        }
      }
    }

    if (this.gitignore && this.gitignore.ignores(relativePath)) {
      return true;
    }

    return false;
  }

  private matchPattern(filepath: string, pattern: string): boolean {
    if (pattern.startsWith('!')) {
      return !this.matchPattern(filepath, pattern.slice(1));
    }

    const regexPattern = pattern
      .replace(/\./g, '\\.')
      .replace(/\*\*/g, '<<<DOUBLESTAR>>>')
      .replace(/\*/g, '[^/]*')
      .replace(/<<<DOUBLESTAR>>>/g, '.*');

    return new RegExp('^' + regexPattern + '$').test(filepath) ||
           new RegExp('^' + regexPattern + '$').test(path.basename(filepath));
  }

  async loadFiles(patterns?: string[]): Promise<ContextFile[]> {
    const searchPatterns = patterns || this.options.patterns || ['**/*'];
    const files: ContextFile[] = [];
    let totalSize = 0;

    try {
      const matches = await glob(searchPatterns, {
        cwd: this.workingDirectory,
        dot: this.options.includeHidden,
        onlyFiles: true,
        ignore: ALWAYS_EXCLUDE,
        absolute: false,
      });

      for (const relativePath of matches) {
        if (this.shouldIgnore(relativePath)) {
          continue;
        }

        const absolutePath = path.join(this.workingDirectory, relativePath);

        try {
          const stats = fs.statSync(absolutePath);

          if (stats.size > this.options.maxFileSize) {
            continue;
          }

          if (totalSize + stats.size > this.options.maxTotalSize) {
            continue;
          }

          let content = fs.readFileSync(absolutePath, 'utf-8');

          if (this.options.compressWhitespace) {
            content = this.compressWhitespace(content);
          }

          if (this.options.removeLockFiles && this.isLockFile(relativePath)) {
            content = '[Lock file content omitted - ' + this.formatBytes(stats.size) + ']';
          }

          const ext = path.extname(relativePath).toLowerCase();
          const language = LANGUAGE_MAP[ext];

          files.push({
            path: absolutePath,
            relativePath,
            content,
            mtime: stats.mtimeMs,
            size: stats.size,
            language,
          });

          totalSize += stats.size;
        } catch (_error) {
          continue;
        }
      }
    } catch (_error) {
      // Return empty on error
    }

    return files;
  }

  private isLockFile(filepath: string): boolean {
    const lockPatterns = [
      'package-lock.json',
      'bun.lockb',
      'bun.lock',
      'yarn.lock',
      'pnpm-lock.yaml',
      'composer.lock',
      'Gemfile.lock',
      'Cargo.lock',
      'poetry.lock',
    ];
    const basename = path.basename(filepath);
    return lockPatterns.includes(basename);
  }

  private compressWhitespace(content: string): string {
    content = content.replace(/[ \t]+$/gm, '');
    content = content.replace(/\n{3,}/g, '\n\n');
    return content;
  }

  private formatBytes(bytes: number): string {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  static parsePatternString(patternStr: string): { include: string[]; exclude: string[] } {
    const parts = patternStr.split(',').map(p => p.trim()).filter(p => p);
    const include: string[] = [];
    const exclude: string[] = [];

    for (const part of parts) {
      if (part.startsWith('!')) {
        exclude.push(part.slice(1));
      } else {
        include.push(part);
      }
    }

    return { include, exclude };
  }

  formatForPrompt(files: ContextFile[]): string {
    const parts: string[] = ['CONTEXT FILES:'];

    for (const file of files) {
      parts.push('\n--- ' + file.relativePath + ' ---');
      if (file.language) {
        parts.push('```' + file.language);
        parts.push(file.content);
        parts.push('```');
      } else {
        parts.push(file.content);
      }
    }

    return parts.join('\n');
  }

  getSummary(files: ContextFile[]): string {
    const totalSize = files.reduce((sum, f) => sum + f.size, 0);
    const languages = [...new Set(files.map(f => f.language).filter(Boolean))];

    const fileList = files.map(f => f.relativePath).slice(0, 5).join(', ');
    const moreCount = files.length > 5 ? ', +' + (files.length - 5) + ' more' : '';

    return '📁 Context: ' + files.length + ' files (' + this.formatBytes(totalSize) + ')\n' +
           'Languages: ' + (languages.join(', ') || 'mixed') + '\n' +
           'Files: ' + fileList + moreCount;
  }
}

let contextLoaderInstance: ContextLoader | null = null;

export function getContextLoader(
  workingDirectory?: string,
  options?: ContextLoaderOptions
): ContextLoader {
  if (!contextLoaderInstance || workingDirectory) {
    contextLoaderInstance = new ContextLoader(workingDirectory, options);
  }
  return contextLoaderInstance;
}

export function resetContextLoader(): void {
  contextLoaderInstance = null;
}
