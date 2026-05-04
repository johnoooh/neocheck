/**
 * search_bcell_assays tool
 *
 * Search B-cell/antibody assay data in CEDAR.
 */

import { z } from 'zod';
import { cedarClient } from '../api/cedar-client.js';
import { cache, CacheKeys, CacheTTL } from '../cache/cache-manager.js';

export const searchBcellSchema = z.object({
  linear_sequence: z
    .string()
    .optional()
    .describe('Peptide sequence (exact match)'),
  structure_id: z
    .number()
    .optional()
    .describe('CEDAR epitope structure ID'),
  antibody_isotype: z
    .string()
    .optional()
    .describe('Antibody isotype filter (e.g., "IgG", "IgM", "IgA")'),
  qualitative_measure: z
    .string()
    .optional()
    .describe('Result filter: "Positive" or "Negative"'),
  mutation: z
    .string()
    .optional()
    .describe('Mutation name (e.g., "G12D")'),
  limit: z
    .number()
    .min(1)
    .max(100)
    .optional()
    .default(25)
    .describe('Maximum results (default: 25, max: 100)'),
});

export type SearchBcellInput = z.infer<typeof searchBcellSchema>;

export interface BcellAssaySummary {
  bcell_id: number;
  structure_id: number;
  linear_sequence: string | null;
  mutation: string | null;
  antibody_isotype: string | null;
  qualitative_measure: string | null;
  quantitative_measure: number | null;
  assay_description: string | null;
  host_organism: string | null;
  source_molecule: string | null;
  source_organism: string | null;
  immunization_description: string | null;
  diseases: string[] | null;
  pubmed_id: string | null;
  journal: string | null;
  year: string | null;
  is_neoantigen: boolean;
  cedar_url: string;
}

export interface SearchBcellResult {
  assays: BcellAssaySummary[];
  count: number;
}

export async function searchBcellAssays(input: SearchBcellInput): Promise<SearchBcellResult> {
  const cacheKey = CacheKeys.epitopeSearch(`bcell:${JSON.stringify(input)}`);
  const cached = cache.get<SearchBcellResult>(cacheKey);
  if (cached) return cached;

  const records = await cedarClient.searchBcell({
    linear_sequence: input.linear_sequence,
    structure_id: input.structure_id,
    antibody_isotype: input.antibody_isotype,
    qualitative_measure: input.qualitative_measure,
    mutation: input.mutation,
    limit: input.limit,
  });

  const assays: BcellAssaySummary[] = records.map((r) => ({
    bcell_id: r.bcell_id,
    structure_id: r.structure_id,
    linear_sequence: r.linear_sequence,
    mutation: r.mutation,
    antibody_isotype: r.antibody_isotype,
    qualitative_measure: r.qualitative_measure,
    quantitative_measure: r.quantitative_measure,
    assay_description: r.assay_description,
    host_organism: r.host_organism_name,
    source_molecule: r.r_object_source_molecule_name,
    source_organism: r.r_object_source_organism_name,
    immunization_description: r.immunization_description,
    diseases: r.disease_names,
    pubmed_id: r.pubmed_id,
    journal: r.journal_name,
    year: r.reference_dates,
    is_neoantigen: r.neoantigen_bool === 1,
    cedar_url: `https://cedar.iedb.org/epitope/${r.structure_id}`,
  }));

  const result: SearchBcellResult = { assays, count: assays.length };
  cache.set(cacheKey, result, CacheTTL.SHORT);
  return result;
}

export const searchBcellTool = {
  name: 'search_bcell_assays',
  description:
    'Search B-cell and antibody assay data in CEDAR. Filter by epitope sequence, antibody isotype (IgG, IgM, IgA), qualitative result, or mutation. Returns assay details including antibody isotype, host organism, immunization context, and disease associations.',
  inputSchema: searchBcellSchema,
  handler: searchBcellAssays,
};
