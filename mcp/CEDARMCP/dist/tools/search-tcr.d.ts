/**
 * search_tcr tool
 *
 * Search T-cell receptors in CEDAR by epitope, CDR3 sequence, MHC allele, or mutation.
 */
import { z } from 'zod';
export declare const searchTcrSchema: z.ZodObject<{
    linear_sequence: z.ZodOptional<z.ZodString>;
    structure_id: z.ZodOptional<z.ZodNumber>;
    cdr3_beta: z.ZodOptional<z.ZodString>;
    cdr3_alpha: z.ZodOptional<z.ZodString>;
    mhc_allele: z.ZodOptional<z.ZodString>;
    mutation: z.ZodOptional<z.ZodString>;
    receptor_type: z.ZodOptional<z.ZodEnum<["alphabeta", "gammadelta"]>>;
    neoantigen_only: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
    limit: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
}, "strip", z.ZodTypeAny, {
    limit: number;
    neoantigen_only: boolean;
    structure_id?: number | undefined;
    linear_sequence?: string | undefined;
    mutation?: string | undefined;
    receptor_type?: "alphabeta" | "gammadelta" | undefined;
    mhc_allele?: string | undefined;
    cdr3_beta?: string | undefined;
    cdr3_alpha?: string | undefined;
}, {
    limit?: number | undefined;
    structure_id?: number | undefined;
    linear_sequence?: string | undefined;
    mutation?: string | undefined;
    receptor_type?: "alphabeta" | "gammadelta" | undefined;
    neoantigen_only?: boolean | undefined;
    mhc_allele?: string | undefined;
    cdr3_beta?: string | undefined;
    cdr3_alpha?: string | undefined;
}>;
export type SearchTcrInput = z.infer<typeof searchTcrSchema>;
export interface TcrSummary {
    receptor_group_id: number;
    receptor_type: string | null;
    receptor_species: string | null;
    receptor_names: string[] | null;
    chain1_cdr3: string | null;
    chain2_cdr3: string | null;
    chain1_cdr1: string[] | null;
    chain1_cdr2: string[] | null;
    chain2_cdr1: string[] | null;
    chain2_cdr2: string[] | null;
    epitope_sequences: string[] | null;
    epitope_structure_ids: number[] | null;
    mhc_alleles: string[] | null;
    mhc_classes: string[] | null;
    diseases: string[] | null;
    host_organisms: string[] | null;
    assay_types: string[] | null;
    qualitative_measures: string[] | null;
    mutations: string[] | null;
    pubmed_ids: string[] | null;
    pdb_ids: string[] | null;
    reference_count: number;
    is_neoantigen: boolean;
    is_direct_ex_vivo: boolean;
}
export interface SearchTcrResult {
    receptors: TcrSummary[];
    count: number;
}
export declare function searchTcr(input: SearchTcrInput): Promise<SearchTcrResult>;
export declare const searchTcrTool: {
    name: string;
    description: string;
    inputSchema: z.ZodObject<{
        linear_sequence: z.ZodOptional<z.ZodString>;
        structure_id: z.ZodOptional<z.ZodNumber>;
        cdr3_beta: z.ZodOptional<z.ZodString>;
        cdr3_alpha: z.ZodOptional<z.ZodString>;
        mhc_allele: z.ZodOptional<z.ZodString>;
        mutation: z.ZodOptional<z.ZodString>;
        receptor_type: z.ZodOptional<z.ZodEnum<["alphabeta", "gammadelta"]>>;
        neoantigen_only: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
        limit: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
    }, "strip", z.ZodTypeAny, {
        limit: number;
        neoantigen_only: boolean;
        structure_id?: number | undefined;
        linear_sequence?: string | undefined;
        mutation?: string | undefined;
        receptor_type?: "alphabeta" | "gammadelta" | undefined;
        mhc_allele?: string | undefined;
        cdr3_beta?: string | undefined;
        cdr3_alpha?: string | undefined;
    }, {
        limit?: number | undefined;
        structure_id?: number | undefined;
        linear_sequence?: string | undefined;
        mutation?: string | undefined;
        receptor_type?: "alphabeta" | "gammadelta" | undefined;
        neoantigen_only?: boolean | undefined;
        mhc_allele?: string | undefined;
        cdr3_beta?: string | undefined;
        cdr3_alpha?: string | undefined;
    }>;
    handler: typeof searchTcr;
};
//# sourceMappingURL=search-tcr.d.ts.map