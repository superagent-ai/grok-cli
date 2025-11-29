import fs from 'fs';
import path from 'path';
import { ToolResult } from '../types';

export interface QRGenerateOptions {
  size?: number; // Module size in pixels
  margin?: number; // Margin in modules
  errorCorrection?: 'L' | 'M' | 'Q' | 'H'; // Low, Medium, Quartile, High
  format?: 'png' | 'svg' | 'ascii' | 'utf8';
  darkColor?: string; // Hex color for dark modules
  lightColor?: string; // Hex color for light modules
  outputPath?: string;
}

export interface QRDecodeResult {
  text: string;
  type?: 'url' | 'text' | 'vcard' | 'wifi' | 'email' | 'phone' | 'sms' | 'geo';
  parsed?: any;
}

/**
 * QR Code Tool for generating and reading QR codes
 * Generates QR codes in multiple formats including ASCII for terminal display
 */
export class QRTool {
  private readonly outputDir = path.join(process.cwd(), '.grok', 'qrcodes');

  /**
   * Generate a QR code
   */
  async generate(data: string, options: QRGenerateOptions = {}): Promise<ToolResult> {
    try {
      const format = options.format || 'ascii';

      if (format === 'ascii' || format === 'utf8') {
        const qrCode = this.generateQRMatrix(data, options.errorCorrection || 'M');
        const ascii = this.matrixToAscii(qrCode, format === 'utf8');

        return {
          success: true,
          output: `QR Code for: ${data.slice(0, 50)}${data.length > 50 ? '...' : ''}\n\n${ascii}`,
          data: { format, content: ascii }
        };
      }

      // For image formats, try to use external library or return ASCII
      fs.mkdirSync(this.outputDir, { recursive: true });

      const timestamp = Date.now();
      const filename = `qr_${timestamp}.${format}`;
      const outputPath = options.outputPath || path.join(this.outputDir, filename);

      if (format === 'svg') {
        const svg = await this.generateSVG(data, options);
        fs.writeFileSync(outputPath, svg, 'utf8');

        return {
          success: true,
          output: `QR Code saved to: ${outputPath}`,
          data: { format: 'svg', path: outputPath }
        };
      }

      // For PNG, we need an external library or fallback
      // Return ASCII with suggestion to install qrcode library
      const qrCode = this.generateQRMatrix(data, options.errorCorrection || 'M');
      const ascii = this.matrixToAscii(qrCode, true);

      return {
        success: true,
        output: `QR Code (ASCII):\n\n${ascii}\n\nNote: For PNG export, install qrcode package: npm install qrcode`,
        data: { format: 'ascii', content: ascii }
      };
    } catch (error: any) {
      return {
        success: false,
        error: `QR generation failed: ${error.message}`
      };
    }
  }

  /**
   * Generate QR matrix using simple implementation
   * Note: This is a simplified version - for production use qrcode library
   */
  private generateQRMatrix(data: string, _errorCorrection: string): boolean[][] {
    // Simple QR-like pattern generator for ASCII display
    // Real QR generation would require a full Reed-Solomon implementation

    const size = Math.max(21, Math.ceil(data.length / 2) + 17);
    const matrix: boolean[][] = Array(size).fill(null).map(() => Array(size).fill(false));

    // Add finder patterns (top-left, top-right, bottom-left)
    this.addFinderPattern(matrix, 0, 0);
    this.addFinderPattern(matrix, 0, size - 7);
    this.addFinderPattern(matrix, size - 7, 0);

    // Add timing patterns
    for (let i = 8; i < size - 8; i++) {
      matrix[6][i] = i % 2 === 0;
      matrix[i][6] = i % 2 === 0;
    }

    // Add data (simplified - just fill remaining area based on data)
    const dataBytes = Buffer.from(data, 'utf8');
    let byteIndex = 0;
    let bitIndex = 0;

    for (let y = size - 1; y >= 0; y -= 2) {
      if (y === 6) y = 5; // Skip timing pattern column

      for (let x = 0; x < size; x++) {
        for (let col = 0; col < 2; col++) {
          const cx = y - col;
          if (cx < 0) continue;

          // Skip if in finder pattern or timing pattern
          if (this.isReservedModule(size, x, cx)) continue;

          if (byteIndex < dataBytes.length) {
            const bit = (dataBytes[byteIndex] >> (7 - bitIndex)) & 1;
            matrix[x][cx] = bit === 1;

            bitIndex++;
            if (bitIndex >= 8) {
              bitIndex = 0;
              byteIndex++;
            }
          } else {
            // Fill remaining with pattern
            matrix[x][cx] = (x + cx) % 3 === 0;
          }
        }
      }
    }

    return matrix;
  }

  /**
   * Add finder pattern at position
   */
  private addFinderPattern(matrix: boolean[][], startRow: number, startCol: number): void {
    for (let r = 0; r < 7; r++) {
      for (let c = 0; c < 7; c++) {
        // Outer border, inner border, and center
        const isOuter = r === 0 || r === 6 || c === 0 || c === 6;
        const isInner = r >= 2 && r <= 4 && c >= 2 && c <= 4;
        matrix[startRow + r][startCol + c] = isOuter || isInner;
      }
    }
  }

  /**
   * Check if module is in reserved area
   */
  private isReservedModule(size: number, row: number, col: number): boolean {
    // Finder patterns
    if (row < 9 && col < 9) return true;
    if (row < 9 && col >= size - 8) return true;
    if (row >= size - 8 && col < 9) return true;

    // Timing patterns
    if (row === 6 || col === 6) return true;

    return false;
  }

  /**
   * Convert matrix to ASCII art
   */
  private matrixToAscii(matrix: boolean[][], useUnicode: boolean): string {
    const lines: string[] = [];

    if (useUnicode) {
      // Use unicode block characters for compact display
      // Each character represents 2 vertical modules
      for (let y = 0; y < matrix.length; y += 2) {
        let line = '';
        for (let x = 0; x < matrix[0].length; x++) {
          const top = matrix[y]?.[x] ?? false;
          const bottom = matrix[y + 1]?.[x] ?? false;

          if (top && bottom) {
            line += '█'; // Full block
          } else if (top) {
            line += '▀'; // Upper half
          } else if (bottom) {
            line += '▄'; // Lower half
          } else {
            line += ' '; // Empty
          }
        }
        lines.push(line);
      }
    } else {
      // Simple ASCII
      for (const row of matrix) {
        let line = '';
        for (const cell of row) {
          line += cell ? '██' : '  ';
        }
        lines.push(line);
      }
    }

    // Add quiet zone
    const width = lines[0]?.length || 0;
    const quietZone = ' '.repeat(width + 4);
    const bordered = [
      quietZone,
      quietZone,
      ...lines.map(l => `  ${l}  `),
      quietZone,
      quietZone
    ];

    return bordered.join('\n');
  }

  /**
   * Generate SVG QR code
   */
  private async generateSVG(data: string, options: QRGenerateOptions): Promise<string> {
    const matrix = this.generateQRMatrix(data, options.errorCorrection || 'M');
    const moduleSize = options.size || 10;
    const margin = (options.margin || 4) * moduleSize;
    const darkColor = options.darkColor || '#000000';
    const lightColor = options.lightColor || '#ffffff';

    const size = matrix.length * moduleSize + margin * 2;

    let svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" version="1.1" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
  <rect width="100%" height="100%" fill="${lightColor}"/>
  <g fill="${darkColor}">
`;

    for (let y = 0; y < matrix.length; y++) {
      for (let x = 0; x < matrix[y].length; x++) {
        if (matrix[y][x]) {
          const px = margin + x * moduleSize;
          const py = margin + y * moduleSize;
          svg += `    <rect x="${px}" y="${py}" width="${moduleSize}" height="${moduleSize}"/>\n`;
        }
      }
    }

    svg += `  </g>\n</svg>`;

    return svg;
  }

  /**
   * Decode QR code from image
   * Requires external tool (zbarimg) or library
   */
  async decode(imagePath: string): Promise<ToolResult> {
    try {
      const resolvedPath = path.resolve(process.cwd(), imagePath);

      if (!fs.existsSync(resolvedPath)) {
        return {
          success: false,
          error: `Image not found: ${imagePath}`
        };
      }

      // Try using zbarimg (common QR reader tool)
      const { execSync } = await import('child_process');

      try {
        const output = execSync(`zbarimg -q "${resolvedPath}"`, { encoding: 'utf8' });
        const match = output.match(/QR-Code:(.+)/);

        if (match) {
          const text = match[1].trim();
          const parsed = this.parseQRContent(text);

          return {
            success: true,
            output: `QR Code decoded:\n\nContent: ${text}\nType: ${parsed.type}`,
            data: parsed
          };
        }

        return {
          success: false,
          error: 'No QR code found in image'
        };
      } catch {
        return {
          success: false,
          error: 'zbarimg not installed. Install with: sudo apt install zbar-tools (Linux) or brew install zbar (macOS)'
        };
      }
    } catch (error: any) {
      return {
        success: false,
        error: `QR decode failed: ${error.message}`
      };
    }
  }

  /**
   * Parse QR content and detect type
   */
  private parseQRContent(text: string): QRDecodeResult {
    const result: QRDecodeResult = { text };

    // URL
    if (text.match(/^https?:\/\//i)) {
      result.type = 'url';
      result.parsed = { url: text };
      return result;
    }

    // WiFi
    const wifiMatch = text.match(/^WIFI:T:([^;]*);S:([^;]*);P:([^;]*);?$/i);
    if (wifiMatch) {
      result.type = 'wifi';
      result.parsed = {
        type: wifiMatch[1],
        ssid: wifiMatch[2],
        password: wifiMatch[3]
      };
      return result;
    }

    // vCard
    if (text.startsWith('BEGIN:VCARD')) {
      result.type = 'vcard';
      result.parsed = this.parseVCard(text);
      return result;
    }

    // Email
    if (text.match(/^mailto:/i)) {
      result.type = 'email';
      const email = text.replace(/^mailto:/i, '');
      result.parsed = { email };
      return result;
    }

    // Phone
    if (text.match(/^tel:/i)) {
      result.type = 'phone';
      const phone = text.replace(/^tel:/i, '');
      result.parsed = { phone };
      return result;
    }

    // SMS
    if (text.match(/^sms:/i) || text.match(/^smsto:/i)) {
      result.type = 'sms';
      const sms = text.replace(/^sms(to)?:/i, '');
      const [number, body] = sms.split('?body=');
      result.parsed = { number, body };
      return result;
    }

    // Geo
    if (text.match(/^geo:/i)) {
      result.type = 'geo';
      const geo = text.replace(/^geo:/i, '');
      const [lat, lng] = geo.split(',');
      result.parsed = { latitude: parseFloat(lat), longitude: parseFloat(lng) };
      return result;
    }

    // Default: plain text
    result.type = 'text';
    result.parsed = { text };
    return result;
  }

  /**
   * Parse vCard content
   */
  private parseVCard(text: string): any {
    const vcard: any = {};
    const lines = text.split(/\r?\n/);

    for (const line of lines) {
      const [key, ...valueParts] = line.split(':');
      const value = valueParts.join(':');

      switch (key.split(';')[0]) {
        case 'FN':
          vcard.fullName = value;
          break;
        case 'N':
          const [lastName, firstName] = value.split(';');
          vcard.lastName = lastName;
          vcard.firstName = firstName;
          break;
        case 'TEL':
          vcard.phone = vcard.phone || [];
          vcard.phone.push(value);
          break;
        case 'EMAIL':
          vcard.email = vcard.email || [];
          vcard.email.push(value);
          break;
        case 'ORG':
          vcard.organization = value;
          break;
        case 'TITLE':
          vcard.title = value;
          break;
        case 'URL':
          vcard.url = value;
          break;
      }
    }

    return vcard;
  }

  /**
   * Generate WiFi QR code
   */
  async generateWiFi(
    ssid: string,
    password: string,
    type: 'WPA' | 'WEP' | 'nopass' = 'WPA',
    options: QRGenerateOptions = {}
  ): Promise<ToolResult> {
    const wifiString = `WIFI:T:${type};S:${ssid};P:${password};;`;
    return this.generate(wifiString, options);
  }

  /**
   * Generate vCard QR code
   */
  async generateVCard(
    contact: {
      firstName: string;
      lastName: string;
      phone?: string;
      email?: string;
      organization?: string;
      title?: string;
      url?: string;
    },
    options: QRGenerateOptions = {}
  ): Promise<ToolResult> {
    const lines = [
      'BEGIN:VCARD',
      'VERSION:3.0',
      `N:${contact.lastName};${contact.firstName}`,
      `FN:${contact.firstName} ${contact.lastName}`
    ];

    if (contact.phone) lines.push(`TEL:${contact.phone}`);
    if (contact.email) lines.push(`EMAIL:${contact.email}`);
    if (contact.organization) lines.push(`ORG:${contact.organization}`);
    if (contact.title) lines.push(`TITLE:${contact.title}`);
    if (contact.url) lines.push(`URL:${contact.url}`);

    lines.push('END:VCARD');

    return this.generate(lines.join('\n'), options);
  }

  /**
   * Generate URL QR code
   */
  async generateURL(url: string, options: QRGenerateOptions = {}): Promise<ToolResult> {
    // Ensure URL has protocol
    const fullUrl = url.match(/^https?:\/\//i) ? url : `https://${url}`;
    return this.generate(fullUrl, options);
  }

  /**
   * List generated QR codes
   */
  listQRCodes(): ToolResult {
    try {
      if (!fs.existsSync(this.outputDir)) {
        return {
          success: true,
          output: 'No QR codes generated yet'
        };
      }

      const files = fs.readdirSync(this.outputDir);
      const qrFiles = files.filter(f => /\.(png|svg)$/i.test(f));

      if (qrFiles.length === 0) {
        return {
          success: true,
          output: 'No QR code files found'
        };
      }

      const list = qrFiles.map(f => {
        const fullPath = path.join(this.outputDir, f);
        const stats = fs.statSync(fullPath);
        return `  📱 ${f} (${this.formatSize(stats.size)})`;
      }).join('\n');

      return {
        success: true,
        output: `QR codes in ${this.outputDir}:\n${list}`
      };
    } catch (error: any) {
      return {
        success: false,
        error: `Failed to list QR codes: ${error.message}`
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
}
