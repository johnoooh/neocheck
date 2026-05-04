/**
 * get_sequence tool
 *
 * Retrieve nucleotide or protein sequence for an allele.
 */

import { z } from 'zod';
import { imgtClient } from '../api/imgt-client.js';
import { cache, CacheKeys, CacheTTL } from '../cache/cache-manager.js';
import type { SequenceType, AlleleDetailResponse } from '../types/imgt.js';

export const getSequenceSchema = z.object({
  allele: z.string().describe('Allele name (e.g., "A*01:01:01:01") or accession'),
  sequence_type: z
    .enum(['coding', 'genomic', 'protein'])
    .describe('Type of sequence: coding (CDS), genomic (full DNA), or protein'),
  format: z
    .enum(['raw', 'fasta'])
    .optional()
    .default('fasta')
    .describe('Output format: raw sequence or FASTA'),
});

export type GetSequenceInput = z.infer<typeof getSequenceSchema>;

export interface GetSequenceResult {
  allele: string;
  accession: string;
  sequence_type: SequenceType;
  format: 'raw' | 'fasta';
  sequence: string;
  length: number;
}

export async function getSequence(input: GetSequenceInput): Promise<GetSequenceResult> {
  const { allele, sequence_type, format } = input;

  // Try to get from allele cache first
  const alleleCacheKey = CacheKeys.allele(allele);
  let alleleData = cache.get<AlleleDetailResponse>(alleleCacheKey);

  if (!alleleData) {
    // Fetch from API
    alleleData = await imgtClient.getAllele(allele);

    // Cache the full response
    cache.set(alleleCacheKey, alleleData, CacheTTL.MEDIUM);
  }

  // Get the requested sequence - API returns sequence.coding, not sequence_coding
  let sequence: string | null | undefined = null;
  switch (sequence_type) {
    case 'coding':
      sequence = alleleData.sequence?.coding;
      break;
    case 'genomic':
      sequence = alleleData.sequence?.genomic;
      break;
    case 'protein':
      sequence = alleleData.sequence?.protein;
      break;
  }

  if (!sequence) {
    throw new Error(
      `No ${sequence_type} sequence available for allele ${allele}. ` +
        `This may be because the allele only has partial sequence data.`
    );
  }

  // Format the output
  let formattedSequence: string;
  if (format === 'fasta') {
    const header = `>${alleleData.name} | ${alleleData.accession} | ${sequence_type}`;
    // Wrap sequence at 60 characters per line (standard FASTA)
    const wrappedSeq = sequence.match(/.{1,60}/g)?.join('\n') ?? sequence;
    formattedSequence = `${header}\n${wrappedSeq}`;
  } else {
    formattedSequence = sequence;
  }

  return {
    allele: alleleData.name,
    accession: alleleData.accession,
    sequence_type,
    format,
    sequence: formattedSequence,
    length: sequence.length,
  };
}

export const getSequenceTool = {
  name: 'get_sequence',
  description: 'Retrieve nucleotide or protein sequence for an HLA allele',
  inputSchema: getSequenceSchema,
  handler: getSequence,
};
