/**
 * CEDAR API Client
 *
 * REST client for the CEDAR (Cancer Epitope Database and Analysis Resource) API.
 * Uses PostgREST-style query syntax.
 * Base URL: https://cedar-api.iedb.org
 */

import type {
  EpitopeSearchRecord,
  AntigenSearchRecord,
  TcellSearchRecord,
  MhcSearchRecord,
  ReferenceSearchRecord,
  TcrSearchRecord,
  BcellSearchRecord,
  TcellExportRecord,
} from '../types/cedar.js';

export class CEDARAPIError extends Error {
  constructor(
    message: string,
    public status: number,
    public endpoint: string
  ) {
    super(message);
    this.name = 'CEDARAPIError';
  }
}

interface QueryParams {
  [key: string]: string | number | undefined;
}

class CEDARClient {
  private baseUrl = 'https://cedar-api.iedb.org';

  private async request<T>(endpoint: string, params: QueryParams = {}): Promise<T> {
    const url = new URL(`${this.baseUrl}/${endpoint}`);

    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) {
        url.searchParams.set(key, String(value));
      }
    }

    const response = await fetch(url.toString(), {
      headers: { Accept: 'application/json' },
    });

    if (!response.ok) {
      throw new CEDARAPIError(
        `CEDAR API error: ${response.status} ${response.statusText}`,
        response.status,
        endpoint
      );
    }

    return response.json() as Promise<T>;
  }

  /**
   * Search epitopes with flexible filtering.
   */
  async searchEpitopes(options: {
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
  }): Promise<EpitopeSearchRecord[]> {
    const params: QueryParams = {
      limit: options.limit ?? 25,
      order: options.order ?? 'structure_id',
    };

    if (options.offset) params.offset = options.offset;
    if (options.select) params.select = options.select;

    // Sequence matching: exact if no wildcards, otherwise substring
    if (options.linear_sequence) {
      const seq = options.linear_sequence.toUpperCase();
      if (seq.includes('*')) {
        params.linear_sequence = `like.${seq}`;
      } else {
        params.linear_sequence = `eq.${seq}`;
      }
    }

    if (options.mutation) {
      params.mutation = `eq.${options.mutation}`;
    }

    if (options.source_organism) {
      params['source_organism_names'] = `cs.{${options.source_organism}}`;
    }

    if (options.neoantigen_only) {
      params.neoantigen_bool = 'eq.1';
    }

    if (options.mhc_class) {
      params['mhc_classes'] = `cs.{${options.mhc_class}}`;
    }

    if (options.mhc_allele) {
      params['mhc_allele_names'] = `cs.{${options.mhc_allele}}`;
    }

    return this.request<EpitopeSearchRecord[]>('epitope_search', params);
  }

  /**
   * Get a single epitope by structure_id.
   */
  async getEpitope(structureId: number): Promise<EpitopeSearchRecord | null> {
    const results = await this.request<EpitopeSearchRecord[]>('epitope_search', {
      structure_id: `eq.${structureId}`,
      limit: 1,
    });
    return results.length > 0 ? results[0] : null;
  }

  /**
   * Search antigens.
   */
  async searchAntigens(options: {
    name?: string;
    organism?: string;
    neoantigen_only?: boolean;
    limit?: number;
    offset?: number;
  }): Promise<AntigenSearchRecord[]> {
    const params: QueryParams = {
      limit: options.limit ?? 25,
      order: 'parent_source_antigen_id',
    };

    if (options.offset) params.offset = options.offset;

    if (options.name) {
      params['parent_source_antigen_names'] = `cs.{${options.name}}`;
    }

    if (options.organism) {
      params['parent_source_antigen_source_org_name'] = `like.*${options.organism}*`;
    }

    if (options.neoantigen_only) {
      params.neoantigen_bool = 'eq.1';
    }

    return this.request<AntigenSearchRecord[]>('antigen_search', params);
  }

  /**
   * Search T-cell assays.
   */
  async searchTcellAssays(options: {
    linear_sequence?: string;
    structure_id?: number;
    mhc_allele?: string;
    assay_type?: string;
    qualitative_measure?: string;
    mutation?: string;
    limit?: number;
    offset?: number;
  }): Promise<TcellSearchRecord[]> {
    const params: QueryParams = {
      limit: options.limit ?? 25,
      order: 'tcell_id',
    };

    if (options.offset) params.offset = options.offset;

    if (options.linear_sequence) {
      params.linear_sequence = `eq.${options.linear_sequence.toUpperCase()}`;
    }

    if (options.structure_id) {
      params.structure_id = `eq.${options.structure_id}`;
    }

    if (options.mhc_allele) {
      params.mhc_allele_name = `eq.${options.mhc_allele}`;
    }

    if (options.assay_type) {
      params.assay_names = `like.*${options.assay_type}*`;
    }

    if (options.qualitative_measure) {
      params.qualitative_measure = `eq.${options.qualitative_measure}`;
    }

    if (options.mutation) {
      params.mutation = `eq.${options.mutation}`;
    }

    return this.request<TcellSearchRecord[]>('tcell_search', params);
  }

  /**
   * Search MHC ligand/elution assays.
   */
  async searchMhcLigands(options: {
    linear_sequence?: string;
    structure_id?: number;
    mhc_allele?: string;
    qualitative_measure?: string;
    mutation?: string;
    limit?: number;
    offset?: number;
  }): Promise<MhcSearchRecord[]> {
    const params: QueryParams = {
      limit: options.limit ?? 25,
      order: 'elution_id',
    };

    if (options.offset) params.offset = options.offset;

    if (options.linear_sequence) {
      params.linear_sequence = `eq.${options.linear_sequence.toUpperCase()}`;
    }

    if (options.structure_id) {
      params.structure_id = `eq.${options.structure_id}`;
    }

    if (options.mhc_allele) {
      params.mhc_allele_name = `eq.${options.mhc_allele}`;
    }

    if (options.qualitative_measure) {
      params.qualitative_measure = `eq.${options.qualitative_measure}`;
    }

    if (options.mutation) {
      params.mutation = `eq.${options.mutation}`;
    }

    return this.request<MhcSearchRecord[]>('mhc_search', params);
  }

  /**
   * Search references/publications.
   */
  async searchReferences(options: {
    title?: string;
    author?: string;
    pubmed_id?: string;
    neoantigen_only?: boolean;
    limit?: number;
    offset?: number;
  }): Promise<ReferenceSearchRecord[]> {
    const params: QueryParams = {
      limit: options.limit ?? 25,
      order: 'reference_id',
    };

    if (options.offset) params.offset = options.offset;

    if (options.title) {
      params.reference_title = `like.*${options.title}*`;
    }

    if (options.author) {
      params['reference_authors'] = `cs.{${options.author}}`;
    }

    if (options.pubmed_id) {
      params.pubmed_id = `eq.${options.pubmed_id}`;
    }

    if (options.neoantigen_only) {
      params.neoantigen_bool = 'eq.1';
    }

    return this.request<ReferenceSearchRecord[]>('reference_search', params);
  }

  /**
   * Search T-cell receptors.
   */
  async searchTcr(options: {
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
  }): Promise<TcrSearchRecord[]> {
    const params: QueryParams = {
      limit: options.limit ?? 25,
      order: 'receptor_group_id',
    };

    if (options.offset) params.offset = options.offset;

    if (options.linear_sequence) {
      params['linear_sequences'] = `cs.{${options.linear_sequence.toUpperCase()}}`;
    }

    if (options.structure_id) {
      params['structure_ids'] = `cs.{${options.structure_id}}`;
    }

    if (options.cdr3_beta) {
      const seq = options.cdr3_beta.toUpperCase();
      if (seq.includes('*')) {
        params.chain2_cdr3_seq = `like.${seq}`;
      } else {
        params.chain2_cdr3_seq = `eq.${seq}`;
      }
    }

    if (options.cdr3_alpha) {
      const seq = options.cdr3_alpha.toUpperCase();
      if (seq.includes('*')) {
        params.chain1_cdr3_seq = `like.${seq}`;
      } else {
        params.chain1_cdr3_seq = `eq.${seq}`;
      }
    }

    if (options.mhc_allele) {
      params['mhc_allele_names'] = `cs.{${options.mhc_allele}}`;
    }

    if (options.mutation) {
      params['mutations'] = `cs.{${options.mutation}}`;
    }

    if (options.receptor_type) {
      params.receptor_type = `eq.${options.receptor_type}`;
    }

    if (options.neoantigen_only) {
      params.neoantigen_bool = 'eq.1';
    }

    return this.request<TcrSearchRecord[]>('tcr_search', params);
  }

  /**
   * Search B-cell assays.
   */
  async searchBcell(options: {
    linear_sequence?: string;
    structure_id?: number;
    antibody_isotype?: string;
    qualitative_measure?: string;
    mutation?: string;
    limit?: number;
    offset?: number;
  }): Promise<BcellSearchRecord[]> {
    const params: QueryParams = {
      limit: options.limit ?? 25,
      order: 'bcell_id',
    };

    if (options.offset) params.offset = options.offset;

    if (options.linear_sequence) {
      params.linear_sequence = `eq.${options.linear_sequence.toUpperCase()}`;
    }

    if (options.structure_id) {
      params.structure_id = `eq.${options.structure_id}`;
    }

    if (options.antibody_isotype) {
      params.antibody_isotype = `eq.${options.antibody_isotype}`;
    }

    if (options.qualitative_measure) {
      params.qualitative_measure = `eq.${options.qualitative_measure}`;
    }

    if (options.mutation) {
      params.mutation = `eq.${options.mutation}`;
    }

    return this.request<BcellSearchRecord[]>('bcell_search', params);
  }

  /**
   * Get T-cell export data for a specific epitope (enrichment data).
   */
  async getTcellExport(options: {
    epitope_name?: string;
    mutation?: string;
    select?: string;
    limit?: number;
  }): Promise<TcellExportRecord[]> {
    const params: QueryParams = {
      limit: options.limit ?? 50,
      order: 'assay_id',
    };

    if (options.select) {
      params.select = options.select;
    } else {
      // Default: select only the enrichment fields we care about
      params.select = [
        'assay_id',
        'epitope__name', 'epitope__mutation', 'epitope__source_molecule', 'epitope__source_organism',
        'reference__pmid', 'reference__title', 'reference__journal', 'reference__date',
        'host__name', 'host__sex', 'host__age',
        'first_in_vivo_process__disease', 'first_in_vivo_process__disease_stage',
        'assay__method', 'assay__response_measured', 'assay__qualitative_measurement',
        'assay__quantitative_measurement', 'assay__units',
        'assay__number_of_subjects_tested', 'assay__number_of_subjects_positive',
        'assay__response_frequency_',
        'mhc_restriction__name', 'mhc_restriction__class', 'mhc_restriction__evidence_code',
        'effector_cell__tcr_name', 'complex__pdb_id',
      ].join(',');
    }

    if (options.epitope_name) {
      params['epitope__name'] = `eq.${options.epitope_name}`;
    }

    if (options.mutation) {
      params['epitope__mutation'] = `eq.${options.mutation}`;
    }

    return this.request<TcellExportRecord[]>('tcell_export', params);
  }
}

export const cedarClient = new CEDARClient();
