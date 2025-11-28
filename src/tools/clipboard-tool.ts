import fs from 'fs';
import path from 'path';
import { spawn, execSync } from 'child_process';
import { ToolResult } from '../types';

export interface ClipboardContent {
  type: 'text' | 'image' | 'html' | 'files' | 'empty';
  content?: string;
  imagePath?: string;
  files?: string[];
  html?: string;
}

/**
 * Clipboard Tool for reading and writing to system clipboard
 * Supports text, images, HTML, and file references
 * Works on Linux (xclip/xsel), macOS (pbcopy/pbpaste), and Windows (PowerShell)
 */
export class ClipboardTool {
  private readonly imageOutputDir = path.join(process.cwd(), '.grok', 'clipboard');

  /**
   * Read text from clipboard
   */
  async readText(): Promise<ToolResult> {
    try {
      const platform = process.platform;
      let text: string;

      if (platform === 'darwin') {
        text = execSync('pbpaste', { encoding: 'utf8' });
      } else if (platform === 'linux') {
        // Try xclip first, then xsel
        try {
          text = execSync('xclip -selection clipboard -o', { encoding: 'utf8' });
        } catch {
          text = execSync('xsel --clipboard --output', { encoding: 'utf8' });
        }
      } else if (platform === 'win32') {
        text = execSync('powershell -command "Get-Clipboard"', { encoding: 'utf8' });
      } else {
        return {
          success: false,
          error: `Unsupported platform: ${platform}`
        };
      }

      if (!text || text.trim().length === 0) {
        return {
          success: true,
          output: 'Clipboard is empty or contains non-text content',
          data: { type: 'empty' }
        };
      }

      return {
        success: true,
        output: `📋 Clipboard text (${text.length} chars):\n${text.slice(0, 2000)}${text.length > 2000 ? '\n... [truncated]' : ''}`,
        data: { type: 'text', content: text }
      };
    } catch (error: any) {
      return {
        success: false,
        error: `Failed to read clipboard: ${error.message}`
      };
    }
  }

  /**
   * Write text to clipboard
   */
  async writeText(text: string): Promise<ToolResult> {
    try {
      const platform = process.platform;

      if (platform === 'darwin') {
        const proc = spawn('pbcopy');
        proc.stdin.write(text);
        proc.stdin.end();
        await this.waitForProcess(proc);
      } else if (platform === 'linux') {
        try {
          const proc = spawn('xclip', ['-selection', 'clipboard']);
          proc.stdin.write(text);
          proc.stdin.end();
          await this.waitForProcess(proc);
        } catch {
          const proc = spawn('xsel', ['--clipboard', '--input']);
          proc.stdin.write(text);
          proc.stdin.end();
          await this.waitForProcess(proc);
        }
      } else if (platform === 'win32') {
        const proc = spawn('powershell', ['-command', `Set-Clipboard -Value '${text.replace(/'/g, "''")}'`]);
        await this.waitForProcess(proc);
      } else {
        return {
          success: false,
          error: `Unsupported platform: ${platform}`
        };
      }

      return {
        success: true,
        output: `📋 Copied ${text.length} characters to clipboard`
      };
    } catch (error: any) {
      return {
        success: false,
        error: `Failed to write to clipboard: ${error.message}`
      };
    }
  }

  /**
   * Read image from clipboard and save to file
   */
  async readImage(outputPath?: string): Promise<ToolResult> {
    try {
      fs.mkdirSync(this.imageOutputDir, { recursive: true });

      const platform = process.platform;
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const imagePath = outputPath || path.join(this.imageOutputDir, `clipboard_${timestamp}.png`);

      if (platform === 'darwin') {
        // macOS: Use osascript to check for image and pngpaste to save
        try {
          execSync('which pngpaste', { stdio: 'ignore' });
          execSync(`pngpaste "${imagePath}"`, { stdio: 'ignore' });
        } catch {
          // Fallback: Use screencapture to capture from clipboard
          const script = `
            set theFile to POSIX file "${imagePath}"
            try
              set theImage to the clipboard as «class PNGf»
              set theRef to open for access theFile with write permission
              write theImage to theRef
              close access theRef
            end try
          `;
          execSync(`osascript -e '${script}'`, { stdio: 'ignore' });
        }
      } else if (platform === 'linux') {
        // Linux: Use xclip to get image
        try {
          execSync(`xclip -selection clipboard -t image/png -o > "${imagePath}"`, { shell: '/bin/bash' });
        } catch {
          return {
            success: false,
            error: 'No image in clipboard or xclip not available'
          };
        }
      } else if (platform === 'win32') {
        // Windows: Use PowerShell
        const script = `
$img = Get-Clipboard -Format Image
if ($img) {
  $img.Save('${imagePath.replace(/\\/g, '\\\\')}')
}
        `;
        execSync(`powershell -command "${script}"`, { stdio: 'ignore' });
      } else {
        return {
          success: false,
          error: `Unsupported platform: ${platform}`
        };
      }

      if (!fs.existsSync(imagePath) || fs.statSync(imagePath).size === 0) {
        // Clean up empty file if created
        if (fs.existsSync(imagePath)) {
          fs.unlinkSync(imagePath);
        }
        return {
          success: false,
          error: 'No image found in clipboard'
        };
      }

      const stats = fs.statSync(imagePath);

      return {
        success: true,
        output: `🖼️ Image saved from clipboard:\n   Path: ${imagePath}\n   Size: ${this.formatSize(stats.size)}`,
        data: { type: 'image', imagePath }
      };
    } catch (error: any) {
      return {
        success: false,
        error: `Failed to read image from clipboard: ${error.message}`
      };
    }
  }

  /**
   * Copy image file to clipboard
   */
  async writeImage(imagePath: string): Promise<ToolResult> {
    try {
      const resolvedPath = path.resolve(process.cwd(), imagePath);

      if (!fs.existsSync(resolvedPath)) {
        return {
          success: false,
          error: `Image file not found: ${imagePath}`
        };
      }

      const platform = process.platform;

      if (platform === 'darwin') {
        const script = `set the clipboard to (read (POSIX file "${resolvedPath}") as «class PNGf»)`;
        execSync(`osascript -e '${script}'`);
      } else if (platform === 'linux') {
        execSync(`xclip -selection clipboard -t image/png -i "${resolvedPath}"`);
      } else if (platform === 'win32') {
        const script = `
Add-Type -AssemblyName System.Windows.Forms
$image = [System.Drawing.Image]::FromFile('${resolvedPath.replace(/\\/g, '\\\\')}')
[System.Windows.Forms.Clipboard]::SetImage($image)
        `;
        execSync(`powershell -command "${script}"`);
      } else {
        return {
          success: false,
          error: `Unsupported platform: ${platform}`
        };
      }

      return {
        success: true,
        output: `🖼️ Image copied to clipboard: ${imagePath}`
      };
    } catch (error: any) {
      return {
        success: false,
        error: `Failed to copy image to clipboard: ${error.message}`
      };
    }
  }

  /**
   * Read HTML from clipboard
   */
  async readHtml(): Promise<ToolResult> {
    try {
      const platform = process.platform;
      let html: string;

      if (platform === 'darwin') {
        // macOS doesn't easily expose HTML via command line
        return {
          success: false,
          error: 'HTML clipboard reading not supported on macOS via CLI'
        };
      } else if (platform === 'linux') {
        try {
          html = execSync('xclip -selection clipboard -t text/html -o', { encoding: 'utf8' });
        } catch {
          return {
            success: false,
            error: 'No HTML content in clipboard or xclip not available'
          };
        }
      } else if (platform === 'win32') {
        html = execSync('powershell -command "Get-Clipboard -Format Html"', { encoding: 'utf8' });
      } else {
        return {
          success: false,
          error: `Unsupported platform: ${platform}`
        };
      }

      if (!html || html.trim().length === 0) {
        return {
          success: true,
          output: 'No HTML content in clipboard',
          data: { type: 'empty' }
        };
      }

      return {
        success: true,
        output: `📋 Clipboard HTML (${html.length} chars):\n${html.slice(0, 1000)}${html.length > 1000 ? '\n... [truncated]' : ''}`,
        data: { type: 'html', html }
      };
    } catch (error: any) {
      return {
        success: false,
        error: `Failed to read HTML from clipboard: ${error.message}`
      };
    }
  }

  /**
   * Copy file path to clipboard
   */
  async copyFilePath(filePath: string): Promise<ToolResult> {
    try {
      const resolvedPath = path.resolve(process.cwd(), filePath);

      if (!fs.existsSync(resolvedPath)) {
        return {
          success: false,
          error: `File not found: ${filePath}`
        };
      }

      return await this.writeText(resolvedPath);
    } catch (error: any) {
      return {
        success: false,
        error: `Failed to copy file path: ${error.message}`
      };
    }
  }

  /**
   * Copy file content to clipboard
   */
  async copyFileContent(filePath: string): Promise<ToolResult> {
    try {
      const resolvedPath = path.resolve(process.cwd(), filePath);

      if (!fs.existsSync(resolvedPath)) {
        return {
          success: false,
          error: `File not found: ${filePath}`
        };
      }

      const content = fs.readFileSync(resolvedPath, 'utf8');
      return await this.writeText(content);
    } catch (error: any) {
      return {
        success: false,
        error: `Failed to copy file content: ${error.message}`
      };
    }
  }

  /**
   * Get clipboard content type
   */
  async getContentType(): Promise<ToolResult> {
    try {
      const textResult = await this.readText();

      if (textResult.success && textResult.data?.type === 'text') {
        return {
          success: true,
          output: 'Clipboard contains: text',
          data: { type: 'text' }
        };
      }

      // Check for image
      const platform = process.platform;

      if (platform === 'darwin') {
        try {
          const script = 'clipboard info';
          const info = execSync(`osascript -e '${script}'`, { encoding: 'utf8' });
          if (info.includes('«class PNGf»') || info.includes('TIFF')) {
            return {
              success: true,
              output: 'Clipboard contains: image',
              data: { type: 'image' }
            };
          }
        } catch {
          // Ignore
        }
      } else if (platform === 'linux') {
        try {
          const targets = execSync('xclip -selection clipboard -t TARGETS -o', { encoding: 'utf8' });
          if (targets.includes('image/png') || targets.includes('image/jpeg')) {
            return {
              success: true,
              output: 'Clipboard contains: image',
              data: { type: 'image' }
            };
          }
        } catch {
          // Ignore
        }
      }

      return {
        success: true,
        output: 'Clipboard is empty or contains unknown content type',
        data: { type: 'empty' }
      };
    } catch (error: any) {
      return {
        success: false,
        error: `Failed to determine clipboard type: ${error.message}`
      };
    }
  }

  /**
   * Clear clipboard
   */
  async clear(): Promise<ToolResult> {
    try {
      const platform = process.platform;

      if (platform === 'darwin') {
        execSync('pbcopy < /dev/null');
      } else if (platform === 'linux') {
        try {
          execSync('xclip -selection clipboard -i /dev/null');
        } catch {
          execSync('xsel --clipboard --clear');
        }
      } else if (platform === 'win32') {
        execSync('powershell -command "Set-Clipboard -Value $null"');
      } else {
        return {
          success: false,
          error: `Unsupported platform: ${platform}`
        };
      }

      return {
        success: true,
        output: '📋 Clipboard cleared'
      };
    } catch (error: any) {
      return {
        success: false,
        error: `Failed to clear clipboard: ${error.message}`
      };
    }
  }

  /**
   * Helper to wait for a spawned process
   */
  private waitForProcess(proc: ReturnType<typeof spawn>): Promise<void> {
    return new Promise((resolve, reject) => {
      proc.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Process exited with code ${code}`));
        }
      });
      proc.on('error', reject);
    });
  }

  /**
   * Format file size
   */
  private formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }
}
