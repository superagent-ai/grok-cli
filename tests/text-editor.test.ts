/**
 * Tests for TextEditorTool
 */
import { TextEditorTool } from '../src/tools/text-editor';
import * as fs from 'fs-extra';
import * as path from 'path';
import os from 'os';

// Mock the confirmation service to auto-approve
jest.mock('../src/utils/confirmation-service', () => ({
  ConfirmationService: {
    getInstance: jest.fn(() => ({
      getSessionFlags: jest.fn(() => ({ fileOperations: true, allOperations: false })),
      requestConfirmation: jest.fn(() => Promise.resolve({ confirmed: true })),
    })),
  },
}));

describe('TextEditorTool', () => {
  let editor: TextEditorTool;
  let testDir: string;
  let testFile: string;

  beforeAll(async () => {
    testDir = path.join(os.tmpdir(), 'grok-cli-test-' + Date.now());
    await fs.ensureDir(testDir);
  });

  afterAll(async () => {
    await fs.remove(testDir);
  });

  beforeEach(() => {
    editor = new TextEditorTool();
    testFile = path.join(testDir, 'test-file.txt');
  });

  afterEach(async () => {
    if (await fs.pathExists(testFile)) {
      await fs.remove(testFile);
    }
  });

  describe('view', () => {
    it('should view file contents', async () => {
      await fs.writeFile(testFile, 'line1\nline2\nline3');
      const result = await editor.view(testFile);

      expect(result.success).toBe(true);
      expect(result.output).toContain('line1');
      expect(result.output).toContain('line2');
      expect(result.output).toContain('line3');
    });

    it('should view specific line range', async () => {
      await fs.writeFile(testFile, 'line1\nline2\nline3\nline4\nline5');
      const result = await editor.view(testFile, [2, 4]);

      expect(result.success).toBe(true);
      expect(result.output).toContain('line2');
      expect(result.output).toContain('line3');
      expect(result.output).toContain('line4');
      expect(result.output).not.toContain('line1');
      expect(result.output).not.toContain('line5');
    });

    it('should list directory contents', async () => {
      const subDir = path.join(testDir, 'subdir');
      await fs.ensureDir(subDir);
      await fs.writeFile(path.join(subDir, 'file1.txt'), 'content');
      await fs.writeFile(path.join(subDir, 'file2.txt'), 'content');

      const result = await editor.view(subDir);

      expect(result.success).toBe(true);
      expect(result.output).toContain('file1.txt');
      expect(result.output).toContain('file2.txt');

      await fs.remove(subDir);
    });

    it('should return error for non-existent file', async () => {
      const result = await editor.view('/nonexistent/file.txt');

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('should truncate long files and show line count', async () => {
      const lines = Array.from({ length: 20 }, (_, i) => `line${i + 1}`);
      await fs.writeFile(testFile, lines.join('\n'));

      const result = await editor.view(testFile);

      expect(result.success).toBe(true);
      expect(result.output).toContain('+10 lines');
    });
  });

  describe('create', () => {
    it('should create a new file', async () => {
      const newFile = path.join(testDir, 'new-file.txt');
      const result = await editor.create(newFile, 'Hello, World!');

      expect(result.success).toBe(true);
      const content = await fs.readFile(newFile, 'utf-8');
      expect(content).toBe('Hello, World!');

      await fs.remove(newFile);
    });

    it('should create nested directories', async () => {
      const nestedFile = path.join(testDir, 'nested', 'deep', 'file.txt');
      const result = await editor.create(nestedFile, 'nested content');

      expect(result.success).toBe(true);
      expect(await fs.pathExists(nestedFile)).toBe(true);

      await fs.remove(path.join(testDir, 'nested'));
    });

    it('should add to edit history', async () => {
      const newFile = path.join(testDir, 'history-test.txt');
      await editor.create(newFile, 'content');

      const history = editor.getEditHistory();
      expect(history.length).toBeGreaterThan(0);
      expect(history[history.length - 1].command).toBe('create');

      await fs.remove(newFile);
    });
  });

  describe('strReplace', () => {
    it('should replace text in file', async () => {
      await fs.writeFile(testFile, 'Hello, World!');
      const result = await editor.strReplace(testFile, 'World', 'Grok');

      expect(result.success).toBe(true);
      const content = await fs.readFile(testFile, 'utf-8');
      expect(content).toBe('Hello, Grok!');
    });

    it('should replace first occurrence only by default', async () => {
      await fs.writeFile(testFile, 'foo bar foo baz foo');
      const result = await editor.strReplace(testFile, 'foo', 'qux');

      expect(result.success).toBe(true);
      const content = await fs.readFile(testFile, 'utf-8');
      expect(content).toBe('qux bar foo baz foo');
    });

    it('should replace all occurrences when replaceAll is true', async () => {
      await fs.writeFile(testFile, 'foo bar foo baz foo');
      const result = await editor.strReplace(testFile, 'foo', 'qux', true);

      expect(result.success).toBe(true);
      const content = await fs.readFile(testFile, 'utf-8');
      expect(content).toBe('qux bar qux baz qux');
    });

    it('should return error if string not found', async () => {
      await fs.writeFile(testFile, 'Hello, World!');
      const result = await editor.strReplace(testFile, 'nonexistent', 'replacement');

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('should return error for non-existent file', async () => {
      const result = await editor.strReplace('/nonexistent/file.txt', 'old', 'new');

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('should generate proper diff output', async () => {
      await fs.writeFile(testFile, 'line1\nold content\nline3');
      const result = await editor.strReplace(testFile, 'old content', 'new content');

      expect(result.success).toBe(true);
      expect(result.output).toContain('-old content');
      expect(result.output).toContain('+new content');
    });
  });

  describe('replaceLines', () => {
    it('should replace specific line range', async () => {
      await fs.writeFile(testFile, 'line1\nline2\nline3\nline4\nline5');
      const result = await editor.replaceLines(testFile, 2, 4, 'replaced');

      expect(result.success).toBe(true);
      const content = await fs.readFile(testFile, 'utf-8');
      expect(content).toBe('line1\nreplaced\nline5');
    });

    it('should validate start line', async () => {
      await fs.writeFile(testFile, 'line1\nline2\nline3');
      const result = await editor.replaceLines(testFile, 0, 2, 'replacement');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid start line');
    });

    it('should validate end line', async () => {
      await fs.writeFile(testFile, 'line1\nline2\nline3');
      const result = await editor.replaceLines(testFile, 1, 10, 'replacement');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid end line');
    });

    it('should return error for non-existent file', async () => {
      const result = await editor.replaceLines('/nonexistent/file.txt', 1, 2, 'new');

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });
  });

  describe('insert', () => {
    it('should insert content at specific line', async () => {
      await fs.writeFile(testFile, 'line1\nline3');
      const result = await editor.insert(testFile, 2, 'line2');

      expect(result.success).toBe(true);
      const content = await fs.readFile(testFile, 'utf-8');
      expect(content).toBe('line1\nline2\nline3');
    });

    it('should insert at beginning of file', async () => {
      await fs.writeFile(testFile, 'line2\nline3');
      const result = await editor.insert(testFile, 1, 'line1');

      expect(result.success).toBe(true);
      const content = await fs.readFile(testFile, 'utf-8');
      expect(content).toBe('line1\nline2\nline3');
    });

    it('should return error for non-existent file', async () => {
      const result = await editor.insert('/nonexistent/file.txt', 1, 'content');

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });
  });

  describe('undoEdit', () => {
    it('should undo create operation', async () => {
      const newFile = path.join(testDir, 'undo-create.txt');
      await editor.create(newFile, 'content');
      expect(await fs.pathExists(newFile)).toBe(true);

      const result = await editor.undoEdit();

      expect(result.success).toBe(true);
      expect(await fs.pathExists(newFile)).toBe(false);
    });

    it('should undo str_replace operation', async () => {
      await fs.writeFile(testFile, 'original');
      await editor.strReplace(testFile, 'original', 'modified');

      const result = await editor.undoEdit();

      expect(result.success).toBe(true);
      const content = await fs.readFile(testFile, 'utf-8');
      expect(content).toBe('original');
    });

    it('should return error when no edits to undo', async () => {
      const result = await editor.undoEdit();

      expect(result.success).toBe(false);
      expect(result.error).toContain('No edits to undo');
    });
  });

  describe('getEditHistory', () => {
    it('should return copy of edit history', async () => {
      await fs.writeFile(testFile, 'content');
      await editor.strReplace(testFile, 'content', 'modified');

      const history = editor.getEditHistory();
      expect(Array.isArray(history)).toBe(true);
      expect(history.length).toBe(1);
    });
  });
});
