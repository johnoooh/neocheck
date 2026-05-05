/**
 * Cache Manager for IMGT/HLA MCP Server
 *
 * Provides in-memory caching with TTL to reduce API calls and improve response time.
 */
export declare class CacheManager {
    private cache;
    private defaultTTL;
    /**
     * Create a new cache manager
     * @param defaultTTL Default time-to-live in milliseconds (default: 1 hour)
     */
    constructor(defaultTTL?: number);
    /**
     * Get an item from the cache
     */
    get<T>(key: string): T | undefined;
    /**
     * Set an item in the cache
     */
    set<T>(key: string, data: T, ttl?: number): void;
    /**
     * Delete an item from the cache
     */
    delete(key: string): boolean;
    /**
     * Delete all items matching a key prefix
     */
    deleteByPrefix(prefix: string): number;
    /**
     * Clear all items from the cache
     */
    clear(): void;
    /**
     * Get or set a cached value
     * If the value doesn't exist or is expired, call the factory function
     */
    getOrSet<T>(key: string, factory: () => Promise<T>, ttl?: number): Promise<T>;
    /**
     * Remove expired entries
     */
    cleanup(): number;
    /**
     * Get cache statistics
     */
    getStats(): CacheStats;
    /**
     * Check if a key exists and is not expired
     */
    has(key: string): boolean;
    /**
     * Get all keys (including expired ones)
     */
    keys(): string[];
}
export interface CacheStats {
    totalEntries: number;
    validEntries: number;
    expiredEntries: number;
}
export declare const CacheKeys: {
    allele: (identifier: string) => string;
    alleleList: (locus: string, limit: number, offset?: string) => string;
    sequence: (allele: string, type: string) => string;
    alignment: (locus: string, type: string) => string;
    cell: (cellId: string) => string;
    search: (params: string) => string;
    alleleListAll: () => string;
};
export declare const cache: CacheManager;
export declare const CacheTTL: {
    SHORT: number;
    MEDIUM: number;
    LONG: number;
};
//# sourceMappingURL=cache-manager.d.ts.map