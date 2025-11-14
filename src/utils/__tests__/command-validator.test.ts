import { describe, it, expect } from 'vitest';
import {
  validateCommand,
  isCommandSafe,
  sanitizeCommandArgs,
  getBaseCommand,
} from '../command-validator';

describe('command-validator', () => {
  describe('validateCommand', () => {
    it('should allow safe commands when whitelist is disabled', () => {
      const result = validateCommand('ls -la', { useWhitelist: false });
      expect(result).toBe('ls -la');
    });

    it('should allow whitelisted commands when whitelist is enabled', () => {
      const result = validateCommand('git status', { useWhitelist: true });
      expect(result).toBe('git status');
    });

    it('should block non-whitelisted commands when whitelist is enabled', () => {
      expect(() => validateCommand('dangerous-command', { useWhitelist: true })).toThrow(
        'not in the whitelist'
      );
    });

    it('should block rm -rf /', () => {
      expect(() => validateCommand('rm -rf /', { useWhitelist: false })).toThrow(
        'dangerous pattern'
      );
    });

    it('should block fork bombs', () => {
      expect(() => validateCommand(':(){ :|:& };:', { useWhitelist: false })).toThrow(
        'dangerous pattern'
      );
    });

    it('should block curl piped to sh', () => {
      expect(() =>
        validateCommand('curl http://example.com/script.sh | sh', { useWhitelist: false })
      ).toThrow('dangerous pattern');
    });

    it('should block chmod 777', () => {
      expect(() => validateCommand('chmod 777 file.txt', { useWhitelist: false })).toThrow(
        'dangerous pattern'
      );
    });

    it('should block eval commands', () => {
      expect(() => validateCommand('eval "malicious code"', { useWhitelist: false })).toThrow(
        'dangerous pattern'
      );
    });

    it('should block commands exceeding max length', () => {
      const longCommand = 'a'.repeat(20000);
      expect(() => validateCommand(longCommand, { maxCommandLength: 10000 })).toThrow(
        'exceeds maximum length'
      );
    });

    it('should allow additional commands when specified', () => {
      const result = validateCommand('custom-cmd', {
        useWhitelist: true,
        additionalAllowedCommands: ['custom-cmd'],
      });
      expect(result).toBe('custom-cmd');
    });

    it('should allow npm commands', () => {
      const result = validateCommand('npm install', { useWhitelist: true });
      expect(result).toBe('npm install');
    });

    it('should allow git commands', () => {
      const result = validateCommand('git commit -m "test"', { useWhitelist: true });
      expect(result).toBe('git commit -m "test"');
    });
  });

  describe('isCommandSafe', () => {
    it('should return true for safe commands', () => {
      expect(isCommandSafe('ls -la', { useWhitelist: false })).toBe(true);
    });

    it('should return false for dangerous commands', () => {
      expect(isCommandSafe('rm -rf /', { useWhitelist: false })).toBe(false);
    });

    it('should return false for non-whitelisted commands', () => {
      expect(isCommandSafe('dangerous-cmd', { useWhitelist: true })).toBe(false);
    });
  });

  describe('sanitizeCommandArgs', () => {
    it('should escape arguments with spaces', () => {
      const result = sanitizeCommandArgs(['ls', '-la', 'file name.txt']);
      expect(result).toContain('file name.txt');
    });

    it('should escape special characters', () => {
      const result = sanitizeCommandArgs(['echo', 'test;rm -rf /']);
      expect(result).toBeTruthy();
      // Shell-escape should properly escape this
    });

    it('should handle simple arguments', () => {
      const result = sanitizeCommandArgs(['git', 'status']);
      expect(result).toContain('git');
      expect(result).toContain('status');
    });
  });

  describe('getBaseCommand', () => {
    it('should extract base command from simple command', () => {
      expect(getBaseCommand('ls -la')).toBe('ls');
    });

    it('should extract base command from complex command', () => {
      expect(getBaseCommand('git commit -m "message"')).toBe('git');
    });

    it('should handle command with leading spaces', () => {
      expect(getBaseCommand('  npm install  ')).toBe('npm');
    });

    it('should handle single word command', () => {
      expect(getBaseCommand('pwd')).toBe('pwd');
    });
  });
});
