/**
 * search_mhc_ligands tool
 *
 * Search MHC ligand/elution assay data in CEDAR.
 */
import { z } from 'zod';
export declare const searchMhcSchema: z.ZodObject<{
    linear_sequence: z.ZodOptional<z.ZodString>;
    structure_id: z.ZodOptional<z.ZodNumber>;
    mutation: z.ZodOptional<z.ZodString>;
    mhc_allele: z.ZodOptional<z.ZodString>;
    qualitative_measure: z.ZodOptional<z.ZodString>;
    limit: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
}, "strip", z.ZodTypeAny, {
    limit: number;
    structure_id?: number | undefined;
    linear_sequence?: string | undefined;
    mutation?: string | undefined;
    qualitative_measure?: string | undefined;
    mhc_allele?: string | undefined;
}, {
    limit?: number | undefined;
    structure_id?: number | undefined;
    linear_sequence?: string | undefined;
    mutation?: string | undefined;
    qualitative_measure?: string | undefined;
    mhc_allele?: string | undefined;
}>;
export type SearchMhcInput = z.infer<typeof searchMhcSchema>;
export interface MhcLigandSummary {
    elution_id: number;
    structure_id: number;
    linear_sequence: string | null;
    mutation: string | null;
    assay_description: string | null;
    assay_types: string | null;
    qualitative_measure: string | null;
    quantitative_measure: number | null;
    mhc_class: string | null;
    mhc_allele: string | null;
    mhc_resolution: string | null;
    mhc_evidence: string | null;
    host_organism: string | null;
    source_organism: string | null;
    source_molecule: string | null;
    pubmed_id: string | null;
    journal: string | null;
    year: string | null;
    is_neoantigen: boolean;
}
export interface SearchMhcResult {
    ligands: MhcLigandSummary[];
    count: number;
}
export declare function searchMhcLigands(input: SearchMhcInput): Promise<SearchMhcResult>;
export declare const searchMhcTool: {
    name: string;
    description: string;
    inputSchema: z.ZodObject<{
        linear_sequence: z.ZodOptional<z.ZodString>;
        structure_id: z.ZodOptional<z.ZodNumber>;
        mutation: z.ZodOptional<z.ZodString>;
        mhc_allele: z.ZodOptional<z.ZodString>;
        qualitative_measure: z.ZodOptional<z.ZodString>;
        limit: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
    }, "strip", z.ZodTypeAny, {
        limit: number;
        structure_id?: number | undefined;
        linear_sequence?: string | undefined;
        mutation?: string | undefined;
        qualitative_measure?: string | undefined;
        mhc_allele?: string | undefined;
    }, {
        limit?: number | undefined;
        structure_id?: number | undefined;
        linear_sequence?: string | undefined;
        mutation?: string | undefined;
        qualitative_measure?: string | undefined;
        mhc_allele?: string | undefined;
    }>;
    handler: typeof searchMhcLigands;
};
//# sourceMappingURL=search-mhc.d.ts.map