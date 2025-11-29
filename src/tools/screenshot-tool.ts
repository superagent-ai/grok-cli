import fs from 'fs';
import path from 'path';
import { spawn, execSync } from 'child_process';
import { ToolResult } from '../types';

export interface ScreenshotOptions {
  fullscreen?: boolean;
  region?: { x: number; y: number; width: number; height: number };
  window?: string; // Window title or ID
  delay?: number; // Delay in seconds
  format?: 'png' | 'jpg';
  quality?: number; // 1-100 for jpg
  outputPath?: string;
}

export interface ScreenshotResult {
  path: string;
  width?: number;
  height?: number;
  size: string;
  timestamp: string;
}

/**
 * Screenshot Tool for capturing screen, windows, and regions
 * Works on Linux (with scrot/gnome-screenshot), macOS (screencapture), and Windows (PowerShell)
 */
export class ScreenshotTool {
  private readonly defaultOutputDir = path.join(process.cwd(), '.grok', 'screenshots');

  /**
   * Capture a screenshot
   */
  async capture(options: ScreenshotOptions = {}): Promise<ToolResult> {
    try {
      // Ensure output directory exists
      fs.mkdirSync(this.defaultOutputDir, { recursive: true });

      const format = options.format || 'png';
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `screenshot_${timestamp}.${format}`;
      const outputPath = options.outputPath || path.join(this.defaultOutputDir, filename);

      const platform = process.platform;

      let result: ScreenshotResult;

      if (platform === 'darwin') {
        result = await this.captureMacOS(outputPath, options);
      } else if (platform === 'linux') {
        result = await this.captureLinux(outputPath, options);
      } else if (platform === 'win32') {
        result = await this.captureWindows(outputPath, options);
      } else {
        return {
          success: false,
          error: `Unsupported platform: ${platform}`
        };
      }

      return {
        success: true,
        output: this.formatResult(result),
        data: result
      };
    } catch (error: any) {
      return {
        success: false,
        error: `Screenshot capture failed: ${error.message}`
      };
    }
  }

  /**
   * Capture screenshot on macOS using screencapture
   */
  private async captureMacOS(outputPath: string, options: ScreenshotOptions): Promise<ScreenshotResult> {
    return new Promise((resolve, reject) => {
      const args: string[] = [];

      if (options.delay) {
        args.push('-T', options.delay.toString());
      }

      if (options.region) {
        args.push('-R', `${options.region.x},${options.region.y},${options.region.width},${options.region.height}`);
      } else if (options.window) {
        args.push('-l', options.window);
      } else if (!options.fullscreen) {
        // Interactive selection mode
        args.push('-i');
      }

      if (options.format === 'jpg') {
        args.push('-t', 'jpg');
      }

      args.push(outputPath);

      const screencapture = spawn('screencapture', args);

      screencapture.on('close', (code) => {
        if (code === 0 && fs.existsSync(outputPath)) {
          const stats = fs.statSync(outputPath);
          resolve({
            path: outputPath,
            size: this.formatSize(stats.size),
            timestamp: new Date().toISOString()
          });
        } else {
          reject(new Error(`screencapture failed with code ${code}`));
        }
      });

      screencapture.on('error', (err) => {
        reject(err);
      });
    });
  }

  /**
   * Capture screenshot on Linux using scrot or gnome-screenshot
   */
  private async captureLinux(outputPath: string, options: ScreenshotOptions): Promise<ScreenshotResult> {
    // Try scrot first, then gnome-screenshot, then import (ImageMagick)
    const tools = ['scrot', 'gnome-screenshot', 'import'];
    let availableTool: string | null = null;

    for (const tool of tools) {
      try {
        execSync(`which ${tool}`, { stdio: 'ignore' });
        availableTool = tool;
        break;
      } catch {
        continue;
      }
    }

    if (!availableTool) {
      throw new Error('No screenshot tool found. Install scrot, gnome-screenshot, or imagemagick.');
    }

    return new Promise((resolve, reject) => {
      let args: string[] = [];

      if (availableTool === 'scrot') {
        if (options.delay) {
          args.push('-d', options.delay.toString());
        }
        if (options.region) {
          args.push('-a', `${options.region.x},${options.region.y},${options.region.width},${options.region.height}`);
        } else if (options.window) {
          args.push('-u'); // Focused window
        }
        if (options.quality && options.format === 'jpg') {
          args.push('-q', options.quality.toString());
        }
        args.push(outputPath);
      } else if (availableTool === 'gnome-screenshot') {
        if (options.delay) {
          args.push('-d', options.delay.toString());
        }
        if (options.window) {
          args.push('-w'); // Active window
        } else if (options.region) {
          args.push('-a'); // Area selection
        }
        args.push('-f', outputPath);
      } else if (availableTool === 'import') {
        // ImageMagick import
        if (options.window) {
          args.push('-window', 'root');
        }
        args.push(outputPath);
      }

      const screenshot = spawn(availableTool, args);

      screenshot.on('close', (code) => {
        if (code === 0 && fs.existsSync(outputPath)) {
          const stats = fs.statSync(outputPath);
          resolve({
            path: outputPath,
            size: this.formatSize(stats.size),
            timestamp: new Date().toISOString()
          });
        } else {
          reject(new Error(`${availableTool} failed with code ${code}`));
        }
      });

      screenshot.on('error', (err) => {
        reject(err);
      });
    });
  }

  /**
   * Capture screenshot on Windows using PowerShell
   */
  private async captureWindows(outputPath: string, _options: ScreenshotOptions): Promise<ScreenshotResult> {
    return new Promise((resolve, reject) => {
      const script = `
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$screen = [System.Windows.Forms.Screen]::PrimaryScreen
$bounds = $screen.Bounds
$bitmap = New-Object System.Drawing.Bitmap($bounds.Width, $bounds.Height)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.CopyFromScreen($bounds.Location, [System.Drawing.Point]::Empty, $bounds.Size)
$bitmap.Save('${outputPath.replace(/\\/g, '\\\\')}')
$graphics.Dispose()
$bitmap.Dispose()
      `;

      const powershell = spawn('powershell', ['-Command', script]);

      powershell.on('close', (code) => {
        if (code === 0 && fs.existsSync(outputPath)) {
          const stats = fs.statSync(outputPath);
          resolve({
            path: outputPath,
            size: this.formatSize(stats.size),
            timestamp: new Date().toISOString()
          });
        } else {
          reject(new Error(`PowerShell screenshot failed with code ${code}`));
        }
      });

      powershell.on('error', (err) => {
        reject(err);
      });
    });
  }

  /**
   * Capture active window
   */
  async captureWindow(windowTitle?: string): Promise<ToolResult> {
    return this.capture({ window: windowTitle || 'active' });
  }

  /**
   * Capture a region
   */
  async captureRegion(x: number, y: number, width: number, height: number): Promise<ToolResult> {
    return this.capture({ region: { x, y, width, height } });
  }

  /**
   * Capture fullscreen with delay
   */
  async captureDelayed(seconds: number): Promise<ToolResult> {
    return this.capture({ fullscreen: true, delay: seconds });
  }

  /**
   * List saved screenshots
   */
  listScreenshots(): ToolResult {
    try {
      if (!fs.existsSync(this.defaultOutputDir)) {
        return {
          success: true,
          output: 'No screenshots found'
        };
      }

      const files = fs.readdirSync(this.defaultOutputDir);
      const screenshots = files.filter(f => /\.(png|jpg|jpeg)$/i.test(f));

      if (screenshots.length === 0) {
        return {
          success: true,
          output: 'No screenshots found'
        };
      }

      const screenshotList = screenshots.map(file => {
        const fullPath = path.join(this.defaultOutputDir, file);
        const stats = fs.statSync(fullPath);
        const time = stats.mtime.toLocaleString();
        return `  📸 ${file} (${this.formatSize(stats.size)}) - ${time}`;
      }).join('\n');

      return {
        success: true,
        output: `Screenshots in ${this.defaultOutputDir}:\n${screenshotList}`
      };
    } catch (error: any) {
      return {
        success: false,
        error: `Failed to list screenshots: ${error.message}`
      };
    }
  }

  /**
   * Read a screenshot and convert to base64
   */
  async toBase64(filePath: string): Promise<ToolResult> {
    try {
      const resolvedPath = path.resolve(process.cwd(), filePath);

      if (!fs.existsSync(resolvedPath)) {
        return {
          success: false,
          error: `Screenshot not found: ${filePath}`
        };
      }

      const buffer = fs.readFileSync(resolvedPath);
      const base64 = buffer.toString('base64');
      const ext = path.extname(resolvedPath).toLowerCase();
      const mediaType = ext === '.png' ? 'image/png' : 'image/jpeg';

      return {
        success: true,
        output: `Screenshot converted to base64 (${base64.length} characters)`,
        data: {
          base64,
          mediaType,
          filename: path.basename(filePath)
        }
      };
    } catch (error: any) {
      return {
        success: false,
        error: `Failed to convert screenshot: ${error.message}`
      };
    }
  }

  /**
   * Delete a screenshot
   */
  deleteScreenshot(filePath: string): ToolResult {
    try {
      const resolvedPath = filePath.startsWith('/')
        ? filePath
        : path.join(this.defaultOutputDir, filePath);

      if (!fs.existsSync(resolvedPath)) {
        return {
          success: false,
          error: `Screenshot not found: ${filePath}`
        };
      }

      fs.unlinkSync(resolvedPath);

      return {
        success: true,
        output: `Screenshot deleted: ${resolvedPath}`
      };
    } catch (error: any) {
      return {
        success: false,
        error: `Failed to delete screenshot: ${error.message}`
      };
    }
  }

  /**
   * Clear all screenshots
   */
  clearScreenshots(): ToolResult {
    try {
      if (!fs.existsSync(this.defaultOutputDir)) {
        return {
          success: true,
          output: 'No screenshots to clear'
        };
      }

      const files = fs.readdirSync(this.defaultOutputDir);
      let deleted = 0;

      for (const file of files) {
        if (/\.(png|jpg|jpeg)$/i.test(file)) {
          fs.unlinkSync(path.join(this.defaultOutputDir, file));
          deleted++;
        }
      }

      return {
        success: true,
        output: `Cleared ${deleted} screenshots`
      };
    } catch (error: any) {
      return {
        success: false,
        error: `Failed to clear screenshots: ${error.message}`
      };
    }
  }

  /**
   * Format file size
   */
  private formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }

  /**
   * Format result for display
   */
  private formatResult(result: ScreenshotResult): string {
    const lines = [
      `📸 Screenshot captured`,
      `   Path: ${result.path}`,
      `   Size: ${result.size}`,
      `   Time: ${result.timestamp}`
    ];

    if (result.width && result.height) {
      lines.push(`   Dimensions: ${result.width}x${result.height}`);
    }

    return lines.join('\n');
  }
}
