/**
 * GitHub Data Client for ANHIG/IMGTHLA Repository
 *
 * Provides access to alignment files and bulk data from the GitHub repository.
 * Repository: https://github.com/ANHIG/IMGTHLA
 */
import type { AlignmentType, AlignedSequence } from '../types/imgt.js';
export declare class GitHubDataClient {
    private baseUrl;
    private branch;
    constructor(baseUrl?: string, branch?: string);
    /**
     * Fetch raw file content from GitHub
     */
    private fetchFile;
    /**
     * Get the allele list (CSV format)
     */
    getAlleleList(): Promise<AlleleListEntry[]>;
    /**
     * Get alignment file for a specific locus
     * Files are in the alignments/ directory with names like:
     * - A_prot.txt (protein)
     * - A_nuc.txt (nucleotide/CDS)
     * - A_gen.txt (genomic)
     */
    getAlignment(locus: string, alignmentType: AlignmentType): Promise<string>;
    /**
     * Parse alignment file content into structured data
     *
     * IMGT alignment format:
     * - Lines starting with # are comments
     * - Lines starting with whitespace + "Prot" or containing only "|" are headers
     * - Sequence lines: " AlleleName    SEQUENCE_FRAGMENT" (allele name starts after leading space)
     * - "-" means same as reference, "." means gap, "*" means stop codon
     * - Sequences span multiple blocks (continuation lines for same allele)
     */
    parseAlignment(content: string): ParsedAlignment;
    /**
     * Get specific alleles from an alignment
     */
    getAlignmentForAlleles(locus: string, alignmentType: AlignmentType, alleleNames: string[]): Promise<AlignedSequence[]>;
    /**
     * Get FASTA file for a locus
     */
    getFasta(locus: string, sequenceType: 'nuc' | 'gen' | 'prot'): Promise<string>;
    /**
     * Parse FASTA content into sequences
     */
    parseFasta(content: string): FastaEntry[];
    /**
     * Get alignment suffix based on type
     */
    private getAlignmentSuffix;
    /**
     * Get the current database version from release info
     */
    getDatabaseVersion(): Promise<string>;
    /**
     * Get P group data from WMDA files
     * P groups contain alleles with identical protein sequences in the antigen-binding domains (exons 2 and 3)
     *
     * File format: LOCUS*;allele1/allele2/.../alleleN;P_GROUP_NAME
     * Example: A*;01:01:01:01/01:01:01:02/.../01:501;01:01P
     */
    getPGroups(): Promise<PGroupData[]>;
    /**
     * Get G group data from WMDA files
     * G groups contain alleles with identical nucleotide sequences in the antigen-binding domains
     */
    getGGroups(): Promise<GGroupData[]>;
    /**
     * Parse P group file content
     */
    private parsePGroupFile;
    /**
     * Parse G group file content
     */
    private parseGGroupFile;
    /**
     * Find P group for a specific allele
     * Returns the P group name if the allele belongs to one, or null
     */
    findPGroupForAllele(alleleName: string): Promise<string | null>;
    /**
     * Check if two alleles are in the same P group
     */
    areInSamePGroup(allele1: string, allele2: string): Promise<PGroupCheckResult>;
}
export interface AlleleListEntry {
    alleleId: string;
    allele: string;
}
export interface ParsedAlignment {
    sequences: AlignedSequence[];
    reference?: string;
}
export interface FastaEntry {
    header: string;
    sequence: string;
}
export interface PGroupData {
    locus: string;
    alleles: string[];
    pGroup: string | null;
}
export interface GGroupData {
    locus: string;
    alleles: string[];
    gGroup: string | null;
}
export interface PGroupCheckResult {
    allele1: string;
    allele2: string;
    pGroup1: string | null;
    pGroup2: string | null;
    samePGroup: boolean;
}
export declare class GitHubDataError extends Error {
    status: number;
    path: string;
    constructor(message: string, status: number, path: string);
}
export declare const githubClient: GitHubDataClient;
//# sourceMappingURL=github-client.d.ts.map