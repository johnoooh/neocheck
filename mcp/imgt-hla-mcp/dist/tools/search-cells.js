/**
 * search_cells tool
 *
 * Search for cell lines in the database.
 */
import { z } from 'zod';
import { imgtClient } from '../api/imgt-client.js';
import { cache, CacheKeys, CacheTTL } from '../cache/cache-manager.js';
export const searchCellsSchema = z.object({
    query: z.string().optional().describe('Cell name or identifier pattern'),
    ethnicity: z.string().optional().describe('Filter by ethnic origin'),
    limit: z
        .number()
        .min(1)
        .max(100)
        .optional()
        .default(20)
        .describe('Maximum results (default: 20)'),
});
export async function searchCells(input) {
    const { query, ethnicity, limit } = input;
    // Build cache key
    const cacheKey = CacheKeys.search(`cells:${JSON.stringify({ query, ethnicity, limit })}`);
    // Try cache first
    const cached = cache.get(cacheKey);
    if (cached) {
        return cached;
    }
    // Fetch from API
    const response = await imgtClient.searchCells({
        query,
        ethnicity,
        limit,
    });
    const result = {
        cells: response.data.map((c) => ({
            id: c.id,
            name: c.name,
        })),
        total: response.meta.total,
        has_more: response.meta.next !== null,
    };
    // Cache the result
    cache.set(cacheKey, result, CacheTTL.SHORT);
    return result;
}
export const searchCellsTool = {
    name: 'search_cells',
    description: 'Search for cell lines in the IMGT/HLA database',
    inputSchema: searchCellsSchema,
    handler: searchCells,
};
//# sourceMappingURL=search-cells.js.map