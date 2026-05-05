/**
 * search_epitopes tool
 *
 * Search for cancer epitopes in CEDAR by sequence, mutation, organism, MHC restriction, etc.
 */
import { z } from 'zod';
export declare const searchEpitopesSchema: z.ZodObject<{
    linear_sequence: z.ZodOptional<z.ZodString>;
    mutation: z.ZodOptional<z.ZodString>;
    source_organism: z.ZodOptional<z.ZodString>;
    neoantigen_only: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
    mhc_class: z.ZodOptional<z.ZodString>;
    mhc_allele: z.ZodOptional<z.ZodString>;
    limit: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
}, "strip", z.ZodTypeAny, {
    limit: number;
    neoantigen_only: boolean;
    linear_sequence?: string | undefined;
    mutation?: string | undefined;
    source_organism?: string | undefined;
    mhc_class?: string | undefined;
    mhc_allele?: string | undefined;
}, {
    limit?: number | undefined;
    linear_sequence?: string | undefined;
    mutation?: string | undefined;
    source_organism?: string | undefined;
    neoantigen_only?: boolean | undefined;
    mhc_class?: string | undefined;
    mhc_allele?: string | undefined;
}>;
export type SearchEpitopesInput = z.infer<typeof searchEpitopesSchema>;
export interface EpitopeSummary {
    structure_id: number;
    linear_sequence: string | null;
    mutation: string | null;
    structure_type: string | null;
    source_molecules: string[] | null;
    source_organisms: string[] | null;
    mhc_alleles: string[] | null;
    mhc_classes: string[] | null;
    diseases: string[] | null;
    is_neoantigen: boolean;
    tcell_assay_count: number;
    mhc_assay_count: number;
    bcell_assay_count: number;
    reference_count: number;
    pdb_ids: string[] | null;
    cedar_url: string;
}
export interface SearchEpitopesResult {
    epitopes: EpitopeSummary[];
    count: number;
}
export declare function searchEpitopes(input: SearchEpitopesInput): Promise<SearchEpitopesResult>;
export declare const searchEpitopesTool: {
    name: string;
    description: string;
    inputSchema: z.ZodObject<{
        linear_sequence: z.ZodOptional<z.ZodString>;
        mutation: z.ZodOptional<z.ZodString>;
        source_organism: z.ZodOptional<z.ZodString>;
        neoantigen_only: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
        mhc_class: z.ZodOptional<z.ZodString>;
        mhc_allele: z.ZodOptional<z.ZodString>;
        limit: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
    }, "strip", z.ZodTypeAny, {
        limit: number;
        neoantigen_only: boolean;
        linear_sequence?: string | undefined;
        mutation?: string | undefined;
        source_organism?: string | undefined;
        mhc_class?: string | undefined;
        mhc_allele?: string | undefined;
    }, {
        limit?: number | undefined;
        linear_sequence?: string | undefined;
        mutation?: string | undefined;
        source_organism?: string | undefined;
        neoantigen_only?: boolean | undefined;
        mhc_class?: string | undefined;
        mhc_allele?: string | undefined;
    }>;
    handler: typeof searchEpitopes;
};
//# sourceMappingURL=search-epitopes.d.ts.map