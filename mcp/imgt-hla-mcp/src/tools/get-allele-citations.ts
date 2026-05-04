/**
 * get_allele_citations tool
 *
 * Extract citations from an allele's metadata for use with PubMed MCP.
 * Returns PubMed IDs that can be passed to pubmed_fetch_contents for abstracts.
 */

import { z } from 'zod';
import { imgtClient } from '../api/imgt-client.js';
import { cache, CacheKeys, CacheTTL } from '../cache/cache-manager.js';
import type { AlleleDetailResponse } from '../types/imgt.js';

export const getAlleleCitationsSchema = z.object({
  allele: z
    .string()
    .describe('Allele name (e.g., "A*02:01:01:01", "C*05:01") or accession (e.g., "HLA00001")'),
});

export type GetAlleleCitationsInput = z.infer<typeof getAlleleCitationsSchema>;

export interface CitationInfo {
  pubmed_id: string;
  title: string | null;
  authors: string | null;
  journal: string | null;
  year: number | null;
}

export interface GetAlleleCitationsResult {
  allele: string;
  accession: string;
  citation_count: number;
  citations: CitationInfo[];
  pubmed_ids: string[];
  note: string;
}

export async function getAlleleCitations(
  input: GetAlleleCitationsInput
): Promise<GetAlleleCitationsResult> {
  const { allele } = input;

  // Try to get from cache first
  const cacheKey = CacheKeys.allele(allele);
  let alleleData = cache.get<AlleleDetailResponse>(cacheKey);

  if (!alleleData) {
    alleleData = await imgtClient.getAllele(allele);
    cache.set(cacheKey, alleleData, CacheTTL.MEDIUM);
  }

  // Extract citations with PubMed IDs
  // Note: API uses 'pubmed' field, not 'pubmed_id'
  const citations: CitationInfo[] = [];
  const pubmedIds: string[] = [];

  for (const citation of alleleData.citations ?? []) {
    if (citation.pubmed) {
      const year = typeof citation.year === 'string'
        ? parseInt(citation.year, 10)
        : citation.year ?? null;

      citations.push({
        pubmed_id: citation.pubmed,
        title: citation.title ?? null,
        authors: citation.authors ?? null,
        journal: citation.journal ?? null,
        year: year,
      });
      pubmedIds.push(citation.pubmed);
    }
  }

  return {
    allele: alleleData.name,
    accession: alleleData.accession,
    citation_count: citations.length,
    citations,
    pubmed_ids: pubmedIds,
    note:
      pubmedIds.length > 0
        ? `Use pubmed_fetch_contents with IDs [${pubmedIds.join(', ')}] to get full abstracts.`
        : 'No PubMed citations found for this allele.',
  };
}

export const getAlleleCitationsTool = {
  name: 'get_allele_citations',
  description:
    'Get PubMed citations for an HLA allele. Returns PubMed IDs that can be used with ' +
    'the PubMed MCP server (pubmed_fetch_contents) to retrieve full abstracts and paper details.',
  inputSchema: getAlleleCitationsSchema,
  handler: getAlleleCitations,
};
