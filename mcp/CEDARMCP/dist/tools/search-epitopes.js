/**
 * search_epitopes tool
 *
 * Search for cancer epitopes in CEDAR by sequence, mutation, organism, MHC restriction, etc.
 */
import { z } from 'zod';
import { cedarClient } from '../api/cedar-client.js';
import { cache, CacheKeys, CacheTTL } from '../cache/cache-manager.js';
export const searchEpitopesSchema = z.object({
    linear_sequence: z
        .string()
        .optional()
        .describe('Peptide sequence to search for (exact match). Use * for wildcards (e.g., "*GADGVGK*" for substring).'),
    mutation: z
        .string()
        .optional()
        .describe('Mutation name to filter by (e.g., "G12D", "G12V", "V600E")'),
    source_organism: z
        .string()
        .optional()
        .describe('Source organism name (e.g., "Homo sapiens")'),
    neoantigen_only: z
        .boolean()
        .optional()
        .default(false)
        .describe('If true, only return neoantigen epitopes'),
    mhc_class: z
        .string()
        .optional()
        .describe('Filter by MHC class ("I" or "II")'),
    mhc_allele: z
        .string()
        .optional()
        .describe('Filter by MHC allele name (e.g., "HLA-A*11:01")'),
    limit: z
        .number()
        .min(1)
        .max(100)
        .optional()
        .default(25)
        .describe('Maximum results to return (default: 25, max: 100)'),
});
export async function searchEpitopes(input) {
    const cacheKey = CacheKeys.epitopeSearch(JSON.stringify(input));
    const cached = cache.get(cacheKey);
    if (cached)
        return cached;
    const records = await cedarClient.searchEpitopes({
        linear_sequence: input.linear_sequence,
        mutation: input.mutation,
        source_organism: input.source_organism,
        neoantigen_only: input.neoantigen_only,
        mhc_class: input.mhc_class,
        mhc_allele: input.mhc_allele,
        limit: input.limit,
    });
    const epitopes = records.map((r) => ({
        structure_id: r.structure_id,
        linear_sequence: r.linear_sequence,
        mutation: r.mutation,
        structure_type: r.structure_type,
        source_molecules: r.r_object_source_molecule_names,
        source_organisms: r.source_organism_names,
        mhc_alleles: r.mhc_allele_names,
        mhc_classes: r.mhc_classes,
        diseases: r.disease_names,
        is_neoantigen: r.neoantigen_bool === 1,
        tcell_assay_count: r.tcell_ids?.length ?? 0,
        mhc_assay_count: r.elution_ids?.length ?? 0,
        bcell_assay_count: r.bcell_ids?.length ?? 0,
        reference_count: r.reference_ids?.length ?? 0,
        pdb_ids: r.pdb_ids,
        cedar_url: `https://cedar.iedb.org/epitope/${r.structure_id}`,
    }));
    const result = { epitopes, count: epitopes.length };
    cache.set(cacheKey, result, CacheTTL.SHORT);
    return result;
}
export const searchEpitopesTool = {
    name: 'search_epitopes',
    description: 'Search for cancer epitopes in CEDAR by peptide sequence, mutation (e.g., G12D, V600E), source organism, MHC restriction, or neoantigen status. Returns epitope summaries with assay counts and MHC allele information.',
    inputSchema: searchEpitopesSchema,
    handler: searchEpitopes,
};
//# sourceMappingURL=search-epitopes.js.map