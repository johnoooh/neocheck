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
import { ambiguityDetector } from '../analysis/ambiguity-detector.js';
export const findAmbiguousPairsSchema = z.object({
    allele1: z.string().describe('First allele in the pair (e.g., "A*02:01:01:01")'),
    allele2: z.string().describe('Second allele in the pair (e.g., "A*68:01:01:01")'),
    sequence_type: z
        .enum(['coding', 'genomic'])
        .optional()
        .default('coding')
        .describe('Type of sequence to compare'),
    region_start: z.number().optional().describe('Start position for comparison (0-indexed)'),
    region_end: z.number().optional().describe('End position for comparison (0-indexed, exclusive)'),
});
export async function findAmbiguousPairs(input) {
    const { allele1, allele2, sequence_type, region_start, region_end } = input;
    const result = await ambiguityDetector.findAmbiguousPairs(allele1, allele2, sequence_type, region_start, region_end);
    // Generate summary
    let summary;
    if (result.ambiguous_pairs.length === 0) {
        if (result.total_differences === 0) {
            summary = `The alleles ${allele1} and ${allele2} have identical ${sequence_type} sequences in the analyzed region. No ambiguity exists.`;
        }
        else {
            summary =
                `Found ${result.total_differences} difference(s) between ${allele1} and ${allele2} ` +
                    `at position(s) ${result.positions_analyzed.map((p) => p + 1).join(', ')}. ` +
                    `No alternative allele pairs were found that would produce the same heterozygous pattern.`;
        }
    }
    else {
        summary =
            `Found ${result.ambiguous_pairs.length} ambiguous allele pair(s) that are indistinguishable ` +
                `from ${allele1}/${allele2} based on ${sequence_type} sequence. ` +
                `These pairs differ at position(s) ${result.positions_analyzed.map((p) => p + 1).join(', ')} ` +
                `but produce the same heterozygous pattern.`;
    }
    return {
        input_pair: result.input_pair,
        ambiguous_pairs: result.ambiguous_pairs,
        total_differences: result.total_differences,
        positions_analyzed: result.positions_analyzed,
        sequence_type: result.sequence_type,
        summary,
    };
}
export const findAmbiguousPairsTool = {
    name: 'find_ambiguous_pairs',
    description: 'Find HLA allele pairs that are indistinguishable based on sequence identity. ' +
        'Critical for resolving typing ambiguities when phase cannot be determined. ' +
        'Example: A*02:01:01:01/A*68:01:01:01 may be indistinguishable from A*02:614:01/A*68:164:02.',
    inputSchema: findAmbiguousPairsSchema,
    handler: findAmbiguousPairs,
};
//# sourceMappingURL=find-ambiguous-pairs.js.map