/**
 * visualize_comparison tool
 *
 * Generate interactive HTML visualization of HLA allele comparisons.
 * Uses pre-computed alignments from IMGT/GitHub to properly handle
 * partial sequences.
 *
 * Includes sequence alignment, difference plots, and protein domain mapping.
 */
import { z } from 'zod';
export declare const visualizeComparisonSchema: z.ZodObject<{
    alleles: z.ZodArray<z.ZodString, "many">;
    output_path: z.ZodOptional<z.ZodString>;
    title: z.ZodDefault<z.ZodOptional<z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    alleles: string[];
    title: string;
    output_path?: string | undefined;
}, {
    alleles: string[];
    output_path?: string | undefined;
    title?: string | undefined;
}>;
export type VisualizeComparisonInput = z.infer<typeof visualizeComparisonSchema>;
interface VisualizationSummary {
    alleles_compared: number;
    locus: string;
    protein_differences: number;
    coding_differences: number;
    peptide_binding_differences: number;
    skipped_unknown_positions: number;
    warnings: string[];
}
export declare function visualizeComparison(input: VisualizeComparisonInput): Promise<{
    html?: string;
    saved_to?: string;
    message?: string;
    summary?: VisualizationSummary;
    error?: string;
    note?: string;
}>;
export declare const visualizeComparisonTool: {
    name: string;
    description: string;
    inputSchema: z.ZodObject<{
        alleles: z.ZodArray<z.ZodString, "many">;
        output_path: z.ZodOptional<z.ZodString>;
        title: z.ZodDefault<z.ZodOptional<z.ZodString>>;
    }, "strip", z.ZodTypeAny, {
        alleles: string[];
        title: string;
        output_path?: string | undefined;
    }, {
        alleles: string[];
        output_path?: string | undefined;
        title?: string | undefined;
    }>;
    handler: typeof visualizeComparison;
};
export {};
//# sourceMappingURL=visualize-comparison.d.ts.map