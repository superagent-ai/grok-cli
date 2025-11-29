import fs from 'fs';
import path from 'path';
import { ToolResult } from '../types';

export interface DocumentContent {
  text: string;
  type: 'docx' | 'xlsx' | 'pptx' | 'odt' | 'ods' | 'odp' | 'rtf' | 'csv';
  metadata: DocumentMetadata;
  sheets?: SheetContent[]; // For spreadsheets
  slides?: SlideContent[]; // For presentations
}

export interface DocumentMetadata {
  title?: string;
  author?: string;
  creator?: string;
  created?: string;
  modified?: string;
  lastModifiedBy?: string;
  pageCount?: number;
  wordCount?: number;
  sheetCount?: number;
  slideCount?: number;
}

export interface SheetContent {
  name: string;
  data: string[][];
  rowCount: number;
  colCount: number;
}

export interface SlideContent {
  number: number;
  title?: string;
  text: string;
}

/**
 * Document Tool for reading Office documents (DOCX, XLSX, PPTX) and other formats
 * Uses ZIP-based extraction for Office Open XML formats
 */
export class DocumentTool {
  private readonly supportedFormats = ['.docx', '.xlsx', '.pptx', '.odt', '.ods', '.odp', '.rtf', '.csv', '.tsv'];
  private readonly maxFileSizeMB = 100;

  /**
   * Read document content
   */
  async readDocument(filePath: string): Promise<ToolResult> {
    try {
      const resolvedPath = path.resolve(process.cwd(), filePath);

      if (!fs.existsSync(resolvedPath)) {
        return {
          success: false,
          error: `Document not found: ${filePath}`
        };
      }

      const ext = path.extname(resolvedPath).toLowerCase();
      if (!this.supportedFormats.includes(ext)) {
        return {
          success: false,
          error: `Unsupported format: ${ext}. Supported: ${this.supportedFormats.join(', ')}`
        };
      }

      const stats = fs.statSync(resolvedPath);
      const fileSizeMB = stats.size / (1024 * 1024);
      if (fileSizeMB > this.maxFileSizeMB) {
        return {
          success: false,
          error: `File too large: ${fileSizeMB.toFixed(2)}MB. Max: ${this.maxFileSizeMB}MB`
        };
      }

      let content: DocumentContent;

      switch (ext) {
        case '.docx':
          content = await this.readDocx(resolvedPath);
          break;
        case '.xlsx':
          content = await this.readXlsx(resolvedPath);
          break;
        case '.pptx':
          content = await this.readPptx(resolvedPath);
          break;
        case '.csv':
        case '.tsv':
          content = await this.readCsv(resolvedPath, ext === '.tsv' ? '\t' : ',');
          break;
        case '.rtf':
          content = await this.readRtf(resolvedPath);
          break;
        default:
          return {
            success: false,
            error: `Format ${ext} is recognized but not yet fully implemented`
          };
      }

      return {
        success: true,
        output: this.formatOutput(content, filePath),
        data: content
      };
    } catch (error: any) {
      return {
        success: false,
        error: `Failed to read document: ${error.message}`
      };
    }
  }

  /**
   * Read DOCX file
   */
  private async readDocx(filePath: string): Promise<DocumentContent> {
    const AdmZip = (await import('adm-zip')).default;
    const zip = new AdmZip(filePath);

    // Read document.xml
    const documentXml = zip.readAsText('word/document.xml');

    // Extract text from XML
    const text = this.extractTextFromXml(documentXml, 'w:t');

    // Try to read metadata from core.xml
    const metadata = this.extractDocxMetadata(zip);

    return {
      text,
      type: 'docx',
      metadata: {
        ...metadata,
        wordCount: text.split(/\s+/).filter(w => w.length > 0).length
      }
    };
  }

  /**
   * Read XLSX file
   */
  private async readXlsx(filePath: string): Promise<DocumentContent> {
    const AdmZip = (await import('adm-zip')).default;
    const zip = new AdmZip(filePath);

    // Read shared strings
    const sharedStrings: string[] = [];
    try {
      const sharedStringsXml = zip.readAsText('xl/sharedStrings.xml');
      const matches = sharedStringsXml.match(/<t[^>]*>([^<]*)<\/t>/g) || [];
      for (const match of matches) {
        const text = match.replace(/<[^>]+>/g, '');
        sharedStrings.push(text);
      }
    } catch {
      // No shared strings
    }

    // Read workbook to get sheet names
    const workbookXml = zip.readAsText('xl/workbook.xml');
    const sheetNames: string[] = [];
    const sheetMatches = workbookXml.match(/<sheet[^>]+name="([^"]+)"[^>]*>/g) || [];
    for (const match of sheetMatches) {
      const nameMatch = match.match(/name="([^"]+)"/);
      if (nameMatch) {
        sheetNames.push(nameMatch[1]);
      }
    }

    // Read sheets
    const sheets: SheetContent[] = [];
    let sheetIndex = 1;

    while (true) {
      try {
        const sheetXml = zip.readAsText(`xl/worksheets/sheet${sheetIndex}.xml`);
        const sheetData = this.parseSheetXml(sheetXml, sharedStrings);

        sheets.push({
          name: sheetNames[sheetIndex - 1] || `Sheet${sheetIndex}`,
          data: sheetData.data,
          rowCount: sheetData.data.length,
          colCount: sheetData.maxCol
        });

        sheetIndex++;
      } catch {
        break;
      }
    }

    // Combine all sheet text
    const text = sheets.map(s =>
      `[${s.name}]\n` + s.data.map(row => row.join('\t')).join('\n')
    ).join('\n\n');

    return {
      text,
      type: 'xlsx',
      metadata: {
        sheetCount: sheets.length
      },
      sheets
    };
  }

  /**
   * Parse Excel sheet XML
   */
  private parseSheetXml(xml: string, sharedStrings: string[]): { data: string[][]; maxCol: number } {
    const data: string[][] = [];
    let maxCol = 0;

    // Find all rows
    const rowMatches = xml.match(/<row[^>]*>[\s\S]*?<\/row>/g) || [];

    for (const rowXml of rowMatches) {
      const rowNumMatch = rowXml.match(/r="(\d+)"/);
      const rowNum = rowNumMatch ? parseInt(rowNumMatch[1]) - 1 : data.length;

      // Ensure row exists
      while (data.length <= rowNum) {
        data.push([]);
      }

      // Find all cells in row
      const cellMatches = rowXml.match(/<c[^>]*>[\s\S]*?<\/c>/g) || [];

      for (const cellXml of cellMatches) {
        const refMatch = cellXml.match(/r="([A-Z]+)(\d+)"/);
        if (!refMatch) continue;

        const colStr = refMatch[1];
        const colIndex = this.colStringToIndex(colStr);
        maxCol = Math.max(maxCol, colIndex + 1);

        // Ensure row has enough columns
        while (data[rowNum].length <= colIndex) {
          data[rowNum].push('');
        }

        // Get cell value
        const valueMatch = cellXml.match(/<v>([^<]*)<\/v>/);
        let value = valueMatch ? valueMatch[1] : '';

        // Check if it's a shared string reference
        const typeMatch = cellXml.match(/t="s"/);
        if (typeMatch && sharedStrings[parseInt(value)]) {
          value = sharedStrings[parseInt(value)];
        }

        data[rowNum][colIndex] = value;
      }
    }

    return { data, maxCol };
  }

  /**
   * Convert Excel column string to index (A=0, B=1, ..., AA=26, etc.)
   */
  private colStringToIndex(col: string): number {
    let index = 0;
    for (let i = 0; i < col.length; i++) {
      index = index * 26 + (col.charCodeAt(i) - 64);
    }
    return index - 1;
  }

  /**
   * Read PPTX file
   */
  private async readPptx(filePath: string): Promise<DocumentContent> {
    const AdmZip = (await import('adm-zip')).default;
    const zip = new AdmZip(filePath);

    const slides: SlideContent[] = [];
    let slideIndex = 1;

    while (true) {
      try {
        const slideXml = zip.readAsText(`ppt/slides/slide${slideIndex}.xml`);
        const text = this.extractTextFromXml(slideXml, 'a:t');

        // Try to get slide title (usually in first shape)
        const titleMatch = slideXml.match(/<p:sp[^>]*>[\s\S]*?<p:txBody>[\s\S]*?<a:p>[\s\S]*?<a:t>([^<]+)<\/a:t>/);
        const title = titleMatch ? titleMatch[1] : undefined;

        slides.push({
          number: slideIndex,
          title,
          text
        });

        slideIndex++;
      } catch {
        break;
      }
    }

    const text = slides.map(s =>
      `[Slide ${s.number}${s.title ? ': ' + s.title : ''}]\n${s.text}`
    ).join('\n\n');

    return {
      text,
      type: 'pptx',
      metadata: {
        slideCount: slides.length
      },
      slides
    };
  }

  /**
   * Read CSV/TSV file
   */
  private async readCsv(filePath: string, delimiter: string): Promise<DocumentContent> {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split(/\r?\n/);
    const data: string[][] = [];

    for (const line of lines) {
      if (line.trim()) {
        data.push(this.parseCsvLine(line, delimiter));
      }
    }

    const text = data.map(row => row.join('\t')).join('\n');

    return {
      text,
      type: 'csv',
      metadata: {},
      sheets: [{
        name: 'Data',
        data,
        rowCount: data.length,
        colCount: data[0]?.length || 0
      }]
    };
  }

  /**
   * Parse a single CSV line handling quotes
   */
  private parseCsvLine(line: string, delimiter: string): string[] {
    const cells: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];

      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === delimiter && !inQuotes) {
        cells.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }

    cells.push(current.trim());
    return cells;
  }

  /**
   * Read RTF file
   */
  private async readRtf(filePath: string): Promise<DocumentContent> {
    const content = fs.readFileSync(filePath, 'utf8');

    // Basic RTF to text conversion
    let text = content
      // Remove RTF header
      .replace(/^\{\\rtf[^}]*/, '')
      // Remove control words
      .replace(/\\[a-z]+\d* ?/g, '')
      // Remove groups
      .replace(/[{}]/g, '')
      // Convert special characters
      .replace(/\\'([0-9a-f]{2})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
      // Clean up whitespace
      .replace(/\s+/g, ' ')
      .trim();

    return {
      text,
      type: 'rtf',
      metadata: {
        wordCount: text.split(/\s+/).filter(w => w.length > 0).length
      }
    };
  }

  /**
   * Extract text from XML content
   */
  private extractTextFromXml(xml: string, tagName: string): string {
    const regex = new RegExp(`<${tagName}[^>]*>([^<]*)</${tagName}>`, 'g');
    const matches = xml.match(regex) || [];

    const texts: string[] = [];
    for (const match of matches) {
      const text = match.replace(/<[^>]+>/g, '').trim();
      if (text) {
        texts.push(text);
      }
    }

    return texts.join(' ');
  }

  /**
   * Extract DOCX metadata
   */
  private extractDocxMetadata(zip: any): DocumentMetadata {
    const metadata: DocumentMetadata = {};

    try {
      const coreXml = zip.readAsText('docProps/core.xml');

      const titleMatch = coreXml.match(/<dc:title>([^<]*)<\/dc:title>/);
      if (titleMatch) metadata.title = titleMatch[1];

      const creatorMatch = coreXml.match(/<dc:creator>([^<]*)<\/dc:creator>/);
      if (creatorMatch) metadata.author = creatorMatch[1];

      const createdMatch = coreXml.match(/<dcterms:created[^>]*>([^<]*)<\/dcterms:created>/);
      if (createdMatch) metadata.created = createdMatch[1];

      const modifiedMatch = coreXml.match(/<dcterms:modified[^>]*>([^<]*)<\/dcterms:modified>/);
      if (modifiedMatch) metadata.modified = modifiedMatch[1];

      const lastModifiedByMatch = coreXml.match(/<cp:lastModifiedBy>([^<]*)<\/cp:lastModifiedBy>/);
      if (lastModifiedByMatch) metadata.lastModifiedBy = lastModifiedByMatch[1];
    } catch {
      // Metadata extraction failed
    }

    return metadata;
  }

  /**
   * Format output for display
   */
  private formatOutput(content: DocumentContent, filePath: string): string {
    const lines: string[] = [];
    const typeEmoji = {
      docx: '📝',
      xlsx: '📊',
      pptx: '📽️',
      csv: '📊',
      rtf: '📝',
      odt: '📝',
      ods: '📊',
      odp: '📽️'
    };

    lines.push(`${typeEmoji[content.type] || '📄'} ${content.type.toUpperCase()}: ${path.basename(filePath)}`);

    if (content.metadata.title) {
      lines.push(`   Title: ${content.metadata.title}`);
    }
    if (content.metadata.author) {
      lines.push(`   Author: ${content.metadata.author}`);
    }
    if (content.metadata.wordCount) {
      lines.push(`   Words: ${content.metadata.wordCount}`);
    }
    if (content.metadata.sheetCount) {
      lines.push(`   Sheets: ${content.metadata.sheetCount}`);
    }
    if (content.metadata.slideCount) {
      lines.push(`   Slides: ${content.metadata.slideCount}`);
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
   * List supported documents in directory
   */
  listDocuments(dirPath: string = '.'): ToolResult {
    try {
      const resolvedPath = path.resolve(process.cwd(), dirPath);

      if (!fs.existsSync(resolvedPath)) {
        return {
          success: false,
          error: `Directory not found: ${dirPath}`
        };
      }

      const files = fs.readdirSync(resolvedPath);
      const docs = files.filter(f => {
        const ext = path.extname(f).toLowerCase();
        return this.supportedFormats.includes(ext);
      });

      if (docs.length === 0) {
        return {
          success: true,
          output: `No supported documents found in ${dirPath}`
        };
      }

      const docList = docs.map(doc => {
        const fullPath = path.join(resolvedPath, doc);
        const stats = fs.statSync(fullPath);
        const ext = path.extname(doc).toLowerCase();
        const emoji = ext.includes('doc') ? '📝' : ext.includes('xls') || ext === '.csv' ? '📊' : '📽️';
        return `  ${emoji} ${doc} (${this.formatSize(stats.size)})`;
      }).join('\n');

      return {
        success: true,
        output: `Documents in ${dirPath}:\n${docList}`
      };
    } catch (error: any) {
      return {
        success: false,
        error: `Failed to list documents: ${error.message}`
      };
    }
  }

  /**
   * Check if file is a supported document
   */
  isDocument(filePath: string): boolean {
    const ext = path.extname(filePath).toLowerCase();
    return this.supportedFormats.includes(ext);
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
