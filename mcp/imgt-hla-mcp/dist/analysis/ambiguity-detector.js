/**
 * Ambiguity Detector for HLA Typing
 *
 * Detects ambiguous allele pairs that produce identical heterozygous patterns.
 * This is critical for HLA typing interpretation when phase cannot be determined.
 *
 * Example: A*02:01:01:01/A*68:01:01:01 and A*02:614:01/A*68:164:02 may be
 * indistinguishable if they differ only at position 814 with swapped bases.
 */
import { imgtClient } from '../api/imgt-client.js';
import { githubClient } from '../api/github-client.js';
import { cache, CacheKeys, CacheTTL } from '../cache/cache-manager.js';
import { extractLocus } from '../types/imgt.js';
export class AmbiguityDetector {
    /**
     * Find ambiguous allele pairs for a given input pair
     */
    async findAmbiguousPairs(allele1, allele2, sequenceType = 'coding', regionStart, regionEnd) {
        // Extract loci
        const locus1 = extractLocus(allele1);
        const locus2 = extractLocus(allele2);
        if (!locus1 || !locus2) {
            throw new Error(`Could not extract locus from allele names: ${allele1}, ${allele2}`);
        }
        // Get sequences for input alleles
        const [seq1, seq2] = await Promise.all([
            this.getAlleleSequence(allele1, sequenceType),
            this.getAlleleSequence(allele2, sequenceType),
        ]);
        // Find positions where the alleles differ
        const differences = this.findDifferences(seq1, seq2, regionStart, regionEnd);
        if (differences.length === 0) {
            return {
                input_pair: [allele1, allele2],
                ambiguous_pairs: [],
                total_differences: 0,
                positions_analyzed: [],
                sequence_type: sequenceType,
                locus1,
                locus2,
            };
        }
        // Get alignment data for both loci to search for swap candidates
        const [locus1Alignment, locus2Alignment] = await Promise.all([
            this.getLocusAlignmentData(locus1, sequenceType),
            locus1 !== locus2 ? this.getLocusAlignmentData(locus2, sequenceType) : Promise.resolve(null),
        ]);
        // Find candidates at each locus that have swapped bases at differing positions
        const ambiguousPairs = [];
        // For each locus, find alleles with swapped bases
        const locus1Candidates = this.findSwapCandidates(allele1, seq1, differences, locus1Alignment, 'allele1');
        const locus2Candidates = this.findSwapCandidates(allele2, seq2, differences, locus2Alignment ?? locus1Alignment, 'allele2');
        // Check all combinations of candidates
        for (const cand1 of locus1Candidates) {
            for (const cand2 of locus2Candidates) {
                // Verify this pair produces the same heterozygous pattern
                if (this.producesSamePattern(cand1.sequence, cand2.sequence, seq1, seq2, differences)) {
                    const explanation = this.generateExplanation(differences, seq1, seq2, cand1, cand2);
                    ambiguousPairs.push({
                        pair: [cand1.allele, cand2.allele],
                        differing_positions: differences.map((d) => d.position),
                        explanation,
                    });
                }
            }
        }
        return {
            input_pair: [allele1, allele2],
            ambiguous_pairs: ambiguousPairs,
            total_differences: differences.length,
            positions_analyzed: differences.map((d) => d.position),
            sequence_type: sequenceType,
            locus1,
            locus2,
        };
    }
    /**
     * Get sequence for an allele
     */
    async getAlleleSequence(allele, sequenceType) {
        const cacheKey = CacheKeys.allele(allele);
        let alleleData = cache.get(cacheKey);
        if (!alleleData) {
            alleleData = await imgtClient.getAllele(allele);
            cache.set(cacheKey, alleleData, CacheTTL.MEDIUM);
        }
        // API returns sequence.coding, not sequence_coding
        switch (sequenceType) {
            case 'coding':
                if (!alleleData.sequence?.coding) {
                    throw new Error(`No coding sequence available for ${allele}`);
                }
                return alleleData.sequence.coding;
            case 'genomic':
                if (!alleleData.sequence?.genomic) {
                    throw new Error(`No genomic sequence available for ${allele}`);
                }
                return alleleData.sequence.genomic;
            case 'protein':
                if (!alleleData.sequence?.protein) {
                    throw new Error(`No protein sequence available for ${allele}`);
                }
                return alleleData.sequence.protein;
        }
        throw new Error(`Unknown sequence type: ${sequenceType}`);
    }
    /**
     * Find positions where two sequences differ
     */
    findDifferences(seq1, seq2, regionStart, regionEnd) {
        const differences = [];
        const start = regionStart ?? 0;
        const end = Math.min(regionEnd ?? seq1.length, seq1.length, seq2.length);
        for (let i = start; i < end; i++) {
            if (seq1[i] !== seq2[i]) {
                differences.push({
                    position: i,
                    allele1_base: seq1[i],
                    allele2_base: seq2[i],
                });
            }
        }
        return differences;
    }
    /**
     * Get alignment data for a locus as a map of allele -> sequence
     */
    async getLocusAlignmentData(locus, sequenceType) {
        const alignmentType = sequenceType === 'protein' ? 'protein' : sequenceType === 'genomic' ? 'genomic' : 'nucleotide';
        const cacheKey = `alignment-map:${locus}:${alignmentType}`;
        let alignmentMap = cache.get(cacheKey);
        if (!alignmentMap) {
            try {
                const content = await githubClient.getAlignment(locus, alignmentType);
                const parsed = githubClient.parseAlignment(content);
                alignmentMap = new Map();
                for (const seq of parsed.sequences) {
                    // Remove gaps for comparison (store ungapped sequence)
                    alignmentMap.set(seq.allele, seq.sequence.replace(/-/g, ''));
                }
                cache.set(cacheKey, alignmentMap, CacheTTL.LONG);
            }
            catch (error) {
                // Fall back to empty map if alignment not available
                alignmentMap = new Map();
            }
        }
        return alignmentMap;
    }
    /**
     * Find alleles that could serve as swap candidates
     */
    findSwapCandidates(originalAllele, originalSeq, differences, alignmentData, whichAllele) {
        const candidates = [];
        for (const [alleleName, sequence] of alignmentData) {
            // Skip the original allele
            if (alleleName === originalAllele)
                continue;
            // Check if this allele has the swapped bases at all differing positions
            let isCandidate = true;
            for (const diff of differences) {
                if (diff.position >= sequence.length) {
                    isCandidate = false;
                    break;
                }
                // For this to be a swap candidate:
                // - If we're looking for allele1 replacement, the candidate should have allele2's base
                // - If we're looking for allele2 replacement, the candidate should have allele1's base
                const expectedBase = whichAllele === 'allele1' ? diff.allele2_base : diff.allele1_base;
                if (sequence[diff.position] !== expectedBase) {
                    isCandidate = false;
                    break;
                }
            }
            if (isCandidate) {
                // Also verify the rest of the sequence matches (within the typed region)
                // For simplicity, we check that non-differing positions match
                let matches = true;
                const checkLength = Math.min(originalSeq.length, sequence.length);
                for (let i = 0; i < checkLength; i++) {
                    const isDifferingPosition = differences.some((d) => d.position === i);
                    if (!isDifferingPosition && originalSeq[i] !== sequence[i]) {
                        matches = false;
                        break;
                    }
                }
                if (matches) {
                    candidates.push({ allele: alleleName, sequence });
                }
            }
        }
        return candidates;
    }
    /**
     * Check if two candidate alleles produce the same heterozygous pattern as the originals
     */
    producesSamePattern(candSeq1, candSeq2, origSeq1, origSeq2, differences) {
        for (const diff of differences) {
            const pos = diff.position;
            // Get bases at this position
            const origBases = new Set([origSeq1[pos], origSeq2[pos]]);
            const candBases = new Set([candSeq1[pos], candSeq2[pos]]);
            // The heterozygous pattern should be the same (same two bases observed)
            if (origBases.size !== candBases.size)
                return false;
            for (const base of origBases) {
                if (!candBases.has(base))
                    return false;
            }
        }
        return true;
    }
    /**
     * Generate human-readable explanation of the ambiguity
     */
    generateExplanation(differences, origSeq1, origSeq2, cand1, cand2) {
        const parts = [];
        for (const diff of differences) {
            const pos = diff.position + 1; // 1-indexed for human readability
            const origPair = `${origSeq1[diff.position]}/${origSeq2[diff.position]}`;
            const candPair = `${cand1.sequence[diff.position]}/${cand2.sequence[diff.position]}`;
            parts.push(`Position ${pos}: Input has ${origPair}, alternative has ${candPair}`);
        }
        return parts.join('; ');
    }
}
// Export singleton instance
export const ambiguityDetector = new AmbiguityDetector();
//# sourceMappingURL=ambiguity-detector.js.map