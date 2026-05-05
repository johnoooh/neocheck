/**
 * search_tcell_assays tool
 *
 * Search T-cell assay results for specific epitopes in CEDAR.
 */
import { z } from 'zod';
export declare const searchTcellSchema: z.ZodObject<{
    linear_sequence: z.ZodOptional<z.ZodString>;
    structure_id: z.ZodOptional<z.ZodNumber>;
    mutation: z.ZodOptional<z.ZodString>;
    mhc_allele: z.ZodOptional<z.ZodString>;
    assay_type: z.ZodOptional<z.ZodString>;
    qualitative_measure: z.ZodOptional<z.ZodString>;
    limit: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
}, "strip", z.ZodTypeAny, {
    limit: number;
    structure_id?: number | undefined;
    linear_sequence?: string | undefined;
    mutation?: string | undefined;
    qualitative_measure?: string | undefined;
    mhc_allele?: string | undefined;
    assay_type?: string | undefined;
}, {
    limit?: number | undefined;
    structure_id?: number | undefined;
    linear_sequence?: string | undefined;
    mutation?: string | undefined;
    qualitative_measure?: string | undefined;
    mhc_allele?: string | undefined;
    assay_type?: string | undefined;
}>;
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
export declare function searchTcellAssays(input: SearchTcellInput): Promise<SearchTcellResult>;
export declare const searchTcellTool: {
    name: string;
    description: string;
    inputSchema: z.ZodObject<{
        linear_sequence: z.ZodOptional<z.ZodString>;
        structure_id: z.ZodOptional<z.ZodNumber>;
        mutation: z.ZodOptional<z.ZodString>;
        mhc_allele: z.ZodOptional<z.ZodString>;
        assay_type: z.ZodOptional<z.ZodString>;
        qualitative_measure: z.ZodOptional<z.ZodString>;
        limit: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
    }, "strip", z.ZodTypeAny, {
        limit: number;
        structure_id?: number | undefined;
        linear_sequence?: string | undefined;
        mutation?: string | undefined;
        qualitative_measure?: string | undefined;
        mhc_allele?: string | undefined;
        assay_type?: string | undefined;
    }, {
        limit?: number | undefined;
        structure_id?: number | undefined;
        linear_sequence?: string | undefined;
        mutation?: string | undefined;
        qualitative_measure?: string | undefined;
        mhc_allele?: string | undefined;
        assay_type?: string | undefined;
    }>;
    handler: typeof searchTcellAssays;
};
//# sourceMappingURL=search-tcell.d.ts.map