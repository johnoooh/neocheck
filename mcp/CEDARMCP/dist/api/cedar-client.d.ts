/**
 * CEDAR API Client
 *
 * REST client for the CEDAR (Cancer Epitope Database and Analysis Resource) API.
 * Uses PostgREST-style query syntax.
 * Base URL: https://cedar-api.iedb.org
 */
import type { EpitopeSearchRecord, AntigenSearchRecord, TcellSearchRecord, MhcSearchRecord, ReferenceSearchRecord, TcrSearchRecord, BcellSearchRecord, TcellExportRecord } from '../types/cedar.js';
export declare class CEDARAPIError extends Error {
    status: number;
    endpoint: string;
    constructor(message: string, status: number, endpoint: string);
}
declare class CEDARClient {
    private baseUrl;
    private request;
    /**
     * Search epitopes with flexible filtering.
     */
    searchEpitopes(options: {
        linear_sequence?: string;
        mutation?: string;
        source_organism?: string;
        neoantigen_only?: boolean;
        mhc_class?: string;
        mhc_allele?: string;
        select?: string;
        limit?: number;
        offset?: number;
        order?: string;
    }): Promise<EpitopeSearchRecord[]>;
    /**
     * Get a single epitope by structure_id.
     */
    getEpitope(structureId: number): Promise<EpitopeSearchRecord | null>;
    /**
     * Search antigens.
     */
    searchAntigens(options: {
        name?: string;
        organism?: string;
        neoantigen_only?: boolean;
        limit?: number;
        offset?: number;
    }): Promise<AntigenSearchRecord[]>;
    /**
     * Search T-cell assays.
     */
    searchTcellAssays(options: {
        linear_sequence?: string;
        structure_id?: number;
        mhc_allele?: string;
        assay_type?: string;
        qualitative_measure?: string;
        mutation?: string;
        limit?: number;
        offset?: number;
    }): Promise<TcellSearchRecord[]>;
    /**
     * Search MHC ligand/elution assays.
     */
    searchMhcLigands(options: {
        linear_sequence?: string;
        structure_id?: number;
        mhc_allele?: string;
        qualitative_measure?: string;
        mutation?: string;
        limit?: number;
        offset?: number;
    }): Promise<MhcSearchRecord[]>;
    /**
     * Search references/publications.
     */
    searchReferences(options: {
        title?: string;
        author?: string;
        pubmed_id?: string;
        neoantigen_only?: boolean;
        limit?: number;
        offset?: number;
    }): Promise<ReferenceSearchRecord[]>;
    /**
     * Search T-cell receptors.
     */
    searchTcr(options: {
        linear_sequence?: string;
        structure_id?: number;
        cdr3_beta?: string;
        cdr3_alpha?: string;
        mhc_allele?: string;
        mutation?: string;
        receptor_type?: string;
        neoantigen_only?: boolean;
        limit?: number;
        offset?: number;
    }): Promise<TcrSearchRecord[]>;
    /**
     * Search B-cell assays.
     */
    searchBcell(options: {
        linear_sequence?: string;
        structure_id?: number;
        antibody_isotype?: string;
        qualitative_measure?: string;
        mutation?: string;
        limit?: number;
        offset?: number;
    }): Promise<BcellSearchRecord[]>;
    /**
     * Get T-cell export data for a specific epitope (enrichment data).
     */
    getTcellExport(options: {
        epitope_name?: string;
        mutation?: string;
        select?: string;
        limit?: number;
    }): Promise<TcellExportRecord[]>;
}
export declare const cedarClient: CEDARClient;
export {};
//# sourceMappingURL=cedar-client.d.ts.map