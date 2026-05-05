/**
 * Cache Manager for IMGT/HLA MCP Server
 *
 * Provides in-memory caching with TTL to reduce API calls and improve response time.
 */
export class CacheManager {
    cache = new Map();
    defaultTTL;
    /**
     * Create a new cache manager
     * @param defaultTTL Default time-to-live in milliseconds (default: 1 hour)
     */
    constructor(defaultTTL = 60 * 60 * 1000) {
        this.defaultTTL = defaultTTL;
    }
    /**
     * Get an item from the cache
     */
    get(key) {
        const entry = this.cache.get(key);
        if (!entry) {
            return undefined;
        }
        // Check if expired
        if (Date.now() > entry.expiresAt) {
            this.cache.delete(key);
            return undefined;
        }
        return entry.data;
    }
    /**
     * Set an item in the cache
     */
    set(key, data, ttl) {
        const expiresAt = Date.now() + (ttl ?? this.defaultTTL);
        this.cache.set(key, { data, expiresAt });
    }
    /**
     * Delete an item from the cache
     */
    delete(key) {
        return this.cache.delete(key);
    }
    /**
     * Delete all items matching a key prefix
     */
    deleteByPrefix(prefix) {
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
    clear() {
        this.cache.clear();
    }
    /**
     * Get or set a cached value
     * If the value doesn't exist or is expired, call the factory function
     */
    async getOrSet(key, factory, ttl) {
        const cached = this.get(key);
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
    cleanup() {
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
    getStats() {
        const now = Date.now();
        let validCount = 0;
        let expiredCount = 0;
        for (const entry of this.cache.values()) {
            if (now > entry.expiresAt) {
                expiredCount++;
            }
            else {
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
    has(key) {
        const entry = this.cache.get(key);
        if (!entry)
            return false;
        if (Date.now() > entry.expiresAt) {
            this.cache.delete(key);
            return false;
        }
        return true;
    }
    /**
     * Get all keys (including expired ones)
     */
    keys() {
        return Array.from(this.cache.keys());
    }
}
// Cache key generators for consistent key formatting
export const CacheKeys = {
    allele: (identifier) => `allele:${identifier}`,
    alleleList: (locus, limit, offset) => `alleleList:${locus}:${limit}:${offset ?? 'start'}`,
    sequence: (allele, type) => `sequence:${allele}:${type}`,
    alignment: (locus, type) => `alignment:${locus}:${type}`,
    cell: (cellId) => `cell:${cellId}`,
    search: (params) => `search:${params}`,
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
//# sourceMappingURL=cache-manager.js.map