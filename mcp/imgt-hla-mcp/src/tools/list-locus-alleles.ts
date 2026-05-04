/**
 * list_locus_alleles tool
 *
 * List all alleles for a specific HLA locus.
 */

import { z } from 'zod';
import { imgtClient } from '../api/imgt-client.js';
import { cache, CacheKeys, CacheTTL } from '../cache/cache-manager.js';

export const listLocusAllelesSchema = z.object({
  locus: z.string().describe('HLA locus (A, B, C, DRB1, DQB1, DPB1, etc.)'),
  limit: z
    .number()
    .min(1)
    .max(500)
    .optional()
    .default(50)
    .describe('Maximum results (default: 50, max: 500)'),
  offset: z.string().optional().describe('Pagination cursor from previous response'),
});

export type ListLocusAllelesInput = z.infer<typeof listLocusAllelesSchema>;

export interface ListLocusAllelesResult {
  locus: string;
  alleles: Array<{
    accession: string;
    name: string;
  }>;
  total: number;
  has_more: boolean;
  next_cursor: string | null;
}

export async function listLocusAlleles(
  input: ListLocusAllelesInput
): Promise<ListLocusAllelesResult> {
  const { locus, limit, offset } = input;

  // Normalize locus name (remove trailing asterisk if present)
  const normalizedLocus = locus.replace(/\*$/, '');

  // Build cache key
  const cacheKey = CacheKeys.alleleList(normalizedLocus, limit, offset);

  // Try cache first
  const cached = cache.get<ListLocusAllelesResult>(cacheKey);
  if (cached) {
    return cached;
  }

  // Fetch from API
  const response = await imgtClient.listLocusAlleles(normalizedLocus, limit, offset);

  const result: ListLocusAllelesResult = {
    locus: normalizedLocus,
    alleles: response.data.map((a) => ({
      accession: a.accession,
      name: a.name,
    })),
    total: response.meta.total,
    has_more: response.meta.next !== null,
    next_cursor: response.meta.next,
  };

  // Cache the result
  cache.set(cacheKey, result, CacheTTL.SHORT);

  return result;
}

export const listLocusAllelesTool = {
  name: 'list_locus_alleles',
  description: 'List all alleles for a specific HLA locus',
  inputSchema: listLocusAllelesSchema,
  handler: listLocusAlleles,
};
