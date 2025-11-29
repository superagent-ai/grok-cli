import fs from 'fs';
import path from 'path';
import { ToolResult } from '../types';

export interface AudioInfo {
  filename: string;
  format: string;
  duration?: number;
  sampleRate?: number;
  channels?: number;
  bitrate?: number;
  size: string;
}

export interface TranscriptionResult {
  text: string;
  language?: string;
  confidence?: number;
  segments?: TranscriptionSegment[];
}

export interface TranscriptionSegment {
  start: number;
  end: number;
  text: string;
}

/**
 * Audio Tool for processing and analyzing audio files
 * Supports transcription via external APIs and local analysis
 */
export class AudioTool {
  private readonly supportedFormats = ['.mp3', '.wav', '.ogg', '.m4a', '.flac', '.aac', '.wma', '.webm'];
  private readonly maxFileSizeMB = 100; // 100MB max

  /**
   * Get audio file information
   */
  async getInfo(filePath: string): Promise<ToolResult> {
    try {
      const resolvedPath = path.resolve(process.cwd(), filePath);

      if (!fs.existsSync(resolvedPath)) {
        return {
          success: false,
          error: `Audio file not found: ${filePath}`
        };
      }

      const ext = path.extname(resolvedPath).toLowerCase();
      if (!this.supportedFormats.includes(ext)) {
        return {
          success: false,
          error: `Unsupported audio format: ${ext}. Supported: ${this.supportedFormats.join(', ')}`
        };
      }

      const stats = fs.statSync(resolvedPath);
      const buffer = fs.readFileSync(resolvedPath);

      const info: AudioInfo = {
        filename: path.basename(filePath),
        format: ext.slice(1).toUpperCase(),
        size: this.formatSize(stats.size)
      };

      // Try to extract metadata based on format
      if (ext === '.wav') {
        const wavInfo = this.parseWavHeader(buffer);
        Object.assign(info, wavInfo);
      } else if (ext === '.mp3') {
        const mp3Info = this.parseMp3Header(buffer);
        Object.assign(info, mp3Info);
      }

      return {
        success: true,
        output: this.formatAudioInfo(info),
        data: info
      };
    } catch (error: any) {
      return {
        success: false,
        error: `Failed to get audio info: ${error.message}`
      };
    }
  }

  /**
   * Parse WAV file header
   */
  private parseWavHeader(buffer: Buffer): Partial<AudioInfo> {
    try {
      if (buffer.toString('ascii', 0, 4) !== 'RIFF') {
        return {};
      }

      const channels = buffer.readUInt16LE(22);
      const sampleRate = buffer.readUInt32LE(24);
      const byteRate = buffer.readUInt32LE(28);
      const _bitsPerSample = buffer.readUInt16LE(34);
      const dataSize = buffer.readUInt32LE(40);

      const duration = dataSize / byteRate;
      const bitrate = Math.round(byteRate * 8 / 1000);

      return {
        sampleRate,
        channels,
        bitrate,
        duration: Math.round(duration * 100) / 100
      };
    } catch {
      return {};
    }
  }

  /**
   * Parse MP3 file header (basic)
   */
  private parseMp3Header(buffer: Buffer): Partial<AudioInfo> {
    try {
      // Look for MP3 frame sync
      let offset = 0;
      while (offset < buffer.length - 4) {
        if (buffer[offset] === 0xFF && (buffer[offset + 1] & 0xE0) === 0xE0) {
          // Found frame sync
          const header = buffer.readUInt32BE(offset);

          // Extract bitrate index and sample rate index
          const bitrateIndex = (header >> 12) & 0x0F;
          const sampleRateIndex = (header >> 10) & 0x03;
          const channelMode = (header >> 6) & 0x03;

          // Bitrate table for MPEG Audio Layer III
          const bitrates = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0];
          const sampleRates = [44100, 48000, 32000, 0];

          const bitrate = bitrates[bitrateIndex];
          const sampleRate = sampleRates[sampleRateIndex];
          const channels = channelMode === 3 ? 1 : 2;

          // Estimate duration
          const duration = buffer.length * 8 / (bitrate * 1000);

          return {
            bitrate,
            sampleRate,
            channels,
            duration: Math.round(duration * 100) / 100
          };
        }
        offset++;
      }
      return {};
    } catch {
      return {};
    }
  }

  /**
   * Transcribe audio using Whisper API (if available)
   */
  async transcribe(filePath: string, options: { language?: string; prompt?: string } = {}): Promise<ToolResult> {
    try {
      const resolvedPath = path.resolve(process.cwd(), filePath);

      if (!fs.existsSync(resolvedPath)) {
        return {
          success: false,
          error: `Audio file not found: ${filePath}`
        };
      }

      const ext = path.extname(resolvedPath).toLowerCase();
      if (!this.supportedFormats.includes(ext)) {
        return {
          success: false,
          error: `Unsupported audio format: ${ext}`
        };
      }

      const stats = fs.statSync(resolvedPath);
      const fileSizeMB = stats.size / (1024 * 1024);
      if (fileSizeMB > this.maxFileSizeMB) {
        return {
          success: false,
          error: `Audio file too large: ${fileSizeMB.toFixed(2)}MB. Max: ${this.maxFileSizeMB}MB`
        };
      }

      // Check for OpenAI API key (Whisper)
      const openaiKey = process.env.OPENAI_API_KEY;
      if (openaiKey) {
        return await this.transcribeWithWhisper(resolvedPath, openaiKey, options);
      }

      // Check for Grok API (if it supports transcription)
      const grokKey = process.env.GROK_API_KEY;
      if (grokKey) {
        // Grok doesn't natively support audio transcription yet
        // Return instruction for user
        return {
          success: false,
          error: 'Audio transcription requires OpenAI API key (OPENAI_API_KEY). Set it in your environment or .env file to enable Whisper transcription.'
        };
      }

      return {
        success: false,
        error: 'No transcription API available. Set OPENAI_API_KEY for Whisper transcription.'
      };
    } catch (error: any) {
      return {
        success: false,
        error: `Transcription failed: ${error.message}`
      };
    }
  }

  /**
   * Transcribe using OpenAI Whisper API
   */
  private async transcribeWithWhisper(
    filePath: string,
    apiKey: string,
    options: { language?: string; prompt?: string }
  ): Promise<ToolResult> {
    const FormData = (await import('form-data')).default;
    const axios = (await import('axios')).default;

    const form = new FormData();
    form.append('file', fs.createReadStream(filePath));
    form.append('model', 'whisper-1');

    if (options.language) {
      form.append('language', options.language);
    }
    if (options.prompt) {
      form.append('prompt', options.prompt);
    }
    form.append('response_format', 'verbose_json');

    try {
      const response = await axios.post(
        'https://api.openai.com/v1/audio/transcriptions',
        form,
        {
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            ...form.getHeaders()
          },
          timeout: 300000, // 5 minutes
          maxContentLength: Infinity,
          maxBodyLength: Infinity
        }
      );

      const result: TranscriptionResult = {
        text: response.data.text,
        language: response.data.language,
        segments: response.data.segments?.map((seg: any) => ({
          start: seg.start,
          end: seg.end,
          text: seg.text
        }))
      };

      return {
        success: true,
        output: this.formatTranscription(result, filePath),
        data: result
      };
    } catch (error: any) {
      const errorMsg = error.response?.data?.error?.message || error.message;
      return {
        success: false,
        error: `Whisper transcription failed: ${errorMsg}`
      };
    }
  }

  /**
   * Convert audio to base64
   */
  async toBase64(filePath: string): Promise<ToolResult> {
    try {
      const resolvedPath = path.resolve(process.cwd(), filePath);

      if (!fs.existsSync(resolvedPath)) {
        return {
          success: false,
          error: `Audio file not found: ${filePath}`
        };
      }

      const ext = path.extname(resolvedPath).toLowerCase();
      const buffer = fs.readFileSync(resolvedPath);
      const base64 = buffer.toString('base64');

      const mimeTypes: Record<string, string> = {
        '.mp3': 'audio/mpeg',
        '.wav': 'audio/wav',
        '.ogg': 'audio/ogg',
        '.m4a': 'audio/mp4',
        '.flac': 'audio/flac',
        '.aac': 'audio/aac',
        '.wma': 'audio/x-ms-wma',
        '.webm': 'audio/webm'
      };

      return {
        success: true,
        output: `Audio converted to base64 (${base64.length} characters)`,
        data: {
          base64,
          mediaType: mimeTypes[ext] || 'audio/mpeg',
          filename: path.basename(filePath)
        }
      };
    } catch (error: any) {
      return {
        success: false,
        error: `Failed to convert audio to base64: ${error.message}`
      };
    }
  }

  /**
   * List audio files in directory
   */
  listAudioFiles(dirPath: string = '.'): ToolResult {
    try {
      const resolvedPath = path.resolve(process.cwd(), dirPath);

      if (!fs.existsSync(resolvedPath)) {
        return {
          success: false,
          error: `Directory not found: ${dirPath}`
        };
      }

      const files = fs.readdirSync(resolvedPath);
      const audioFiles = files.filter(f => {
        const ext = path.extname(f).toLowerCase();
        return this.supportedFormats.includes(ext);
      });

      if (audioFiles.length === 0) {
        return {
          success: true,
          output: `No audio files found in ${dirPath}`
        };
      }

      const audioList = audioFiles.map(file => {
        const fullPath = path.join(resolvedPath, file);
        const stats = fs.statSync(fullPath);
        return `  🎵 ${file} (${this.formatSize(stats.size)})`;
      }).join('\n');

      return {
        success: true,
        output: `Audio files in ${dirPath}:\n${audioList}`
      };
    } catch (error: any) {
      return {
        success: false,
        error: `Failed to list audio files: ${error.message}`
      };
    }
  }

  /**
   * Check if file is an audio file
   */
  isAudio(filePath: string): boolean {
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

  /**
   * Format audio info for display
   */
  private formatAudioInfo(info: AudioInfo): string {
    const lines = [
      `🎵 Audio: ${info.filename}`,
      `   Format: ${info.format}`,
      `   Size: ${info.size}`
    ];

    if (info.duration) {
      const minutes = Math.floor(info.duration / 60);
      const seconds = Math.round(info.duration % 60);
      lines.push(`   Duration: ${minutes}:${seconds.toString().padStart(2, '0')}`);
    }
    if (info.sampleRate) {
      lines.push(`   Sample Rate: ${info.sampleRate} Hz`);
    }
    if (info.channels) {
      lines.push(`   Channels: ${info.channels} (${info.channels === 1 ? 'Mono' : 'Stereo'})`);
    }
    if (info.bitrate) {
      lines.push(`   Bitrate: ${info.bitrate} kbps`);
    }

    return lines.join('\n');
  }

  /**
   * Format transcription for display
   */
  private formatTranscription(result: TranscriptionResult, filePath: string): string {
    const lines = [
      `🎤 Transcription: ${path.basename(filePath)}`
    ];

    if (result.language) {
      lines.push(`   Language: ${result.language}`);
    }

    lines.push('');
    lines.push('--- Transcript ---');
    lines.push(result.text);

    if (result.segments && result.segments.length > 0) {
      lines.push('');
      lines.push('--- Segments ---');
      for (const seg of result.segments.slice(0, 10)) {
        const startTime = this.formatTime(seg.start);
        const endTime = this.formatTime(seg.end);
        lines.push(`[${startTime} -> ${endTime}] ${seg.text}`);
      }
      if (result.segments.length > 10) {
        lines.push(`... and ${result.segments.length - 10} more segments`);
      }
    }

    return lines.join('\n');
  }

  /**
   * Format time in MM:SS format
   */
  private formatTime(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }
}
