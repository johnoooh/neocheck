/**
 * compare_alleles tool
 *
 * Compare two or more alleles and identify sequence differences.
 * Uses pre-computed alignments from IMGT/GitHub to properly handle
 * partial sequences and ensure accurate comparison.
 *
 * Reports both coding (nucleotide) and protein differences, plus P group status.
 */
import { z } from 'zod';
import { githubClient } from '../api/github-client.js';
import { cache, CacheKeys, CacheTTL } from '../cache/cache-manager.js';
import { extractLocus } from '../types/imgt.js';
export const compareAllelesSchema = z.object({
    alleles: z.array(z.string()).min(2).describe('List of allele names to compare (minimum 2)'),
    sequence_type: z
        .enum(['coding', 'genomic', 'protein'])
        .optional()
        .default('coding')
        .describe('Primary sequence type to compare (default: coding). Note: both coding and protein differences are always reported.'),
    show_alignment: z
        .union([z.boolean(), z.string().transform((v) => v === 'true')])
        .optional()
        .default(false)
        .describe('Include aligned sequences in output'),
});
export async function compareAlleles(input) {
    const { alleles, show_alignment } = input;
    const warnings = [];
    // Extract locus from first allele and validate all alleles are same locus
    const loci = alleles.map((a) => extractLocus(a));
    const uniqueLoci = new Set(loci.filter((l) => l !== null));
    if (uniqueLoci.size === 0) {
        throw new Error('Could not determine locus from allele names. Use format like A*02:01:01:01');
    }
    if (uniqueLoci.size > 1) {
        throw new Error(`Cannot compare alleles from different loci: ${[...uniqueLoci].join(', ')}. ` +
            `All alleles must be from the same HLA locus.`);
    }
    const locus = [...uniqueLoci][0];
    // Fetch pre-computed alignments from GitHub
    // These are properly gapped and handle partial sequences correctly
    let proteinAligned = [];
    let nucleotideAligned = [];
    try {
        proteinAligned = await fetchAlignedSequences(locus, 'protein', alleles);
    }
    catch (error) {
        warnings.push(`Could not fetch protein alignment: ${error instanceof Error ? error.message : String(error)}`);
    }
    try {
        nucleotideAligned = await fetchAlignedSequences(locus, 'nucleotide', alleles);
    }
    catch (error) {
        warnings.push(`Could not fetch nucleotide alignment: ${error instanceof Error ? error.message : String(error)}`);
    }
    // Verify we found all requested alleles
    const foundProtein = new Set(proteinAligned.map((s) => s.allele));
    const foundNucleotide = new Set(nucleotideAligned.map((s) => s.allele));
    for (const allele of alleles) {
        if (!foundProtein.has(allele) && proteinAligned.length > 0) {
            warnings.push(`Allele ${allele} not found in protein alignment. Try using full allele name (e.g., A*02:01:01:01).`);
        }
        if (!foundNucleotide.has(allele) && nucleotideAligned.length > 0) {
            warnings.push(`Allele ${allele} not found in nucleotide alignment.`);
        }
    }
    // Compare aligned sequences
    const proteinComparison = compareAlignedSequences(proteinAligned, 'protein', show_alignment);
    const codingComparison = compareAlignedSequences(nucleotideAligned, 'nucleotide', show_alignment);
    // Get P group information
    const pGroupInfos = [];
    for (const alleleName of alleles) {
        try {
            const pGroup = await githubClient.findPGroupForAllele(alleleName);
            pGroupInfos.push({ allele: alleleName, pGroup });
        }
        catch {
            pGroupInfos.push({ allele: alleleName, pGroup: null });
        }
    }
    // Check if all alleles are in the same P group
    const uniquePGroups = new Set(pGroupInfos.map((p) => p.pGroup).filter((p) => p !== null));
    const samePGroup = uniquePGroups.size === 1 && pGroupInfos.every((p) => p.pGroup !== null);
    let pGroupExplanation;
    if (samePGroup) {
        const pGroupName = pGroupInfos[0].pGroup;
        pGroupExplanation = `All alleles belong to the same P group (${pGroupName}). They have identical protein sequences in the antigen-binding domains (exons 2 and 3).`;
    }
    else if (uniquePGroups.size === 0) {
        pGroupExplanation = `None of the alleles belong to a defined P group. This may indicate they have unique protein sequences in the antigen-binding domains.`;
    }
    else {
        const groupList = pGroupInfos
            .map((p) => `${p.allele}: ${p.pGroup || 'no P group'}`)
            .join(', ');
        pGroupExplanation = `Alleles belong to different P groups or have no P group: ${groupList}. They have different protein sequences in the antigen-binding domains.`;
    }
    // Generate summary
    const summary = `Compared ${alleles.length} alleles from locus ${locus}:\n` +
        `- Coding (nucleotide): ${codingComparison.variable_positions} differences across ${codingComparison.comparable_positions} comparable positions (${codingComparison.percent_identity}% identical)\n` +
        `- Protein: ${proteinComparison.variable_positions} differences across ${proteinComparison.comparable_positions} comparable positions (${proteinComparison.percent_identity}% identical)\n` +
        `- P group: ${samePGroup ? 'Same P group' : 'Different P groups'}` +
        (proteinComparison.warnings?.length || codingComparison.warnings?.length
            ? '\n\nNote: Some positions were skipped due to unknown (*) or gap (.) characters in partial sequences.'
            : '');
    return {
        alleles,
        locus,
        p_group_analysis: {
            same_p_group: samePGroup,
            p_groups: pGroupInfos,
            explanation: pGroupExplanation,
        },
        coding_comparison: codingComparison,
        protein_comparison: proteinComparison,
        summary,
        warnings: warnings.length > 0 ? warnings : undefined,
    };
}
/**
 * Normalize allele name by stripping HLA- prefix if present
 */
function normalizeAlleleName(name) {
    if (name.toUpperCase().startsWith('HLA-')) {
        return name.substring(4);
    }
    return name;
}
/**
 * Fetch aligned sequences from GitHub for specific alleles.
 * Supports partial allele names (e.g., "A*02:01") by matching the first
 * allele that starts with the query (typically the reference allele).
 * Also handles HLA- prefix in allele names.
 */
async function fetchAlignedSequences(locus, alignmentType, alleleNames) {
    // Build cache key for the full alignment
    const cacheKey = CacheKeys.alignment(locus, alignmentType);
    // Try to get full alignment from cache
    let alignmentContent = cache.get(cacheKey);
    if (!alignmentContent) {
        // Fetch from GitHub
        alignmentContent = await githubClient.getAlignment(locus, alignmentType);
        // Cache with long TTL
        cache.set(cacheKey, alignmentContent, CacheTTL.LONG);
    }
    // Parse the alignment
    const parsed = githubClient.parseAlignment(alignmentContent);
    // Match alleles - support both exact matches and prefix matches for 2-field names
    const results = [];
    const matchedNames = new Map(); // requested name -> matched name
    for (const requestedName of alleleNames) {
        // Normalize the requested name (strip HLA- prefix)
        const normalizedName = normalizeAlleleName(requestedName);
        // First try exact match
        const exactMatch = parsed.sequences.find((seq) => seq.allele === normalizedName);
        if (exactMatch) {
            results.push({ allele: requestedName, sequence: exactMatch.sequence });
            matchedNames.set(requestedName, exactMatch.allele);
            continue;
        }
        // Try prefix match (e.g., "A*02:01" matches "A*02:01:01:01")
        // Find the first (usually reference) allele that starts with the query
        const prefixMatch = parsed.sequences.find((seq) => seq.allele.startsWith(normalizedName + ':'));
        if (prefixMatch) {
            // Return with the original requested name for consistency
            results.push({
                allele: requestedName,
                sequence: prefixMatch.sequence,
            });
            matchedNames.set(requestedName, prefixMatch.allele);
        }
    }
    return results;
}
/**
 * Compare aligned sequences, properly handling unknown (*) and gap (.) characters
 */
function compareAlignedSequences(sequences, sequenceType, showAlignment) {
    if (sequences.length < 2) {
        return {
            sequence_type: sequenceType,
            total_positions: 0,
            comparable_positions: 0,
            identical_positions: 0,
            variable_positions: 0,
            percent_identity: '0',
            differences: [],
            alignment: `Insufficient ${sequenceType} sequences available for comparison.`,
            warnings: ['Less than 2 sequences found in alignment'],
        };
    }
    // Find alignment length (all sequences should be same length in a proper alignment)
    const alignmentLength = Math.max(...sequences.map((s) => s.sequence.length));
    const warnings = [];
    // Compare sequences position by position, skipping unknown/gap positions
    const differences = [];
    let identicalCount = 0;
    let comparableCount = 0;
    let skippedUnknown = 0;
    let skippedGap = 0;
    for (let pos = 0; pos < alignmentLength; pos++) {
        const bases = {};
        let hasUnknown = false;
        let hasGap = false;
        for (const seq of sequences) {
            const base = seq.sequence[pos] || '*'; // Treat missing as unknown
            // Check for unknown (*) or gap (.) characters
            if (base === '*') {
                hasUnknown = true;
                break;
            }
            if (base === '.') {
                hasGap = true;
                break;
            }
            bases[seq.allele] = base;
        }
        // Skip positions with unknown or gap characters
        if (hasUnknown) {
            skippedUnknown++;
            continue;
        }
        if (hasGap) {
            skippedGap++;
            continue;
        }
        // This position is comparable
        comparableCount++;
        // Check for differences
        const uniqueBases = new Set(Object.values(bases));
        const isVariable = uniqueBases.size > 1;
        if (isVariable) {
            differences.push({
                position: pos + 1, // 1-indexed for human readability
                bases,
                is_variable: true,
            });
        }
        else {
            identicalCount++;
        }
    }
    // Add warnings about skipped positions
    if (skippedUnknown > 0) {
        warnings.push(`${skippedUnknown} positions skipped due to unknown (*) sequence in one or more alleles`);
    }
    if (skippedGap > 0) {
        warnings.push(`${skippedGap} positions skipped due to alignment gaps (.)`);
    }
    // Generate alignment if requested
    let alignment;
    if (showAlignment) {
        alignment = generateAlignment(sequences, differences);
    }
    const percentIdentity = comparableCount > 0 ? ((identicalCount / comparableCount) * 100).toFixed(2) : '0';
    return {
        sequence_type: sequenceType,
        total_positions: alignmentLength,
        comparable_positions: comparableCount,
        identical_positions: identicalCount,
        variable_positions: differences.length,
        percent_identity: percentIdentity,
        differences,
        alignment,
        warnings: warnings.length > 0 ? warnings : undefined,
    };
}
/**
 * Generate a simple text alignment showing only variable positions
 */
function generateAlignment(sequences, differences) {
    if (differences.length === 0) {
        return 'All comparable sequences are identical.';
    }
    // Limit to first 50 differences for readability
    const displayDiffs = differences.slice(0, 50);
    const truncated = differences.length > 50;
    const lines = [];
    // Header with position numbers
    const positions = displayDiffs.map((d) => d.position.toString());
    const maxPosLen = Math.max(...positions.map((p) => p.length));
    const maxNameLen = Math.max(...sequences.map((s) => s.allele.length));
    // Position header
    lines.push(' '.repeat(maxNameLen + 2) + positions.map((p) => p.padStart(maxPosLen)).join(' '));
    lines.push('-'.repeat(maxNameLen + 2 + (maxPosLen + 1) * positions.length));
    // Sequence lines
    for (const seq of sequences) {
        const bases = displayDiffs.map((d) => {
            const base = seq.sequence[d.position - 1] || '-';
            return base.padStart(maxPosLen);
        });
        lines.push(`${seq.allele.padEnd(maxNameLen)}  ${bases.join(' ')}`);
    }
    if (truncated) {
        lines.push(`\n... and ${differences.length - 50} more differences`);
    }
    return lines.join('\n');
}
export const compareAllelesTool = {
    name: 'compare_alleles',
    description: 'Compare two or more HLA alleles and identify sequence differences. ' +
        'Reports both coding (nucleotide) and protein differences, plus P group membership.',
    inputSchema: compareAllelesSchema,
    handler: compareAlleles,
};
//# sourceMappingURL=compare-alleles.js.map