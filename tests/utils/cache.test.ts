/**
 * Tests for the Cache utility
 */

import { Cache, createCacheKey } from '../../src/utils/cache';

describe('Cache', () => {
  describe('basic operations', () => {
    it('should store and retrieve values', () => {
      const cache = new Cache<string>();
      cache.set('key1', 'value1');
      expect(cache.get('key1')).toBe('value1');
    });

    it('should return undefined for non-existent keys', () => {
      const cache = new Cache<string>();
      expect(cache.get('nonexistent')).toBeUndefined();
    });

    it('should check if key exists', () => {
      const cache = new Cache<string>();
      cache.set('key1', 'value1');
      expect(cache.has('key1')).toBe(true);
      expect(cache.has('nonexistent')).toBe(false);
    });

    it('should delete keys', () => {
      const cache = new Cache<string>();
      cache.set('key1', 'value1');
      expect(cache.delete('key1')).toBe(true);
      expect(cache.get('key1')).toBeUndefined();
      expect(cache.delete('nonexistent')).toBe(false);
    });

    it('should clear all entries', () => {
      const cache = new Cache<string>();
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.clear();
      expect(cache.size).toBe(0);
      expect(cache.get('key1')).toBeUndefined();
    });
  });

  describe('TTL (time-to-live)', () => {
    it('should expire entries after TTL', async () => {
      const cache = new Cache<string>(100); // 100ms TTL
      cache.set('key1', 'value1');

      // Should be available immediately
      expect(cache.get('key1')).toBe('value1');

      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 150));

      // Should be expired
      expect(cache.get('key1')).toBeUndefined();
    });

    it('should use custom TTL per entry', async () => {
      const cache = new Cache<string>(1000); // Default 1s TTL
      cache.set('key1', 'value1', 100); // Custom 100ms TTL

      await new Promise(resolve => setTimeout(resolve, 150));
      expect(cache.get('key1')).toBeUndefined();
    });

    it('should cleanup expired entries', async () => {
      const cache = new Cache<string>(100);
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');

      await new Promise(resolve => setTimeout(resolve, 150));

      cache.cleanup();
      expect(cache.size).toBe(0);
    });
  });

  describe('getOrCompute', () => {
    it('should compute value if not in cache', async () => {
      const cache = new Cache<number>();
      const computeFn = jest.fn(async () => 42);

      const result = await cache.getOrCompute('key1', computeFn);

      expect(result).toBe(42);
      expect(computeFn).toHaveBeenCalledTimes(1);
    });

    it('should return cached value without computing', async () => {
      const cache = new Cache<number>();
      const computeFn = jest.fn(async () => 42);

      // First call computes
      await cache.getOrCompute('key1', computeFn);

      // Second call uses cache
      const result = await cache.getOrCompute('key1', computeFn);

      expect(result).toBe(42);
      expect(computeFn).toHaveBeenCalledTimes(1); // Only called once
    });

    it('should recompute if entry expired', async () => {
      const cache = new Cache<number>(100);
      const computeFn = jest.fn(async () => 42);

      await cache.getOrCompute('key1', computeFn);

      await new Promise(resolve => setTimeout(resolve, 150));

      await cache.getOrCompute('key1', computeFn);

      expect(computeFn).toHaveBeenCalledTimes(2);
    });
  });

  describe('getOrComputeSync', () => {
    it('should compute value synchronously', () => {
      const cache = new Cache<number>();
      const computeFn = jest.fn(() => 42);

      const result = cache.getOrComputeSync('key1', computeFn);

      expect(result).toBe(42);
      expect(computeFn).toHaveBeenCalledTimes(1);
    });

    it('should use cached value', () => {
      const cache = new Cache<number>();
      const computeFn = jest.fn(() => 42);

      cache.getOrComputeSync('key1', computeFn);
      const result = cache.getOrComputeSync('key1', computeFn);

      expect(result).toBe(42);
      expect(computeFn).toHaveBeenCalledTimes(1);
    });
  });
});

describe('createCacheKey', () => {
  it('should create key from single value', () => {
    expect(createCacheKey('test')).toBe('test');
  });

  it('should create key from multiple values', () => {
    expect(createCacheKey('a', 'b', 'c')).toBe('a:b:c');
  });

  it('should handle numbers and booleans', () => {
    expect(createCacheKey('test', 42, true)).toBe('test:42:true');
  });

  it('should filter out null and undefined', () => {
    expect(createCacheKey('a', null, 'b', undefined, 'c')).toBe('a:b:c');
  });

  it('should handle empty input', () => {
    expect(createCacheKey()).toBe('');
  });
});
