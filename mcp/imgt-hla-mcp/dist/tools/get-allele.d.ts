/**
 * get_allele tool
 *
 * Get detailed information about a specific allele.
 */
import { z } from 'zod';
export declare const getAlleleSchema: z.ZodObject<{
    allele: z.ZodString;
    include_sequence: z.ZodDefault<z.ZodOptional<z.ZodUnion<[z.ZodBoolean, z.ZodEffects<z.ZodString, boolean, string>]>>>;
    include_history: z.ZodDefault<z.ZodOptional<z.ZodUnion<[z.ZodBoolean, z.ZodEffects<z.ZodString, boolean, string>]>>>;
}, "strip", z.ZodTypeAny, {
    allele: string;
    include_sequence: boolean;
    include_history: boolean;
}, {
    allele: string;
    include_sequence?: string | boolean | undefined;
    include_history?: string | boolean | undefined;
}>;
export type GetAlleleInput = z.infer<typeof getAlleleSchema>;
export interface GetAlleleResult {
    accession: string;
    name: string;
    locus: string;
    class: string;
    features: Array<{
        name: string;
        type: string;
        start: number;
        end: number;
    }>;
    cells: Array<{
        id: string;
        name: string;
    }>;
    citations: Array<{
        pubmed_id?: string;
        title?: string;
        authors?: string;
        journal?: string;
        year?: number;
    }>;
    confirmation_count: number;
    sequences?: {
        coding?: {
            sequence: string;
            length: number;
        };
        genomic?: {
            sequence: string;
            length: number;
        };
        protein?: {
            sequence: string;
            length: number;
        };
    };
    history?: Array<{
        version: string;
        name: string;
    }>;
}
export declare function getAllele(input: GetAlleleInput): Promise<GetAlleleResult>;
export declare const getAlleleTool: {
    name: string;
    description: string;
    inputSchema: z.ZodObject<{
        allele: z.ZodString;
        include_sequence: z.ZodDefault<z.ZodOptional<z.ZodUnion<[z.ZodBoolean, z.ZodEffects<z.ZodString, boolean, string>]>>>;
        include_history: z.ZodDefault<z.ZodOptional<z.ZodUnion<[z.ZodBoolean, z.ZodEffects<z.ZodString, boolean, string>]>>>;
    }, "strip", z.ZodTypeAny, {
        allele: string;
        include_sequence: boolean;
        include_history: boolean;
    }, {
        allele: string;
        include_sequence?: string | boolean | undefined;
        include_history?: string | boolean | undefined;
    }>;
    handler: typeof getAllele;
};
//# sourceMappingURL=get-allele.d.ts.map