/**
 * search_mhc_ligands tool
 *
 * Search MHC ligand/elution assay data in CEDAR.
 */
import { z } from 'zod';
import { cedarClient } from '../api/cedar-client.js';
import { cache, CacheKeys, CacheTTL } from '../cache/cache-manager.js';
export const searchMhcSchema = z.object({
    linear_sequence: z
        .string()
        .optional()
        .describe('Peptide sequence (exact match, e.g., "VVVGADGVGK")'),
    structure_id: z
        .number()
        .optional()
        .describe('CEDAR epitope structure ID'),
    mutation: z
        .string()
        .optional()
        .describe('Mutation name (e.g., "G12D")'),
    mhc_allele: z
        .string()
        .optional()
        .describe('MHC allele name (e.g., "HLA-A*11:01", "HLA-B*08:01")'),
    qualitative_measure: z
        .string()
        .optional()
        .describe('Result filter: "Positive" or "Negative"'),
    limit: z
        .number()
        .min(1)
        .max(100)
        .optional()
        .default(25)
        .describe('Maximum results to return (default: 25, max: 100)'),
});
export async function searchMhcLigands(input) {
    const cacheKey = CacheKeys.mhcSearch(JSON.stringify(input));
    const cached = cache.get(cacheKey);
    if (cached)
        return cached;
    const records = await cedarClient.searchMhcLigands({
        linear_sequence: input.linear_sequence,
        structure_id: input.structure_id,
        mhc_allele: input.mhc_allele,
        qualitative_measure: input.qualitative_measure,
        mutation: input.mutation,
        limit: input.limit,
    });
    const ligands = records.map((r) => ({
        elution_id: r.elution_id,
        structure_id: r.structure_id,
        linear_sequence: r.linear_sequence,
        mutation: r.mutation,
        assay_description: r.assay_description,
        assay_types: r.assay_names,
        qualitative_measure: r.qualitative_measure,
        quantitative_measure: r.quantitative_measure,
        mhc_class: r.mhc_class,
        mhc_allele: r.mhc_allele_name,
        mhc_resolution: r.mhc_allele_resolution,
        mhc_evidence: r.mhc_allele_evidence,
        host_organism: r.host_organism_name,
        source_organism: r.r_object_source_organism_name,
        source_molecule: r.r_object_source_molecule_name,
        pubmed_id: r.pubmed_id,
        journal: r.journal_name,
        year: r.reference_dates?.[0] ?? null,
        is_neoantigen: r.neoantigen_bool === 1,
    }));
    const result = { ligands, count: ligands.length };
    cache.set(cacheKey, result, CacheTTL.SHORT);
    return result;
}
export const searchMhcTool = {
    name: 'search_mhc_ligands',
    description: 'Search MHC ligand and elution assay data in CEDAR. Filter by peptide sequence, mutation, MHC allele, or qualitative result. Returns binding/elution records with MHC allele, evidence type, assay method, and publication info.',
    inputSchema: searchMhcSchema,
    handler: searchMhcLigands,
};
//# sourceMappingURL=search-mhc.js.map