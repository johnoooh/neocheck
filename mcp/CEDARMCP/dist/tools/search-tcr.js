/**
 * search_tcr tool
 *
 * Search T-cell receptors in CEDAR by epitope, CDR3 sequence, MHC allele, or mutation.
 */
import { z } from 'zod';
import { cedarClient } from '../api/cedar-client.js';
import { cache, CacheKeys, CacheTTL } from '../cache/cache-manager.js';
export const searchTcrSchema = z.object({
    linear_sequence: z
        .string()
        .optional()
        .describe('Epitope peptide sequence the TCR recognizes (e.g., "VVVGADGVGK")'),
    structure_id: z
        .number()
        .optional()
        .describe('CEDAR epitope structure ID to find reactive TCRs for'),
    cdr3_beta: z
        .string()
        .optional()
        .describe('CDR3β sequence (exact match, or use * for substring e.g., "*VGPG*")'),
    cdr3_alpha: z
        .string()
        .optional()
        .describe('CDR3α sequence (exact match, or use * for substring)'),
    mhc_allele: z
        .string()
        .optional()
        .describe('MHC allele restriction (e.g., "HLA-A*11:01")'),
    mutation: z
        .string()
        .optional()
        .describe('Mutation name (e.g., "G12D")'),
    receptor_type: z
        .enum(['alphabeta', 'gammadelta'])
        .optional()
        .describe('TCR type filter'),
    neoantigen_only: z
        .boolean()
        .optional()
        .default(false)
        .describe('If true, only return TCRs recognizing neoantigens'),
    limit: z
        .number()
        .min(1)
        .max(100)
        .optional()
        .default(25)
        .describe('Maximum results (default: 25, max: 100)'),
});
export async function searchTcr(input) {
    const cacheKey = CacheKeys.epitopeSearch(`tcr:${JSON.stringify(input)}`);
    const cached = cache.get(cacheKey);
    if (cached)
        return cached;
    const records = await cedarClient.searchTcr({
        linear_sequence: input.linear_sequence,
        structure_id: input.structure_id,
        cdr3_beta: input.cdr3_beta,
        cdr3_alpha: input.cdr3_alpha,
        mhc_allele: input.mhc_allele,
        mutation: input.mutation,
        receptor_type: input.receptor_type,
        neoantigen_only: input.neoantigen_only,
        limit: input.limit,
    });
    const receptors = records.map((r) => ({
        receptor_group_id: r.receptor_group_id,
        receptor_type: r.receptor_type,
        receptor_species: r.receptor_species_names,
        receptor_names: r.receptor_names,
        chain1_cdr3: r.chain1_cdr3_seq,
        chain2_cdr3: r.chain2_cdr3_seq,
        chain1_cdr1: r.receptor_chain1_cdr1_seqs,
        chain1_cdr2: r.receptor_chain1_cdr2_seqs,
        chain2_cdr1: r.receptor_chain2_cdr1_seqs,
        chain2_cdr2: r.receptor_chain2_cdr2_seqs,
        epitope_sequences: r.linear_sequences,
        epitope_structure_ids: r.structure_ids,
        mhc_alleles: r.mhc_allele_names,
        mhc_classes: r.mhc_classes,
        diseases: r.disease_names,
        host_organisms: r.host_organism_names,
        assay_types: r.assay_names,
        qualitative_measures: r.qualitative_measures,
        mutations: r.mutations,
        pubmed_ids: r.pubmed_ids,
        pdb_ids: r.pdb_ids,
        reference_count: r.reference_ids?.length ?? 0,
        is_neoantigen: r.neoantigen_bool === 1,
        is_direct_ex_vivo: r.direct_ex_vivo_bool === 1,
    }));
    const result = { receptors, count: receptors.length };
    cache.set(cacheKey, result, CacheTTL.SHORT);
    return result;
}
export const searchTcrTool = {
    name: 'search_tcr',
    description: 'Search T-cell receptors (TCRs) in CEDAR by epitope sequence, CDR3β/α sequence, MHC allele, or mutation. Find reactive TCRs for neoepitopes (e.g., all TCRs targeting KRAS G12D), or search by CDR3 sequence to find what epitopes a TCR recognizes. Returns receptor details including CDR1/2/3 sequences, MHC restriction, and associated epitopes.',
    inputSchema: searchTcrSchema,
    handler: searchTcr,
};
//# sourceMappingURL=search-tcr.js.map