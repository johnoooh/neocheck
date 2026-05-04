/**
 * search_alleles tool
 *
 * Search for HLA alleles by name pattern or query.
 */

import { z } from 'zod';
import { imgtClient } from '../api/imgt-client.js';
import { cache, CacheKeys, CacheTTL } from '../cache/cache-manager.js';
import type { SearchType } from '../types/imgt.js';

export const searchAllelesSchema = z.object({
  query: z
    .string()
    .optional()
    .describe('Allele name pattern (e.g., "A*02:01", "DRB1*15")'),
  locus: z
    .string()
    .optional()
    .describe('Filter by locus (A, B, C, DRB1, DQB1, etc.)'),
  search_type: z
    .enum(['exact', 'startsWith', 'contains'])
    .optional()
    .default('startsWith')
    .describe('Search type: exact, startsWith, or contains'),
  limit: z
    .number()
    .min(1)
    .max(100)
    .optional()
    .default(20)
    .describe('Maximum results (default: 20, max: 100)'),
});

export type SearchAllelesInput = z.infer<typeof searchAllelesSchema>;

export interface SearchAllelesResult {
  alleles: Array<{
    accession: string;
    name: string;
  }>;
  total: number;
  has_more: boolean;
}

export async function searchAlleles(input: SearchAllelesInput): Promise<SearchAllelesResult> {
  const { query, locus, search_type, limit } = input;

  // Build cache key from parameters
  const cacheKey = CacheKeys.search(JSON.stringify({ query, locus, search_type, limit }));

  // Try cache first
  const cached = cache.get<SearchAllelesResult>(cacheKey);
  if (cached) {
    return cached;
  }

  // Fetch from API
  const response = await imgtClient.searchAlleles({
    query,
    locus,
    searchType: search_type as SearchType,
    limit,
  });

  const result: SearchAllelesResult = {
    alleles: response.data.map((a) => ({
      accession: a.accession,
      name: a.name,
    })),
    total: response.meta.total,
    has_more: response.meta.next !== null,
  };

  // Cache the result
  cache.set(cacheKey, result, CacheTTL.SHORT);

  return result;
}

export const searchAllelesTool = {
  name: 'search_alleles',
  description: 'Search for HLA alleles by name pattern or query',
  inputSchema: searchAllelesSchema,
  handler: searchAlleles,
};
