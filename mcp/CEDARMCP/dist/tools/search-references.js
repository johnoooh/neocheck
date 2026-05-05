/**
 * search_references tool
 *
 * Search publications/references in CEDAR.
 */
import { z } from 'zod';
import { cedarClient } from '../api/cedar-client.js';
import { cache, CacheKeys, CacheTTL } from '../cache/cache-manager.js';
export const searchReferencesSchema = z.object({
    title: z
        .string()
        .optional()
        .describe('Search by title substring (e.g., "KRAS", "neoantigen")'),
    author: z
        .string()
        .optional()
        .describe('Search by author name'),
    pubmed_id: z
        .string()
        .optional()
        .describe('Search by exact PubMed ID'),
    neoantigen_only: z
        .boolean()
        .optional()
        .default(false)
        .describe('If true, only return references about neoantigens'),
    limit: z
        .number()
        .min(1)
        .max(100)
        .optional()
        .default(25)
        .describe('Maximum results to return (default: 25, max: 100)'),
});
export async function searchReferences(input) {
    const cacheKey = CacheKeys.referenceSearch(JSON.stringify(input));
    const cached = cache.get(cacheKey);
    if (cached)
        return cached;
    const records = await cedarClient.searchReferences({
        title: input.title,
        author: input.author,
        pubmed_id: input.pubmed_id,
        neoantigen_only: input.neoantigen_only,
        limit: input.limit,
    });
    const references = records.map((r) => ({
        reference_id: r.reference_id,
        reference_iri: r.reference_iri,
        pubmed_id: r.pubmed_id,
        reference_type: r.reference_type,
        title: r.reference_title,
        authors: r.reference_authors,
        year: r.reference_dates?.[0] ?? null,
        journal: r.journal_name,
        epitope_count: r.structure_ids?.length ?? 0,
        assay_count: r.cedar_assay_ids?.length ?? 0,
        is_neoantigen: r.neoantigen_bool === 1,
        pubmed_url: r.pubmed_id ? `https://pubmed.ncbi.nlm.nih.gov/${r.pubmed_id}` : null,
    }));
    const result = { references, count: references.length };
    cache.set(cacheKey, result, CacheTTL.SHORT);
    return result;
}
export const searchReferencesTool = {
    name: 'search_references',
    description: 'Search publications and references in CEDAR by title, author, PubMed ID, or neoantigen focus. Returns reference summaries with publication details, epitope counts, and PubMed links.',
    inputSchema: searchReferencesSchema,
    handler: searchReferences,
};
//# sourceMappingURL=search-references.js.map