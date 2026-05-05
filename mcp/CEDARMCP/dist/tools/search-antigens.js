/**
 * search_antigens tool
 *
 * Search for source antigens in CEDAR.
 */
import { z } from 'zod';
import { cedarClient } from '../api/cedar-client.js';
import { cache, CacheKeys, CacheTTL } from '../cache/cache-manager.js';
export const searchAntigensSchema = z.object({
    name: z
        .string()
        .optional()
        .describe('Antigen name to search for (e.g., "KRAS", "TP53", "BRAF")'),
    organism: z
        .string()
        .optional()
        .describe('Source organism name (e.g., "Homo sapiens")'),
    neoantigen_only: z
        .boolean()
        .optional()
        .default(false)
        .describe('If true, only return neoantigens'),
    limit: z
        .number()
        .min(1)
        .max(100)
        .optional()
        .default(25)
        .describe('Maximum results to return (default: 25, max: 100)'),
});
export async function searchAntigens(input) {
    const cacheKey = CacheKeys.antigenSearch(JSON.stringify(input));
    const cached = cache.get(cacheKey);
    if (cached)
        return cached;
    const records = await cedarClient.searchAntigens({
        name: input.name,
        organism: input.organism,
        neoantigen_only: input.neoantigen_only,
        limit: input.limit,
    });
    const antigens = records.map((r) => ({
        antigen_id: r.parent_source_antigen_id,
        antigen_iri: r.parent_source_antigen_iri,
        names: r.parent_source_antigen_names,
        source_organism: r.parent_source_antigen_source_org_name,
        epitope_count: r.structure_ids?.length ?? 0,
        diseases: r.disease_names,
        is_neoantigen: r.neoantigen_bool === 1,
        mhc_alleles: r.mhc_allele_names,
        assay_count: r.cedar_assay_ids?.length ?? 0,
        reference_count: r.reference_ids?.length ?? 0,
    }));
    const result = { antigens, count: antigens.length };
    cache.set(cacheKey, result, CacheTTL.SHORT);
    return result;
}
export const searchAntigensTool = {
    name: 'search_antigens',
    description: 'Search for source antigens in CEDAR by name (e.g., KRAS, TP53, BRAF), organism, or neoantigen status. Returns antigen summaries with associated epitope counts and disease contexts.',
    inputSchema: searchAntigensSchema,
    handler: searchAntigens,
};
//# sourceMappingURL=search-antigens.js.map