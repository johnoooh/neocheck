/**
 * get_epitope tool
 *
 * Get comprehensive details for a specific epitope by its CEDAR structure_id.
 */

import { z } from 'zod';
import { cedarClient } from '../api/cedar-client.js';
import { cache, CacheKeys, CacheTTL } from '../cache/cache-manager.js';

export const getEpitopeSchema = z.object({
  structure_id: z
    .number()
    .describe('CEDAR epitope structure ID (e.g., 1309311 for KRAS G12D VVVGADGVGK)'),
});

export type GetEpitopeInput = z.infer<typeof getEpitopeSchema>;

export interface EpitopeDetail {
  structure_id: number;
  structure_iri: string;
  linear_sequence: string | null;
  structure_type: string | null;
  sequence_length: number | null;
  mutation: string | null;
  modification: string | null;

  // Classification
  is_neoantigen: boolean;
  is_viral_antigen: boolean;
  is_germline_antigen: boolean;
  is_naturally_occurring_disease: boolean;
  is_direct_ex_vivo: boolean;
  related_object_types: string[] | null;

  // Source information
  source_molecules: string[] | null;
  source_organisms: string[] | null;
  curated_source_antigens: Array<{
    accession: string | null;
    name: string | null;
    organism: string | null;
    start: number | null;
    end: number | null;
  }> | null;

  // MHC restriction
  mhc_alleles: string[] | null;
  mhc_classes: string[] | null;
  mhc_allele_evidences: string[] | null;

  // Assay summary
  assay_types: string[] | null;
  qualitative_measures: string[] | null;
  tcell_assay_count: number;
  mhc_assay_count: number;
  bcell_assay_count: number;

  // Receptor info
  receptor_types: string[] | null;
  receptor_names: string[] | null;
  tcr_cdr3_alpha: string[] | null;
  tcr_cdr3_beta: string[] | null;

  // Disease context
  diseases: string[] | null;
  disease_stages: string[] | null;
  host_organisms: string[] | null;

  // Structures
  pdb_ids: string[] | null;

  // References
  pubmed_ids: string[] | null;
  reference_count: number;
  journals: string[] | null;

  // URLs
  cedar_url: string;
}

export async function getEpitope(input: GetEpitopeInput): Promise<EpitopeDetail> {
  const cacheKey = CacheKeys.epitope(input.structure_id);
  const cached = cache.get<EpitopeDetail>(cacheKey);
  if (cached) return cached;

  const record = await cedarClient.getEpitope(input.structure_id);
  if (!record) {
    throw new Error(`Epitope with structure_id ${input.structure_id} not found`);
  }

  const result: EpitopeDetail = {
    structure_id: record.structure_id,
    structure_iri: record.structure_iri,
    linear_sequence: record.linear_sequence,
    structure_type: record.structure_type,
    sequence_length: record.linear_sequence_length,
    mutation: record.mutation,
    modification: record.e_modification,

    is_neoantigen: record.neoantigen_bool === 1,
    is_viral_antigen: record.viral_antigen_bool === 1,
    is_germline_antigen: record.germline_antigen_bool === 1,
    is_naturally_occurring_disease: record.naturally_occuring_disease_bool === 1,
    is_direct_ex_vivo: record.direct_ex_vivo_bool === 1,
    related_object_types: record.e_related_object_types,

    source_molecules: record.r_object_source_molecule_names,
    source_organisms: record.source_organism_names,
    curated_source_antigens: record.curated_source_antigens?.map((a) => ({
      accession: a.accession,
      name: a.name,
      organism: a.source_organism_name,
      start: a.starting_position,
      end: a.ending_position,
    })) ?? null,

    mhc_alleles: record.mhc_allele_names,
    mhc_classes: record.mhc_classes,
    mhc_allele_evidences: record.mhc_allele_evidences,

    assay_types: record.assay_names,
    qualitative_measures: record.qualitative_measures,
    tcell_assay_count: record.tcell_ids?.length ?? 0,
    mhc_assay_count: record.elution_ids?.length ?? 0,
    bcell_assay_count: record.bcell_ids?.length ?? 0,

    receptor_types: record.receptor_types,
    receptor_names: record.receptor_names,
    tcr_cdr3_alpha: record.receptor_chain1_cdr3_seqs,
    tcr_cdr3_beta: record.receptor_chain2_cdr3_seqs,

    diseases: record.disease_names,
    disease_stages: record.disease_stages,
    host_organisms: record.host_organism_names,

    pdb_ids: record.pdb_ids,

    pubmed_ids: record.pubmed_ids,
    reference_count: record.reference_ids?.length ?? 0,
    journals: record.journal_names,

    cedar_url: `https://cedar.iedb.org/epitope/${record.structure_id}`,
  };

  cache.set(cacheKey, result, CacheTTL.MEDIUM);
  return result;
}

export const getEpitopeTool = {
  name: 'get_epitope',
  description:
    'Get comprehensive details for a specific CEDAR epitope by its structure_id. Returns full epitope data including sequence, mutation, MHC restriction, T-cell/B-cell/MHC assay counts, TCR CDR3 sequences, disease associations, PDB structures, and publication references.',
  inputSchema: getEpitopeSchema,
  handler: getEpitope,
};
