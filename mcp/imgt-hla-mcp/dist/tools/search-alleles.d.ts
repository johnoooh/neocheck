/**
 * search_alleles tool
 *
 * Search for HLA alleles by name pattern or query.
 */
import { z } from 'zod';
export declare const searchAllelesSchema: z.ZodObject<{
    query: z.ZodOptional<z.ZodString>;
    locus: z.ZodOptional<z.ZodString>;
    search_type: z.ZodDefault<z.ZodOptional<z.ZodEnum<["exact", "startsWith", "contains"]>>>;
    limit: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
}, "strip", z.ZodTypeAny, {
    limit: number;
    search_type: "exact" | "startsWith" | "contains";
    query?: string | undefined;
    locus?: string | undefined;
}, {
    limit?: number | undefined;
    query?: string | undefined;
    locus?: string | undefined;
    search_type?: "exact" | "startsWith" | "contains" | undefined;
}>;
export type SearchAllelesInput = z.infer<typeof searchAllelesSchema>;
export interface SearchAllelesResult {
    alleles: Array<{
        accession: string;
        name: string;
    }>;
    total: number;
    has_more: boolean;
}
export declare function searchAlleles(input: SearchAllelesInput): Promise<SearchAllelesResult>;
export declare const searchAllelesTool: {
    name: string;
    description: string;
    inputSchema: z.ZodObject<{
        query: z.ZodOptional<z.ZodString>;
        locus: z.ZodOptional<z.ZodString>;
        search_type: z.ZodDefault<z.ZodOptional<z.ZodEnum<["exact", "startsWith", "contains"]>>>;
        limit: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
    }, "strip", z.ZodTypeAny, {
        limit: number;
        search_type: "exact" | "startsWith" | "contains";
        query?: string | undefined;
        locus?: string | undefined;
    }, {
        limit?: number | undefined;
        query?: string | undefined;
        locus?: string | undefined;
        search_type?: "exact" | "startsWith" | "contains" | undefined;
    }>;
    handler: typeof searchAlleles;
};
//# sourceMappingURL=search-alleles.d.ts.map