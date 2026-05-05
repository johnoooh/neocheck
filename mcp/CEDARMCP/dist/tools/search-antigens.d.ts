/**
 * search_antigens tool
 *
 * Search for source antigens in CEDAR.
 */
import { z } from 'zod';
export declare const searchAntigensSchema: z.ZodObject<{
    name: z.ZodOptional<z.ZodString>;
    organism: z.ZodOptional<z.ZodString>;
    neoantigen_only: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
    limit: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
}, "strip", z.ZodTypeAny, {
    limit: number;
    neoantigen_only: boolean;
    name?: string | undefined;
    organism?: string | undefined;
}, {
    limit?: number | undefined;
    neoantigen_only?: boolean | undefined;
    name?: string | undefined;
    organism?: string | undefined;
}>;
export type SearchAntigensInput = z.infer<typeof searchAntigensSchema>;
export interface AntigenSummary {
    antigen_id: string;
    antigen_iri: string;
    names: string[] | null;
    source_organism: string | null;
    epitope_count: number;
    diseases: string[] | null;
    is_neoantigen: boolean;
    mhc_alleles: string[] | null;
    assay_count: number;
    reference_count: number;
}
export interface SearchAntigensResult {
    antigens: AntigenSummary[];
    count: number;
}
export declare function searchAntigens(input: SearchAntigensInput): Promise<SearchAntigensResult>;
export declare const searchAntigensTool: {
    name: string;
    description: string;
    inputSchema: z.ZodObject<{
        name: z.ZodOptional<z.ZodString>;
        organism: z.ZodOptional<z.ZodString>;
        neoantigen_only: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
        limit: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
    }, "strip", z.ZodTypeAny, {
        limit: number;
        neoantigen_only: boolean;
        name?: string | undefined;
        organism?: string | undefined;
    }, {
        limit?: number | undefined;
        neoantigen_only?: boolean | undefined;
        name?: string | undefined;
        organism?: string | undefined;
    }>;
    handler: typeof searchAntigens;
};
//# sourceMappingURL=search-antigens.d.ts.map