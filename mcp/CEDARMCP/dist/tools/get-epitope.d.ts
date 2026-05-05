/**
 * get_epitope tool
 *
 * Get comprehensive details for a specific epitope by its CEDAR structure_id.
 */
import { z } from 'zod';
export declare const getEpitopeSchema: z.ZodObject<{
    structure_id: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    structure_id: number;
}, {
    structure_id: number;
}>;
export type GetEpitopeInput = z.infer<typeof getEpitopeSchema>;
export interface EpitopeDetail {
    structure_id: number;
    structure_iri: string;
    linear_sequence: string | null;
    structure_type: string | null;
    sequence_length: number | null;
    mutation: string | null;
    modification: string | null;
    is_neoantigen: boolean;
    is_viral_antigen: boolean;
    is_germline_antigen: boolean;
    is_naturally_occurring_disease: boolean;
    is_direct_ex_vivo: boolean;
    related_object_types: string[] | null;
    source_molecules: string[] | null;
    source_organisms: string[] | null;
    curated_source_antigens: Array<{
        accession: string | null;
        name: string | null;
        organism: string | null;
        start: number | null;
        end: number | null;
    }> | null;
    mhc_alleles: string[] | null;
    mhc_classes: string[] | null;
    mhc_allele_evidences: string[] | null;
    assay_types: string[] | null;
    qualitative_measures: string[] | null;
    tcell_assay_count: number;
    mhc_assay_count: number;
    bcell_assay_count: number;
    receptor_types: string[] | null;
    receptor_names: string[] | null;
    tcr_cdr3_alpha: string[] | null;
    tcr_cdr3_beta: string[] | null;
    diseases: string[] | null;
    disease_stages: string[] | null;
    host_organisms: string[] | null;
    pdb_ids: string[] | null;
    pubmed_ids: string[] | null;
    reference_count: number;
    journals: string[] | null;
    cedar_url: string;
}
export declare function getEpitope(input: GetEpitopeInput): Promise<EpitopeDetail>;
export declare const getEpitopeTool: {
    name: string;
    description: string;
    inputSchema: z.ZodObject<{
        structure_id: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        structure_id: number;
    }, {
        structure_id: number;
    }>;
    handler: typeof getEpitope;
};
//# sourceMappingURL=get-epitope.d.ts.map