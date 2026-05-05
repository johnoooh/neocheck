/**
 * get_sequence tool
 *
 * Retrieve nucleotide or protein sequence for an allele.
 */
import { z } from 'zod';
import type { SequenceType } from '../types/imgt.js';
export declare const getSequenceSchema: z.ZodObject<{
    allele: z.ZodString;
    sequence_type: z.ZodEnum<["coding", "genomic", "protein"]>;
    format: z.ZodDefault<z.ZodOptional<z.ZodEnum<["raw", "fasta"]>>>;
}, "strip", z.ZodTypeAny, {
    allele: string;
    sequence_type: "coding" | "genomic" | "protein";
    format: "raw" | "fasta";
}, {
    allele: string;
    sequence_type: "coding" | "genomic" | "protein";
    format?: "raw" | "fasta" | undefined;
}>;
export type GetSequenceInput = z.infer<typeof getSequenceSchema>;
export interface GetSequenceResult {
    allele: string;
    accession: string;
    sequence_type: SequenceType;
    format: 'raw' | 'fasta';
    sequence: string;
    length: number;
}
export declare function getSequence(input: GetSequenceInput): Promise<GetSequenceResult>;
export declare const getSequenceTool: {
    name: string;
    description: string;
    inputSchema: z.ZodObject<{
        allele: z.ZodString;
        sequence_type: z.ZodEnum<["coding", "genomic", "protein"]>;
        format: z.ZodDefault<z.ZodOptional<z.ZodEnum<["raw", "fasta"]>>>;
    }, "strip", z.ZodTypeAny, {
        allele: string;
        sequence_type: "coding" | "genomic" | "protein";
        format: "raw" | "fasta";
    }, {
        allele: string;
        sequence_type: "coding" | "genomic" | "protein";
        format?: "raw" | "fasta" | undefined;
    }>;
    handler: typeof getSequence;
};
//# sourceMappingURL=get-sequence.d.ts.map