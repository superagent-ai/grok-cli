import { describe, it, expect, beforeEach } from 'vitest';
import path from 'path';
import { validatePath, validateFilePath, isPathSafe } from '../path-validator';

describe('path-validator', () => {
  const workingDir = '/home/user/project';

  describe('validatePath', () => {
    it('should allow valid paths within working directory', () => {
      const result = validatePath('src/index.ts', workingDir);
      expect(result).toBe(path.join(workingDir, 'src/index.ts'));
    });

    it('should resolve relative paths correctly', () => {
      const result = validatePath('./config.json', workingDir);
      expect(result).toBe(path.join(workingDir, 'config.json'));
    });

    it('should allow absolute paths within working directory', () => {
      const absPath = path.join(workingDir, 'test.txt');
      const result = validatePath(absPath, workingDir);
      expect(result).toBe(absPath);
    });

    it('should block path traversal attacks', () => {
      expect(() => validatePath('../../../etc/passwd', workingDir)).toThrow(
        'Path traversal detected'
      );
    });

    it('should block absolute paths outside working directory', () => {
      expect(() => validatePath('/etc/passwd', workingDir)).toThrow('Path traversal detected');
    });

    it('should block access to .env files', () => {
      expect(() => validatePath('.env', workingDir)).toThrow('Access to sensitive file');
    });

    it('should block access to credentials files', () => {
      expect(() => validatePath('credentials.json', workingDir)).toThrow(
        'Access to sensitive file'
      );
    });

    it('should block access to SSH keys', () => {
      expect(() => validatePath('id_rsa', workingDir)).toThrow('Access to sensitive file');
    });

    it('should block access to .ssh directory', () => {
      expect(() => validatePath('.ssh/id_rsa', workingDir)).toThrow('Access to .ssh directory');
    });

    it('should allow nested paths within working directory', () => {
      const result = validatePath('src/utils/helpers.ts', workingDir);
      expect(result).toBe(path.join(workingDir, 'src/utils/helpers.ts'));
    });
  });

  describe('isPathSafe', () => {
    it('should return true for safe paths', () => {
      expect(isPathSafe('src/index.ts', workingDir)).toBe(true);
    });

    it('should return false for path traversal', () => {
      expect(isPathSafe('../../../etc/passwd', workingDir)).toBe(false);
    });

    it('should return false for sensitive files', () => {
      expect(isPathSafe('.env', workingDir)).toBe(false);
    });
  });

  describe('validateFilePath', () => {
    it('should allow valid file paths', async () => {
      const result = await validateFilePath('src/index.ts', workingDir, false);
      expect(result).toBe(path.join(workingDir, 'src/index.ts'));
    });

    it('should block sensitive files', async () => {
      await expect(validateFilePath('.env', workingDir, false)).rejects.toThrow(
        'Access to sensitive file'
      );
    });
  });
});
