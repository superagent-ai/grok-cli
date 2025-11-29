import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import fs from 'fs';
import path from 'path';
import os from 'os';

export interface VoiceInputConfig {
  enabled: boolean;
  provider: 'whisper-local' | 'whisper-api' | 'system';
  language?: string;
  model?: string;
  apiKey?: string;
  hotkey?: string;
  autoSend?: boolean;
  silenceThreshold?: number;
  silenceDuration?: number;
}

export interface TranscriptionResult {
  success: boolean;
  text?: string;
  confidence?: number;
  language?: string;
  duration?: number;
  error?: string;
}

export interface VoiceInputState {
  isRecording: boolean;
  isProcessing: boolean;
  lastTranscription?: string;
  errorCount: number;
}

/**
 * Enhanced Voice Input - Inspired by Aider
 * Supports multiple speech-to-text backends
 */
export class VoiceInputManager extends EventEmitter {
  private config: VoiceInputConfig;
  private state: VoiceInputState;
  private recordingProcess: ChildProcess | null = null;
  private tempDir: string;

  constructor(config: Partial<VoiceInputConfig> = {}) {
    super();

    this.config = {
      enabled: config.enabled ?? false,
      provider: config.provider || 'system',
      language: config.language || 'en',
      model: config.model || 'base',
      hotkey: config.hotkey || 'ctrl+shift+v',
      autoSend: config.autoSend ?? true,
      silenceThreshold: config.silenceThreshold || 0.01,
      silenceDuration: config.silenceDuration || 1500
    };

    this.state = {
      isRecording: false,
      isProcessing: false,
      errorCount: 0
    };

    this.tempDir = path.join(os.tmpdir(), 'grok-voice');
    this.ensureTempDir();
    this.loadConfig();
  }

  /**
   * Ensure temp directory exists
   */
  private ensureTempDir(): void {
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }
  }

  /**
   * Load voice config from settings
   */
  private loadConfig(): void {
    const configPath = path.join(os.homedir(), '.grok', 'voice-config.json');

    if (fs.existsSync(configPath)) {
      try {
        const saved = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        this.config = { ...this.config, ...saved };
      } catch (error) {
        // Use defaults
      }
    }
  }

  /**
   * Save voice config
   */
  saveConfig(): void {
    const configDir = path.join(os.homedir(), '.grok');
    const configPath = path.join(configDir, 'voice-config.json');

    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }

    fs.writeFileSync(configPath, JSON.stringify(this.config, null, 2));
  }

  /**
   * Check if voice input is available
   */
  async isAvailable(): Promise<{ available: boolean; reason?: string }> {
    // Check for required system tools
    const tools = ['sox', 'ffmpeg'];
    const missingTools: string[] = [];

    for (const tool of tools) {
      try {
        await this.checkCommand(tool);
      } catch {
        missingTools.push(tool);
      }
    }

    if (missingTools.length > 0) {
      return {
        available: false,
        reason: `Missing required tools: ${missingTools.join(', ')}. Install with: brew install ${missingTools.join(' ')} (macOS) or apt-get install ${missingTools.join(' ')} (Linux)`
      };
    }

    // Check for Whisper if using local provider
    if (this.config.provider === 'whisper-local') {
      try {
        await this.checkCommand('whisper');
      } catch {
        return {
          available: false,
          reason: 'Whisper not found. Install with: pip install openai-whisper'
        };
      }
    }

    // Check for API key if using whisper-api
    if (this.config.provider === 'whisper-api' && !this.config.apiKey) {
      return {
        available: false,
        reason: 'OpenAI API key required for Whisper API. Set in voice config or OPENAI_API_KEY env var.'
      };
    }

    return { available: true };
  }

  /**
   * Check if a command exists
   */
  private checkCommand(command: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const check = spawn('which', [command]);
      check.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`${command} not found`));
      });
    });
  }

  /**
   * Start recording audio
   */
  async startRecording(): Promise<void> {
    if (this.state.isRecording) {
      return;
    }

    const availability = await this.isAvailable();
    if (!availability.available) {
      this.emit('error', new Error(availability.reason));
      return;
    }

    this.state.isRecording = true;
    this.emit('recording-started');

    const audioFile = path.join(this.tempDir, `recording_${Date.now()}.wav`);

    // Use sox for recording (cross-platform)
    this.recordingProcess = spawn('sox', [
      '-d',  // Default audio device
      '-r', '16000',  // 16kHz sample rate (optimal for Whisper)
      '-c', '1',  // Mono
      '-b', '16',  // 16-bit
      audioFile,
      'silence', '1', '0.1', `${this.config.silenceThreshold ?? 0.01}%`,  // Start on sound
      '1', `${(this.config.silenceDuration ?? 1500) / 1000}`, `${this.config.silenceThreshold ?? 0.01}%`  // Stop on silence
    ]);

    this.recordingProcess.on('close', async () => {
      this.state.isRecording = false;

      if (fs.existsSync(audioFile)) {
        await this.processAudio(audioFile);
      }
    });

    this.recordingProcess.on('error', (error) => {
      this.state.isRecording = false;
      this.state.errorCount++;
      this.emit('error', error);
    });
  }

  /**
   * Stop recording
   */
  stopRecording(): void {
    if (this.recordingProcess) {
      this.recordingProcess.kill('SIGINT');
      this.recordingProcess = null;
    }
    this.state.isRecording = false;
    this.emit('recording-stopped');
  }

  /**
   * Process recorded audio
   */
  private async processAudio(audioFile: string): Promise<void> {
    this.state.isProcessing = true;
    this.emit('processing-started');

    try {
      let result: TranscriptionResult;

      switch (this.config.provider) {
        case 'whisper-local':
          result = await this.transcribeWithWhisperLocal(audioFile);
          break;
        case 'whisper-api':
          result = await this.transcribeWithWhisperAPI(audioFile);
          break;
        case 'system':
        default:
          result = await this.transcribeWithSystem(audioFile);
          break;
      }

      if (result.success && result.text) {
        this.state.lastTranscription = result.text;
        this.emit('transcription', result);
      } else {
        this.emit('error', new Error(result.error || 'Transcription failed'));
      }
    } catch (error) {
      this.state.errorCount++;
      this.emit('error', error);
    } finally {
      this.state.isProcessing = false;
      this.emit('processing-finished');

      // Clean up audio file
      try {
        fs.unlinkSync(audioFile);
      } catch {
        // Ignore cleanup errors
      }
    }
  }

  /**
   * Transcribe with local Whisper installation
   */
  private async transcribeWithWhisperLocal(audioFile: string): Promise<TranscriptionResult> {
    return new Promise((resolve) => {
      const args = [
        audioFile,
        '--model', this.config.model || 'base',
        '--language', this.config.language || 'en',
        '--output_format', 'txt',
        '--output_dir', this.tempDir
      ];

      const whisper = spawn('whisper', args);
      let stderr = '';

      whisper.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      whisper.on('close', (code) => {
        if (code === 0) {
          const txtFile = audioFile.replace('.wav', '.txt');
          if (fs.existsSync(txtFile)) {
            const text = fs.readFileSync(txtFile, 'utf-8').trim();
            try { fs.unlinkSync(txtFile); } catch (_e) { /* ignore cleanup errors */ }
            resolve({ success: true, text });
          } else {
            resolve({ success: false, error: 'Transcription file not found' });
          }
        } else {
          resolve({ success: false, error: stderr || 'Whisper failed' });
        }
      });
    });
  }

  /**
   * Transcribe with OpenAI Whisper API
   */
  private async transcribeWithWhisperAPI(audioFile: string): Promise<TranscriptionResult> {
    const apiKey = this.config.apiKey || process.env.OPENAI_API_KEY;

    if (!apiKey) {
      return { success: false, error: 'OpenAI API key not configured' };
    }

    try {
      const FormData = (await import('form-data')).default;
      const axios = (await import('axios')).default;

      const form = new FormData();
      form.append('file', fs.createReadStream(audioFile));
      form.append('model', 'whisper-1');
      if (this.config.language) {
        form.append('language', this.config.language);
      }

      const response = await axios.post(
        'https://api.openai.com/v1/audio/transcriptions',
        form,
        {
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            ...form.getHeaders()
          }
        }
      );

      return {
        success: true,
        text: response.data.text,
        language: response.data.language
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.response?.data?.error?.message || error.message
      };
    }
  }

  /**
   * Transcribe with system speech recognition (macOS)
   */
  private async transcribeWithSystem(_audioFile: string): Promise<TranscriptionResult> {
    // On macOS, we can use the built-in speech recognition
    if (process.platform === 'darwin') {
      return new Promise((resolve) => {
        // Use macOS dictation through AppleScript (limited but works without setup)
        const script = `
          tell application "System Events"
            -- This is a placeholder, actual implementation would use Speech framework
            return "System speech recognition not fully implemented. Use whisper-local or whisper-api provider."
          end tell
        `;

        const osascript = spawn('osascript', ['-e', script]);
        let stdout = '';

        osascript.stdout.on('data', (data) => {
          stdout += data.toString();
        });

        osascript.on('close', () => {
          resolve({
            success: false,
            error: 'System speech recognition requires manual setup. Please use whisper-local or whisper-api provider.'
          });
        });
      });
    }

    return {
      success: false,
      error: 'System speech recognition not available on this platform. Use whisper-local or whisper-api provider.'
    };
  }

  /**
   * Toggle recording (push-to-talk style)
   */
  toggleRecording(): void {
    if (this.state.isRecording) {
      this.stopRecording();
    } else {
      this.startRecording();
    }
  }

  /**
   * Get current state
   */
  getState(): VoiceInputState {
    return { ...this.state };
  }

  /**
   * Get configuration
   */
  getConfig(): VoiceInputConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  setConfig(config: Partial<VoiceInputConfig>): void {
    this.config = { ...this.config, ...config };
    this.saveConfig();
  }

  /**
   * Enable voice input
   */
  enable(): void {
    this.config.enabled = true;
    this.saveConfig();
  }

  /**
   * Disable voice input
   */
  disable(): void {
    this.config.enabled = false;
    this.stopRecording();
    this.saveConfig();
  }

  /**
   * Check if enabled
   */
  isEnabled(): boolean {
    return this.config.enabled;
  }

  /**
   * Format status for display
   */
  formatStatus(): string {
    let output = '🎤 Voice Input Status\n' + '═'.repeat(50) + '\n\n';
    output += `Status: ${this.config.enabled ? '✅ Enabled' : '❌ Disabled'}\n`;
    output += `Provider: ${this.config.provider}\n`;
    output += `Language: ${this.config.language || 'auto'}\n`;
    output += `Model: ${this.config.model || 'base'}\n`;
    output += `Hotkey: ${this.config.hotkey}\n`;
    output += `Auto-send: ${this.config.autoSend ? 'Yes' : 'No'}\n\n`;

    output += `Recording: ${this.state.isRecording ? '🔴 Recording...' : '⚪ Idle'}\n`;
    output += `Processing: ${this.state.isProcessing ? '⏳ Processing...' : '✅ Ready'}\n`;

    if (this.state.lastTranscription) {
      output += `\nLast: "${this.state.lastTranscription.substring(0, 50)}..."\n`;
    }

    output += '\n💡 Commands: /voice on|off|toggle|config';

    return output;
  }

  /**
   * Clean up resources
   */
  dispose(): void {
    this.stopRecording();
    // Clean up temp directory
    try {
      const files = fs.readdirSync(this.tempDir);
      for (const file of files) {
        fs.unlinkSync(path.join(this.tempDir, file));
      }
      fs.rmdirSync(this.tempDir);
    } catch {
      // Ignore cleanup errors
    }
  }
}

// Singleton instance
let voiceInputInstance: VoiceInputManager | null = null;

export function getVoiceInputManager(config?: Partial<VoiceInputConfig>): VoiceInputManager {
  if (!voiceInputInstance) {
    voiceInputInstance = new VoiceInputManager(config);
  }
  return voiceInputInstance;
}

export function resetVoiceInputManager(): void {
  if (voiceInputInstance) {
    voiceInputInstance.dispose();
  }
  voiceInputInstance = null;
}
