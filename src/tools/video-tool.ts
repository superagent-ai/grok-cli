import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { ToolResult } from '../types';

export interface VideoInfo {
  filename: string;
  format: string;
  duration?: number;
  width?: number;
  height?: number;
  fps?: number;
  bitrate?: number;
  codec?: string;
  size: string;
}

export interface FrameExtraction {
  frames: ExtractedFrame[];
  totalFrames: number;
  outputDir: string;
}

export interface ExtractedFrame {
  path: string;
  timestamp: number;
  frameNumber: number;
}

/**
 * Video Tool for processing and analyzing video files
 * Supports frame extraction, metadata reading, and video analysis
 */
export class VideoTool {
  private readonly supportedFormats = ['.mp4', '.mkv', '.avi', '.mov', '.webm', '.flv', '.wmv', '.m4v', '.mpeg', '.mpg'];
  private readonly _maxFileSizeMB = 500; // 500MB max

  /**
   * Get video file information
   */
  async getInfo(filePath: string): Promise<ToolResult> {
    try {
      const resolvedPath = path.resolve(process.cwd(), filePath);

      if (!fs.existsSync(resolvedPath)) {
        return {
          success: false,
          error: `Video file not found: ${filePath}`
        };
      }

      const ext = path.extname(resolvedPath).toLowerCase();
      if (!this.supportedFormats.includes(ext)) {
        return {
          success: false,
          error: `Unsupported video format: ${ext}. Supported: ${this.supportedFormats.join(', ')}`
        };
      }

      const stats = fs.statSync(resolvedPath);

      // Try to get detailed info with ffprobe
      const ffprobeInfo = await this.getFFProbeInfo(resolvedPath);

      const info: VideoInfo = {
        filename: path.basename(filePath),
        format: ext.slice(1).toUpperCase(),
        size: this.formatSize(stats.size),
        ...ffprobeInfo
      };

      return {
        success: true,
        output: this.formatVideoInfo(info),
        data: info
      };
    } catch (error: any) {
      return {
        success: false,
        error: `Failed to get video info: ${error.message}`
      };
    }
  }

  /**
   * Get video info using ffprobe
   */
  private async getFFProbeInfo(filePath: string): Promise<Partial<VideoInfo>> {
    return new Promise((resolve) => {
      const ffprobe = spawn('ffprobe', [
        '-v', 'quiet',
        '-print_format', 'json',
        '-show_format',
        '-show_streams',
        filePath
      ]);

      let output = '';
      let errorOutput = '';

      ffprobe.stdout.on('data', (data) => {
        output += data.toString();
      });

      ffprobe.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });

      ffprobe.on('close', (code) => {
        if (code !== 0 || !output) {
          resolve({});
          return;
        }

        try {
          const data = JSON.parse(output);
          const videoStream = data.streams?.find((s: any) => s.codec_type === 'video');
          const format = data.format;

          const info: Partial<VideoInfo> = {};

          if (format?.duration) {
            info.duration = parseFloat(format.duration);
          }

          if (videoStream) {
            info.width = videoStream.width;
            info.height = videoStream.height;
            info.codec = videoStream.codec_name;

            if (videoStream.r_frame_rate) {
              const [num, den] = videoStream.r_frame_rate.split('/');
              info.fps = Math.round(parseInt(num) / parseInt(den));
            }
          }

          if (format?.bit_rate) {
            info.bitrate = Math.round(parseInt(format.bit_rate) / 1000);
          }

          resolve(info);
        } catch {
          resolve({});
        }
      });

      ffprobe.on('error', () => {
        resolve({});
      });

      // Timeout after 10 seconds
      setTimeout(() => {
        ffprobe.kill();
        resolve({});
      }, 10000);
    });
  }

  /**
   * Extract frames from video
   */
  async extractFrames(
    filePath: string,
    options: {
      interval?: number; // Seconds between frames
      count?: number; // Total frames to extract
      timestamps?: number[]; // Specific timestamps
      outputDir?: string;
      format?: 'jpg' | 'png';
    } = {}
  ): Promise<ToolResult> {
    try {
      const resolvedPath = path.resolve(process.cwd(), filePath);

      if (!fs.existsSync(resolvedPath)) {
        return {
          success: false,
          error: `Video file not found: ${filePath}`
        };
      }

      const ext = path.extname(resolvedPath).toLowerCase();
      if (!this.supportedFormats.includes(ext)) {
        return {
          success: false,
          error: `Unsupported video format: ${ext}`
        };
      }

      // Check for ffmpeg
      const ffmpegAvailable = await this.checkFFmpeg();
      if (!ffmpegAvailable) {
        return {
          success: false,
          error: 'ffmpeg is required for frame extraction. Please install ffmpeg.'
        };
      }

      const outputDir = options.outputDir || path.join(process.cwd(), '.grok', 'frames', path.basename(filePath, ext));
      fs.mkdirSync(outputDir, { recursive: true });

      const format = options.format || 'jpg';
      const frames: ExtractedFrame[] = [];

      if (options.timestamps && options.timestamps.length > 0) {
        // Extract specific timestamps
        for (let i = 0; i < options.timestamps.length; i++) {
          const timestamp = options.timestamps[i];
          const outputPath = path.join(outputDir, `frame_${i + 1}.${format}`);
          await this.extractFrameAtTimestamp(resolvedPath, timestamp, outputPath);
          frames.push({
            path: outputPath,
            timestamp,
            frameNumber: i + 1
          });
        }
      } else {
        // Extract frames at intervals
        const videoInfo = await this.getFFProbeInfo(resolvedPath);
        const duration = videoInfo.duration || 60;

        let interval = options.interval || 10;
        let count = options.count || Math.min(10, Math.ceil(duration / interval));

        if (options.count) {
          interval = duration / count;
        }

        for (let i = 0; i < count; i++) {
          const timestamp = i * interval;
          if (timestamp >= duration) break;

          const outputPath = path.join(outputDir, `frame_${i + 1}.${format}`);
          await this.extractFrameAtTimestamp(resolvedPath, timestamp, outputPath);
          frames.push({
            path: outputPath,
            timestamp,
            frameNumber: i + 1
          });
        }
      }

      const result: FrameExtraction = {
        frames,
        totalFrames: frames.length,
        outputDir
      };

      return {
        success: true,
        output: this.formatFrameExtraction(result),
        data: result
      };
    } catch (error: any) {
      return {
        success: false,
        error: `Frame extraction failed: ${error.message}`
      };
    }
  }

  /**
   * Extract a single frame at a specific timestamp
   */
  private extractFrameAtTimestamp(videoPath: string, timestamp: number, outputPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const ffmpeg = spawn('ffmpeg', [
        '-y',
        '-ss', timestamp.toString(),
        '-i', videoPath,
        '-vframes', '1',
        '-q:v', '2',
        outputPath
      ]);

      ffmpeg.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`ffmpeg exited with code ${code}`));
        }
      });

      ffmpeg.on('error', reject);

      // Timeout after 30 seconds
      setTimeout(() => {
        ffmpeg.kill();
        reject(new Error('Frame extraction timeout'));
      }, 30000);
    });
  }

  /**
   * Create a thumbnail from video
   */
  async createThumbnail(filePath: string, timestamp: number = 1, outputPath?: string): Promise<ToolResult> {
    try {
      const resolvedPath = path.resolve(process.cwd(), filePath);

      if (!fs.existsSync(resolvedPath)) {
        return {
          success: false,
          error: `Video file not found: ${filePath}`
        };
      }

      const ffmpegAvailable = await this.checkFFmpeg();
      if (!ffmpegAvailable) {
        return {
          success: false,
          error: 'ffmpeg is required for thumbnail creation.'
        };
      }

      const ext = path.extname(resolvedPath);
      const thumbPath = outputPath || resolvedPath.replace(ext, '_thumb.jpg');

      await this.extractFrameAtTimestamp(resolvedPath, timestamp, thumbPath);

      return {
        success: true,
        output: `Thumbnail created: ${thumbPath}`,
        data: { path: thumbPath, timestamp }
      };
    } catch (error: any) {
      return {
        success: false,
        error: `Thumbnail creation failed: ${error.message}`
      };
    }
  }

  /**
   * Extract audio from video
   */
  async extractAudio(filePath: string, outputPath?: string): Promise<ToolResult> {
    try {
      const resolvedPath = path.resolve(process.cwd(), filePath);

      if (!fs.existsSync(resolvedPath)) {
        return {
          success: false,
          error: `Video file not found: ${filePath}`
        };
      }

      const ffmpegAvailable = await this.checkFFmpeg();
      if (!ffmpegAvailable) {
        return {
          success: false,
          error: 'ffmpeg is required for audio extraction.'
        };
      }

      const ext = path.extname(resolvedPath);
      const audioPath = outputPath || resolvedPath.replace(ext, '.mp3');

      return new Promise((resolve) => {
        const ffmpeg = spawn('ffmpeg', [
          '-y',
          '-i', resolvedPath,
          '-vn',
          '-acodec', 'libmp3lame',
          '-q:a', '2',
          audioPath
        ]);

        ffmpeg.on('close', (code) => {
          if (code === 0) {
            resolve({
              success: true,
              output: `Audio extracted to: ${audioPath}`,
              data: { path: audioPath }
            });
          } else {
            resolve({
              success: false,
              error: `Audio extraction failed with code ${code}`
            });
          }
        });

        ffmpeg.on('error', (err) => {
          resolve({
            success: false,
            error: `Audio extraction error: ${err.message}`
          });
        });
      });
    } catch (error: any) {
      return {
        success: false,
        error: `Audio extraction failed: ${error.message}`
      };
    }
  }

  /**
   * Check if ffmpeg is available
   */
  private async checkFFmpeg(): Promise<boolean> {
    return new Promise((resolve) => {
      const ffmpeg = spawn('ffmpeg', ['-version']);

      ffmpeg.on('close', (code) => {
        resolve(code === 0);
      });

      ffmpeg.on('error', () => {
        resolve(false);
      });
    });
  }

  /**
   * List video files in directory
   */
  listVideos(dirPath: string = '.'): ToolResult {
    try {
      const resolvedPath = path.resolve(process.cwd(), dirPath);

      if (!fs.existsSync(resolvedPath)) {
        return {
          success: false,
          error: `Directory not found: ${dirPath}`
        };
      }

      const files = fs.readdirSync(resolvedPath);
      const videos = files.filter(f => {
        const ext = path.extname(f).toLowerCase();
        return this.supportedFormats.includes(ext);
      });

      if (videos.length === 0) {
        return {
          success: true,
          output: `No video files found in ${dirPath}`
        };
      }

      const videoList = videos.map(video => {
        const fullPath = path.join(resolvedPath, video);
        const stats = fs.statSync(fullPath);
        return `  🎬 ${video} (${this.formatSize(stats.size)})`;
      }).join('\n');

      return {
        success: true,
        output: `Video files in ${dirPath}:\n${videoList}`
      };
    } catch (error: any) {
      return {
        success: false,
        error: `Failed to list videos: ${error.message}`
      };
    }
  }

  /**
   * Check if file is a video
   */
  isVideo(filePath: string): boolean {
    const ext = path.extname(filePath).toLowerCase();
    return this.supportedFormats.includes(ext);
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
   * Format duration
   */
  private formatDuration(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  }

  /**
   * Format video info for display
   */
  private formatVideoInfo(info: VideoInfo): string {
    const lines = [
      `🎬 Video: ${info.filename}`,
      `   Format: ${info.format}`,
      `   Size: ${info.size}`
    ];

    if (info.duration) {
      lines.push(`   Duration: ${this.formatDuration(info.duration)}`);
    }
    if (info.width && info.height) {
      lines.push(`   Resolution: ${info.width}x${info.height}`);
    }
    if (info.fps) {
      lines.push(`   Frame Rate: ${info.fps} fps`);
    }
    if (info.codec) {
      lines.push(`   Codec: ${info.codec}`);
    }
    if (info.bitrate) {
      lines.push(`   Bitrate: ${info.bitrate} kbps`);
    }

    return lines.join('\n');
  }

  /**
   * Format frame extraction result
   */
  private formatFrameExtraction(result: FrameExtraction): string {
    const lines = [
      `🎞️ Extracted ${result.totalFrames} frames`,
      `   Output directory: ${result.outputDir}`,
      ''
    ];

    for (const frame of result.frames) {
      lines.push(`   Frame ${frame.frameNumber}: ${this.formatDuration(frame.timestamp)} -> ${path.basename(frame.path)}`);
    }

    return lines.join('\n');
  }
}
