/**
 * get_alignment tool
 *
 * Retrieve pre-computed multiple sequence alignments from GitHub.
 */
import { z } from 'zod';
import type { AlignmentType, AlignedSequence } from '../types/imgt.js';
export declare const getAlignmentSchema: z.ZodObject<{
    locus: z.ZodString;
    alignment_type: z.ZodEnum<["protein", "nucleotide", "genomic"]>;
    alleles: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
}, "strip", z.ZodTypeAny, {
    locus: string;
    alignment_type: "genomic" | "protein" | "nucleotide";
    alleles?: string[] | undefined;
}, {
    locus: string;
    alignment_type: "genomic" | "protein" | "nucleotide";
    alleles?: string[] | undefined;
}>;
export type GetAlignmentInput = z.infer<typeof getAlignmentSchema>;
export interface GetAlignmentResult {
    locus: string;
    alignment_type: AlignmentType;
    sequences: AlignedSequence[];
    reference?: string;
    total_sequences: number;
    alignment_length: number;
}
export declare function getAlignment(input: GetAlignmentInput): Promise<GetAlignmentResult>;
export declare const getAlignmentTool: {
    name: string;
    description: string;
    inputSchema: z.ZodObject<{
        locus: z.ZodString;
        alignment_type: z.ZodEnum<["protein", "nucleotide", "genomic"]>;
        alleles: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    }, "strip", z.ZodTypeAny, {
        locus: string;
        alignment_type: "genomic" | "protein" | "nucleotide";
        alleles?: string[] | undefined;
    }, {
        locus: string;
        alignment_type: "genomic" | "protein" | "nucleotide";
        alleles?: string[] | undefined;
    }>;
    handler: typeof getAlignment;
};
//# sourceMappingURL=get-alignment.d.ts.map