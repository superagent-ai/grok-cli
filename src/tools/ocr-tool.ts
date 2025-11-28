import fs from 'fs';
import path from 'path';
import { spawn, execSync } from 'child_process';
import { ToolResult } from '../types';

export interface OCRResult {
  text: string;
  confidence?: number;
  language?: string;
  blocks?: OCRBlock[];
  processingTime?: number;
}

export interface OCRBlock {
  text: string;
  confidence?: number;
  boundingBox?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export interface OCROptions {
  language?: string; // e.g., 'eng', 'fra', 'deu', 'jpn'
  psm?: number; // Page segmentation mode (0-13)
  oem?: number; // OCR Engine mode (0-3)
  dpi?: number; // Image DPI for processing
}

/**
 * OCR Tool for extracting text from images
 * Uses Tesseract OCR as the backend (must be installed on system)
 * Falls back to basic image analysis if Tesseract is not available
 */
export class OCRTool {
  private readonly supportedFormats = ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.tiff', '.tif', '.webp'];
  private readonly maxFileSizeMB = 50;
  private tesseractAvailable: boolean | null = null;

  /**
   * Perform OCR on an image file
   */
  async extractText(filePath: string, options: OCROptions = {}): Promise<ToolResult> {
    try {
      const resolvedPath = path.resolve(process.cwd(), filePath);

      if (!fs.existsSync(resolvedPath)) {
        return {
          success: false,
          error: `Image file not found: ${filePath}`
        };
      }

      const ext = path.extname(resolvedPath).toLowerCase();
      if (!this.supportedFormats.includes(ext)) {
        return {
          success: false,
          error: `Unsupported image format: ${ext}. Supported: ${this.supportedFormats.join(', ')}`
        };
      }

      const stats = fs.statSync(resolvedPath);
      const fileSizeMB = stats.size / (1024 * 1024);
      if (fileSizeMB > this.maxFileSizeMB) {
        return {
          success: false,
          error: `Image file too large: ${fileSizeMB.toFixed(2)}MB. Max: ${this.maxFileSizeMB}MB`
        };
      }

      // Check Tesseract availability
      const hasTesseract = await this.checkTesseract();

      if (hasTesseract) {
        return await this.runTesseract(resolvedPath, options);
      } else {
        // Try alternative: use online OCR API if available
        const grokKey = process.env.GROK_API_KEY;
        const openaiKey = process.env.OPENAI_API_KEY;

        if (grokKey || openaiKey) {
          return await this.runVisionOCR(resolvedPath, (openaiKey || grokKey) as string);
        }

        return {
          success: false,
          error: 'Tesseract OCR not installed. Install with: sudo apt install tesseract-ocr (Linux) or brew install tesseract (macOS). Alternatively, set OPENAI_API_KEY for vision-based OCR.'
        };
      }
    } catch (error: any) {
      return {
        success: false,
        error: `OCR failed: ${error.message}`
      };
    }
  }

  /**
   * Check if Tesseract is available
   */
  private async checkTesseract(): Promise<boolean> {
    if (this.tesseractAvailable !== null) {
      return this.tesseractAvailable;
    }

    try {
      execSync('tesseract --version', { stdio: 'ignore' });
      this.tesseractAvailable = true;
    } catch {
      this.tesseractAvailable = false;
    }

    return this.tesseractAvailable;
  }

  /**
   * Run Tesseract OCR
   */
  private async runTesseract(imagePath: string, options: OCROptions): Promise<ToolResult> {
    return new Promise((resolve) => {
      const startTime = Date.now();
      const args: string[] = [imagePath, 'stdout'];

      // Add language option
      if (options.language) {
        args.push('-l', options.language);
      }

      // Add page segmentation mode
      if (options.psm !== undefined) {
        args.push('--psm', options.psm.toString());
      }

      // Add OCR engine mode
      if (options.oem !== undefined) {
        args.push('--oem', options.oem.toString());
      }

      // Add DPI option
      if (options.dpi) {
        args.push('--dpi', options.dpi.toString());
      }

      // Request TSV output for confidence scores
      args.push('-c', 'tessedit_create_tsv=1');

      const tesseract = spawn('tesseract', args);

      let stdout = '';
      let stderr = '';

      tesseract.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      tesseract.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      tesseract.on('close', (code) => {
        const processingTime = Date.now() - startTime;

        if (code !== 0) {
          resolve({
            success: false,
            error: `Tesseract exited with code ${code}: ${stderr}`
          });
          return;
        }

        // Parse TSV output for confidence scores
        const { text, blocks, avgConfidence } = this.parseTesseractTSV(stdout);

        const result: OCRResult = {
          text,
          confidence: avgConfidence,
          language: options.language || 'eng',
          blocks,
          processingTime
        };

        resolve({
          success: true,
          output: this.formatOutput(result, imagePath),
          data: result
        });
      });

      tesseract.on('error', (err) => {
        resolve({
          success: false,
          error: `Tesseract error: ${err.message}`
        });
      });
    });
  }

  /**
   * Parse Tesseract TSV output
   */
  private parseTesseractTSV(tsv: string): { text: string; blocks: OCRBlock[]; avgConfidence: number } {
    const lines = tsv.split('\n');
    const blocks: OCRBlock[] = [];
    const words: string[] = [];
    let totalConfidence = 0;
    let wordCount = 0;

    // Skip header line
    for (let i = 1; i < lines.length; i++) {
      const parts = lines[i].split('\t');
      if (parts.length >= 12) {
        const level = parseInt(parts[0]);
        const conf = parseFloat(parts[10]);
        const text = parts[11]?.trim();

        if (level === 5 && text) { // Word level
          words.push(text);
          if (conf > 0) {
            totalConfidence += conf;
            wordCount++;
          }

          blocks.push({
            text,
            confidence: conf,
            boundingBox: {
              x: parseInt(parts[6]),
              y: parseInt(parts[7]),
              width: parseInt(parts[8]),
              height: parseInt(parts[9])
            }
          });
        }
      }
    }

    return {
      text: words.join(' '),
      blocks,
      avgConfidence: wordCount > 0 ? Math.round(totalConfidence / wordCount) : 0
    };
  }

  /**
   * Run OCR using vision API (OpenAI or similar)
   */
  private async runVisionOCR(imagePath: string, apiKey: string): Promise<ToolResult> {
    const axios = (await import('axios')).default;

    // Read image and convert to base64
    const buffer = fs.readFileSync(imagePath);
    const base64 = buffer.toString('base64');
    const ext = path.extname(imagePath).toLowerCase();
    const mediaType = ext === '.png' ? 'image/png' : 'image/jpeg';

    try {
      const startTime = Date.now();

      const response = await axios.post(
        'https://api.openai.com/v1/chat/completions',
        {
          model: 'gpt-4-vision-preview',
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: 'Extract all text from this image. Return ONLY the extracted text, preserving the original layout and formatting as much as possible. Do not include any explanations or comments.'
                },
                {
                  type: 'image_url',
                  image_url: {
                    url: `data:${mediaType};base64,${base64}`
                  }
                }
              ]
            }
          ],
          max_tokens: 4096
        },
        {
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: 60000
        }
      );

      const text = response.data.choices[0]?.message?.content || '';
      const processingTime = Date.now() - startTime;

      const result: OCRResult = {
        text,
        processingTime
      };

      return {
        success: true,
        output: this.formatOutput(result, imagePath),
        data: result
      };
    } catch (error: any) {
      const errorMsg = error.response?.data?.error?.message || error.message;
      return {
        success: false,
        error: `Vision OCR failed: ${errorMsg}`
      };
    }
  }

  /**
   * List available Tesseract languages
   */
  async listLanguages(): Promise<ToolResult> {
    try {
      const hasTesseract = await this.checkTesseract();
      if (!hasTesseract) {
        return {
          success: false,
          error: 'Tesseract not installed'
        };
      }

      const output = execSync('tesseract --list-langs', { encoding: 'utf8' });
      const lines = output.split('\n').slice(1).filter(l => l.trim());

      return {
        success: true,
        output: `Available OCR languages:\n${lines.map(l => `  - ${l}`).join('\n')}`
      };
    } catch (error: any) {
      return {
        success: false,
        error: `Failed to list languages: ${error.message}`
      };
    }
  }

  /**
   * Batch OCR multiple images
   */
  async batchOCR(filePaths: string[], options: OCROptions = {}): Promise<ToolResult> {
    const results: { file: string; text?: string; error?: string }[] = [];

    for (const filePath of filePaths) {
      const result = await this.extractText(filePath, options);
      if (result.success) {
        results.push({ file: filePath, text: result.data?.text });
      } else {
        results.push({ file: filePath, error: result.error });
      }
    }

    const successCount = results.filter(r => r.text).length;

    return {
      success: true,
      output: `Batch OCR completed: ${successCount}/${filePaths.length} successful\n\n` +
        results.map(r => `${r.file}: ${r.error || `${r.text?.slice(0, 100)}...`}`).join('\n'),
      data: results
    };
  }

  /**
   * OCR a specific region of an image
   */
  async extractRegion(
    filePath: string,
    region: { x: number; y: number; width: number; height: number },
    options: OCROptions = {}
  ): Promise<ToolResult> {
    // For region extraction, we need ImageMagick to crop first
    try {
      execSync('which convert', { stdio: 'ignore' });
    } catch {
      return {
        success: false,
        error: 'ImageMagick is required for region extraction. Install with: sudo apt install imagemagick'
      };
    }

    const resolvedPath = path.resolve(process.cwd(), filePath);
    if (!fs.existsSync(resolvedPath)) {
      return {
        success: false,
        error: `Image not found: ${filePath}`
      };
    }

    const tempPath = path.join(process.cwd(), '.grok', 'temp', `ocr_region_${Date.now()}.png`);
    fs.mkdirSync(path.dirname(tempPath), { recursive: true });

    try {
      // Crop the region using ImageMagick
      execSync(
        `convert "${resolvedPath}" -crop ${region.width}x${region.height}+${region.x}+${region.y} "${tempPath}"`
      );

      const result = await this.extractText(tempPath, options);

      // Clean up temp file
      if (fs.existsSync(tempPath)) {
        fs.unlinkSync(tempPath);
      }

      return result;
    } catch (error: any) {
      if (fs.existsSync(tempPath)) {
        fs.unlinkSync(tempPath);
      }
      return {
        success: false,
        error: `Region extraction failed: ${error.message}`
      };
    }
  }

  /**
   * Format OCR output for display
   */
  private formatOutput(result: OCRResult, filePath: string): string {
    const lines = [
      `🔍 OCR: ${path.basename(filePath)}`
    ];

    if (result.confidence !== undefined) {
      lines.push(`   Confidence: ${result.confidence}%`);
    }
    if (result.language) {
      lines.push(`   Language: ${result.language}`);
    }
    if (result.processingTime) {
      lines.push(`   Processing time: ${result.processingTime}ms`);
    }

    lines.push('');
    lines.push('--- Extracted Text ---');
    lines.push(result.text || '[No text detected]');

    return lines.join('\n');
  }

  /**
   * Check if file is a supported image format
   */
  isSupported(filePath: string): boolean {
    const ext = path.extname(filePath).toLowerCase();
    return this.supportedFormats.includes(ext);
  }
}
