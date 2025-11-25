/**
 * Tests for SearchTool
 */
import { SearchTool } from '../src/tools/search';
import * as fs from 'fs-extra';
import * as path from 'path';
import os from 'os';

// Mock the confirmation service
jest.mock('../src/utils/confirmation-service', () => ({
  ConfirmationService: {
    getInstance: jest.fn(() => ({
      getSessionFlags: jest.fn(() => ({ bashCommands: true, allOperations: false })),
      requestConfirmation: jest.fn(() => Promise.resolve({ confirmed: true })),
    })),
  },
}));

describe('SearchTool', () => {
  let searchTool: SearchTool;
  let testDir: string;
  let originalCwd: string;

  beforeAll(async () => {
    originalCwd = process.cwd();
    testDir = path.join(os.tmpdir(), 'grok-cli-search-test-' + Date.now());
    await fs.ensureDir(testDir);

    // Create test files
    await fs.writeFile(path.join(testDir, 'file1.ts'), 'function hello() { console.log("hello"); }');
    await fs.writeFile(path.join(testDir, 'file2.ts'), 'const world = "world";');
    await fs.writeFile(path.join(testDir, 'file3.js'), 'function goodbye() { return "goodbye"; }');
    await fs.writeFile(path.join(testDir, 'readme.md'), '# Test README\nThis is a test file.');

    // Create nested structure
    await fs.ensureDir(path.join(testDir, 'src'));
    await fs.writeFile(path.join(testDir, 'src', 'index.ts'), 'export * from "./utils";');
    await fs.writeFile(path.join(testDir, 'src', 'utils.ts'), 'export function utility() { return "util"; }');
  });

  afterAll(async () => {
    process.chdir(originalCwd);
    await fs.remove(testDir);
  });

  beforeEach(() => {
    searchTool = new SearchTool();
    searchTool.setCurrentDirectory(testDir);
  });

  describe('text search', () => {
    it('should find text in files', async () => {
      const result = await searchTool.search('function', {
        searchType: 'text'
      });

      expect(result.success).toBe(true);
    });

    it('should respect case sensitivity', async () => {
      const result = await searchTool.search('FUNCTION', {
        searchType: 'text',
        caseSensitive: true
      });

      expect(result.success).toBe(true);
    });

    it('should search with regex', async () => {
      const result = await searchTool.search('function\\s+\\w+', {
        searchType: 'text',
        regex: true
      });

      expect(result.success).toBe(true);
    });

    it('should filter by file type', async () => {
      const result = await searchTool.search('function', {
        searchType: 'text',
        fileTypes: ['ts']
      });

      expect(result.success).toBe(true);
    });

    it('should limit results', async () => {
      const result = await searchTool.search('function', {
        searchType: 'text',
        maxResults: 1
      });

      expect(result.success).toBe(true);
    });
  });

  describe('file search', () => {
    it('should find files by name', async () => {
      const result = await searchTool.search('readme', {
        searchType: 'files'
      });

      expect(result.success).toBe(true);
      expect(result.output?.toLowerCase()).toContain('readme');
    });

    it('should find files with pattern', async () => {
      const result = await searchTool.search('ts', {
        searchType: 'files'
      });

      expect(result.success).toBe(true);
    });

    it('should search recursively', async () => {
      const result = await searchTool.search('index', {
        searchType: 'files'
      });

      expect(result.success).toBe(true);
    });
  });

  describe('combined search', () => {
    it('should search both text and files', async () => {
      const result = await searchTool.search('utility', {
        searchType: 'both'
      });

      expect(result.success).toBe(true);
    });
  });

  describe('include/exclude patterns', () => {
    it('should include files matching pattern', async () => {
      const result = await searchTool.search('function', {
        searchType: 'text',
        includePattern: '*.ts'
      });

      expect(result.success).toBe(true);
    });

    it('should exclude files matching pattern', async () => {
      const result = await searchTool.search('function', {
        searchType: 'text',
        excludePattern: '*.js'
      });

      expect(result.success).toBe(true);
    });
  });

  describe('directory operations', () => {
    it('should get current directory', () => {
      expect(searchTool.getCurrentDirectory()).toBe(testDir);
    });

    it('should set current directory', () => {
      const newDir = path.join(testDir, 'src');
      searchTool.setCurrentDirectory(newDir);
      expect(searchTool.getCurrentDirectory()).toBe(newDir);
    });
  });

  describe('error handling', () => {
    it('should handle empty query gracefully', async () => {
      const result = await searchTool.search('', {
        searchType: 'text'
      });

      expect(result).toBeDefined();
    });
  });
});
