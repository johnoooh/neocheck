/**
 * get_alignment tool
 *
 * Retrieve pre-computed multiple sequence alignments from GitHub.
 */

import { z } from 'zod';
import { githubClient } from '../api/github-client.js';
import { cache, CacheKeys, CacheTTL } from '../cache/cache-manager.js';
import type { AlignmentType, AlignedSequence } from '../types/imgt.js';

export const getAlignmentSchema = z.object({
  locus: z.string().describe('HLA locus (A, B, C, DRB1, etc.)'),
  alignment_type: z
    .enum(['protein', 'nucleotide', 'genomic'])
    .describe('Type of alignment: protein, nucleotide (CDS), or genomic'),
  alleles: z
    .array(z.string())
    .optional()
    .describe('Filter to specific alleles (optional)'),
});

export type GetAlignmentInput = z.infer<typeof getAlignmentSchema>;

export interface GetAlignmentResult {
  locus: string;
  alignment_type: AlignmentType;
  sequences: AlignedSequence[];
  reference?: string;
  total_sequences: number;
  alignment_length: number;
}

export async function getAlignment(input: GetAlignmentInput): Promise<GetAlignmentResult> {
  const { locus, alignment_type, alleles } = input;

  // Normalize locus name (remove trailing asterisk if present)
  const normalizedLocus = locus.replace(/\*$/, '');

  // Build cache key for full alignment
  const cacheKey = CacheKeys.alignment(normalizedLocus, alignment_type);

  // Try to get full alignment from cache
  let alignmentContent = cache.get<string>(cacheKey);

  if (!alignmentContent) {
    // Fetch from GitHub
    alignmentContent = await githubClient.getAlignment(normalizedLocus, alignment_type);

    // Cache with long TTL (alignments don't change often)
    cache.set(cacheKey, alignmentContent, CacheTTL.LONG);
  }

  // Parse the alignment
  const parsed = githubClient.parseAlignment(alignmentContent);

  // Filter to specific alleles if requested
  let sequences = parsed.sequences;
  if (alleles && alleles.length > 0) {
    const requestedSet = new Set(alleles);
    sequences = sequences.filter((seq) => requestedSet.has(seq.allele));

    if (sequences.length === 0) {
      throw new Error(
        `None of the requested alleles found in alignment. ` +
          `Requested: ${alleles.join(', ')}. ` +
          `Make sure allele names exactly match the alignment format.`
      );
    }
  }

  // Calculate alignment length (from first sequence)
  const alignmentLength = sequences.length > 0 ? sequences[0].sequence.length : 0;

  return {
    locus: normalizedLocus,
    alignment_type,
    sequences,
    reference: parsed.reference,
    total_sequences: sequences.length,
    alignment_length: alignmentLength,
  };
}

export const getAlignmentTool = {
  name: 'get_alignment',
  description:
    'Retrieve pre-computed multiple sequence alignments for HLA alleles from the IMGT/HLA database',
  inputSchema: getAlignmentSchema,
  handler: getAlignment,
};
