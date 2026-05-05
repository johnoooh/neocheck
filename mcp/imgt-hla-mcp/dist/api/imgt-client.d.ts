/**
 * IMGT/HLA REST API Client
 *
 * Provides access to the IPD-IMGT/HLA database through the EBI REST API.
 * Base URL: https://www.ebi.ac.uk/cgi-bin/ipd/api/
 */
import type { AlleleListResponse, AlleleDetailResponse, CellListResponse, CellDetailResponse, SequenceType, SearchType } from '../types/imgt.js';
export declare class IMGTClient {
    private baseUrl;
    private project;
    constructor(baseUrl?: string, project?: string);
    /**
     * Build a query string using IMGT's MongoDB-style query syntax
     */
    private buildQuery;
    /**
     * Make an API request
     */
    private request;
    /**
     * Search for alleles
     */
    searchAlleles(params: {
        query?: string;
        locus?: string;
        searchType?: SearchType;
        limit?: number;
        next?: string;
    }): Promise<AlleleListResponse>;
    /**
     * Get a single allele by accession or name
     *
     * Supports:
     * - Accessions: HLA00001
     * - Full 4-field names: A*01:01:01:01
     * - 2-field names: A*01:01 (resolves to first matching 4-field allele)
     * - 3-field names: A*01:01:01
     */
    getAllele(identifier: string): Promise<AlleleDetailResponse>;
    /**
     * Get allele by accession directly
     */
    getAlleleByAccession(accession: string): Promise<AlleleDetailResponse>;
    /**
     * List alleles for a specific locus
     */
    listLocusAlleles(locus: string, limit?: number, next?: string): Promise<AlleleListResponse>;
    /**
     * Download sequences in bulk
     */
    downloadSequences(params: {
        locus?: string;
        query?: string;
        sequenceType: SequenceType;
    }): Promise<string>;
    /**
     * Search for cells
     */
    searchCells(params: {
        query?: string;
        ethnicity?: string;
        limit?: number;
        next?: string;
    }): Promise<CellListResponse>;
    /**
     * Get a single cell by ID
     */
    getCell(cellId: string): Promise<CellDetailResponse>;
    /**
     * Get multiple alleles in batch
     */
    getAllelesBatch(identifiers: string[]): Promise<AlleleDetailResponse[]>;
}
export declare class IMGTAPIError extends Error {
    status: number;
    endpoint: string;
    constructor(message: string, status: number, endpoint: string);
}
export declare const imgtClient: IMGTClient;
//# sourceMappingURL=imgt-client.d.ts.map