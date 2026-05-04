/**
 * get_allele tool
 *
 * Get detailed information about a specific allele.
 */

import { z } from 'zod';
import { imgtClient } from '../api/imgt-client.js';
import { cache, CacheKeys, CacheTTL } from '../cache/cache-manager.js';
import type { AlleleDetailResponse } from '../types/imgt.js';

// Use z.coerce.boolean() to handle string "true"/"false" from MCP
export const getAlleleSchema = z.object({
  allele: z
    .string()
    .describe('Allele name (e.g., "A*01:01:01:01") or accession (e.g., "HLA00001")'),
  include_sequence: z
    .union([z.boolean(), z.string().transform((v) => v === 'true')])
    .optional()
    .default(false)
    .describe('Include sequences in response'),
  include_history: z
    .union([z.boolean(), z.string().transform((v) => v === 'true')])
    .optional()
    .default(false)
    .describe('Include nomenclature history'),
});

export type GetAlleleInput = z.infer<typeof getAlleleSchema>;

export interface GetAlleleResult {
  accession: string;
  name: string;
  locus: string;
  class: string;
  features: Array<{
    name: string;
    type: string;
    start: number;
    end: number;
  }>;
  cells: Array<{
    id: string;
    name: string;
  }>;
  citations: Array<{
    pubmed_id?: string;
    title?: string;
    authors?: string;
    journal?: string;
    year?: number;
  }>;
  confirmation_count: number;
  sequences?: {
    coding?: { sequence: string; length: number };
    genomic?: { sequence: string; length: number };
    protein?: { sequence: string; length: number };
  };
  history?: Array<{
    version: string;
    name: string;
  }>;
}

export async function getAllele(input: GetAlleleInput): Promise<GetAlleleResult> {
  const { allele, include_sequence, include_history } = input;

  // Build cache key
  const cacheKey = CacheKeys.allele(allele);

  // Try to get full allele data from cache
  let fullData = cache.get<AlleleDetailResponse>(cacheKey);

  if (!fullData) {
    // Fetch from API
    fullData = await imgtClient.getAllele(allele);

    // Cache the full response
    cache.set(cacheKey, fullData, CacheTTL.MEDIUM);
  }

  // Build result based on what was requested
  // Use null-safe access with ?? [] for all arrays
  // Note: feature is a dict with coding/genomic/protein arrays, flatten for output
  const allFeatures = [
    ...(fullData.feature?.coding ?? []),
    ...(fullData.feature?.genomic ?? []),
    ...(fullData.feature?.protein ?? []),
  ];

  const result: GetAlleleResult = {
    accession: fullData.accession,
    name: fullData.name,
    locus: fullData.locus,
    class: fullData.class,
    features: allFeatures.map((f) => ({
      name: f.type + (f.number ? ` ${f.number}` : ''),
      type: f.type,
      start: f.start,
      end: f.start + (f.length ?? 0),
    })),
    cells: (fullData.cell_entries ?? []).map((c) => ({
      id: c.id,
      name: c.name,
    })),
    citations: (fullData.citations ?? []).map((c) => ({
      pubmed_id: c.pubmed,
      title: c.title,
      authors: c.authors,
      journal: c.journal,
      year: typeof c.year === 'string' ? parseInt(c.year, 10) : c.year,
    })),
    confirmation_count: fullData.confirmation_status?.length ?? 0,
  };

  // Add sequences if requested - note: API returns sequence.coding, not sequence_coding
  if (include_sequence) {
    result.sequences = {};
    if (fullData.sequence?.coding) {
      result.sequences.coding = {
        sequence: fullData.sequence.coding,
        length: fullData.sequence.coding.length,
      };
    }
    if (fullData.sequence?.genomic) {
      result.sequences.genomic = {
        sequence: fullData.sequence.genomic,
        length: fullData.sequence.genomic.length,
      };
    }
    if (fullData.sequence?.protein) {
      result.sequences.protein = {
        sequence: fullData.sequence.protein,
        length: fullData.sequence.protein.length,
      };
    }
  }

  // Add history if requested - note: API uses release_version, not version
  if (include_history && fullData.allele_history) {
    result.history = fullData.allele_history.map((h) => ({
      version: h.release_version,
      name: h.name,
    }));
  }

  return result;
}

export const getAlleleTool = {
  name: 'get_allele',
  description: 'Get detailed information about a specific HLA allele',
  inputSchema: getAlleleSchema,
  handler: getAllele,
};
