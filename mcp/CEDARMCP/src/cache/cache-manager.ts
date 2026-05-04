/**
 * Cache Manager for CEDAR MCP Server
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

  constructor(defaultTTL: number = 60 * 60 * 1000) {
    this.defaultTTL = defaultTTL;
  }

  get<T>(key: string): T | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return undefined;
    }
    return entry.data as T;
  }

  set<T>(key: string, data: T, ttl?: number): void {
    const expiresAt = Date.now() + (ttl ?? this.defaultTTL);
    this.cache.set(key, { data, expiresAt });
  }

  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  async getOrSet<T>(key: string, factory: () => Promise<T>, ttl?: number): Promise<T> {
    const cached = this.get<T>(key);
    if (cached !== undefined) return cached;
    const data = await factory();
    this.set(key, data, ttl);
    return data;
  }

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
}

export const CacheKeys = {
  epitope: (id: number) => `epitope:${id}`,
  epitopeSearch: (params: string) => `epitope_search:${params}`,
  antigenSearch: (params: string) => `antigen_search:${params}`,
  tcellSearch: (params: string) => `tcell_search:${params}`,
  mhcSearch: (params: string) => `mhc_search:${params}`,
  referenceSearch: (params: string) => `reference_search:${params}`,
};

export const cache = new CacheManager();

export const CacheTTL = {
  SHORT: 5 * 60 * 1000,       // 5 minutes for search results
  MEDIUM: 60 * 60 * 1000,     // 1 hour for individual epitopes
  LONG: 24 * 60 * 60 * 1000,  // 24 hours for static data
};
