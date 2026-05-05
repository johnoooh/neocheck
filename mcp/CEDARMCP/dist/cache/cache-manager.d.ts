/**
 * Cache Manager for CEDAR MCP Server
 *
 * Provides in-memory caching with TTL to reduce API calls and improve response time.
 */
export declare class CacheManager {
    private cache;
    private defaultTTL;
    constructor(defaultTTL?: number);
    get<T>(key: string): T | undefined;
    set<T>(key: string, data: T, ttl?: number): void;
    delete(key: string): boolean;
    getOrSet<T>(key: string, factory: () => Promise<T>, ttl?: number): Promise<T>;
    cleanup(): number;
}
export declare const CacheKeys: {
    epitope: (id: number) => string;
    epitopeSearch: (params: string) => string;
    antigenSearch: (params: string) => string;
    tcellSearch: (params: string) => string;
    mhcSearch: (params: string) => string;
    referenceSearch: (params: string) => string;
};
export declare const cache: CacheManager;
export declare const CacheTTL: {
    SHORT: number;
    MEDIUM: number;
    LONG: number;
};
//# sourceMappingURL=cache-manager.d.ts.map