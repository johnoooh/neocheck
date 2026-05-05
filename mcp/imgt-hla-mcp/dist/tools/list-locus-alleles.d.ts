/**
 * list_locus_alleles tool
 *
 * List all alleles for a specific HLA locus.
 */
import { z } from 'zod';
export declare const listLocusAllelesSchema: z.ZodObject<{
    locus: z.ZodString;
    limit: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
    offset: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    limit: number;
    locus: string;
    offset?: string | undefined;
}, {
    locus: string;
    limit?: number | undefined;
    offset?: string | undefined;
}>;
export type ListLocusAllelesInput = z.infer<typeof listLocusAllelesSchema>;
export interface ListLocusAllelesResult {
    locus: string;
    alleles: Array<{
        accession: string;
        name: string;
    }>;
    total: number;
    has_more: boolean;
    next_cursor: string | null;
}
export declare function listLocusAlleles(input: ListLocusAllelesInput): Promise<ListLocusAllelesResult>;
export declare const listLocusAllelesTool: {
    name: string;
    description: string;
    inputSchema: z.ZodObject<{
        locus: z.ZodString;
        limit: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
        offset: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        limit: number;
        locus: string;
        offset?: string | undefined;
    }, {
        locus: string;
        limit?: number | undefined;
        offset?: string | undefined;
    }>;
    handler: typeof listLocusAlleles;
};
//# sourceMappingURL=list-locus-alleles.d.ts.map