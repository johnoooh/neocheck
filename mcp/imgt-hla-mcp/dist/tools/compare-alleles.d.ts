/**
 * compare_alleles tool
 *
 * Compare two or more alleles and identify sequence differences.
 * Uses pre-computed alignments from IMGT/GitHub to properly handle
 * partial sequences and ensure accurate comparison.
 *
 * Reports both coding (nucleotide) and protein differences, plus P group status.
 */
import { z } from 'zod';
import type { SequenceType } from '../types/imgt.js';
export declare const compareAllelesSchema: z.ZodObject<{
    alleles: z.ZodArray<z.ZodString, "many">;
    sequence_type: z.ZodDefault<z.ZodOptional<z.ZodEnum<["coding", "genomic", "protein"]>>>;
    show_alignment: z.ZodDefault<z.ZodOptional<z.ZodUnion<[z.ZodBoolean, z.ZodEffects<z.ZodString, boolean, string>]>>>;
}, "strip", z.ZodTypeAny, {
    sequence_type: "coding" | "genomic" | "protein";
    alleles: string[];
    show_alignment: boolean;
}, {
    alleles: string[];
    sequence_type?: "coding" | "genomic" | "protein" | undefined;
    show_alignment?: string | boolean | undefined;
}>;
export type CompareAllelesInput = z.infer<typeof compareAllelesSchema>;
export interface PositionDifference {
    position: number;
    bases: Record<string, string>;
    is_variable: boolean;
}
export interface SequenceComparison {
    sequence_type: SequenceType | 'nucleotide';
    total_positions: number;
    comparable_positions: number;
    identical_positions: number;
    variable_positions: number;
    percent_identity: string;
    differences: PositionDifference[];
    alignment?: string;
    warnings?: string[];
}
export interface PGroupInfo {
    allele: string;
    pGroup: string | null;
}
export interface CompareAllelesResult {
    alleles: string[];
    locus: string;
    p_group_analysis: {
        same_p_group: boolean;
        p_groups: PGroupInfo[];
        explanation: string;
    };
    coding_comparison: SequenceComparison;
    protein_comparison: SequenceComparison;
    summary: string;
    warnings?: string[];
}
export declare function compareAlleles(input: CompareAllelesInput): Promise<CompareAllelesResult>;
export declare const compareAllelesTool: {
    name: string;
    description: string;
    inputSchema: z.ZodObject<{
        alleles: z.ZodArray<z.ZodString, "many">;
        sequence_type: z.ZodDefault<z.ZodOptional<z.ZodEnum<["coding", "genomic", "protein"]>>>;
        show_alignment: z.ZodDefault<z.ZodOptional<z.ZodUnion<[z.ZodBoolean, z.ZodEffects<z.ZodString, boolean, string>]>>>;
    }, "strip", z.ZodTypeAny, {
        sequence_type: "coding" | "genomic" | "protein";
        alleles: string[];
        show_alignment: boolean;
    }, {
        alleles: string[];
        sequence_type?: "coding" | "genomic" | "protein" | undefined;
        show_alignment?: string | boolean | undefined;
    }>;
    handler: typeof compareAlleles;
};
//# sourceMappingURL=compare-alleles.d.ts.map