/**
 * get_cell tool
 *
 * Get detailed information about a specific cell line.
 */
import { z } from 'zod';
import { imgtClient } from '../api/imgt-client.js';
import { cache, CacheKeys, CacheTTL } from '../cache/cache-manager.js';
export const getCellSchema = z.object({
    cell_id: z.string().describe('Cell identifier'),
});
export async function getCell(input) {
    const { cell_id } = input;
    // Build cache key
    const cacheKey = CacheKeys.cell(cell_id);
    // Try cache first
    const cached = cache.get(cacheKey);
    if (cached) {
        return formatCellResult(cached);
    }
    // Fetch from API
    const response = await imgtClient.getCell(cell_id);
    // Cache the full response
    cache.set(cacheKey, response, CacheTTL.MEDIUM);
    return formatCellResult(response);
}
function formatCellResult(data) {
    return {
        id: data.id,
        name: data.name,
        ethnicity: data.ethnicity,
        origin: data.origin,
        source: data.source,
        typing: data.typing?.map((t) => ({
            locus: t.locus,
            alleles: t.alleles,
        })),
    };
}
export const getCellTool = {
    name: 'get_cell',
    description: 'Get detailed information about a specific cell line',
    inputSchema: getCellSchema,
    handler: getCell,
};
//# sourceMappingURL=get-cell.js.map