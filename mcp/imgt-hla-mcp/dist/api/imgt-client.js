/**
 * IMGT/HLA REST API Client
 *
 * Provides access to the IPD-IMGT/HLA database through the EBI REST API.
 * Base URL: https://www.ebi.ac.uk/cgi-bin/ipd/api/
 */
const BASE_URL = 'https://www.ebi.ac.uk/cgi-bin/ipd/api';
const PROJECT = 'HLA';
export class IMGTClient {
    baseUrl;
    project;
    constructor(baseUrl = BASE_URL, project = PROJECT) {
        this.baseUrl = baseUrl;
        this.project = project;
    }
    /**
     * Build a query string using IMGT's MongoDB-style query syntax
     */
    buildQuery(params) {
        const conditions = [];
        if (params.name) {
            switch (params.searchType) {
                case 'exact':
                    conditions.push(`eq(name,"${params.name}")`);
                    break;
                case 'contains':
                    conditions.push(`contains(name,"${params.name}")`);
                    break;
                case 'startsWith':
                default:
                    conditions.push(`startsWith(name,"${params.name}")`);
                    break;
            }
        }
        if (params.locus) {
            conditions.push(`startsWith(name,"${params.locus}*")`);
        }
        if (params.accession) {
            conditions.push(`eq(accession,"${params.accession}")`);
        }
        if (conditions.length === 0)
            return '';
        if (conditions.length === 1)
            return conditions[0];
        return `and(${conditions.join(',')})`;
    }
    /**
     * Make an API request
     */
    async request(endpoint, params = {}) {
        const url = new URL(`${this.baseUrl}${endpoint}`);
        // Add project parameter
        url.searchParams.set('project', this.project);
        // Add other parameters
        for (const [key, value] of Object.entries(params)) {
            if (value !== undefined) {
                url.searchParams.set(key, String(value));
            }
        }
        const response = await fetch(url.toString(), {
            headers: {
                Accept: 'application/json',
            },
        });
        if (!response.ok) {
            throw new IMGTAPIError(`API request failed: ${response.status} ${response.statusText}`, response.status, endpoint);
        }
        return response.json();
    }
    /**
     * Search for alleles
     */
    async searchAlleles(params) {
        const queryString = this.buildQuery({
            name: params.query,
            locus: params.locus,
            searchType: params.searchType,
        });
        return this.request('/allele', {
            query: queryString || undefined,
            limit: params.limit,
            next: params.next,
        });
    }
    /**
     * Get a single allele by accession or name
     *
     * Supports:
     * - Accessions: HLA00001
     * - Full 4-field names: A*01:01:01:01
     * - 2-field names: A*01:01 (resolves to first matching 4-field allele)
     * - 3-field names: A*01:01:01
     */
    async getAllele(identifier) {
        // If it looks like an accession (starts with HLA followed by digits), use it directly
        if (/^HLA\d+$/.test(identifier)) {
            return this.request(`/allele/${identifier}`);
        }
        // Try exact match first
        const exactResult = await this.searchAlleles({
            query: identifier,
            searchType: 'exact',
            limit: 1,
        });
        if (exactResult.data.length > 0) {
            return this.request(`/allele/${exactResult.data[0].accession}`);
        }
        // If exact match fails and this looks like a 2-field or 3-field allele name,
        // try prefix search to find the most common (first listed) matching allele
        // Pattern: LOCUS*XX:XX or LOCUS*XX:XX:XX (not 4-field)
        const is2or3Field = identifier.match(/^[A-Z]+[0-9]*\*\d+:\d+(?::\d+)?$/);
        if (is2or3Field) {
            const prefixResult = await this.searchAlleles({
                query: identifier,
                searchType: 'startsWith',
                limit: 1,
            });
            if (prefixResult.data.length > 0) {
                return this.request(`/allele/${prefixResult.data[0].accession}`);
            }
        }
        throw new IMGTAPIError(`Allele not found: ${identifier}. Try using the full 4-field name (e.g., A*01:01:01:01) or search first.`, 404, '/allele');
    }
    /**
     * Get allele by accession directly
     */
    async getAlleleByAccession(accession) {
        return this.request(`/allele/${accession}`);
    }
    /**
     * List alleles for a specific locus
     */
    async listLocusAlleles(locus, limit = 50, next) {
        const queryString = `startsWith(name,"${locus}*")`;
        return this.request('/allele', {
            query: queryString,
            limit,
            next,
        });
    }
    /**
     * Download sequences in bulk
     */
    async downloadSequences(params) {
        const url = new URL(`${this.baseUrl}/allele/download`);
        url.searchParams.set('project', this.project);
        url.searchParams.set('type', params.sequenceType);
        if (params.locus) {
            url.searchParams.set('query', `startsWith(name,"${params.locus}*")`);
        }
        else if (params.query) {
            url.searchParams.set('query', params.query);
        }
        const response = await fetch(url.toString(), {
            headers: {
                Accept: 'text/plain',
            },
        });
        if (!response.ok) {
            throw new IMGTAPIError(`Download failed: ${response.status} ${response.statusText}`, response.status, '/allele/download');
        }
        return response.text();
    }
    /**
     * Search for cells
     */
    async searchCells(params) {
        const conditions = [];
        if (params.query) {
            conditions.push(`contains(name,"${params.query}")`);
        }
        if (params.ethnicity) {
            conditions.push(`eq(ethnicity,"${params.ethnicity}")`);
        }
        const queryString = conditions.length === 0
            ? undefined
            : conditions.length === 1
                ? conditions[0]
                : `and(${conditions.join(',')})`;
        return this.request('/cell', {
            query: queryString,
            limit: params.limit,
            next: params.next,
        });
    }
    /**
     * Get a single cell by ID
     */
    async getCell(cellId) {
        return this.request(`/cell/${cellId}`);
    }
    /**
     * Get multiple alleles in batch
     */
    async getAllelesBatch(identifiers) {
        return Promise.all(identifiers.map((id) => this.getAllele(id)));
    }
}
export class IMGTAPIError extends Error {
    status;
    endpoint;
    constructor(message, status, endpoint) {
        super(message);
        this.name = 'IMGTAPIError';
        this.status = status;
        this.endpoint = endpoint;
    }
}
// Export singleton instance
export const imgtClient = new IMGTClient();
//# sourceMappingURL=imgt-client.js.map