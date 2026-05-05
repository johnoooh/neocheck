/**
 * Cache Manager for CEDAR MCP Server
 *
 * Provides in-memory caching with TTL to reduce API calls and improve response time.
 */
export class CacheManager {
    cache = new Map();
    defaultTTL;
    constructor(defaultTTL = 60 * 60 * 1000) {
        this.defaultTTL = defaultTTL;
    }
    get(key) {
        const entry = this.cache.get(key);
        if (!entry)
            return undefined;
        if (Date.now() > entry.expiresAt) {
            this.cache.delete(key);
            return undefined;
        }
        return entry.data;
    }
    set(key, data, ttl) {
        const expiresAt = Date.now() + (ttl ?? this.defaultTTL);
        this.cache.set(key, { data, expiresAt });
    }
    delete(key) {
        return this.cache.delete(key);
    }
    async getOrSet(key, factory, ttl) {
        const cached = this.get(key);
        if (cached !== undefined)
            return cached;
        const data = await factory();
        this.set(key, data, ttl);
        return data;
    }
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
}
export const CacheKeys = {
    epitope: (id) => `epitope:${id}`,
    epitopeSearch: (params) => `epitope_search:${params}`,
    antigenSearch: (params) => `antigen_search:${params}`,
    tcellSearch: (params) => `tcell_search:${params}`,
    mhcSearch: (params) => `mhc_search:${params}`,
    referenceSearch: (params) => `reference_search:${params}`,
};
export const cache = new CacheManager();
export const CacheTTL = {
    SHORT: 5 * 60 * 1000, // 5 minutes for search results
    MEDIUM: 60 * 60 * 1000, // 1 hour for individual epitopes
    LONG: 24 * 60 * 60 * 1000, // 24 hours for static data
};
//# sourceMappingURL=cache-manager.js.map