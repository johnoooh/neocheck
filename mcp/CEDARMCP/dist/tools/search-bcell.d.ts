/**
 * search_bcell_assays tool
 *
 * Search B-cell/antibody assay data in CEDAR.
 */
import { z } from 'zod';
export declare const searchBcellSchema: z.ZodObject<{
    linear_sequence: z.ZodOptional<z.ZodString>;
    structure_id: z.ZodOptional<z.ZodNumber>;
    antibody_isotype: z.ZodOptional<z.ZodString>;
    qualitative_measure: z.ZodOptional<z.ZodString>;
    mutation: z.ZodOptional<z.ZodString>;
    limit: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
}, "strip", z.ZodTypeAny, {
    limit: number;
    structure_id?: number | undefined;
    linear_sequence?: string | undefined;
    mutation?: string | undefined;
    qualitative_measure?: string | undefined;
    antibody_isotype?: string | undefined;
}, {
    limit?: number | undefined;
    structure_id?: number | undefined;
    linear_sequence?: string | undefined;
    mutation?: string | undefined;
    qualitative_measure?: string | undefined;
    antibody_isotype?: string | undefined;
}>;
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
export declare function searchBcellAssays(input: SearchBcellInput): Promise<SearchBcellResult>;
export declare const searchBcellTool: {
    name: string;
    description: string;
    inputSchema: z.ZodObject<{
        linear_sequence: z.ZodOptional<z.ZodString>;
        structure_id: z.ZodOptional<z.ZodNumber>;
        antibody_isotype: z.ZodOptional<z.ZodString>;
        qualitative_measure: z.ZodOptional<z.ZodString>;
        mutation: z.ZodOptional<z.ZodString>;
        limit: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
    }, "strip", z.ZodTypeAny, {
        limit: number;
        structure_id?: number | undefined;
        linear_sequence?: string | undefined;
        mutation?: string | undefined;
        qualitative_measure?: string | undefined;
        antibody_isotype?: string | undefined;
    }, {
        limit?: number | undefined;
        structure_id?: number | undefined;
        linear_sequence?: string | undefined;
        mutation?: string | undefined;
        qualitative_measure?: string | undefined;
        antibody_isotype?: string | undefined;
    }>;
    handler: typeof searchBcellAssays;
};
//# sourceMappingURL=search-bcell.d.ts.map