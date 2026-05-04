/**
 * Cache Manager for IMGT/HLA MCP Server
 *
 * Provides in-memory caching with TTL to reduce API calls and improve response time.
 */

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

export class CacheManager {
  private cache: Map<string, CacheEntry<unknown>> = new Map();
  private defaultTTL: number;

  /**
   * Create a new cache manager
   * @param defaultTTL Default time-to-live in milliseconds (default: 1 hour)
   */
  constructor(defaultTTL: number = 60 * 60 * 1000) {
    this.defaultTTL = defaultTTL;
  }

  /**
   * Get an item from the cache
   */
  get<T>(key: string): T | undefined {
    const entry = this.cache.get(key);

    if (!entry) {
      return undefined;
    }

    // Check if expired
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return undefined;
    }

    return entry.data as T;
  }

  /**
   * Set an item in the cache
   */
  set<T>(key: string, data: T, ttl?: number): void {
    const expiresAt = Date.now() + (ttl ?? this.defaultTTL);
    this.cache.set(key, { data, expiresAt });
  }

  /**
   * Delete an item from the cache
   */
  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  /**
   * Delete all items matching a key prefix
   */
  deleteByPrefix(prefix: string): number {
    let count = 0;
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) {
        this.cache.delete(key);
        count++;
      }
    }
    return count;
  }

  /**
   * Clear all items from the cache
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get or set a cached value
   * If the value doesn't exist or is expired, call the factory function
   */
  async getOrSet<T>(key: string, factory: () => Promise<T>, ttl?: number): Promise<T> {
    const cached = this.get<T>(key);
    if (cached !== undefined) {
      return cached;
    }

    const data = await factory();
    this.set(key, data, ttl);
    return data;
  }

  /**
   * Remove expired entries
   */
  cleanup(): number {
    const now = Date.now();
    let count = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
        count++;
      }
    }

    return count;
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    const now = Date.now();
    let validCount = 0;
    let expiredCount = 0;

    for (const entry of this.cache.values()) {
      if (now > entry.expiresAt) {
        expiredCount++;
      } else {
        validCount++;
      }
    }

    return {
      totalEntries: this.cache.size,
      validEntries: validCount,
      expiredEntries: expiredCount,
    };
  }

  /**
   * Check if a key exists and is not expired
   */
  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return false;
    }
    return true;
  }

  /**
   * Get all keys (including expired ones)
   */
  keys(): string[] {
    return Array.from(this.cache.keys());
  }
}

export interface CacheStats {
  totalEntries: number;
  validEntries: number;
  expiredEntries: number;
}

// Cache key generators for consistent key formatting
export const CacheKeys = {
  allele: (identifier: string) => `allele:${identifier}`,
  alleleList: (locus: string, limit: number, offset?: string) =>
    `alleleList:${locus}:${limit}:${offset ?? 'start'}`,
  sequence: (allele: string, type: string) => `sequence:${allele}:${type}`,
  alignment: (locus: string, type: string) => `alignment:${locus}:${type}`,
  cell: (cellId: string) => `cell:${cellId}`,
  search: (params: string) => `search:${params}`,
  alleleListAll: () => 'alleleListAll',
};

// Export singleton instance with 1-hour default TTL
export const cache = new CacheManager();

// TTL constants for different data types
export const CacheTTL = {
  SHORT: 5 * 60 * 1000, // 5 minutes for search results
  MEDIUM: 60 * 60 * 1000, // 1 hour for individual alleles
  LONG: 24 * 60 * 60 * 1000, // 24 hours for alignments and bulk data
};
