/**
 * search_tcell_assays tool
 *
 * Search T-cell assay results for specific epitopes in CEDAR.
 */

import { z } from 'zod';
import { cedarClient } from '../api/cedar-client.js';
import { cache, CacheKeys, CacheTTL } from '../cache/cache-manager.js';

export const searchTcellSchema = z.object({
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
    .describe('MHC allele name (e.g., "HLA-A*11:01")'),
  assay_type: z
    .string()
    .optional()
    .describe('Assay type filter (e.g., "IFNg", "ELISPOT", "cytotoxicity")'),
  qualitative_measure: z
    .string()
    .optional()
    .describe('Result filter: "Positive", "Negative", "Positive-High", "Positive-Low"'),
  limit: z
    .number()
    .min(1)
    .max(100)
    .optional()
    .default(25)
    .describe('Maximum results to return (default: 25, max: 100)'),
});

export type SearchTcellInput = z.infer<typeof searchTcellSchema>;

export interface TcellAssaySummary {
  tcell_id: number;
  structure_id: number;
  linear_sequence: string | null;
  mutation: string | null;
  assay_description: string | null;
  assay_types: string | null;
  qualitative_measure: string | null;
  quantitative_measure: number | null;
  mhc_class: string | null;
  mhc_allele: string | null;
  mhc_evidence: string | null;
  host_organism: string | null;
  source_organism: string | null;
  source_molecule: string | null;
  diseases: string[] | null;
  immunization: string | null;
  pubmed_id: string | null;
  journal: string | null;
  year: string | null;
  is_neoantigen: boolean;
  receptor_cdr3_alpha: string[] | null;
  receptor_cdr3_beta: string[] | null;
}

export interface SearchTcellResult {
  assays: TcellAssaySummary[];
  count: number;
}

export async function searchTcellAssays(input: SearchTcellInput): Promise<SearchTcellResult> {
  const cacheKey = CacheKeys.tcellSearch(JSON.stringify(input));
  const cached = cache.get<SearchTcellResult>(cacheKey);
  if (cached) return cached;

  const records = await cedarClient.searchTcellAssays({
    linear_sequence: input.linear_sequence,
    structure_id: input.structure_id,
    mhc_allele: input.mhc_allele,
    assay_type: input.assay_type,
    qualitative_measure: input.qualitative_measure,
    mutation: input.mutation,
    limit: input.limit,
  });

  const assays: TcellAssaySummary[] = records.map((r) => ({
    tcell_id: r.tcell_id,
    structure_id: r.structure_id,
    linear_sequence: r.linear_sequence,
    mutation: r.mutation,
    assay_description: r.assay_description,
    assay_types: r.assay_names,
    qualitative_measure: r.qualitative_measure,
    quantitative_measure: r.quantitative_measure,
    mhc_class: r.mhc_class,
    mhc_allele: r.mhc_allele_name,
    mhc_evidence: r.mhc_allele_evidence,
    host_organism: r.host_organism_name,
    source_organism: r.r_object_source_organism_name,
    source_molecule: r.r_object_source_molecule_name,
    diseases: r.disease_names,
    immunization: r.immunization_description,
    pubmed_id: r.pubmed_id,
    journal: r.journal_name,
    year: r.reference_dates?.[0] ?? null,
    is_neoantigen: r.neoantigen_bool === 1,
    receptor_cdr3_alpha: r.receptor_chain1_cdr3_seqs,
    receptor_cdr3_beta: r.receptor_chain2_cdr3_seqs,
  }));

  const result: SearchTcellResult = { assays, count: assays.length };
  cache.set(cacheKey, result, CacheTTL.SHORT);
  return result;
}

export const searchTcellTool = {
  name: 'search_tcell_assays',
  description:
    'Search T-cell assay results in CEDAR for specific epitopes. Filter by peptide sequence, mutation, MHC allele, assay type (IFNg, ELISPOT, cytotoxicity, etc.), or qualitative result. Returns assay details including MHC restriction, host organism, immunization context, and TCR CDR3 sequences.',
  inputSchema: searchTcellSchema,
  handler: searchTcellAssays,
};
