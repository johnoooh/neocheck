/**
 * GitHub Data Client for ANHIG/IMGTHLA Repository
 *
 * Provides access to alignment files and bulk data from the GitHub repository.
 * Repository: https://github.com/ANHIG/IMGTHLA
 */

import type { AlignmentType, AlignedSequence } from '../types/imgt.js';

const RAW_BASE_URL = 'https://raw.githubusercontent.com/ANHIG/IMGTHLA';
const DEFAULT_BRANCH = 'Latest';

export class GitHubDataClient {
  private baseUrl: string;
  private branch: string;

  constructor(baseUrl: string = RAW_BASE_URL, branch: string = DEFAULT_BRANCH) {
    this.baseUrl = baseUrl;
    this.branch = branch;
  }

  /**
   * Fetch raw file content from GitHub
   */
  private async fetchFile(path: string): Promise<string> {
    const url = `${this.baseUrl}/${this.branch}/${path}`;

    const response = await fetch(url);
    if (!response.ok) {
      throw new GitHubDataError(
        `Failed to fetch ${path}: ${response.status} ${response.statusText}`,
        response.status,
        path
      );
    }

    return response.text();
  }

  /**
   * Get the allele list (CSV format)
   */
  async getAlleleList(): Promise<AlleleListEntry[]> {
    const content = await this.fetchFile('Allelelist.txt');
    const lines = content.trim().split('\n');

    // Skip header line
    return lines.slice(1).map((line) => {
      const [alleleId, allele] = line.split(',');
      return { alleleId: alleleId.trim(), allele: allele.trim() };
    });
  }

  /**
   * Get alignment file for a specific locus
   * Files are in the alignments/ directory with names like:
   * - A_prot.txt (protein)
   * - A_nuc.txt (nucleotide/CDS)
   * - A_gen.txt (genomic)
   */
  async getAlignment(locus: string, alignmentType: AlignmentType): Promise<string> {
    const suffix = this.getAlignmentSuffix(alignmentType);
    const filename = `${locus}_${suffix}.txt`;
    return this.fetchFile(`alignments/${filename}`);
  }

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
  parseAlignment(content: string): ParsedAlignment {
    const lines = content.split('\n');
    const sequences: Map<string, string[]> = new Map();
    let reference: string | undefined;
    let referenceSequence: string[] = [];

    for (const line of lines) {
      // Skip empty lines
      if (!line.trim()) {
        continue;
      }

      // Skip comment lines (start with #)
      if (line.startsWith('#')) {
        continue;
      }

      // Skip header lines (Prot, cDNA, gDNA, AA codon, or position markers)
      if (
        line.match(/^\s*(Prot|cDNA|gDNA|AA\s+codon)/i) ||
        line.match(/^\s+\|/) ||
        line.match(/^\s+-?\d+\s*$/) ||
        line.match(/^\s+\d+\s+\d+/)
      ) {
        continue;
      }

      // Parse sequence lines
      // Format: " A*01:01:01:01     MAVM APRTLLLLLS GALAL..TQT"
      // The allele name is preceded by a space and followed by multiple spaces
      const seqMatch = line.match(/^\s*(\S+\*[\w:]+\S*)\s{2,}(.+)$/);
      if (seqMatch) {
        const [, alleleName, sequenceFragment] = seqMatch;

        // Clean up sequence:
        // - Remove spaces (used for readability in alignment)
        // - Keep "-" (match reference), "." (gap/insertion), "*" (stop)
        // - Remove "|" (exon boundary markers)
        const cleanSeq = sequenceFragment.replace(/\s+/g, '').replace(/\|/g, '');

        // Skip if this looks like metadata (e.g., "Please", "see", etc.)
        if (!alleleName.includes('*') || cleanSeq.length < 5) {
          continue;
        }

        if (!sequences.has(alleleName)) {
          sequences.set(alleleName, []);
          if (!reference) {
            reference = alleleName;
          }
        }
        sequences.get(alleleName)!.push(cleanSeq);

        // Track reference sequence for expansion
        if (alleleName === reference) {
          referenceSequence.push(cleanSeq);
        }
      }
    }

    // Join sequence fragments and expand "-" to actual bases from reference
    const fullReference = referenceSequence.join('');
    const result: AlignedSequence[] = [];

    for (const [allele, fragments] of sequences) {
      const fullSeq = fragments.join('');

      // Expand "-" characters to actual reference bases
      let expandedSeq = '';
      for (let i = 0; i < fullSeq.length; i++) {
        if (fullSeq[i] === '-' && i < fullReference.length) {
          expandedSeq += fullReference[i];
        } else {
          expandedSeq += fullSeq[i];
        }
      }

      result.push({
        allele,
        sequence: expandedSeq,
      });
    }

    return { sequences: result, reference };
  }

  /**
   * Get specific alleles from an alignment
   */
  async getAlignmentForAlleles(
    locus: string,
    alignmentType: AlignmentType,
    alleleNames: string[]
  ): Promise<AlignedSequence[]> {
    const content = await this.getAlignment(locus, alignmentType);
    const parsed = this.parseAlignment(content);

    // Filter to requested alleles
    const requestedSet = new Set(alleleNames);
    return parsed.sequences.filter((seq) => requestedSet.has(seq.allele));
  }

  /**
   * Get FASTA file for a locus
   */
  async getFasta(locus: string, sequenceType: 'nuc' | 'gen' | 'prot'): Promise<string> {
    // FASTA files are in fasta/ directory
    // Format: A_nuc.fasta, A_gen.fasta, A_prot.fasta
    const filename = `${locus}_${sequenceType}.fasta`;
    return this.fetchFile(`fasta/${filename}`);
  }

  /**
   * Parse FASTA content into sequences
   */
  parseFasta(content: string): FastaEntry[] {
    const entries: FastaEntry[] = [];
    const lines = content.split('\n');
    let currentHeader: string | null = null;
    let currentSequence: string[] = [];

    for (const line of lines) {
      if (line.startsWith('>')) {
        // Save previous entry
        if (currentHeader) {
          entries.push({
            header: currentHeader,
            sequence: currentSequence.join(''),
          });
        }
        currentHeader = line.slice(1).trim();
        currentSequence = [];
      } else if (currentHeader && line.trim()) {
        currentSequence.push(line.trim());
      }
    }

    // Save last entry
    if (currentHeader) {
      entries.push({
        header: currentHeader,
        sequence: currentSequence.join(''),
      });
    }

    return entries;
  }

  /**
   * Get alignment suffix based on type
   */
  private getAlignmentSuffix(alignmentType: AlignmentType): string {
    switch (alignmentType) {
      case 'protein':
        return 'prot';
      case 'nucleotide':
        return 'nuc';
      case 'genomic':
        return 'gen';
    }
  }

  /**
   * Get the current database version from release info
   */
  async getDatabaseVersion(): Promise<string> {
    try {
      const content = await this.fetchFile('Allelelist.txt');
      // First line usually contains version info in comments
      const versionMatch = content.match(/(\d+\.\d+\.\d+)/);
      return versionMatch ? versionMatch[1] : 'unknown';
    } catch {
      return 'unknown';
    }
  }

  /**
   * Get P group data from WMDA files
   * P groups contain alleles with identical protein sequences in the antigen-binding domains (exons 2 and 3)
   *
   * File format: LOCUS*;allele1/allele2/.../alleleN;P_GROUP_NAME
   * Example: A*;01:01:01:01/01:01:01:02/.../01:501;01:01P
   */
  async getPGroups(): Promise<PGroupData[]> {
    const content = await this.fetchFile('wmda/hla_nom_p.txt');
    return this.parsePGroupFile(content);
  }

  /**
   * Get G group data from WMDA files
   * G groups contain alleles with identical nucleotide sequences in the antigen-binding domains
   */
  async getGGroups(): Promise<GGroupData[]> {
    const content = await this.fetchFile('wmda/hla_nom_g.txt');
    return this.parseGGroupFile(content);
  }

  /**
   * Parse P group file content
   */
  private parsePGroupFile(content: string): PGroupData[] {
    const lines = content.split('\n');
    const groups: PGroupData[] = [];

    for (const line of lines) {
      // Skip comments and empty lines
      if (line.startsWith('#') || !line.trim()) {
        continue;
      }

      // Format: LOCUS*;allele1/allele2/...;P_GROUP_NAME
      const parts = line.split(';');
      if (parts.length < 2) continue;

      const locus = parts[0].replace('*', '');
      const allelesPart = parts[1];
      const pGroupName = parts[2] || null;

      if (!allelesPart) continue;

      // Parse alleles (format: field1:field2:field3:field4 without locus prefix)
      const alleleFields = allelesPart.split('/').filter((a) => a.trim());
      const fullAlleleNames = alleleFields.map((a) => `${locus}*${a}`);

      groups.push({
        locus,
        alleles: fullAlleleNames,
        pGroup: pGroupName,
      });
    }

    return groups;
  }

  /**
   * Parse G group file content
   */
  private parseGGroupFile(content: string): GGroupData[] {
    const lines = content.split('\n');
    const groups: GGroupData[] = [];

    for (const line of lines) {
      // Skip comments and empty lines
      if (line.startsWith('#') || !line.trim()) {
        continue;
      }

      // Format: LOCUS*;allele1/allele2/...;G_GROUP_NAME
      const parts = line.split(';');
      if (parts.length < 2) continue;

      const locus = parts[0].replace('*', '');
      const allelesPart = parts[1];
      const gGroupName = parts[2] || null;

      if (!allelesPart) continue;

      // Parse alleles
      const alleleFields = allelesPart.split('/').filter((a) => a.trim());
      const fullAlleleNames = alleleFields.map((a) => `${locus}*${a}`);

      groups.push({
        locus,
        alleles: fullAlleleNames,
        gGroup: gGroupName,
      });
    }

    return groups;
  }

  /**
   * Find P group for a specific allele
   * Returns the P group name if the allele belongs to one, or null
   */
  async findPGroupForAllele(alleleName: string): Promise<string | null> {
    const groups = await this.getPGroups();

    // Normalize allele name (handle 2-field, 3-field, or 4-field)
    const normalizedName = alleleName.toUpperCase();

    for (const group of groups) {
      // Check if any allele in the group matches or starts with the query
      for (const allele of group.alleles) {
        const upperAllele = allele.toUpperCase();
        // Exact match or prefix match (for 2-field queries like C*05:01)
        if (
          upperAllele === normalizedName ||
          upperAllele.startsWith(normalizedName + ':') ||
          normalizedName.startsWith(upperAllele + ':')
        ) {
          return group.pGroup;
        }
      }
    }

    return null;
  }

  /**
   * Check if two alleles are in the same P group
   */
  async areInSamePGroup(allele1: string, allele2: string): Promise<PGroupCheckResult> {
    const groups = await this.getPGroups();

    const norm1 = allele1.toUpperCase();
    const norm2 = allele2.toUpperCase();

    let pGroup1: string | null = null;
    let pGroup2: string | null = null;

    for (const group of groups) {
      for (const allele of group.alleles) {
        const upperAllele = allele.toUpperCase();

        // Check allele1
        if (
          upperAllele === norm1 ||
          upperAllele.startsWith(norm1 + ':') ||
          norm1.startsWith(upperAllele + ':')
        ) {
          pGroup1 = group.pGroup;
        }

        // Check allele2
        if (
          upperAllele === norm2 ||
          upperAllele.startsWith(norm2 + ':') ||
          norm2.startsWith(upperAllele + ':')
        ) {
          pGroup2 = group.pGroup;
        }
      }
    }

    return {
      allele1: allele1,
      allele2: allele2,
      pGroup1,
      pGroup2,
      samePGroup: pGroup1 !== null && pGroup2 !== null && pGroup1 === pGroup2,
    };
  }
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

export class GitHubDataError extends Error {
  status: number;
  path: string;

  constructor(message: string, status: number, path: string) {
    super(message);
    this.name = 'GitHubDataError';
    this.status = status;
    this.path = path;
  }
}

// Export singleton instance
export const githubClient = new GitHubDataClient();
