/**
 * check_allele_expression tool
 *
 * Check if alleles are null, low-expressing, or have other expression variants.
 */

import { z } from 'zod';
import {
  getExpressionSuffix,
  EXPRESSION_DESCRIPTIONS,
  type ExpressionSuffix,
} from '../types/imgt.js';

export const checkExpressionSchema = z.object({
  alleles: z.array(z.string()).min(1).describe('List of allele names to check'),
});

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

export async function checkExpression(input: CheckExpressionInput): Promise<CheckExpressionResult> {
  const { alleles } = input;

  const results: ExpressionStatus[] = alleles.map((allele) => {
    const suffix = getExpressionSuffix(allele);

    return {
      allele,
      suffix,
      description: suffix ? EXPRESSION_DESCRIPTIONS[suffix] : 'Normal expression',
      is_expressing: suffix === null || suffix === 'L',
    };
  });

  // Calculate summary
  const summary = {
    total: results.length,
    expressing: results.filter((r) => r.is_expressing).length,
    null: results.filter((r) => r.suffix === 'N').length,
    low: results.filter((r) => r.suffix === 'L').length,
    other_variants: results.filter((r) => r.suffix && !['N', 'L'].includes(r.suffix)).length,
  };

  return { results, summary };
}

export const checkExpressionTool = {
  name: 'check_allele_expression',
  description:
    'Check if HLA alleles are null (N), low-expressing (L), or have other expression variants (S, C, A, Q)',
  inputSchema: checkExpressionSchema,
  handler: checkExpression,
};
