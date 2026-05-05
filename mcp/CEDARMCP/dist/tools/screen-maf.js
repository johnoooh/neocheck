/**
 * screen_maf_neoantigens tool
 *
 * Screen a MAF file against CEDAR to identify which somatic mutations
 * have known cancer epitopes with experimental evidence.
 */
import { z } from 'zod';
import * as fs from 'fs/promises';
import { cedarClient } from '../api/cedar-client.js';
import { cache, CacheKeys, CacheTTL } from '../cache/cache-manager.js';
// --- Zod Schema ---
const mafMutationSchema = z.object({
    hugo_symbol: z.string(),
    hgvsp_short: z.string(),
    variant_classification: z.string(),
    t_var_freq: z.number().nullable().optional(),
    protein_position: z.string().nullable().optional(),
});
export const screenMafSchema = z.object({
    maf_file_path: z
        .string()
        .optional()
        .describe('Absolute path to a MAF file on disk. Either this or mutations must be provided.'),
    mutations: z
        .array(mafMutationSchema)
        .optional()
        .describe('Pre-parsed array of mutations as an alternative to maf_file_path. Each entry needs hugo_symbol, hgvsp_short, variant_classification.'),
    max_epitopes_per_mutation: z
        .number()
        .min(1)
        .max(50)
        .optional()
        .default(10)
        .describe('Maximum CEDAR epitope results per mutation (default: 10)'),
    include_tcell_details: z
        .boolean()
        .optional()
        .default(false)
        .describe('If true, enrich each epitope hit with detailed T-cell export data including response frequency, subject counts, assay methods, MHC restriction details, and TCR names. Requires additional API calls per hit.'),
});
// --- Helpers ---
/**
 * Parse a MAF file into structured rows.
 */
async function parseMafFile(filePath) {
    const content = await fs.readFile(filePath, 'utf-8');
    const lines = content.split('\n').filter((l) => l.trim() && !l.startsWith('#'));
    if (lines.length < 2) {
        throw new Error('MAF file must contain a header row and at least one data row');
    }
    const header = lines[0].split('\t');
    const colIndex = (name) => {
        const idx = header.indexOf(name);
        if (idx === -1)
            throw new Error(`Required MAF column not found: ${name}`);
        return idx;
    };
    // Required columns
    const hugoIdx = colIndex('Hugo_Symbol');
    const hgvspIdx = colIndex('HGVSp_Short');
    const varClassIdx = colIndex('Variant_Classification');
    // Optional columns
    const tVarFreqIdx = header.indexOf('t_var_freq');
    const protPosIdx = header.indexOf('Protein_position');
    const rows = [];
    for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split('\t');
        if (cols.length <= hugoIdx)
            continue;
        rows.push({
            hugo_symbol: cols[hugoIdx],
            hgvsp_short: cols[hgvspIdx] ?? '',
            variant_classification: cols[varClassIdx] ?? '',
            t_var_freq: tVarFreqIdx >= 0 && cols[tVarFreqIdx]
                ? parseFloat(cols[tVarFreqIdx]) || null
                : null,
            protein_position: protPosIdx >= 0 ? cols[protPosIdx] || null : null,
        });
    }
    return rows;
}
/**
 * Extract short mutation notation from HGVSp_Short.
 * "p.E17K" → "E17K", "p.G12D" → "G12D"
 * Returns null for splice variants, frameshifts, nonsense, etc.
 */
function extractShortMutation(hgvsp) {
    const match = hgvsp.match(/^p\.([A-Z]\d+[A-Z])$/i);
    return match ? match[1] : null;
}
/**
 * Check if a variant classification is missense.
 */
function isMissense(varClass) {
    return varClass.toLowerCase() === 'missense_mutation';
}
/**
 * Convert an EpitopeSearchRecord to an EpitopeSummary.
 */
function toEpitopeSummary(r) {
    return {
        structure_id: r.structure_id,
        linear_sequence: r.linear_sequence,
        mutation: r.mutation,
        structure_type: r.structure_type,
        source_molecules: r.r_object_source_molecule_names,
        source_organisms: r.source_organism_names,
        mhc_alleles: r.mhc_allele_names,
        mhc_classes: r.mhc_classes,
        diseases: r.disease_names,
        is_neoantigen: r.neoantigen_bool === 1,
        tcell_assay_count: r.tcell_ids?.length ?? 0,
        mhc_assay_count: r.elution_ids?.length ?? 0,
        bcell_assay_count: r.bcell_ids?.length ?? 0,
        reference_count: r.reference_ids?.length ?? 0,
        pdb_ids: r.pdb_ids,
        cedar_url: `https://cedar.iedb.org/epitope/${r.structure_id}`,
    };
}
/**
 * Query CEDAR for multiple mutations in batches of `concurrency`.
 */
async function queryMutationsBatched(mutations, maxPerMutation, concurrency = 3) {
    const results = new Map();
    // Deduplicate mutations to avoid redundant API calls
    const uniqueMutations = new Map();
    for (const { shortMutation, index } of mutations) {
        const existing = uniqueMutations.get(shortMutation);
        if (existing) {
            existing.push(index);
        }
        else {
            uniqueMutations.set(shortMutation, [index]);
        }
    }
    const uniqueEntries = Array.from(uniqueMutations.entries());
    for (let i = 0; i < uniqueEntries.length; i += concurrency) {
        const batch = uniqueEntries.slice(i, i + concurrency);
        const promises = batch.map(async ([shortMutation, indices]) => {
            const cacheKey = CacheKeys.epitopeSearch(`maf:${shortMutation}:${maxPerMutation}`);
            const cached = cache.get(cacheKey);
            let summaries;
            if (cached) {
                summaries = cached;
            }
            else {
                const records = await cedarClient.searchEpitopes({
                    mutation: shortMutation,
                    limit: maxPerMutation,
                });
                summaries = records.map(toEpitopeSummary);
                cache.set(cacheKey, summaries, CacheTTL.SHORT);
            }
            // Assign to all indices sharing this mutation
            for (const idx of indices) {
                results.set(idx, summaries);
            }
        });
        await Promise.allSettled(promises);
    }
    return results;
}
/**
 * Convert a TcellExportRecord to a TcellDetailRecord summary.
 */
function toTcellDetail(r) {
    return {
        assay_method: r.assay__method,
        response_measured: r.assay__response_measured,
        qualitative_measure: r.assay__qualitative_measurement,
        quantitative_measure: r.assay__quantitative_measurement,
        units: r.assay__units,
        response_frequency: r.assay__response_frequency_,
        subjects_tested: r.assay__number_of_subjects_tested,
        subjects_positive: r.assay__number_of_subjects_positive,
        mhc_restriction: r.mhc_restriction__name,
        mhc_class: r.mhc_restriction__class,
        mhc_evidence: r.mhc_restriction__evidence_code,
        host: r.host__name,
        disease: r.first_in_vivo_process__disease,
        disease_stage: r.first_in_vivo_process__disease_stage,
        tcr_name: r.effector_cell__tcr_name,
        pdb_id: r.complex__pdb_id,
        pubmed_id: r.reference__pmid,
    };
}
/**
 * Fetch T-cell export data for epitope hits in batches.
 * Uses epitope linear_sequence (peptide name) to query tcell_export endpoint.
 */
async function enrichWithTcellDetails(epitopeHits, concurrency = 3) {
    // Collect unique linear_sequences across all hits that have T-cell assays
    const sequenceToStructureIds = new Map();
    for (const summaries of epitopeHits.values()) {
        for (const s of summaries) {
            if (s.tcell_assay_count > 0 && s.linear_sequence) {
                const seq = s.linear_sequence;
                if (!sequenceToStructureIds.has(seq)) {
                    sequenceToStructureIds.set(seq, new Set());
                }
                sequenceToStructureIds.get(seq).add(s.structure_id);
            }
        }
    }
    if (sequenceToStructureIds.size === 0)
        return;
    const sequenceList = Array.from(sequenceToStructureIds.keys());
    // Map from linear_sequence → TcellDetailRecord[]
    const detailsBySequence = new Map();
    // Batch fetch by epitope name (linear_sequence)
    for (let i = 0; i < sequenceList.length; i += concurrency) {
        const batch = sequenceList.slice(i, i + concurrency);
        const promises = batch.map(async (seq) => {
            const cacheKey = CacheKeys.epitopeSearch(`tcell_export:seq:${seq}`);
            const cached = cache.get(cacheKey);
            if (cached) {
                detailsBySequence.set(seq, cached);
                return;
            }
            try {
                const records = await cedarClient.getTcellExport({ epitope_name: seq, limit: 50 });
                const details = records.map(toTcellDetail);
                cache.set(cacheKey, details, CacheTTL.MEDIUM);
                detailsBySequence.set(seq, details);
            }
            catch {
                // If export fetch fails, skip enrichment for this epitope
                detailsBySequence.set(seq, []);
            }
        });
        await Promise.allSettled(promises);
    }
    // Attach details to epitope summaries by matching linear_sequence
    for (const summaries of epitopeHits.values()) {
        for (const s of summaries) {
            if (s.linear_sequence) {
                const details = detailsBySequence.get(s.linear_sequence);
                if (details && details.length > 0) {
                    s.tcell_details = details;
                }
            }
        }
    }
}
// --- Main Handler ---
export async function screenMafNeoantigens(input) {
    // 1. Get mutations from file or direct input
    let parsedRows;
    if (input.maf_file_path) {
        parsedRows = await parseMafFile(input.maf_file_path);
    }
    else if (input.mutations) {
        parsedRows = input.mutations.map((m) => ({
            hugo_symbol: m.hugo_symbol,
            hgvsp_short: m.hgvsp_short,
            variant_classification: m.variant_classification,
            t_var_freq: m.t_var_freq ?? null,
            protein_position: m.protein_position ?? null,
        }));
    }
    else {
        throw new Error('Either maf_file_path or mutations must be provided');
    }
    // 2. Classify mutations
    const missenseMutations = [];
    const skipped = [];
    for (let i = 0; i < parsedRows.length; i++) {
        const row = parsedRows[i];
        if (!isMissense(row.variant_classification)) {
            skipped.push({
                hugo_symbol: row.hugo_symbol,
                hgvsp_short: row.hgvsp_short,
                variant_classification: row.variant_classification,
                skip_reason: `Non-missense variant: ${row.variant_classification}`,
            });
            continue;
        }
        const shortMut = extractShortMutation(row.hgvsp_short);
        if (!shortMut) {
            skipped.push({
                hugo_symbol: row.hugo_symbol,
                hgvsp_short: row.hgvsp_short,
                variant_classification: row.variant_classification,
                skip_reason: `Could not extract short mutation notation from: ${row.hgvsp_short}`,
            });
            continue;
        }
        missenseMutations.push({ row, shortMutation: shortMut, index: i });
    }
    // 3. Query CEDAR in batches
    const cedarResults = await queryMutationsBatched(missenseMutations.map((m) => ({
        shortMutation: m.shortMutation,
        index: m.index,
    })), input.max_epitopes_per_mutation ?? 10);
    // 3b. Optionally enrich with T-cell export data
    if (input.include_tcell_details) {
        await enrichWithTcellDetails(cedarResults);
    }
    // 4. Build results
    const mutationResults = missenseMutations.map((m) => {
        const hits = cedarResults.get(m.index) ?? [];
        return {
            hugo_symbol: m.row.hugo_symbol,
            hgvsp_short: m.row.hgvsp_short,
            mutation_short: m.shortMutation,
            variant_classification: m.row.variant_classification,
            t_var_freq: m.row.t_var_freq,
            protein_position: m.row.protein_position,
            cedar_hits: hits,
            hit_count: hits.length,
        };
    });
    const withHits = mutationResults.filter((m) => m.hit_count > 0).length;
    return {
        summary: {
            total_mutations: parsedRows.length,
            missense_mutations: missenseMutations.length,
            skipped_mutations: skipped.length,
            mutations_with_cedar_hits: withHits,
            mutations_without_cedar_hits: missenseMutations.length - withHits,
        },
        mutations: mutationResults,
        skipped,
    };
}
// --- Tool Export ---
export const screenMafTool = {
    name: 'screen_maf_neoantigens',
    description: 'Screen a MAF file (or list of mutations) against CEDAR to identify which somatic mutations have known cancer epitopes. Parses missense mutations, queries CEDAR by short mutation notation (e.g., G12D, E17K, V600E), and returns a structured report with CEDAR epitope matches including MHC restriction, assay evidence, disease context, and neoantigen status. Set include_tcell_details=true for enriched T-cell data including response frequencies, subject counts, and TCR names.',
    inputSchema: screenMafSchema,
    handler: screenMafNeoantigens,
};
//# sourceMappingURL=screen-maf.js.map