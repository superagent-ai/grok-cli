/**
 * Tests for GitTool
 */
import { GitTool } from '../../src/tools/git-tool';
import * as fs from 'fs-extra';
import * as path from 'path';
import os from 'os';
import { execSync } from 'child_process';

// Mock the confirmation service to auto-approve
jest.mock('../../src/utils/confirmation-service', () => ({
  ConfirmationService: {
    getInstance: jest.fn(() => ({
      getSessionFlags: jest.fn(() => ({ bashCommands: true, allOperations: false })),
      requestConfirmation: jest.fn(() => Promise.resolve({ confirmed: true })),
    })),
  },
}));

describe('GitTool', () => {
  let gitTool: GitTool;
  let testDir: string;
  let originalCwd: string;

  beforeAll(async () => {
    originalCwd = process.cwd();
    testDir = path.join(os.tmpdir(), 'grok-cli-git-test-' + Date.now());
    await fs.ensureDir(testDir);

    // Initialize git repo
    process.chdir(testDir);
    execSync('git init', { stdio: 'ignore' });
    execSync('git config user.email "test@test.com"', { stdio: 'ignore' });
    execSync('git config user.name "Test User"', { stdio: 'ignore' });

    // Create initial commit
    await fs.writeFile(path.join(testDir, 'initial.txt'), 'initial content');
    execSync('git add .', { stdio: 'ignore' });
    execSync('git commit -m "Initial commit"', { stdio: 'ignore' });
  });

  afterAll(async () => {
    process.chdir(originalCwd);
    await fs.remove(testDir);
  });

  beforeEach(() => {
    gitTool = new GitTool(testDir);
    process.chdir(testDir);
  });

  describe('isGitRepo', () => {
    it('should return true for git repository', async () => {
      const result = await gitTool.isGitRepo();
      expect(result).toBe(true);
    });

    it('should return false for non-git directory', async () => {
      const nonGitDir = path.join(os.tmpdir(), 'non-git-' + Date.now());
      await fs.ensureDir(nonGitDir);

      const nonGitTool = new GitTool(nonGitDir);
      const result = await nonGitTool.isGitRepo();
      expect(result).toBe(false);

      await fs.remove(nonGitDir);
    });
  });

  describe('getStatus', () => {
    it('should show clean status', async () => {
      const status = await gitTool.getStatus();

      expect(status.staged).toEqual([]);
      expect(status.unstaged).toEqual([]);
      expect(status.untracked).toEqual([]);
    });

    it('should show modified files', async () => {
      await fs.writeFile(path.join(testDir, 'initial.txt'), 'modified content');

      const status = await gitTool.getStatus();

      expect(status.unstaged).toContain('initial.txt');

      // Reset for other tests
      execSync('git checkout -- .', { stdio: 'ignore' });
    });

    it('should show untracked files', async () => {
      await fs.writeFile(path.join(testDir, 'new-file.txt'), 'new content');

      const status = await gitTool.getStatus();

      expect(status.untracked).toContain('new-file.txt');

      await fs.remove(path.join(testDir, 'new-file.txt'));
    });

    it('should show staged files', async () => {
      await fs.writeFile(path.join(testDir, 'staged-file.txt'), 'staged content');
      execSync('git add staged-file.txt', { stdio: 'ignore' });

      const status = await gitTool.getStatus();

      expect(status.staged).toContain('staged-file.txt');

      execSync('git reset HEAD staged-file.txt', { stdio: 'ignore' });
      await fs.remove(path.join(testDir, 'staged-file.txt'));
    });
  });

  describe('getDiff', () => {
    it('should show diff for modified files', async () => {
      await fs.writeFile(path.join(testDir, 'initial.txt'), 'modified content');

      const diff = await gitTool.getDiff();

      expect(diff).toContain('modified content');

      execSync('git checkout -- .', { stdio: 'ignore' });
    });

    it('should show staged diff', async () => {
      await fs.writeFile(path.join(testDir, 'staged.txt'), 'staged content');
      execSync('git add staged.txt', { stdio: 'ignore' });

      const diff = await gitTool.getDiff(true);

      expect(diff).toContain('staged');

      execSync('git reset HEAD staged.txt', { stdio: 'ignore' });
      await fs.remove(path.join(testDir, 'staged.txt'));
    });
  });

  describe('add', () => {
    it('should add files to staging', async () => {
      await fs.writeFile(path.join(testDir, 'to-add.txt'), 'content');

      const result = await gitTool.add(['to-add.txt']);

      expect(result.success).toBe(true);

      // Verify file is staged
      const status = await gitTool.getStatus();
      expect(status.staged).toContain('to-add.txt');

      execSync('git reset HEAD to-add.txt', { stdio: 'ignore' });
      await fs.remove(path.join(testDir, 'to-add.txt'));
    });

    it('should add all files when "all" is passed', async () => {
      await fs.writeFile(path.join(testDir, 'file1.txt'), 'content1');
      await fs.writeFile(path.join(testDir, 'file2.txt'), 'content2');

      const result = await gitTool.add('all');

      expect(result.success).toBe(true);

      execSync('git reset HEAD', { stdio: 'ignore' });
      await fs.remove(path.join(testDir, 'file1.txt'));
      await fs.remove(path.join(testDir, 'file2.txt'));
    });
  });

  describe('branch', () => {
    it('should list branches', async () => {
      const result = await gitTool.branch();

      expect(result.success).toBe(true);
      expect(result.output).toContain('master');
    });

    it('should create new branch', async () => {
      const result = await gitTool.branch('test-branch');

      expect(result.success).toBe(true);

      // Cleanup
      execSync('git branch -D test-branch', { stdio: 'ignore' });
    });
  });

  describe('checkout', () => {
    it('should checkout existing branch', async () => {
      execSync('git branch checkout-test', { stdio: 'ignore' });

      const result = await gitTool.checkout('checkout-test');

      expect(result.success).toBe(true);

      // Go back to master and cleanup
      execSync('git checkout master', { stdio: 'ignore' });
      execSync('git branch -D checkout-test', { stdio: 'ignore' });
    });

    it('should create and checkout new branch', async () => {
      const result = await gitTool.checkout('new-branch', true);

      expect(result.success).toBe(true);

      // Cleanup
      execSync('git checkout master', { stdio: 'ignore' });
      execSync('git branch -D new-branch', { stdio: 'ignore' });
    });
  });

  describe('commit', () => {
    it('should create commit with message', async () => {
      await fs.writeFile(path.join(testDir, 'commit-test.txt'), 'content');
      execSync('git add commit-test.txt', { stdio: 'ignore' });

      const result = await gitTool.commit('Test commit');

      expect(result.success).toBe(true);

      // Verify commit
      const log = execSync('git log --oneline -1', { encoding: 'utf-8' });
      expect(log).toContain('Test commit');
    });
  });

  describe('stash', () => {
    it('should stash changes', async () => {
      await fs.writeFile(path.join(testDir, 'initial.txt'), 'stash test');

      const result = await gitTool.stash();

      expect(result.success).toBe(true);

      // Verify changes are stashed
      const content = await fs.readFile(path.join(testDir, 'initial.txt'), 'utf-8');
      expect(content).not.toBe('stash test');

      // Pop stash
      await gitTool.stashPop();
      execSync('git checkout -- .', { stdio: 'ignore' });
    });

    it('should stash with message', async () => {
      await fs.writeFile(path.join(testDir, 'initial.txt'), 'stash with message');

      const result = await gitTool.stash('My stash message');

      expect(result.success).toBe(true);

      // Pop stash and cleanup
      await gitTool.stashPop();
      execSync('git checkout -- .', { stdio: 'ignore' });
    });
  });

  describe('getLog', () => {
    it('should return commit log', async () => {
      const log = await gitTool.getLog(5);

      expect(log).toBeDefined();
      expect(log.length).toBeGreaterThan(0);
    });
  });

  describe('formatStatus', () => {
    it('should format clean status', async () => {
      const status = await gitTool.getStatus();
      const formatted = gitTool.formatStatus(status);

      expect(formatted).toContain('Branch:');
      expect(formatted).toContain('Working tree clean');
    });

    it('should format status with changes', async () => {
      await fs.writeFile(path.join(testDir, 'format-test.txt'), 'content');

      const status = await gitTool.getStatus();
      const formatted = gitTool.formatStatus(status);

      expect(formatted).toContain('Untracked:');
      expect(formatted).toContain('format-test.txt');

      await fs.remove(path.join(testDir, 'format-test.txt'));
    });
  });
});
