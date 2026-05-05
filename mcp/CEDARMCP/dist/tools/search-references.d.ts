/**
 * search_references tool
 *
 * Search publications/references in CEDAR.
 */
import { z } from 'zod';
export declare const searchReferencesSchema: z.ZodObject<{
    title: z.ZodOptional<z.ZodString>;
    author: z.ZodOptional<z.ZodString>;
    pubmed_id: z.ZodOptional<z.ZodString>;
    neoantigen_only: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
    limit: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
}, "strip", z.ZodTypeAny, {
    limit: number;
    neoantigen_only: boolean;
    pubmed_id?: string | undefined;
    title?: string | undefined;
    author?: string | undefined;
}, {
    limit?: number | undefined;
    pubmed_id?: string | undefined;
    neoantigen_only?: boolean | undefined;
    title?: string | undefined;
    author?: string | undefined;
}>;
export type SearchReferencesInput = z.infer<typeof searchReferencesSchema>;
export interface ReferenceSummary {
    reference_id: number;
    reference_iri: string;
    pubmed_id: string | null;
    reference_type: string | null;
    title: string | null;
    authors: string[] | null;
    year: string | null;
    journal: string | null;
    epitope_count: number;
    assay_count: number;
    is_neoantigen: boolean;
    pubmed_url: string | null;
}
export interface SearchReferencesResult {
    references: ReferenceSummary[];
    count: number;
}
export declare function searchReferences(input: SearchReferencesInput): Promise<SearchReferencesResult>;
export declare const searchReferencesTool: {
    name: string;
    description: string;
    inputSchema: z.ZodObject<{
        title: z.ZodOptional<z.ZodString>;
        author: z.ZodOptional<z.ZodString>;
        pubmed_id: z.ZodOptional<z.ZodString>;
        neoantigen_only: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
        limit: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
    }, "strip", z.ZodTypeAny, {
        limit: number;
        neoantigen_only: boolean;
        pubmed_id?: string | undefined;
        title?: string | undefined;
        author?: string | undefined;
    }, {
        limit?: number | undefined;
        pubmed_id?: string | undefined;
        neoantigen_only?: boolean | undefined;
        title?: string | undefined;
        author?: string | undefined;
    }>;
    handler: typeof searchReferences;
};
//# sourceMappingURL=search-references.d.ts.map