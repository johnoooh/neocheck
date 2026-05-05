/**
 * get_nomenclature_history tool
 *
 * Track allele name changes across database versions.
 */
import { z } from 'zod';
import { imgtClient } from '../api/imgt-client.js';
import { cache, CacheKeys, CacheTTL } from '../cache/cache-manager.js';
export const getNomenclatureHistorySchema = z.object({
    allele: z.string().describe('Current or historical allele name'),
});
export async function getNomenclatureHistory(input) {
    const { allele } = input;
    // Build cache key - use allele cache since we need full data
    const cacheKey = CacheKeys.allele(allele);
    // Try cache first
    let alleleData = cache.get(cacheKey);
    if (!alleleData) {
        // Fetch from API
        alleleData = await imgtClient.getAllele(allele);
        // Cache the full response
        cache.set(cacheKey, alleleData, CacheTTL.MEDIUM);
    }
    if (!alleleData.allele_history || alleleData.allele_history.length === 0) {
        return {
            current_name: alleleData.name,
            accession: alleleData.accession,
            history: [],
            total_versions: 0,
            first_version: 'unknown',
            name_changes: [],
        };
    }
    // Sort history by version (oldest first) - API uses release_version
    const sortedHistory = [...alleleData.allele_history].sort((a, b) => {
        return compareVersions(a.release_version, b.release_version);
    });
    // Find name changes
    const nameChanges = [];
    for (let i = 1; i < sortedHistory.length; i++) {
        if (sortedHistory[i].name !== sortedHistory[i - 1].name) {
            nameChanges.push({
                from_version: sortedHistory[i - 1].release_version,
                to_version: sortedHistory[i].release_version,
                old_name: sortedHistory[i - 1].name,
                new_name: sortedHistory[i].name,
            });
        }
    }
    return {
        current_name: alleleData.name,
        accession: alleleData.accession,
        history: sortedHistory.map((h) => ({
            version: h.release_version,
            name: h.name,
        })),
        total_versions: sortedHistory.length,
        first_version: sortedHistory[0]?.release_version ?? 'unknown',
        name_changes: nameChanges,
    };
}
/**
 * Compare IMGT version strings (e.g., "3.45.0" vs "3.46.0")
 */
function compareVersions(a, b) {
    const partsA = a.split('.').map(Number);
    const partsB = b.split('.').map(Number);
    for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
        const numA = partsA[i] ?? 0;
        const numB = partsB[i] ?? 0;
        if (numA < numB)
            return -1;
        if (numA > numB)
            return 1;
    }
    return 0;
}
export const getNomenclatureHistoryTool = {
    name: 'get_nomenclature_history',
    description: 'Track HLA allele name changes across database versions',
    inputSchema: getNomenclatureHistorySchema,
    handler: getNomenclatureHistory,
};
//# sourceMappingURL=get-nomenclature-history.js.map