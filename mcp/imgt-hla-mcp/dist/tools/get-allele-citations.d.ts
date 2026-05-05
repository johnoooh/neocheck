/**
 * get_allele_citations tool
 *
 * Extract citations from an allele's metadata for use with PubMed MCP.
 * Returns PubMed IDs that can be passed to pubmed_fetch_contents for abstracts.
 */
import { z } from 'zod';
export declare const getAlleleCitationsSchema: z.ZodObject<{
    allele: z.ZodString;
}, "strip", z.ZodTypeAny, {
    allele: string;
}, {
    allele: string;
}>;
export type GetAlleleCitationsInput = z.infer<typeof getAlleleCitationsSchema>;
export interface CitationInfo {
    pubmed_id: string;
    title: string | null;
    authors: string | null;
    journal: string | null;
    year: number | null;
}
export interface GetAlleleCitationsResult {
    allele: string;
    accession: string;
    citation_count: number;
    citations: CitationInfo[];
    pubmed_ids: string[];
    note: string;
}
export declare function getAlleleCitations(input: GetAlleleCitationsInput): Promise<GetAlleleCitationsResult>;
export declare const getAlleleCitationsTool: {
    name: string;
    description: string;
    inputSchema: z.ZodObject<{
        allele: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        allele: string;
    }, {
        allele: string;
    }>;
    handler: typeof getAlleleCitations;
};
//# sourceMappingURL=get-allele-citations.d.ts.map