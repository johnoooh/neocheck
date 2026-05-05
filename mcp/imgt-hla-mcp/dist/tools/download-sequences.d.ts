/**
 * download_sequences tool
 *
 * Bulk download sequences for multiple alleles.
 */
import { z } from 'zod';
import type { SequenceType } from '../types/imgt.js';
export declare const downloadSequencesSchema: z.ZodObject<{
    locus: z.ZodOptional<z.ZodString>;
    query: z.ZodOptional<z.ZodString>;
    sequence_type: z.ZodEnum<["coding", "genomic", "protein"]>;
    format: z.ZodDefault<z.ZodOptional<z.ZodEnum<["fasta"]>>>;
}, "strip", z.ZodTypeAny, {
    sequence_type: "coding" | "genomic" | "protein";
    format: "fasta";
    query?: string | undefined;
    locus?: string | undefined;
}, {
    sequence_type: "coding" | "genomic" | "protein";
    query?: string | undefined;
    locus?: string | undefined;
    format?: "fasta" | undefined;
}>;
export type DownloadSequencesInput = z.infer<typeof downloadSequencesSchema>;
export interface DownloadSequencesResult {
    sequence_type: SequenceType;
    format: 'fasta';
    content: string;
    sequence_count: number;
    total_length: number;
}
export declare function downloadSequences(input: DownloadSequencesInput): Promise<DownloadSequencesResult>;
export declare const downloadSequencesTool: {
    name: string;
    description: string;
    inputSchema: z.ZodObject<{
        locus: z.ZodOptional<z.ZodString>;
        query: z.ZodOptional<z.ZodString>;
        sequence_type: z.ZodEnum<["coding", "genomic", "protein"]>;
        format: z.ZodDefault<z.ZodOptional<z.ZodEnum<["fasta"]>>>;
    }, "strip", z.ZodTypeAny, {
        sequence_type: "coding" | "genomic" | "protein";
        format: "fasta";
        query?: string | undefined;
        locus?: string | undefined;
    }, {
        sequence_type: "coding" | "genomic" | "protein";
        query?: string | undefined;
        locus?: string | undefined;
        format?: "fasta" | undefined;
    }>;
    handler: typeof downloadSequences;
};
//# sourceMappingURL=download-sequences.d.ts.map