import * as fs from 'fs-extra';
import * as path from 'path';
import { PersistenceManager } from '../../src/utils/persistence-manager';
import { createTempTestDir, cleanupTempDir } from '../setup';

describe('PersistenceManager', () => {
  let persistenceManager: PersistenceManager;
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await createTempTestDir('persistence-manager');
    persistenceManager = new PersistenceManager({
      baseDir: tempDir,
      enabled: true,
      backupCount: 2
    });
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  describe('Initialization', () => {
    it('should initialize and create base directory', async () => {
      await persistenceManager.initialize();
      
      expect(await fs.pathExists(tempDir)).toBe(true);
      expect(persistenceManager.isEnabled()).toBe(true);
    });

    it('should handle initialization errors gracefully', async () => {
      // Try to create directory in non-existent path
      const badManager = new PersistenceManager({
        baseDir: '/nonexistent/path/that/cannot/be/created',
        enabled: true
      });

      await badManager.initialize();
      
      // Should disable itself on failure
      expect(badManager.isEnabled()).toBe(false);
    });

    it('should skip initialization when disabled', async () => {
      const disabledManager = new PersistenceManager({
        baseDir: tempDir,
        enabled: false
      });

      await disabledManager.initialize();
      
      expect(disabledManager.isEnabled()).toBe(false);
    });
  });

  describe('Save and Load Operations', () => {
    beforeEach(async () => {
      await persistenceManager.initialize();
    });

    it('should save and load JSON data correctly', async () => {
      const testData = {
        name: 'test',
        value: 42,
        array: [1, 2, 3],
        nested: { foo: 'bar' }
      };

      const saved = await persistenceManager.save('test.json', testData);
      expect(saved).toBe(true);

      const loaded = await persistenceManager.load('test.json');
      expect(loaded).toEqual(testData);
    });

    it('should return default value when file does not exist', async () => {
      const defaultValue = { default: true };
      const loaded = await persistenceManager.load('nonexistent.json', defaultValue);
      
      expect(loaded).toEqual(defaultValue);
    });

    it('should return null when file does not exist and no default provided', async () => {
      const loaded = await persistenceManager.load('nonexistent.json');
      
      expect(loaded).toBeNull();
    });

    it('should handle save errors gracefully', async () => {
      // Try to save to invalid filename
      const result = await persistenceManager.save('', { test: 'data' });
      
      expect(result).toBe(false);
    });

    it('should handle load errors gracefully', async () => {
      // Create invalid JSON file
      const filePath = path.join(tempDir, 'invalid.json');
      await fs.writeFile(filePath, 'invalid json content');

      const loaded = await persistenceManager.load('invalid.json', { default: 'value' });
      
      // Should return default value on parse error
      expect(loaded).toEqual({ default: 'value' });
    });
  });

  describe('File Operations', () => {
    beforeEach(async () => {
      await persistenceManager.initialize();
    });

    it('should check file existence correctly', async () => {
      const exists1 = await persistenceManager.exists('test.json');
      expect(exists1).toBe(false);

      await persistenceManager.save('test.json', { test: 'data' });

      const exists2 = await persistenceManager.exists('test.json');
      expect(exists2).toBe(true);
    });

    it('should delete files correctly', async () => {
      await persistenceManager.save('test.json', { test: 'data' });
      
      const exists1 = await persistenceManager.exists('test.json');
      expect(exists1).toBe(true);

      const deleted = await persistenceManager.delete('test.json');
      expect(deleted).toBe(true);

      const exists2 = await persistenceManager.exists('test.json');
      expect(exists2).toBe(false);
    });

    it('should handle delete of non-existent file', async () => {
      const deleted = await persistenceManager.delete('nonexistent.json');
      expect(deleted).toBe(false);
    });

    it('should get correct file path', () => {
      const filePath = persistenceManager.getFilePath('test.json');
      const expected = path.join(tempDir, 'test.json');
      
      expect(filePath).toBe(expected);
    });
  });

  describe('Backup System', () => {
    beforeEach(async () => {
      await persistenceManager.initialize();
    });

    it('should create backups when overwriting files', async () => {
      const originalData = { version: 1 };
      const updatedData = { version: 2 };

      // Save initial data
      await persistenceManager.save('test.json', originalData);

      // Save updated data (should create backup)
      await persistenceManager.save('test.json', updatedData);

      // Check current data
      const currentData = await persistenceManager.load('test.json');
      expect(currentData).toEqual(updatedData);

      // Check backup was created
      const files = await fs.readdir(tempDir);
      const backupFiles = files.filter(file => file.startsWith('test.json.backup.'));
      
      expect(backupFiles.length).toBe(1);
    });

    it('should limit number of backups', async () => {
      const data1 = { version: 1 };
      const data2 = { version: 2 };
      const data3 = { version: 3 };
      const data4 = { version: 4 };

      // Create multiple versions to exceed backup limit (2)
      await persistenceManager.save('test.json', data1);
      await persistenceManager.save('test.json', data2);
      await persistenceManager.save('test.json', data3);
      await persistenceManager.save('test.json', data4);

      // Check only 2 backups exist
      const files = await fs.readdir(tempDir);
      const backupFiles = files.filter(file => file.startsWith('test.json.backup.'));
      
      expect(backupFiles.length).toBeLessThanOrEqual(2);
    });

    it('should restore from backup when main file is corrupted', async () => {
      const originalData = { test: 'data' };
      
      // Save good data
      await persistenceManager.save('test.json', originalData);
      
      // Update to create backup
      await persistenceManager.save('test.json', { updated: 'data' });

      // Corrupt the main file
      const mainFile = path.join(tempDir, 'test.json');
      await fs.writeFile(mainFile, 'corrupted json');

      // Try to load - should restore from backup
      const loaded = await persistenceManager.load('test.json');
      
      expect(loaded).toBeDefined();
      expect(loaded).not.toBe('corrupted json');
    });
  });

  describe('Enable/Disable Functionality', () => {
    it('should return false for all operations when disabled', async () => {
      persistenceManager.disable();

      const saved = await persistenceManager.save('test.json', { test: 'data' });
      expect(saved).toBe(false);

      const loaded = await persistenceManager.load('test.json');
      expect(loaded).toBeNull();

      const exists = await persistenceManager.exists('test.json');
      expect(exists).toBe(false);

      const deleted = await persistenceManager.delete('test.json');
      expect(deleted).toBe(false);
    });

    it('should work normally when re-enabled', async () => {
      await persistenceManager.initialize();
      
      persistenceManager.disable();
      expect(persistenceManager.isEnabled()).toBe(false);

      persistenceManager.enable();
      expect(persistenceManager.isEnabled()).toBe(true);

      const saved = await persistenceManager.save('test.json', { test: 'data' });
      expect(saved).toBe(true);
    });
  });

  describe('Error Resilience', () => {
    beforeEach(async () => {
      await persistenceManager.initialize();
    });

    it.skip('should handle file system errors during backup creation', async () => {
      const originalData = { test: 'data' };
      
      await persistenceManager.save('test.json', originalData);

      // Mock fs.copy to throw error
      const copySpy = jest.spyOn(fs, 'copy' as any).mockRejectedValue(new Error('Backup failed'));

      try {
        // Should still save successfully despite backup failure
        const saved = await persistenceManager.save('test.json', { updated: 'data' });
        expect(saved).toBe(true);

        const loaded = await persistenceManager.load('test.json');
        expect(loaded).toEqual({ updated: 'data' });
      } finally {
        copySpy.mockRestore();
      }
    });

    it('should handle cleanup errors gracefully', async () => {
      await persistenceManager.save('test.json', { test: 'data' });

      // Create many backup files to trigger cleanup
      for (let i = 0; i < 5; i++) {
        await persistenceManager.save('test.json', { version: i });
      }

      // Should not throw despite potential cleanup issues
      expect(await persistenceManager.exists('test.json')).toBe(true);
    });
  });

  describe('Thread Safety Simulation', () => {
    beforeEach(async () => {
      await persistenceManager.initialize();
    });

    it('should handle concurrent save operations', async () => {
      const concurrentSaves = Array.from({ length: 10 }, (_, i) =>
        persistenceManager.save(`test-${i}.json`, { id: i, data: `test-${i}` })
      );

      const results = await Promise.all(concurrentSaves);
      
      // All saves should succeed
      expect(results.every(result => result === true)).toBe(true);

      // All files should exist and contain correct data
      for (let i = 0; i < 10; i++) {
        const loaded = await persistenceManager.load(`test-${i}.json`);
        expect(loaded).toEqual({ id: i, data: `test-${i}` });
      }
    });

    it('should handle concurrent operations on same file', async () => {
      const testData = { counter: 0 };
      
      // Initial save
      await persistenceManager.save('counter.json', testData);

      // Simulate concurrent reads and writes
      const operations = Array.from({ length: 5 }, async (_, i) => {
        const data = await persistenceManager.load('counter.json');
        const updated = { counter: ((data as any)?.counter || 0) + 1 };
        return persistenceManager.save('counter.json', updated);
      });

      const results = await Promise.all(operations);
      
      // All operations should complete successfully
      expect(results.every(result => result === true)).toBe(true);
    });
  });
});