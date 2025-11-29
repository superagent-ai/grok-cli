import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { ToolResult } from '../types';

export interface ArchiveInfo {
  path: string;
  type: 'zip' | 'tar' | 'tar.gz' | 'tar.bz2' | 'tar.xz' | '7z' | 'rar';
  size: string;
  fileCount?: number;
  files?: ArchiveEntry[];
}

export interface ArchiveEntry {
  path: string;
  size: number;
  compressed?: number;
  isDirectory: boolean;
  modified?: string;
}

export interface ExtractOptions {
  outputDir?: string;
  files?: string[]; // Specific files to extract
  overwrite?: boolean;
  preservePaths?: boolean;
  password?: string;
}

export interface CreateOptions {
  format?: 'zip' | 'tar' | 'tar.gz' | 'tar.bz2' | 'tar.xz';
  compressionLevel?: number; // 0-9
  excludePatterns?: string[];
  password?: string;
  outputPath?: string;
}

/**
 * Archive Tool for working with compressed archives (ZIP, TAR, etc.)
 * Supports listing, extracting, and creating archives
 */
export class ArchiveTool {
  private readonly supportedFormats = ['.zip', '.tar', '.tar.gz', '.tgz', '.tar.bz2', '.tbz2', '.tar.xz', '.txz', '.7z', '.rar', '.gz', '.bz2', '.xz'];
  private readonly outputDir = path.join(process.cwd(), '.grok', 'extracted');

  /**
   * List contents of an archive
   */
  async list(archivePath: string): Promise<ToolResult> {
    try {
      const resolvedPath = path.resolve(process.cwd(), archivePath);

      if (!fs.existsSync(resolvedPath)) {
        return {
          success: false,
          error: `Archive not found: ${archivePath}`
        };
      }

      const type = this.getArchiveType(resolvedPath);
      if (!type) {
        return {
          success: false,
          error: `Unsupported archive format: ${path.extname(resolvedPath)}`
        };
      }

      const stats = fs.statSync(resolvedPath);
      let files: ArchiveEntry[] = [];

      switch (type) {
        case 'zip':
          files = await this.listZip(resolvedPath);
          break;
        case 'tar':
        case 'tar.gz':
        case 'tar.bz2':
        case 'tar.xz':
          files = await this.listTar(resolvedPath, type);
          break;
        case '7z':
          files = await this.list7z(resolvedPath);
          break;
        case 'rar':
          files = await this.listRar(resolvedPath);
          break;
        default:
          return {
            success: false,
            error: `Listing not supported for ${type} format`
          };
      }

      const info: ArchiveInfo = {
        path: resolvedPath,
        type,
        size: this.formatSize(stats.size),
        fileCount: files.filter(f => !f.isDirectory).length,
        files
      };

      return {
        success: true,
        output: this.formatArchiveInfo(info),
        data: info
      };
    } catch (error: any) {
      return {
        success: false,
        error: `Failed to list archive: ${error.message}`
      };
    }
  }

  /**
   * Extract archive contents
   */
  async extract(archivePath: string, options: ExtractOptions = {}): Promise<ToolResult> {
    try {
      const resolvedPath = path.resolve(process.cwd(), archivePath);

      if (!fs.existsSync(resolvedPath)) {
        return {
          success: false,
          error: `Archive not found: ${archivePath}`
        };
      }

      const type = this.getArchiveType(resolvedPath);
      if (!type) {
        return {
          success: false,
          error: `Unsupported archive format`
        };
      }

      const outputDir = options.outputDir || path.join(
        this.outputDir,
        path.basename(resolvedPath, path.extname(resolvedPath))
      );

      fs.mkdirSync(outputDir, { recursive: true });

      let result: { success: boolean; files: string[] };

      switch (type) {
        case 'zip':
          result = await this.extractZip(resolvedPath, outputDir, options);
          break;
        case 'tar':
        case 'tar.gz':
        case 'tar.bz2':
        case 'tar.xz':
          result = await this.extractTar(resolvedPath, outputDir, type, options);
          break;
        case '7z':
          result = await this.extract7z(resolvedPath, outputDir, options);
          break;
        case 'rar':
          result = await this.extractRar(resolvedPath, outputDir, options);
          break;
        default:
          return {
            success: false,
            error: `Extraction not supported for ${type} format`
          };
      }

      if (!result.success) {
        return {
          success: false,
          error: 'Extraction failed'
        };
      }

      return {
        success: true,
        output: `📦 Extracted ${result.files.length} items to: ${outputDir}`,
        data: { outputDir, files: result.files }
      };
    } catch (error: any) {
      return {
        success: false,
        error: `Extraction failed: ${error.message}`
      };
    }
  }

  /**
   * Create an archive
   */
  async create(
    sourcePaths: string[],
    options: CreateOptions = {}
  ): Promise<ToolResult> {
    try {
      const resolvedPaths = sourcePaths.map(p => path.resolve(process.cwd(), p));

      // Verify all source paths exist
      for (const p of resolvedPaths) {
        if (!fs.existsSync(p)) {
          return {
            success: false,
            error: `Source not found: ${p}`
          };
        }
      }

      const format = options.format || 'zip';
      const ext = format === 'tar.gz' ? '.tar.gz' : format === 'tar.bz2' ? '.tar.bz2' : format === 'tar.xz' ? '.tar.xz' : `.${format}`;
      const timestamp = Date.now();
      const archiveName = `archive_${timestamp}${ext}`;
      const outputPath = options.outputPath || path.join(process.cwd(), archiveName);

      let success: boolean;

      switch (format) {
        case 'zip':
          success = await this.createZip(resolvedPaths, outputPath, options);
          break;
        case 'tar':
        case 'tar.gz':
        case 'tar.bz2':
        case 'tar.xz':
          success = await this.createTar(resolvedPaths, outputPath, format, options);
          break;
        default:
          return {
            success: false,
            error: `Creation not supported for ${format} format`
          };
      }

      if (!success) {
        return {
          success: false,
          error: 'Archive creation failed'
        };
      }

      const stats = fs.statSync(outputPath);

      return {
        success: true,
        output: `📦 Created archive: ${outputPath} (${this.formatSize(stats.size)})`,
        data: { path: outputPath, size: stats.size }
      };
    } catch (error: any) {
      return {
        success: false,
        error: `Archive creation failed: ${error.message}`
      };
    }
  }

  /**
   * Get archive type from file extension
   */
  private getArchiveType(filePath: string): ArchiveInfo['type'] | null {
    const lower = filePath.toLowerCase();

    if (lower.endsWith('.zip')) return 'zip';
    if (lower.endsWith('.tar.gz') || lower.endsWith('.tgz')) return 'tar.gz';
    if (lower.endsWith('.tar.bz2') || lower.endsWith('.tbz2')) return 'tar.bz2';
    if (lower.endsWith('.tar.xz') || lower.endsWith('.txz')) return 'tar.xz';
    if (lower.endsWith('.tar')) return 'tar';
    if (lower.endsWith('.7z')) return '7z';
    if (lower.endsWith('.rar')) return 'rar';

    return null;
  }

  /**
   * List ZIP contents
   */
  private async listZip(archivePath: string): Promise<ArchiveEntry[]> {
    const AdmZip = (await import('adm-zip')).default;
    const zip = new AdmZip(archivePath);
    const entries = zip.getEntries();

    return entries.map(entry => ({
      path: entry.entryName,
      size: entry.header.size,
      compressed: entry.header.compressedSize,
      isDirectory: entry.isDirectory,
      modified: entry.header.time ? new Date(entry.header.time).toISOString() : undefined
    }));
  }

  /**
   * List TAR contents
   */
  private async listTar(archivePath: string, type: string): Promise<ArchiveEntry[]> {
    return new Promise((resolve, reject) => {
      const args = ['tf', archivePath];
      if (type === 'tar.gz') args.splice(1, 0, '-z');
      if (type === 'tar.bz2') args.splice(1, 0, '-j');
      if (type === 'tar.xz') args.splice(1, 0, '-J');

      const tar = spawn('tar', args);
      let output = '';

      tar.stdout.on('data', (data) => {
        output += data.toString();
      });

      tar.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`tar exited with code ${code}`));
          return;
        }

        const entries = output.split('\n')
          .filter(line => line.trim())
          .map(line => ({
            path: line,
            size: 0,
            isDirectory: line.endsWith('/')
          }));

        resolve(entries);
      });

      tar.on('error', reject);
    });
  }

  /**
   * List 7z contents
   */
  private async list7z(archivePath: string): Promise<ArchiveEntry[]> {
    return new Promise((resolve, reject) => {
      const sevenZ = spawn('7z', ['l', archivePath]);
      let output = '';

      sevenZ.stdout.on('data', (data) => {
        output += data.toString();
      });

      sevenZ.on('close', (code) => {
        if (code !== 0) {
          reject(new Error('7z not available. Install p7zip-full.'));
          return;
        }

        // Parse 7z output
        const entries: ArchiveEntry[] = [];
        const lines = output.split('\n');
        let inList = false;

        for (const line of lines) {
          if (line.includes('----')) {
            inList = !inList;
            continue;
          }
          if (inList && line.trim()) {
            const match = line.match(/(\d+)\s+\d+\s+(\S+)\s+(.+)/);
            if (match) {
              entries.push({
                path: match[3].trim(),
                size: parseInt(match[1]),
                isDirectory: match[2] === 'D....'
              });
            }
          }
        }

        resolve(entries);
      });

      sevenZ.on('error', () => {
        reject(new Error('7z not installed'));
      });
    });
  }

  /**
   * List RAR contents
   */
  private async listRar(archivePath: string): Promise<ArchiveEntry[]> {
    return new Promise((resolve, reject) => {
      const unrar = spawn('unrar', ['l', archivePath]);
      let output = '';

      unrar.stdout.on('data', (data) => {
        output += data.toString();
      });

      unrar.on('close', (code) => {
        if (code !== 0) {
          reject(new Error('unrar not available'));
          return;
        }

        // Parse unrar output
        const entries: ArchiveEntry[] = [];
        const lines = output.split('\n');

        for (const line of lines) {
          const match = line.match(/(\d+)\s+\d+%\s+[\d-]+\s+[\d:]+\s+[.A-Z]+\s+(.+)/);
          if (match) {
            entries.push({
              path: match[2].trim(),
              size: parseInt(match[1]),
              isDirectory: false
            });
          }
        }

        resolve(entries);
      });

      unrar.on('error', () => {
        reject(new Error('unrar not installed'));
      });
    });
  }

  /**
   * Extract ZIP archive
   */
  private async extractZip(
    archivePath: string,
    outputDir: string,
    options: ExtractOptions
  ): Promise<{ success: boolean; files: string[] }> {
    const AdmZip = (await import('adm-zip')).default;
    const zip = new AdmZip(archivePath);

    if (options.files && options.files.length > 0) {
      const files: string[] = [];
      for (const file of options.files) {
        const entry = zip.getEntry(file);
        if (entry) {
          zip.extractEntryTo(entry, outputDir, options.preservePaths !== false, options.overwrite !== false);
          files.push(file);
        }
      }
      return { success: true, files };
    }

    zip.extractAllTo(outputDir, options.overwrite !== false);
    const entries = zip.getEntries().map(e => e.entryName);
    return { success: true, files: entries };
  }

  /**
   * Extract TAR archive
   */
  private async extractTar(
    archivePath: string,
    outputDir: string,
    type: string,
    options: ExtractOptions
  ): Promise<{ success: boolean; files: string[] }> {
    return new Promise((resolve) => {
      const args = ['xf', archivePath, '-C', outputDir];

      if (type === 'tar.gz') args.splice(1, 0, '-z');
      if (type === 'tar.bz2') args.splice(1, 0, '-j');
      if (type === 'tar.xz') args.splice(1, 0, '-J');

      if (options.files && options.files.length > 0) {
        args.push(...options.files);
      }

      const tar = spawn('tar', args);

      tar.on('close', async (code) => {
        if (code === 0) {
          // List extracted files
          const files = this.getFilesRecursive(outputDir);
          resolve({ success: true, files });
        } else {
          resolve({ success: false, files: [] });
        }
      });

      tar.on('error', () => {
        resolve({ success: false, files: [] });
      });
    });
  }

  /**
   * Extract 7z archive
   */
  private async extract7z(
    archivePath: string,
    outputDir: string,
    options: ExtractOptions
  ): Promise<{ success: boolean; files: string[] }> {
    return new Promise((resolve) => {
      const args = ['x', archivePath, `-o${outputDir}`];

      if (options.overwrite !== false) {
        args.push('-y');
      }

      if (options.password) {
        args.push(`-p${options.password}`);
      }

      const sevenZ = spawn('7z', args);

      sevenZ.on('close', (code) => {
        if (code === 0) {
          const files = this.getFilesRecursive(outputDir);
          resolve({ success: true, files });
        } else {
          resolve({ success: false, files: [] });
        }
      });

      sevenZ.on('error', () => {
        resolve({ success: false, files: [] });
      });
    });
  }

  /**
   * Extract RAR archive
   */
  private async extractRar(
    archivePath: string,
    outputDir: string,
    options: ExtractOptions
  ): Promise<{ success: boolean; files: string[] }> {
    return new Promise((resolve) => {
      const args = ['x'];

      if (options.overwrite !== false) {
        args.push('-o+');
      }

      if (options.password) {
        args.push(`-p${options.password}`);
      }

      args.push(archivePath, outputDir);

      const unrar = spawn('unrar', args);

      unrar.on('close', (code) => {
        if (code === 0) {
          const files = this.getFilesRecursive(outputDir);
          resolve({ success: true, files });
        } else {
          resolve({ success: false, files: [] });
        }
      });

      unrar.on('error', () => {
        resolve({ success: false, files: [] });
      });
    });
  }

  /**
   * Create ZIP archive
   */
  private async createZip(
    sourcePaths: string[],
    outputPath: string,
    _options: CreateOptions
  ): Promise<boolean> {
    const AdmZip = (await import('adm-zip')).default;
    const zip = new AdmZip();

    for (const sourcePath of sourcePaths) {
      const stats = fs.statSync(sourcePath);
      const baseName = path.basename(sourcePath);

      if (stats.isDirectory()) {
        zip.addLocalFolder(sourcePath, baseName);
      } else {
        zip.addLocalFile(sourcePath);
      }
    }

    zip.writeZip(outputPath);
    return true;
  }

  /**
   * Create TAR archive
   */
  private async createTar(
    sourcePaths: string[],
    outputPath: string,
    format: string,
    _options: CreateOptions
  ): Promise<boolean> {
    return new Promise((resolve) => {
      const args = ['cf', outputPath];

      if (format === 'tar.gz') args.splice(1, 0, '-z');
      if (format === 'tar.bz2') args.splice(1, 0, '-j');
      if (format === 'tar.xz') args.splice(1, 0, '-J');

      // Change to parent directory and use relative paths
      const parentDir = path.dirname(sourcePaths[0]);
      const relPaths = sourcePaths.map(p => path.relative(parentDir, p));

      args.push('-C', parentDir);
      args.push(...relPaths);

      const tar = spawn('tar', args);

      tar.on('close', (code) => {
        resolve(code === 0);
      });

      tar.on('error', () => {
        resolve(false);
      });
    });
  }

  /**
   * Get files recursively from directory
   */
  private getFilesRecursive(dir: string): string[] {
    const files: string[] = [];

    try {
      const items = fs.readdirSync(dir);

      for (const item of items) {
        const fullPath = path.join(dir, item);
        const stats = fs.statSync(fullPath);

        if (stats.isDirectory()) {
          files.push(...this.getFilesRecursive(fullPath));
        } else {
          files.push(fullPath);
        }
      }
    } catch {
      // Ignore errors
    }

    return files;
  }

  /**
   * Format archive info for display
   */
  private formatArchiveInfo(info: ArchiveInfo): string {
    const lines = [
      `📦 Archive: ${path.basename(info.path)}`,
      `   Type: ${info.type.toUpperCase()}`,
      `   Size: ${info.size}`,
      `   Files: ${info.fileCount || 0}`,
      ''
    ];

    if (info.files && info.files.length > 0) {
      lines.push('Contents:');

      // Show first 20 files
      const displayFiles = info.files.slice(0, 20);
      for (const file of displayFiles) {
        const icon = file.isDirectory ? '📁' : '📄';
        const size = file.isDirectory ? '' : ` (${this.formatSize(file.size)})`;
        lines.push(`  ${icon} ${file.path}${size}`);
      }

      if (info.files.length > 20) {
        lines.push(`  ... and ${info.files.length - 20} more items`);
      }
    }

    return lines.join('\n');
  }

  /**
   * Format file size
   */
  private formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  }

  /**
   * List archives in directory
   */
  listArchives(dirPath: string = '.'): ToolResult {
    try {
      const resolvedPath = path.resolve(process.cwd(), dirPath);

      if (!fs.existsSync(resolvedPath)) {
        return {
          success: false,
          error: `Directory not found: ${dirPath}`
        };
      }

      const files = fs.readdirSync(resolvedPath);
      const archives = files.filter(f => {
        const lower = f.toLowerCase();
        return this.supportedFormats.some(ext => lower.endsWith(ext));
      });

      if (archives.length === 0) {
        return {
          success: true,
          output: `No archives found in ${dirPath}`
        };
      }

      const list = archives.map(f => {
        const fullPath = path.join(resolvedPath, f);
        const stats = fs.statSync(fullPath);
        return `  📦 ${f} (${this.formatSize(stats.size)})`;
      }).join('\n');

      return {
        success: true,
        output: `Archives in ${dirPath}:\n${list}`
      };
    } catch (error: any) {
      return {
        success: false,
        error: `Failed to list archives: ${error.message}`
      };
    }
  }
}
