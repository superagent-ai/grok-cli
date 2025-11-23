/**
 * Simple in-memory cache with TTL support
 */

export interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

export class Cache<T> {
  private cache = new Map<string, CacheEntry<T>>();
  private defaultTTL: number;

  /**
   * @param defaultTTL Default time-to-live in milliseconds
   */
  constructor(defaultTTL: number = 60000) {
    this.defaultTTL = defaultTTL;
  }

  /**
   * Get a value from the cache
   * @returns The cached value or undefined if not found or expired
   */
  get(key: string): T | undefined {
    const entry = this.cache.get(key);

    if (!entry) {
      return undefined;
    }

    // Check if expired
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return undefined;
    }

    return entry.value;
  }

  /**
   * Set a value in the cache
   * @param key Cache key
   * @param value Value to cache
   * @param ttl Time-to-live in milliseconds (optional, uses default if not provided)
   */
  set(key: string, value: T, ttl?: number): void {
    const expiresAt = Date.now() + (ttl ?? this.defaultTTL);

    this.cache.set(key, {
      value,
      expiresAt,
    });
  }

  /**
   * Check if a key exists and is not expired
   */
  has(key: string): boolean {
    return this.get(key) !== undefined;
  }

  /**
   * Delete a specific key from the cache
   */
  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  /**
   * Clear all entries from the cache
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Remove all expired entries from the cache
   */
  cleanup(): void {
    const now = Date.now();

    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Get the number of entries in the cache (including expired ones)
   */
  get size(): number {
    return this.cache.size;
  }

  /**
   * Get or compute a value
   * If the key exists in cache, return it. Otherwise, compute it, cache it, and return it.
   */
  async getOrCompute(
    key: string,
    computeFn: () => Promise<T>,
    ttl?: number
  ): Promise<T> {
    const cached = this.get(key);

    if (cached !== undefined) {
      return cached;
    }

    const value = await computeFn();
    this.set(key, value, ttl);
    return value;
  }

  /**
   * Synchronous version of getOrCompute
   */
  getOrComputeSync(key: string, computeFn: () => T, ttl?: number): T {
    const cached = this.get(key);

    if (cached !== undefined) {
      return cached;
    }

    const value = computeFn();
    this.set(key, value, ttl);
    return value;
  }
}

/**
 * Create a cache key from multiple parts
 */
export function createCacheKey(...parts: (string | number | boolean | undefined | null)[]): string {
  return parts
    .filter((p) => p !== undefined && p !== null)
    .map((p) => String(p))
    .join(':');
}
