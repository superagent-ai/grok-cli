/**
 * Tests for error utilities
 */

import {
  GrokError,
  APIError,
  FileError,
  FileNotFoundError,
  InvalidCommandError,
  ValidationError,
  TimeoutError,
  isGrokError,
  getErrorMessage,
  withTimeout,
  withRetry,
} from '../../src/utils/errors';

describe('Error Classes', () => {
  describe('GrokError', () => {
    it('should create error with message', () => {
      const error = new GrokError('Test error');
      expect(error.message).toBe('Test error');
      expect(error.name).toBe('GrokError');
    });

    it('should include code and details', () => {
      const error = new GrokError('Test error', 'TEST_CODE', { foo: 'bar' });
      expect(error.code).toBe('TEST_CODE');
      expect(error.details).toEqual({ foo: 'bar' });
    });

    it('should serialize to JSON', () => {
      const error = new GrokError('Test', 'CODE', { key: 'value' });
      const json = error.toJSON();
      expect(json).toEqual({
        name: 'GrokError',
        message: 'Test',
        code: 'CODE',
        details: { key: 'value' },
      });
    });
  });

  describe('APIError', () => {
    it('should include status code', () => {
      const error = new APIError('API failed', 404, { error: 'Not found' });
      expect(error.statusCode).toBe(404);
      expect(error.response).toEqual({ error: 'Not found' });
    });
  });

  describe('FileError', () => {
    it('should include file path and operation', () => {
      const error = new FileError('Failed to read', '/path/to/file', 'read');
      expect(error.filePath).toBe('/path/to/file');
      expect(error.operation).toBe('read');
    });
  });

  describe('FileNotFoundError', () => {
    it('should set correct code', () => {
      const error = new FileNotFoundError('/path/to/file');
      expect(error.code).toBe('FILE_NOT_FOUND');
      expect(error.message).toContain('/path/to/file');
    });
  });

  describe('TimeoutError', () => {
    it('should include timeout value', () => {
      const error = new TimeoutError('Operation timed out', 5000);
      expect(error.timeoutMs).toBe(5000);
    });
  });

  describe('InvalidCommandError', () => {
    it('should include command', () => {
      const error = new InvalidCommandError('Blocked', 'rm -rf /');
      expect(error.command).toBe('rm -rf /');
    });
  });

  describe('ValidationError', () => {
    it('should include field and value', () => {
      const error = new ValidationError('Invalid email', 'email', 'notanemail');
      expect(error.field).toBe('email');
      expect(error.value).toBe('notanemail');
    });
  });
});

describe('isGrokError', () => {
  it('should return true for GrokError', () => {
    const error = new GrokError('test');
    expect(isGrokError(error)).toBe(true);
  });

  it('should return true for subclasses', () => {
    const error = new APIError('test', 500);
    expect(isGrokError(error)).toBe(true);
  });

  it('should return false for regular errors', () => {
    const error = new Error('test');
    expect(isGrokError(error)).toBe(false);
  });

  it('should return false for non-errors', () => {
    expect(isGrokError('string')).toBe(false);
    expect(isGrokError(null)).toBe(false);
    expect(isGrokError(undefined)).toBe(false);
  });
});

describe('getErrorMessage', () => {
  it('should extract message from Error', () => {
    const error = new Error('Test error');
    expect(getErrorMessage(error)).toBe('Test error');
  });

  it('should handle string errors', () => {
    expect(getErrorMessage('String error')).toBe('String error');
  });

  it('should handle unknown errors', () => {
    expect(getErrorMessage(null)).toBe('An unknown error occurred');
    expect(getErrorMessage({})).toBe('An unknown error occurred');
  });
});

describe('withTimeout', () => {
  it('should resolve if promise completes in time', async () => {
    const promise = Promise.resolve('success');
    const result = await withTimeout(promise, 1000);
    expect(result).toBe('success');
  });

  it('should timeout if promise takes too long', async () => {
    const promise = new Promise((resolve) => setTimeout(resolve, 200));

    await expect(withTimeout(promise, 100, 'Timed out')).rejects.toThrow(
      TimeoutError
    );
  });

  it('should include custom error message', async () => {
    const promise = new Promise((resolve) => setTimeout(resolve, 200));

    await expect(
      withTimeout(promise, 100, 'Custom timeout message')
    ).rejects.toThrow('Custom timeout message');
  });

  it('should reject if promise rejects', async () => {
    const promise = Promise.reject(new Error('Failed'));

    await expect(withTimeout(promise, 1000)).rejects.toThrow('Failed');
  });
});

describe('withRetry', () => {
  it('should succeed on first try', async () => {
    const fn = jest.fn(async () => 'success');
    const result = await withRetry(fn);

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should retry on failure', async () => {
    let attempts = 0;
    const fn = jest.fn(async () => {
      attempts++;
      if (attempts < 3) throw new Error('Failed');
      return 'success';
    });

    const result = await withRetry(fn, { maxRetries: 3, initialDelay: 10 });

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('should fail after max retries', async () => {
    const fn = jest.fn(async () => {
      throw new Error('Always fails');
    });

    await expect(
      withRetry(fn, { maxRetries: 2, initialDelay: 10 })
    ).rejects.toThrow('Always fails');

    expect(fn).toHaveBeenCalledTimes(3); // 1 initial + 2 retries
  });

  it('should respect shouldRetry option', async () => {
    const fn = jest.fn(async () => {
      throw new Error('Do not retry');
    });

    await expect(
      withRetry(fn, {
        maxRetries: 3,
        shouldRetry: () => false,
      })
    ).rejects.toThrow('Do not retry');

    expect(fn).toHaveBeenCalledTimes(1); // No retries
  });

  it('should use exponential backoff', async () => {
    const callTimes: number[] = [];

    const fn = jest.fn(async () => {
      callTimes.push(Date.now());
      throw new Error('Failed');
    });

    await expect(
      withRetry(fn, {
        maxRetries: 3,
        initialDelay: 50,
        maxDelay: 500,
      })
    ).rejects.toThrow();

    // Check that we have 4 calls (1 initial + 3 retries)
    expect(callTimes.length).toBe(4);

    // Calculate delays between calls
    const delays = [];
    for (let i = 1; i < callTimes.length; i++) {
      delays.push(callTimes[i] - callTimes[i - 1]);
    }

    // Check that delays increase (exponential backoff)
    expect(delays.length).toBe(3);
    expect(delays[1]).toBeGreaterThanOrEqual(delays[0]);
    expect(delays[2]).toBeGreaterThanOrEqual(delays[1]);
  });
});
