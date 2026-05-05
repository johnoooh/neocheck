/**
 * find_ambiguous_pairs tool
 *
 * Critical HLA typing tool - Find allele pairs that are indistinguishable
 * based on sequence identity within a specified region.
 *
 * When typing shows a heterozygous genotype like A*02:01:01:01/A*68:01:01:01,
 * there may be alternative allele pairs (A*02:614:01/A*68:164:02) that produce
 * identical sequences in the typed region. This ambiguity arises because we
 * cannot determine which chromosome each read originates from.
 */
import { z } from 'zod';
export declare const findAmbiguousPairsSchema: z.ZodObject<{
    allele1: z.ZodString;
    allele2: z.ZodString;
    sequence_type: z.ZodDefault<z.ZodOptional<z.ZodEnum<["coding", "genomic"]>>>;
    region_start: z.ZodOptional<z.ZodNumber>;
    region_end: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    sequence_type: "coding" | "genomic";
    allele1: string;
    allele2: string;
    region_start?: number | undefined;
    region_end?: number | undefined;
}, {
    allele1: string;
    allele2: string;
    sequence_type?: "coding" | "genomic" | undefined;
    region_start?: number | undefined;
    region_end?: number | undefined;
}>;
export type FindAmbiguousPairsInput = z.infer<typeof findAmbiguousPairsSchema>;
export interface FindAmbiguousPairsResult {
    input_pair: [string, string];
    ambiguous_pairs: Array<{
        pair: [string, string];
        differing_positions: number[];
        explanation: string;
    }>;
    total_differences: number;
    positions_analyzed: number[];
    sequence_type: string;
    summary: string;
}
export declare function findAmbiguousPairs(input: FindAmbiguousPairsInput): Promise<FindAmbiguousPairsResult>;
export declare const findAmbiguousPairsTool: {
    name: string;
    description: string;
    inputSchema: z.ZodObject<{
        allele1: z.ZodString;
        allele2: z.ZodString;
        sequence_type: z.ZodDefault<z.ZodOptional<z.ZodEnum<["coding", "genomic"]>>>;
        region_start: z.ZodOptional<z.ZodNumber>;
        region_end: z.ZodOptional<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        sequence_type: "coding" | "genomic";
        allele1: string;
        allele2: string;
        region_start?: number | undefined;
        region_end?: number | undefined;
    }, {
        allele1: string;
        allele2: string;
        sequence_type?: "coding" | "genomic" | undefined;
        region_start?: number | undefined;
        region_end?: number | undefined;
    }>;
    handler: typeof findAmbiguousPairs;
};
//# sourceMappingURL=find-ambiguous-pairs.d.ts.map