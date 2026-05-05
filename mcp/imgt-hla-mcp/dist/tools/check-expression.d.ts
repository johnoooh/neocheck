/**
 * check_allele_expression tool
 *
 * Check if alleles are null, low-expressing, or have other expression variants.
 */
import { z } from 'zod';
import { type ExpressionSuffix } from '../types/imgt.js';
export declare const checkExpressionSchema: z.ZodObject<{
    alleles: z.ZodArray<z.ZodString, "many">;
}, "strip", z.ZodTypeAny, {
    alleles: string[];
}, {
    alleles: string[];
}>;
export type CheckExpressionInput = z.infer<typeof checkExpressionSchema>;
export interface ExpressionStatus {
    allele: string;
    suffix: ExpressionSuffix;
    description: string;
    is_expressing: boolean;
}
export interface CheckExpressionResult {
    results: ExpressionStatus[];
    summary: {
        total: number;
        expressing: number;
        null: number;
        low: number;
        other_variants: number;
    };
}
export declare function checkExpression(input: CheckExpressionInput): Promise<CheckExpressionResult>;
export declare const checkExpressionTool: {
    name: string;
    description: string;
    inputSchema: z.ZodObject<{
        alleles: z.ZodArray<z.ZodString, "many">;
    }, "strip", z.ZodTypeAny, {
        alleles: string[];
    }, {
        alleles: string[];
    }>;
    handler: typeof checkExpression;
};
//# sourceMappingURL=check-expression.d.ts.map