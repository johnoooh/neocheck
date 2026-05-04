/**
 * TypeScript interfaces for IMGT/HLA API responses and data structures
 */

// ============================================================================
// API Response Types
// ============================================================================

export interface AlleleListResponse {
  data: AlleleListItem[];
  meta: PaginationMeta;
}

export interface AlleleListItem {
  accession: string;
  name: string;
}

export interface PaginationMeta {
  next: string | null;
  prev: string | null;
  sort: string | null;
  total: number;
}

export interface AlleleSequences {
  coding: string | null;
  genomic: string | null;
  protein: string | null;
}

export interface AlleleFeatures {
  coding?: AlleleFeature[];
  genomic?: AlleleFeature[];
  protein?: AlleleFeature[];
}

export interface AlleleDetailResponse {
  accession: string;
  name: string;
  locus: string;
  class: string;
  // Sequence data is nested under 'sequence' object
  sequence?: AlleleSequences;
  // API uses 'feature' as dict with coding/genomic/protein arrays
  feature?: AlleleFeatures;
  // API uses 'cell_entries' not 'cells'
  cell_entries?: CellReference[];
  citations?: Citation[];
  allele_history?: AlleleHistoryEntry[];
  // API uses 'insdc' not 'insdc_accession'
  insdc?: INSDCAccession[];
  confirmation_status?: ConfirmationEntry[];
}

export interface AlleleFeature {
  type: string;
  number?: string;
  start: number;
  length?: number;
  partial?: boolean;
}

export interface CellReference {
  id: string;
  name: string;
}

export interface Citation {
  pubmed?: string;  // API uses 'pubmed' not 'pubmed_id'
  authors?: string;
  title?: string;
  journal?: string;
  volume?: string;
  year?: string | number;  // API returns as string
}

export interface AlleleHistoryEntry {
  release_version: string;
  name: string;
}

export interface INSDCAccession {
  accession: string;
  protein_id?: string;
  version?: string;
}

export interface ConfirmationEntry {
  laboratory: string;
  method?: string;
}

// ============================================================================
// Cell Types
// ============================================================================

export interface CellListResponse {
  data: CellListItem[];
  meta: PaginationMeta;
}

export interface CellListItem {
  id: string;
  name: string;
}

export interface CellDetailResponse {
  id: string;
  name: string;
  ethnicity?: string;
  origin?: string;
  typing?: CellTyping[];
  source?: string;
}

export interface CellTyping {
  locus: string;
  alleles: string[];
}

// ============================================================================
// Sequence Types
// ============================================================================

export type SequenceType = 'coding' | 'genomic' | 'protein';

export type SequenceFormat = 'raw' | 'fasta';

export interface SequenceResult {
  allele: string;
  accession: string;
  sequence_type: SequenceType;
  sequence: string;
  length: number;
}

// ============================================================================
// Alignment Types
// ============================================================================

export type AlignmentType = 'protein' | 'nucleotide' | 'genomic';

export interface AlignmentResult {
  locus: string;
  alignment_type: AlignmentType;
  sequences: AlignedSequence[];
  reference?: string;
}

export interface AlignedSequence {
  allele: string;
  sequence: string;
}

// ============================================================================
// Ambiguity Detection Types
// ============================================================================

export interface AmbiguousPairResult {
  input_pair: [string, string];
  ambiguous_pairs: AmbiguousPairDetail[];
  total_differences: number;
  positions_analyzed: number[];
  sequence_type: SequenceType;
}

export interface AmbiguousPairDetail {
  pair: [string, string];
  differing_positions: number[];
  explanation: string;
}

export interface SequenceDifference {
  position: number;
  allele1_base: string;
  allele2_base: string;
}

// ============================================================================
// Comparison Types
// ============================================================================

export interface ComparisonResult {
  alleles: string[];
  sequence_type: SequenceType;
  differences: PositionDifference[];
  total_positions: number;
  identical_positions: number;
  alignment?: string;
}

export interface PositionDifference {
  position: number;
  bases: Record<string, string>;
}

// ============================================================================
// Expression Types
// ============================================================================

export type ExpressionSuffix = 'N' | 'L' | 'S' | 'C' | 'A' | 'Q' | null;

export interface ExpressionResult {
  allele: string;
  suffix: ExpressionSuffix;
  description: string;
  is_expressing: boolean;
}

export const EXPRESSION_DESCRIPTIONS: Record<string, string> = {
  N: 'Null - not expressed',
  L: 'Low surface expression',
  S: 'Secreted molecule only',
  C: 'Cytoplasmic expression only',
  A: 'Aberrant expression',
  Q: 'Questionable expression',
};

// ============================================================================
// Query Types
// ============================================================================

export type SearchType = 'exact' | 'startsWith' | 'contains';

export interface SearchAllelesParams {
  query?: string;
  locus?: string;
  search_type?: SearchType;
  limit?: number;
}

export interface GetAlleleParams {
  allele: string;
  include_sequence?: boolean;
  include_history?: boolean;
}

export interface GetSequenceParams {
  allele: string;
  sequence_type: SequenceType;
  format?: SequenceFormat;
}

export interface ListLocusAllelesParams {
  locus: string;
  limit?: number;
  offset?: string;
}

export interface SearchCellsParams {
  query?: string;
  ethnicity?: string;
  limit?: number;
}

export interface GetCellParams {
  cell_id: string;
}

export interface DownloadSequencesParams {
  locus?: string;
  query?: string;
  sequence_type: SequenceType;
  format?: 'fasta';
}

export interface GetNomenclatureHistoryParams {
  allele: string;
}

export interface FindAmbiguousPairsParams {
  allele1: string;
  allele2: string;
  sequence_type?: SequenceType;
  region_start?: number;
  region_end?: number;
}

export interface CompareAllelesParams {
  alleles: string[];
  sequence_type?: SequenceType;
  show_alignment?: boolean;
}

export interface GetAlignmentParams {
  locus: string;
  alignment_type: AlignmentType;
  alleles?: string[];
}

export interface CheckExpressionParams {
  alleles: string[];
}

// ============================================================================
// HLA Loci
// ============================================================================

export const HLA_CLASS_I_LOCI = ['A', 'B', 'C', 'E', 'F', 'G'] as const;
export const HLA_CLASS_II_LOCI = [
  'DRA',
  'DRB1',
  'DRB3',
  'DRB4',
  'DRB5',
  'DQA1',
  'DQB1',
  'DPA1',
  'DPB1',
  'DMA',
  'DMB',
  'DOA',
  'DOB',
] as const;
export const HLA_LOCI = [...HLA_CLASS_I_LOCI, ...HLA_CLASS_II_LOCI] as const;

export type HLALocus = (typeof HLA_LOCI)[number];

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Extract locus from allele name (e.g., "A*02:01:01:01" -> "A")
 * Also handles "HLA-A*02:01" format by stripping the HLA- prefix.
 */
export function extractLocus(alleleName: string): string | null {
  // Strip common prefixes (HLA-, hla-)
  let name = alleleName;
  if (name.toUpperCase().startsWith('HLA-')) {
    name = name.substring(4);
  }
  const match = name.match(/^([A-Z]+[0-9]*)\*/);
  return match ? match[1] : null;
}

/**
 * Check if an allele name indicates a non-expressing variant
 */
export function getExpressionSuffix(alleleName: string): ExpressionSuffix {
  const lastChar = alleleName.slice(-1).toUpperCase();
  if (['N', 'L', 'S', 'C', 'A', 'Q'].includes(lastChar)) {
    return lastChar as ExpressionSuffix;
  }
  return null;
}

/**
 * Parse allele name into components
 */
export interface AlleleParts {
  locus: string;
  field1: string;
  field2?: string;
  field3?: string;
  field4?: string;
  suffix?: ExpressionSuffix;
}

export function parseAlleleName(alleleName: string): AlleleParts | null {
  // Strip HLA- prefix if present
  let name = alleleName;
  if (name.toUpperCase().startsWith('HLA-')) {
    name = name.substring(4);
  }

  // Remove expression suffix if present
  let suffix: ExpressionSuffix = null;
  const lastChar = name.slice(-1).toUpperCase();
  if (['N', 'L', 'S', 'C', 'A', 'Q'].includes(lastChar)) {
    suffix = lastChar as ExpressionSuffix;
    name = name.slice(0, -1);
  }

  // Match locus*field1:field2:field3:field4
  const match = name.match(/^([A-Z]+[0-9]*)\*(\d+)(?::(\d+))?(?::(\d+))?(?::(\d+))?$/);
  if (!match) return null;

  return {
    locus: match[1],
    field1: match[2],
    field2: match[3],
    field3: match[4],
    field4: match[5],
    suffix,
  };
}
