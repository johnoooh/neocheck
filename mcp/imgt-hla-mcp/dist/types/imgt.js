/**
 * TypeScript interfaces for IMGT/HLA API responses and data structures
 */
export const EXPRESSION_DESCRIPTIONS = {
    N: 'Null - not expressed',
    L: 'Low surface expression',
    S: 'Secreted molecule only',
    C: 'Cytoplasmic expression only',
    A: 'Aberrant expression',
    Q: 'Questionable expression',
};
// ============================================================================
// HLA Loci
// ============================================================================
export const HLA_CLASS_I_LOCI = ['A', 'B', 'C', 'E', 'F', 'G'];
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
];
export const HLA_LOCI = [...HLA_CLASS_I_LOCI, ...HLA_CLASS_II_LOCI];
// ============================================================================
// Utility Functions
// ============================================================================
/**
 * Extract locus from allele name (e.g., "A*02:01:01:01" -> "A")
 * Also handles "HLA-A*02:01" format by stripping the HLA- prefix.
 */
export function extractLocus(alleleName) {
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
export function getExpressionSuffix(alleleName) {
    const lastChar = alleleName.slice(-1).toUpperCase();
    if (['N', 'L', 'S', 'C', 'A', 'Q'].includes(lastChar)) {
        return lastChar;
    }
    return null;
}
export function parseAlleleName(alleleName) {
    // Strip HLA- prefix if present
    let name = alleleName;
    if (name.toUpperCase().startsWith('HLA-')) {
        name = name.substring(4);
    }
    // Remove expression suffix if present
    let suffix = null;
    const lastChar = name.slice(-1).toUpperCase();
    if (['N', 'L', 'S', 'C', 'A', 'Q'].includes(lastChar)) {
        suffix = lastChar;
        name = name.slice(0, -1);
    }
    // Match locus*field1:field2:field3:field4
    const match = name.match(/^([A-Z]+[0-9]*)\*(\d+)(?::(\d+))?(?::(\d+))?(?::(\d+))?$/);
    if (!match)
        return null;
    return {
        locus: match[1],
        field1: match[2],
        field2: match[3],
        field3: match[4],
        field4: match[5],
        suffix,
    };
}
//# sourceMappingURL=imgt.js.map