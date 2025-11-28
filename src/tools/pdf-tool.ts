import fs from 'fs';
import path from 'path';
import { ToolResult } from '../types';

export interface PDFContent {
  text: string;
  pageCount: number;
  metadata: PDFMetadata;
  pages: PDFPage[];
}

export interface PDFMetadata {
  title?: string;
  author?: string;
  subject?: string;
  creator?: string;
  creationDate?: string;
  modificationDate?: string;
}

export interface PDFPage {
  pageNumber: number;
  text: string;
  wordCount: number;
}

/**
 * PDF Tool for reading and extracting content from PDF files
 * Uses a simple text extraction approach without heavy dependencies
 */
export class PDFTool {
  private readonly maxFileSizeMB = 50; // 50MB max

  /**
   * Extract text content from a PDF file
   */
  async extractText(filePath: string, options: { pages?: number[]; maxPages?: number } = {}): Promise<ToolResult> {
    try {
      const resolvedPath = path.resolve(process.cwd(), filePath);

      if (!fs.existsSync(resolvedPath)) {
        return {
          success: false,
          error: `PDF file not found: ${filePath}`
        };
      }

      const ext = path.extname(resolvedPath).toLowerCase();
      if (ext !== '.pdf') {
        return {
          success: false,
          error: `Not a PDF file: ${filePath}`
        };
      }

      const stats = fs.statSync(resolvedPath);
      const fileSizeMB = stats.size / (1024 * 1024);
      if (fileSizeMB > this.maxFileSizeMB) {
        return {
          success: false,
          error: `PDF file too large: ${fileSizeMB.toFixed(2)}MB. Max: ${this.maxFileSizeMB}MB`
        };
      }

      const buffer = fs.readFileSync(resolvedPath);
      const content = await this.parsePDF(buffer, options);

      return {
        success: true,
        output: this.formatOutput(content, filePath),
        data: content
      };
    } catch (error: any) {
      return {
        success: false,
        error: `Failed to extract PDF text: ${error.message}`
      };
    }
  }

  /**
   * Parse PDF buffer and extract content
   */
  private async parsePDF(buffer: Buffer, options: { pages?: number[]; maxPages?: number } = {}): Promise<PDFContent> {
    const pdfString = buffer.toString('latin1');

    // Extract metadata
    const metadata = this.extractMetadata(pdfString);

    // Count pages
    const pageMatches = pdfString.match(/\/Type\s*\/Page[^s]/g);
    const pageCount = pageMatches ? pageMatches.length : 1;

    // Extract text streams
    const textContent = this.extractTextStreams(pdfString);

    // Split into pages (approximate)
    const pages: PDFPage[] = [];
    const avgCharsPerPage = Math.ceil(textContent.length / pageCount);

    for (let i = 0; i < pageCount; i++) {
      if (options.pages && !options.pages.includes(i + 1)) continue;
      if (options.maxPages && pages.length >= options.maxPages) break;

      const start = i * avgCharsPerPage;
      const end = Math.min((i + 1) * avgCharsPerPage, textContent.length);
      const pageText = textContent.slice(start, end).trim();

      pages.push({
        pageNumber: i + 1,
        text: pageText,
        wordCount: pageText.split(/\s+/).filter(w => w.length > 0).length
      });
    }

    return {
      text: textContent,
      pageCount,
      metadata,
      pages
    };
  }

  /**
   * Extract metadata from PDF
   */
  private extractMetadata(pdfString: string): PDFMetadata {
    const metadata: PDFMetadata = {};

    const titleMatch = pdfString.match(/\/Title\s*\(([^)]*)\)/);
    if (titleMatch) metadata.title = this.decodeString(titleMatch[1]);

    const authorMatch = pdfString.match(/\/Author\s*\(([^)]*)\)/);
    if (authorMatch) metadata.author = this.decodeString(authorMatch[1]);

    const subjectMatch = pdfString.match(/\/Subject\s*\(([^)]*)\)/);
    if (subjectMatch) metadata.subject = this.decodeString(subjectMatch[1]);

    const creatorMatch = pdfString.match(/\/Creator\s*\(([^)]*)\)/);
    if (creatorMatch) metadata.creator = this.decodeString(creatorMatch[1]);

    const creationDateMatch = pdfString.match(/\/CreationDate\s*\(D:(\d{14})/);
    if (creationDateMatch) {
      metadata.creationDate = this.parseDate(creationDateMatch[1]);
    }

    const modDateMatch = pdfString.match(/\/ModDate\s*\(D:(\d{14})/);
    if (modDateMatch) {
      metadata.modificationDate = this.parseDate(modDateMatch[1]);
    }

    return metadata;
  }

  /**
   * Extract text streams from PDF
   */
  private extractTextStreams(pdfString: string): string {
    const textParts: string[] = [];

    // Find text objects (BT...ET blocks)
    const textBlocks = pdfString.match(/BT[\s\S]*?ET/g) || [];

    for (const block of textBlocks) {
      // Extract text from Tj and TJ operators
      const tjMatches = block.match(/\(([^)]*)\)\s*Tj/g) || [];
      for (const match of tjMatches) {
        const text = match.match(/\(([^)]*)\)/);
        if (text) {
          textParts.push(this.decodeString(text[1]));
        }
      }

      // Handle TJ arrays
      const tjArrayMatches = block.match(/\[([^\]]*)\]\s*TJ/g) || [];
      for (const match of tjArrayMatches) {
        const arrayContent = match.match(/\[([^\]]*)\]/);
        if (arrayContent) {
          const strings = arrayContent[1].match(/\(([^)]*)\)/g) || [];
          for (const str of strings) {
            const text = str.match(/\(([^)]*)\)/);
            if (text) {
              textParts.push(this.decodeString(text[1]));
            }
          }
        }
      }
    }

    // Also try to extract from stream objects
    const streamMatches = pdfString.match(/stream[\r\n]+([\s\S]*?)[\r\n]+endstream/g) || [];
    for (const stream of streamMatches) {
      // Look for readable text patterns
      const readableText = stream.match(/[A-Za-z][A-Za-z0-9\s,.!?;:'"()-]{10,}/g) || [];
      textParts.push(...readableText);
    }

    // Clean up and join
    let text = textParts.join(' ')
      .replace(/\s+/g, ' ')
      .replace(/([a-z])([A-Z])/g, '$1 $2') // Add space between camelCase
      .trim();

    // If no text found, indicate that
    if (text.length < 10) {
      text = '[PDF contains minimal extractable text - may be image-based or encrypted]';
    }

    return text;
  }

  /**
   * Decode PDF string encoding
   */
  private decodeString(str: string): string {
    return str
      .replace(/\\n/g, '\n')
      .replace(/\\r/g, '\r')
      .replace(/\\t/g, '\t')
      .replace(/\\\(/g, '(')
      .replace(/\\\)/g, ')')
      .replace(/\\\\/g, '\\')
      .replace(/\\(\d{3})/g, (_, oct) => String.fromCharCode(parseInt(oct, 8)));
  }

  /**
   * Parse PDF date format
   */
  private parseDate(dateStr: string): string {
    try {
      const year = dateStr.slice(0, 4);
      const month = dateStr.slice(4, 6);
      const day = dateStr.slice(6, 8);
      const hour = dateStr.slice(8, 10);
      const minute = dateStr.slice(10, 12);
      const second = dateStr.slice(12, 14);
      return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
    } catch {
      return dateStr;
    }
  }

  /**
   * Format output for display
   */
  private formatOutput(content: PDFContent, filePath: string): string {
    const lines: string[] = [];
    lines.push(`📄 PDF: ${path.basename(filePath)}`);
    lines.push(`   Pages: ${content.pageCount}`);
    lines.push(`   Words: ${content.text.split(/\s+/).filter(w => w.length > 0).length}`);

    if (content.metadata.title) {
      lines.push(`   Title: ${content.metadata.title}`);
    }
    if (content.metadata.author) {
      lines.push(`   Author: ${content.metadata.author}`);
    }

    lines.push('');
    lines.push('--- Content ---');
    lines.push(content.text.slice(0, 5000));

    if (content.text.length > 5000) {
      lines.push(`\n... [truncated, ${content.text.length - 5000} more characters]`);
    }

    return lines.join('\n');
  }

  /**
   * Get PDF info without extracting full text
   */
  async getInfo(filePath: string): Promise<ToolResult> {
    try {
      const resolvedPath = path.resolve(process.cwd(), filePath);

      if (!fs.existsSync(resolvedPath)) {
        return {
          success: false,
          error: `PDF file not found: ${filePath}`
        };
      }

      const stats = fs.statSync(resolvedPath);
      const buffer = fs.readFileSync(resolvedPath);
      const pdfString = buffer.toString('latin1');

      const metadata = this.extractMetadata(pdfString);
      const pageMatches = pdfString.match(/\/Type\s*\/Page[^s]/g);
      const pageCount = pageMatches ? pageMatches.length : 1;

      const info = {
        filename: path.basename(filePath),
        path: resolvedPath,
        size: `${(stats.size / 1024).toFixed(2)} KB`,
        pageCount,
        metadata
      };

      return {
        success: true,
        output: `PDF Info:\n${JSON.stringify(info, null, 2)}`,
        data: info
      };
    } catch (error: any) {
      return {
        success: false,
        error: `Failed to get PDF info: ${error.message}`
      };
    }
  }

  /**
   * List PDF files in a directory
   */
  listPDFs(dirPath: string = '.'): ToolResult {
    try {
      const resolvedPath = path.resolve(process.cwd(), dirPath);

      if (!fs.existsSync(resolvedPath)) {
        return {
          success: false,
          error: `Directory not found: ${dirPath}`
        };
      }

      const files = fs.readdirSync(resolvedPath);
      const pdfs = files.filter(f => path.extname(f).toLowerCase() === '.pdf');

      if (pdfs.length === 0) {
        return {
          success: true,
          output: `No PDF files found in ${dirPath}`
        };
      }

      const pdfList = pdfs.map(pdf => {
        const fullPath = path.join(resolvedPath, pdf);
        const stats = fs.statSync(fullPath);
        const sizeKB = (stats.size / 1024).toFixed(2);
        return `  📄 ${pdf} (${sizeKB} KB)`;
      }).join('\n');

      return {
        success: true,
        output: `PDF files in ${dirPath}:\n${pdfList}`
      };
    } catch (error: any) {
      return {
        success: false,
        error: `Failed to list PDFs: ${error.message}`
      };
    }
  }

  /**
   * Check if a file is a PDF
   */
  isPDF(filePath: string): boolean {
    return path.extname(filePath).toLowerCase() === '.pdf';
  }

  /**
   * Convert PDF to base64 for API transmission
   */
  async toBase64(filePath: string): Promise<ToolResult> {
    try {
      const resolvedPath = path.resolve(process.cwd(), filePath);

      if (!fs.existsSync(resolvedPath)) {
        return {
          success: false,
          error: `PDF file not found: ${filePath}`
        };
      }

      const buffer = fs.readFileSync(resolvedPath);
      const base64 = buffer.toString('base64');

      return {
        success: true,
        output: `PDF converted to base64 (${base64.length} characters)`,
        data: {
          base64,
          mediaType: 'application/pdf',
          filename: path.basename(filePath)
        }
      };
    } catch (error: any) {
      return {
        success: false,
        error: `Failed to convert PDF to base64: ${error.message}`
      };
    }
  }
}
