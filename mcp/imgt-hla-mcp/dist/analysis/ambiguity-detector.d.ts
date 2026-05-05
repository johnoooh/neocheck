/**
 * Ambiguity Detector for HLA Typing
 *
 * Detects ambiguous allele pairs that produce identical heterozygous patterns.
 * This is critical for HLA typing interpretation when phase cannot be determined.
 *
 * Example: A*02:01:01:01/A*68:01:01:01 and A*02:614:01/A*68:164:02 may be
 * indistinguishable if they differ only at position 814 with swapped bases.
 */
import { type SequenceType } from '../types/imgt.js';
export interface SequenceDifference {
    position: number;
    allele1_base: string;
    allele2_base: string;
}
export interface AmbiguousPair {
    pair: [string, string];
    differing_positions: number[];
    explanation: string;
}
export interface AmbiguityResult {
    input_pair: [string, string];
    ambiguous_pairs: AmbiguousPair[];
    total_differences: number;
    positions_analyzed: number[];
    sequence_type: SequenceType;
    locus1: string;
    locus2: string;
}
export declare class AmbiguityDetector {
    /**
     * Find ambiguous allele pairs for a given input pair
     */
    findAmbiguousPairs(allele1: string, allele2: string, sequenceType?: SequenceType, regionStart?: number, regionEnd?: number): Promise<AmbiguityResult>;
    /**
     * Get sequence for an allele
     */
    private getAlleleSequence;
    /**
     * Find positions where two sequences differ
     */
    private findDifferences;
    /**
     * Get alignment data for a locus as a map of allele -> sequence
     */
    private getLocusAlignmentData;
    /**
     * Find alleles that could serve as swap candidates
     */
    private findSwapCandidates;
    /**
     * Check if two candidate alleles produce the same heterozygous pattern as the originals
     */
    private producesSamePattern;
    /**
     * Generate human-readable explanation of the ambiguity
     */
    private generateExplanation;
}
export declare const ambiguityDetector: AmbiguityDetector;
//# sourceMappingURL=ambiguity-detector.d.ts.map