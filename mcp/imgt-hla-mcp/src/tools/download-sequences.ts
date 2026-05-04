/**
 * download_sequences tool
 *
 * Bulk download sequences for multiple alleles.
 */

import { z } from 'zod';
import { imgtClient } from '../api/imgt-client.js';
import { cache, CacheKeys, CacheTTL } from '../cache/cache-manager.js';
import type { SequenceType } from '../types/imgt.js';

export const downloadSequencesSchema = z.object({
  locus: z.string().optional().describe('Filter by locus (A, B, C, DRB1, etc.)'),
  query: z.string().optional().describe('IMGT query string for advanced filtering'),
  sequence_type: z
    .enum(['coding', 'genomic', 'protein'])
    .describe('Type of sequence: coding (CDS), genomic (full DNA), or protein'),
  format: z
    .enum(['fasta'])
    .optional()
    .default('fasta')
    .describe('Output format (currently only FASTA supported)'),
});

export type DownloadSequencesInput = z.infer<typeof downloadSequencesSchema>;

export interface DownloadSequencesResult {
  sequence_type: SequenceType;
  format: 'fasta';
  content: string;
  sequence_count: number;
  total_length: number;
}

export async function downloadSequences(
  input: DownloadSequencesInput
): Promise<DownloadSequencesResult> {
  const { locus, query, sequence_type } = input;

  // Build cache key
  const cacheKey = `download:${locus ?? 'all'}:${sequence_type}:${query ?? 'none'}`;

  // Try cache first (use longer TTL for bulk data)
  const cached = cache.get<DownloadSequencesResult>(cacheKey);
  if (cached) {
    return cached;
  }

  // Fetch from API
  const content = await imgtClient.downloadSequences({
    locus,
    query,
    sequenceType: sequence_type,
  });

  // Count sequences (count '>' characters at start of lines)
  const sequenceCount = (content.match(/^>/gm) || []).length;

  // Calculate total sequence length (exclude headers and newlines)
  const totalLength = content
    .split('\n')
    .filter((line) => !line.startsWith('>'))
    .join('').length;

  const result: DownloadSequencesResult = {
    sequence_type,
    format: 'fasta',
    content,
    sequence_count: sequenceCount,
    total_length: totalLength,
  };

  // Cache with longer TTL for bulk data
  cache.set(cacheKey, result, CacheTTL.LONG);

  return result;
}

export const downloadSequencesTool = {
  name: 'download_sequences',
  description: 'Bulk download sequences for multiple HLA alleles in FASTA format',
  inputSchema: downloadSequencesSchema,
  handler: downloadSequences,
};
