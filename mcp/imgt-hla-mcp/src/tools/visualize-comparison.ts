/**
 * visualize_comparison tool
 *
 * Generate interactive HTML visualization of HLA allele comparisons.
 * Uses pre-computed alignments from IMGT/GitHub to properly handle
 * partial sequences.
 *
 * Includes sequence alignment, difference plots, and protein domain mapping.
 */

import { z } from 'zod';
import { githubClient } from '../api/github-client.js';
import { cache, CacheKeys, CacheTTL } from '../cache/cache-manager.js';
import type { AlignedSequence, AlignmentType } from '../types/imgt.js';
import { extractLocus } from '../types/imgt.js';
import * as fs from 'fs';
import * as path from 'path';

export const visualizeComparisonSchema = z.object({
  alleles: z.array(z.string()).min(2).max(10).describe('List of allele names to compare (2-10 alleles)'),
  output_path: z.string().optional().describe('Path to save the HTML file. If not provided, returns HTML content.'),
  title: z.string().optional().default('HLA Allele Comparison').describe('Title for the report'),
});

export type VisualizeComparisonInput = z.infer<typeof visualizeComparisonSchema>;

// HLA Class I protein domain boundaries (1-indexed, based on mature protein)
// These are approximate and may vary slightly between loci
// Colors updated to macOS-style pastels
const HLA_CLASS_I_DOMAINS = {
  leader: { start: -24, end: 0, name: 'Leader', color: '#8e8e93' },
  alpha1: { start: 1, end: 90, name: 'α1 domain', color: '#ff6482' },
  alpha2: { start: 91, end: 182, name: 'α2 domain', color: '#bf5af2' },
  alpha3: { start: 183, end: 274, name: 'α3 domain', color: '#5e5ce6' },
  tm: { start: 275, end: 300, name: 'TM', color: '#30d158' },
  cytoplasmic: { start: 301, end: 365, name: 'Cytoplasmic', color: '#ff9f0a' },
};

// Antigen-binding site positions (contact residues with peptide/TCR)
const PEPTIDE_BINDING_POSITIONS = [
  7, 9, 24, 25, 34, 45, 59, 62, 63, 66, 67, 70, 73, 74, 77, 80, 81, 84, 95,
  97, 99, 114, 116, 123, 143, 146, 147, 152, 155, 156, 159, 160, 163, 167, 171
];

interface AlleleData {
  name: string;
  proteinSeq: string;
  codingSeq: string;
  pGroup: string | null;
}

interface Difference {
  position: number;
  residues: Record<string, string>;
  domain: string;
  isPeptideBinding: boolean;
}

interface VisualizationSummary {
  alleles_compared: number;
  locus: string;
  protein_differences: number;
  coding_differences: number;
  peptide_binding_differences: number;
  skipped_unknown_positions: number;
  warnings: string[];
}

export async function visualizeComparison(input: VisualizeComparisonInput): Promise<{
  html?: string;
  saved_to?: string;
  message?: string;
  summary?: VisualizationSummary;
  error?: string;
  note?: string;
}> {
  const { alleles, output_path, title } = input;
  const warnings: string[] = [];

  // Extract and validate locus
  const loci = alleles.map((a) => extractLocus(a));
  const uniqueLoci = new Set(loci.filter((l) => l !== null));

  if (uniqueLoci.size === 0) {
    throw new Error('Could not determine locus from allele names. Use format like A*02:01:01:01');
  }

  if (uniqueLoci.size > 1) {
    throw new Error(
      `Cannot compare alleles from different loci: ${[...uniqueLoci].join(', ')}. ` +
        `All alleles must be from the same HLA locus.`
    );
  }

  const locus = [...uniqueLoci][0];

  // Fetch pre-computed alignments from GitHub
  let proteinAligned: AlignedSequence[] = [];
  let nucleotideAligned: AlignedSequence[] = [];

  try {
    proteinAligned = await fetchAlignedSequences(locus, 'protein', alleles);
  } catch (error) {
    warnings.push(`Could not fetch protein alignment: ${error instanceof Error ? error.message : String(error)}`);
  }

  try {
    nucleotideAligned = await fetchAlignedSequences(locus, 'nucleotide', alleles);
  } catch (error) {
    warnings.push(`Could not fetch nucleotide alignment: ${error instanceof Error ? error.message : String(error)}`);
  }

  // Build allele data from aligned sequences
  const alleleDataList: AlleleData[] = [];

  for (const alleleName of alleles) {
    const proteinSeq = proteinAligned.find((s) => s.allele === alleleName)?.sequence || '';
    const codingSeq = nucleotideAligned.find((s) => s.allele === alleleName)?.sequence || '';

    if (!proteinSeq && proteinAligned.length > 0) {
      warnings.push(`Allele ${alleleName} not found in protein alignment`);
    }
    if (!codingSeq && nucleotideAligned.length > 0) {
      warnings.push(`Allele ${alleleName} not found in nucleotide alignment`);
    }

    const pGroup = await githubClient.findPGroupForAllele(alleleName).catch(() => null);

    alleleDataList.push({
      name: alleleName,
      proteinSeq,
      codingSeq,
      pGroup,
    });
  }

  // Find differences using aligned sequences (handles * and . properly)
  const { differences: proteinDiffs, skippedUnknown: proteinSkipped } = findDifferencesAligned(
    alleleDataList.map((a) => ({ name: a.name, seq: a.proteinSeq }))
  );
  const { differences: codingDiffs, skippedUnknown: codingSkipped } = findDifferencesAligned(
    alleleDataList.map((a) => ({ name: a.name, seq: a.codingSeq }))
  );

  const totalSkipped = proteinSkipped + codingSkipped;
  if (totalSkipped > 0) {
    warnings.push(`${totalSkipped} positions skipped due to unknown (*) or gap (.) characters in partial sequences`);
  }

  // Count peptide binding site differences
  const peptideBindingDiffs = proteinDiffs.filter((d) => d.isPeptideBinding);

  // Generate HTML
  const html = generateHTML(title, alleleDataList, proteinDiffs, codingDiffs, locus, warnings);

  // Build summary
  const summary: VisualizationSummary = {
    alleles_compared: alleles.length,
    locus,
    protein_differences: proteinDiffs.length,
    coding_differences: codingDiffs.length,
    peptide_binding_differences: peptideBindingDiffs.length,
    skipped_unknown_positions: totalSkipped,
    warnings,
  };

  // Save if path provided - return summary instead of full HTML
  if (output_path) {
    const resolvedPath = path.resolve(output_path);

    // Ensure parent directory exists
    const parentDir = path.dirname(resolvedPath);
    try {
      if (!fs.existsSync(parentDir)) {
        fs.mkdirSync(parentDir, { recursive: true });
      }
      fs.writeFileSync(resolvedPath, html, 'utf-8');
    } catch (writeError) {
      const errorMessage = writeError instanceof Error ? writeError.message : String(writeError);

      // If write fails, return the HTML content so the caller can save it manually
      // This handles cases where the MCP server runs in a different filesystem context
      return {
        error: `Cannot write to ${resolvedPath}: ${errorMessage}`,
        note: 'The MCP server may be running in a different filesystem context. ' +
              'The HTML content is included below - you can save it manually.',
        html,
        summary,
      };
    }

    return {
      saved_to: resolvedPath,
      message: `Visualization saved to ${resolvedPath}. Open in browser to view.`,
      summary,
    };
  }

  return { html, summary };
}

/**
 * Normalize allele name by stripping HLA- prefix if present
 */
function normalizeAlleleName(name: string): string {
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
async function fetchAlignedSequences(
  locus: string,
  alignmentType: AlignmentType,
  alleleNames: string[]
): Promise<AlignedSequence[]> {
  const cacheKey = CacheKeys.alignment(locus, alignmentType);
  let alignmentContent = cache.get<string>(cacheKey);

  if (!alignmentContent) {
    alignmentContent = await githubClient.getAlignment(locus, alignmentType);
    cache.set(cacheKey, alignmentContent, CacheTTL.LONG);
  }

  const parsed = githubClient.parseAlignment(alignmentContent);

  // Match alleles - support both exact matches and prefix matches for 2-field names
  const results: AlignedSequence[] = [];

  for (const requestedName of alleleNames) {
    // Normalize the requested name (strip HLA- prefix)
    const normalizedName = normalizeAlleleName(requestedName);

    // First try exact match
    const exactMatch = parsed.sequences.find((seq) => seq.allele === normalizedName);
    if (exactMatch) {
      results.push({ allele: requestedName, sequence: exactMatch.sequence });
      continue;
    }

    // Try prefix match (e.g., "A*02:01" matches "A*02:01:01:01")
    const prefixMatch = parsed.sequences.find((seq) =>
      seq.allele.startsWith(normalizedName + ':')
    );
    if (prefixMatch) {
      // Return with the original requested name for consistency
      results.push({
        allele: requestedName,
        sequence: prefixMatch.sequence,
      });
    }
  }

  return results;
}

/**
 * Find differences in aligned sequences, properly handling * and . characters
 */
function findDifferencesAligned(sequences: { name: string; seq: string }[]): {
  differences: Difference[];
  skippedUnknown: number;
} {
  if (sequences.length < 2 || sequences.some((s) => !s.seq)) {
    return { differences: [], skippedUnknown: 0 };
  }

  const maxLen = Math.max(...sequences.map((s) => s.seq.length));
  const differences: Difference[] = [];
  let skippedUnknown = 0;

  for (let i = 0; i < maxLen; i++) {
    const residues: Record<string, string> = {};
    let hasUnknown = false;

    for (const { name, seq } of sequences) {
      const char = seq[i] || '*';

      // Skip positions with unknown (*) or gap (.) characters
      if (char === '*' || char === '.') {
        hasUnknown = true;
        break;
      }

      residues[name] = char;
    }

    if (hasUnknown) {
      skippedUnknown++;
      continue;
    }

    const uniqueResidues = new Set(Object.values(residues));

    if (uniqueResidues.size > 1) {
      const pos = i + 1; // 1-indexed
      differences.push({
        position: pos,
        residues,
        domain: getDomain(pos),
        isPeptideBinding: PEPTIDE_BINDING_POSITIONS.includes(pos),
      });
    }
  }

  return { differences, skippedUnknown };
}

function getDomain(position: number): string {
  for (const [, domain] of Object.entries(HLA_CLASS_I_DOMAINS)) {
    if (position >= domain.start && position <= domain.end) {
      return domain.name;
    }
  }
  return 'Unknown';
}

function generateHTML(
  title: string,
  alleles: AlleleData[],
  proteinDiffs: Difference[],
  codingDiffs: Difference[],
  locus: string,
  warnings: string[]
): string {
  const alleleNames = alleles.map(a => a.name);
  const maxProteinLen = Math.max(...alleles.map(a => a.proteinSeq.length), 365);

  // Group differences by domain
  const diffsByDomain: Record<string, Difference[]> = {};
  for (const diff of proteinDiffs) {
    if (!diffsByDomain[diff.domain]) {
      diffsByDomain[diff.domain] = [];
    }
    diffsByDomain[diff.domain].push(diff);
  }

  // Count peptide binding site differences
  const peptideBindingDiffs = proteinDiffs.filter(d => d.isPeptideBinding);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <style>
    :root {
      /* macOS-inspired light theme */
      --bg-primary: #f5f5f7;
      --bg-secondary: #ffffff;
      --bg-card: #ffffff;
      --bg-hover: #f0f0f2;

      --text-primary: #1d1d1f;
      --text-secondary: #86868b;
      --text-tertiary: #a1a1a6;

      --accent: #007aff;
      --accent-hover: #0051d5;
      --accent-light: rgba(0, 122, 255, 0.1);

      --success: #34c759;
      --warning: #ff9500;
      --error: #ff3b30;

      --border-color: #d2d2d7;
      --shadow-sm: 0 1px 3px rgba(0,0,0,0.08);
      --shadow-md: 0 4px 12px rgba(0,0,0,0.08);
      --shadow-lg: 0 8px 24px rgba(0,0,0,0.12);
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Helvetica Neue', Helvetica, Arial, sans-serif;
      background: var(--bg-primary);
      color: var(--text-primary);
      line-height: 1.6;
      padding: 24px;
      font-weight: 400;
      -webkit-font-smoothing: antialiased;
    }

    .container { max-width: 1400px; margin: 0 auto; }

    h1 {
      font-size: 2.2rem;
      margin-bottom: 8px;
      color: var(--text-primary);
      font-weight: 600;
      letter-spacing: -0.02em;
    }

    h2 {
      font-size: 1.4rem;
      margin: 32px 0 16px;
      color: var(--text-primary);
      border-bottom: 1px solid var(--border-color);
      padding-bottom: 10px;
      font-weight: 600;
    }

    h3 {
      font-size: 1.1rem;
      margin: 20px 0 10px;
      color: var(--text-secondary);
      font-weight: 500;
    }

    .warning-box {
      background: #fff3cd;
      border: 1px solid #ffc107;
      border-radius: 8px;
      padding: 12px 16px;
      margin: 16px 0;
      font-size: 0.9rem;
      color: #856404;
    }

    .summary-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 16px;
      margin: 24px 0;
    }

    .summary-card {
      background: var(--bg-card);
      border-radius: 12px;
      padding: 24px;
      text-align: center;
      box-shadow: var(--shadow-md);
      border: 1px solid var(--border-color);
      transition: transform 0.2s ease, box-shadow 0.2s ease;
    }

    .summary-card:hover {
      transform: translateY(-2px);
      box-shadow: var(--shadow-lg);
    }

    .summary-card .value {
      font-size: 2.8rem;
      font-weight: 700;
      color: var(--accent);
      letter-spacing: -0.03em;
    }

    .summary-card .label {
      font-size: 0.9rem;
      color: var(--text-secondary);
      margin-top: 6px;
      font-weight: 500;
    }

    .allele-info {
      background: var(--bg-card);
      border-radius: 12px;
      padding: 20px;
      margin: 16px 0;
      box-shadow: var(--shadow-sm);
      border: 1px solid var(--border-color);
    }

    .allele-info table {
      width: 100%;
      border-collapse: collapse;
    }

    .allele-info th, .allele-info td {
      padding: 12px 16px;
      text-align: left;
      border-bottom: 1px solid #e5e5ea;
    }

    .allele-info th {
      color: var(--text-secondary);
      font-weight: 600;
      font-size: 0.85rem;
      text-transform: uppercase;
      letter-spacing: 0.03em;
    }

    .allele-info tr:last-child td {
      border-bottom: none;
    }

    .p-group {
      display: inline-block;
      background: var(--accent);
      color: white;
      padding: 4px 10px;
      border-radius: 6px;
      font-size: 0.8rem;
      font-weight: 600;
    }

    /* Domain visualization */
    .domain-bar {
      display: flex;
      height: 44px;
      border-radius: 10px;
      overflow: hidden;
      margin: 24px 0;
      box-shadow: var(--shadow-sm);
    }

    .domain-segment {
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 0.75rem;
      font-weight: 600;
      color: white;
      position: relative;
      transition: filter 0.2s ease;
    }

    .domain-segment:hover {
      filter: brightness(1.1);
    }

    /* Difference plot */
    .diff-plot {
      background: var(--bg-card);
      border-radius: 12px;
      padding: 24px;
      margin: 24px 0;
      overflow-x: auto;
      box-shadow: var(--shadow-sm);
      border: 1px solid var(--border-color);
    }

    .diff-plot-container {
      position: relative;
      height: 120px;
      min-width: 100%;
    }

    .diff-track {
      position: absolute;
      bottom: 30px;
      left: 0;
      right: 0;
      height: 4px;
      background: #e5e5ea;
      border-radius: 2px;
    }

    .diff-marker {
      position: absolute;
      bottom: 30px;
      width: 4px;
      background: var(--accent);
      border-radius: 2px;
      cursor: pointer;
      transition: all 0.2s ease;
    }

    .diff-marker:hover {
      transform: scaleY(1.3);
      background: var(--accent-hover);
    }

    .diff-marker.peptide-binding {
      background: var(--success);
    }

    .diff-marker.peptide-binding:hover {
      background: #2db84e;
    }

    .position-labels {
      position: absolute;
      bottom: 5px;
      left: 0;
      right: 0;
      display: flex;
      justify-content: space-between;
      font-size: 0.75rem;
      color: var(--text-secondary);
      font-weight: 500;
    }

    /* Sequence alignment */
    .alignment-container {
      background: var(--bg-card);
      border-radius: 12px;
      padding: 24px;
      margin: 24px 0;
      overflow-x: auto;
      box-shadow: var(--shadow-sm);
      border: 1px solid var(--border-color);
    }

    .alignment {
      font-family: 'SF Mono', 'Monaco', 'Menlo', 'Consolas', monospace;
      font-size: 12px;
      white-space: pre;
      line-height: 1.9;
    }

    .alignment .allele-name {
      display: inline-block;
      width: 160px;
      color: var(--text-secondary);
      font-weight: 500;
    }

    .alignment .seq-block {
      display: inline;
    }

    .alignment .match { color: #c7c7cc; }
    .alignment .mismatch {
      color: white;
      background: var(--accent);
      padding: 2px 4px;
      border-radius: 3px;
      font-weight: 600;
    }
    .alignment .peptide-binding-diff {
      background: var(--success);
    }
    .alignment .unknown {
      color: #c7c7cc;
      background: #f0f0f0;
      padding: 2px 4px;
      border-radius: 3px;
    }

    .alignment .position-ruler {
      color: var(--text-tertiary);
      margin-left: 160px;
    }

    /* Domain difference table */
    .domain-table {
      width: 100%;
      border-collapse: collapse;
      margin: 16px 0;
      background: var(--bg-card);
      border-radius: 12px;
      overflow: hidden;
      box-shadow: var(--shadow-sm);
      border: 1px solid var(--border-color);
    }

    .domain-table th, .domain-table td {
      padding: 14px 16px;
      text-align: left;
      border-bottom: 1px solid #e5e5ea;
    }

    .domain-table th {
      background: #fafafa;
      color: var(--text-secondary);
      font-weight: 600;
      font-size: 0.8rem;
      text-transform: uppercase;
      letter-spacing: 0.03em;
    }

    .domain-table tr:last-child td {
      border-bottom: none;
    }

    .domain-table tr:hover {
      background: var(--bg-hover);
    }

    .domain-badge {
      display: inline-block;
      padding: 4px 12px;
      border-radius: 6px;
      font-size: 0.75rem;
      font-weight: 600;
      color: white;
    }

    .legend {
      display: flex;
      gap: 24px;
      flex-wrap: wrap;
      margin: 16px 0;
      font-size: 0.85rem;
    }

    .legend-item {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .legend-color {
      width: 20px;
      height: 20px;
      border-radius: 6px;
      box-shadow: var(--shadow-sm);
    }

    .tabs {
      display: flex;
      gap: 8px;
      margin-bottom: 0;
      padding: 4px;
      background: #e5e5ea;
      border-radius: 10px;
      width: fit-content;
    }

    .tab {
      padding: 8px 20px;
      background: transparent;
      border: none;
      border-radius: 8px;
      color: var(--text-secondary);
      cursor: pointer;
      font-size: 0.9rem;
      font-weight: 500;
      transition: all 0.2s ease;
    }

    .tab:hover {
      color: var(--text-primary);
    }

    .tab.active {
      background: var(--bg-card);
      color: var(--text-primary);
      box-shadow: var(--shadow-sm);
    }

    .tab-content { display: none; }
    .tab-content.active { display: block; }

    .footer {
      margin-top: 48px;
      padding-top: 24px;
      border-top: 1px solid var(--border-color);
      text-align: center;
      color: var(--text-secondary);
      font-size: 0.85rem;
    }

    .footer p {
      margin: 4px 0;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>${escapeHtml(title)}</h1>
    <p style="color: var(--text-secondary);">Locus: ${locus} | Generated: ${new Date().toISOString()}</p>

    ${warnings.length > 0 ? `
    <div class="warning-box">
      <strong>Note:</strong> ${warnings.join(' ')}
    </div>
    ` : ''}

    <!-- Summary Cards -->
    <div class="summary-grid">
      <div class="summary-card">
        <div class="value">${alleles.length}</div>
        <div class="label">Alleles Compared</div>
      </div>
      <div class="summary-card">
        <div class="value">${proteinDiffs.length}</div>
        <div class="label">Protein Differences</div>
      </div>
      <div class="summary-card">
        <div class="value">${codingDiffs.length}</div>
        <div class="label">Coding Differences</div>
      </div>
      <div class="summary-card">
        <div class="value">${peptideBindingDiffs.length}</div>
        <div class="label">Peptide Binding Site Diffs</div>
      </div>
    </div>

    <!-- Allele Information -->
    <h2>Allele Information</h2>
    <div class="allele-info">
      <table>
        <thead>
          <tr>
            <th>Allele</th>
            <th>P Group</th>
            <th>Protein Length</th>
            <th>Coding Length</th>
          </tr>
        </thead>
        <tbody>
          ${alleles.map(a => `
            <tr>
              <td><strong>${escapeHtml(a.name)}</strong></td>
              <td>${a.pGroup ? `<span class="p-group">${escapeHtml(a.pGroup)}</span>` : '<span style="color: var(--text-secondary)">None</span>'}</td>
              <td>${a.proteinSeq.replace(/\*/g, '').replace(/\./g, '').length} aa (aligned: ${a.proteinSeq.length})</td>
              <td>${a.codingSeq.replace(/\*/g, '').replace(/\./g, '').length} bp (aligned: ${a.codingSeq.length})</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>

    <!-- Domain Structure -->
    <h2>HLA Class I Protein Domain Structure</h2>
    <div class="domain-bar">
      ${Object.entries(HLA_CLASS_I_DOMAINS).filter(([k]) => k !== 'leader').map(([, domain]) => {
        const width = ((domain.end - domain.start + 1) / maxProteinLen) * 100;
        const diffCount = (diffsByDomain[domain.name] || []).length;
        return `<div class="domain-segment" style="width: ${width}%; background: ${domain.color};" title="${domain.name} (${domain.start}-${domain.end}): ${diffCount} differences">
          ${domain.name} (${diffCount})
        </div>`;
      }).join('')}
    </div>

    <div class="legend">
      ${Object.entries(HLA_CLASS_I_DOMAINS).filter(([k]) => k !== 'leader').map(([, domain]) => `
        <div class="legend-item">
          <div class="legend-color" style="background: ${domain.color};"></div>
          <span>${domain.name} (${domain.start}-${domain.end})</span>
        </div>
      `).join('')}
    </div>

    <!-- Difference Plot -->
    <h2>Difference Distribution Plot</h2>
    <div class="diff-plot">
      <p style="margin-bottom: 15px; font-size: 0.9rem; color: var(--text-secondary);">
        Each bar represents a position with sequence variation.
        <span style="color: var(--accent);">Blue</span> = general difference,
        <span style="color: var(--success);">Green</span> = peptide binding site.
      </p>
      <div class="diff-plot-container" style="width: ${Math.max(800, maxProteinLen * 2)}px;">
        <div class="diff-track"></div>
        ${proteinDiffs.map(diff => {
          const left = (diff.position / maxProteinLen) * 100;
          const height = 40 + (diff.isPeptideBinding ? 30 : 0);
          return `<div class="diff-marker ${diff.isPeptideBinding ? 'peptide-binding' : ''}"
                       style="left: ${left}%; height: ${height}px;"
                       title="Position ${diff.position} (${diff.domain})${diff.isPeptideBinding ? ' - Peptide Binding Site' : ''}&#10;${Object.entries(diff.residues).map(([a, r]) => `${a}: ${r}`).join('&#10;')}">
          </div>`;
        }).join('')}
        <div class="position-labels">
          <span>1</span>
          <span>90</span>
          <span>182</span>
          <span>274</span>
          <span>${maxProteinLen}</span>
        </div>
      </div>
    </div>

    <!-- Tabs for Alignment Views -->
    <h2>Sequence Alignment</h2>
    <div class="tabs">
      <button class="tab active" onclick="showTab('protein')">Protein</button>
      <button class="tab" onclick="showTab('coding')">Coding (Nucleotide)</button>
    </div>

    <div id="protein-tab" class="tab-content active">
      <div class="alignment-container">
        ${generateAlignmentHTML(alleles, 'proteinSeq', proteinDiffs, 60)}
      </div>
    </div>

    <div id="coding-tab" class="tab-content">
      <div class="alignment-container">
        ${generateAlignmentHTML(alleles, 'codingSeq', codingDiffs, 60)}
      </div>
    </div>

    <!-- Differences by Domain -->
    <h2>Differences by Domain</h2>
    <table class="domain-table">
      <thead>
        <tr>
          <th>Position</th>
          <th>Domain</th>
          <th>Peptide Binding</th>
          ${alleleNames.map(n => `<th>${escapeHtml(n.split('*')[1] || n)}</th>`).join('')}
        </tr>
      </thead>
      <tbody>
        ${proteinDiffs.slice(0, 100).map(diff => `
          <tr>
            <td><strong>${diff.position}</strong></td>
            <td><span class="domain-badge" style="background: ${getDomainColor(diff.domain)};">${diff.domain}</span></td>
            <td>${diff.isPeptideBinding ? '✓' : ''}</td>
            ${alleleNames.map(n => `<td style="font-family: monospace; font-size: 1.1rem;">${diff.residues[n] || '-'}</td>`).join('')}
          </tr>
        `).join('')}
        ${proteinDiffs.length > 100 ? `<tr><td colspan="${3 + alleleNames.length}" style="text-align: center; color: var(--text-secondary);">... and ${proteinDiffs.length - 100} more differences</td></tr>` : ''}
      </tbody>
    </table>

    <div class="footer">
      <p>Generated by IMGT/HLA MCP Server</p>
      <p>Data source: IPD-IMGT/HLA Database (https://www.ebi.ac.uk/ipd/imgt/hla/)</p>
      <p>Alignments from ANHIG/IMGTHLA GitHub repository</p>
    </div>
  </div>

  <script>
    function showTab(tabName) {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
      document.querySelector(\`[onclick="showTab('\${tabName}')"]\`).classList.add('active');
      document.getElementById(tabName + '-tab').classList.add('active');
    }
  </script>
</body>
</html>`;
}

function generateAlignmentHTML(
  alleles: AlleleData[],
  seqKey: 'proteinSeq' | 'codingSeq',
  diffs: Difference[],
  blockSize: number
): string {
  const sequences = alleles.map(a => ({ name: a.name, seq: a[seqKey] }));
  if (sequences.some(s => !s.seq)) {
    return '<p style="color: var(--text-secondary);">Sequences not available for all alleles.</p>';
  }

  const maxLen = Math.max(...sequences.map(s => s.seq.length));
  const diffPositions = new Set(diffs.map(d => d.position));
  const peptideBindingDiffs = new Set(diffs.filter(d => d.isPeptideBinding).map(d => d.position));
  const blocks: string[] = [];

  for (let start = 0; start < maxLen; start += blockSize) {
    const end = Math.min(start + blockSize, maxLen);

    // Position ruler
    let ruler = ' '.repeat(160);
    for (let p = start; p < end; p += 10) {
      const label = (p + 1).toString();
      ruler += label.padEnd(10);
    }
    blocks.push(`<div class="alignment"><span class="position-ruler">${ruler.trimEnd()}</span></div>`);

    // Sequence lines
    for (const { name, seq } of sequences) {
      let line = `<span class="allele-name">${escapeHtml(name)}</span>`;
      line += '<span class="seq-block">';

      for (let i = start; i < end && i < seq.length; i++) {
        const pos = i + 1;
        const char = seq[i];

        // Handle unknown (*) and gap (.) characters
        if (char === '*' || char === '.') {
          line += `<span class="unknown">${char}</span>`;
        } else if (diffPositions.has(pos)) {
          const isPeptideBinding = peptideBindingDiffs.has(pos);
          line += `<span class="mismatch ${isPeptideBinding ? 'peptide-binding-diff' : ''}">${char}</span>`;
        } else {
          line += `<span class="match">${char}</span>`;
        }

        // Add space every 10 characters for readability
        if ((i + 1) % 10 === 0 && i + 1 < end) {
          line += ' ';
        }
      }

      line += '</span>';
      blocks.push(`<div class="alignment">${line}</div>`);
    }

    blocks.push('<div style="height: 15px;"></div>');
  }

  return blocks.join('\n');
}

function getDomainColor(domain: string): string {
  for (const d of Object.values(HLA_CLASS_I_DOMAINS)) {
    if (d.name === domain) return d.color;
  }
  return '#666';
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export const visualizeComparisonTool = {
  name: 'visualize_comparison',
  description:
    'Generate an interactive HTML visualization of HLA allele comparisons. ' +
    'Includes sequence alignment with color-coded differences, difference distribution plot, ' +
    'protein domain mapping, and peptide binding site annotations.',
  inputSchema: visualizeComparisonSchema,
  handler: visualizeComparison,
};
