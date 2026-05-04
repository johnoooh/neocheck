/**
 * TypeScript interfaces for CEDAR API responses.
 */

// --- Epitope Search ---

export interface CuratedSourceAntigen {
  accession: string | null;
  name: string | null;
  iri: string | null;
  starting_position: number | null;
  ending_position: number | null;
  source_organism_name: string | null;
  source_organism_iri: string | null;
}

export interface EpitopeSearchRecord {
  structure_id: number;
  structure_iri: string;
  structure_descriptions: string[] | null;
  structure_type: string | null;
  linear_sequence: string | null;
  linear_sequence_length: number | null;
  e_modification: string | null;
  mutation: string | null;
  neoantigen_bool: number;
  viral_antigen_bool: number;
  germline_antigen_bool: number;
  other_antigen_bool: number;
  naturally_occuring_disease_bool: number;
  animal_model_of_cancer_bool: number;
  direct_ex_vivo_bool: number;
  all_vaccination_bool: number;
  curated_source_antigens: CuratedSourceAntigen[] | null;
  cedar_assay_ids: number[] | null;
  cedar_assay_iris: string[] | null;
  reference_ids: number[] | null;
  reference_iris: string[] | null;
  pubmed_ids: string[] | null;
  pdb_ids: string[] | null;
  tcell_ids: number[] | null;
  bcell_ids: number[] | null;
  elution_ids: number[] | null;
  receptor_ids: number[] | null;
  tcr_receptor_group_ids: number[] | null;
  bcr_receptor_group_ids: number[] | null;
  qualitative_measures: string[] | null;
  mhc_allele_names: string[] | null;
  mhc_allele_evidences: string[] | null;
  mhc_classes: string[] | null;
  assay_names: string[] | null;
  host_organism_names: string[] | null;
  source_organism_names: string[] | null;
  r_object_source_molecule_names: string[] | null;
  disease_names: string[] | null;
  disease_stages: string[] | null;
  journal_names: string[] | null;
  reference_titles: string[] | null;
  reference_authors: string[] | null;
  receptor_types: string[] | null;
  receptor_names: string[] | null;
  epitope_structures_defined: string[] | null;
  e_related_object_types: string[] | null;
  receptor_chain1_cdr3_seqs: string[] | null;
  receptor_chain2_cdr3_seqs: string[] | null;
}

// --- Antigen Search ---

export interface AntigenSearchRecord {
  parent_source_antigen_id: string;
  parent_source_antigen_iri: string;
  parent_source_antigen_names: string[] | null;
  parent_source_antigen_source_org_iri: string | null;
  parent_source_antigen_source_org_name: string | null;
  structure_ids: number[] | null;
  structure_types: string[] | null;
  structure_descriptions: string[] | null;
  cedar_assay_ids: number[] | null;
  reference_ids: number[] | null;
  pubmed_ids: string[] | null;
  host_organism_names: string[] | null;
  source_organism_names: string[] | null;
  disease_names: string[] | null;
  assay_names: string[] | null;
  qualitative_measures: string[] | null;
  mhc_allele_names: string[] | null;
  mhc_classes: string[] | null;
  neoantigen_bool: number;
  viral_antigen_bool: number;
  germline_antigen_bool: number;
  other_antigen_bool: number;
  naturally_occuring_disease_bool: number;
  journal_names: string[] | null;
  reference_titles: string[] | null;
  reference_authors: string[] | null;
  epitope_structures_defined: string[] | null;
}

// --- T Cell Search ---

export interface TcellSearchRecord {
  tcell_id: number;
  structure_id: number;
  reference_id: number;
  linear_sequence: string | null;
  structure_type: string | null;
  linear_sequence_length: number | null;
  epitope_structure_defined: string | null;
  mutation: string | null;
  assay_description: string | null;
  assay_names: string | null;
  qualitative_measure: string | null;
  quantitative_measure: number | null;
  mhc_class: string | null;
  mhc_allele_name: string | null;
  mhc_allele_resolution: string | null;
  mhc_allele_evidence: string | null;
  host_organism_name: string | null;
  r_object_source_organism_name: string | null;
  r_object_source_molecule_name: string | null;
  disease_names: string[] | null;
  disease_stages: string[] | null;
  immunization_description: string | null;
  antigen_description: string | null;
  pubmed_id: string | null;
  journal_name: string | null;
  reference_dates: string[] | null;
  reference_authors: string[] | null;
  neoantigen_bool: number;
  viral_antigen_bool: number;
  receptor_ids: number[] | null;
  receptor_types: string | null;
  receptor_chain1_cdr3_seqs: string[] | null;
  receptor_chain2_cdr3_seqs: string[] | null;
}

// --- MHC Ligand/Elution Search ---

export interface MhcSearchRecord {
  elution_id: number;
  structure_id: number;
  reference_id: number;
  linear_sequence: string | null;
  structure_type: string | null;
  linear_sequence_length: number | null;
  epitope_structure_defined: string | null;
  mutation: string | null;
  assay_description: string | null;
  assay_names: string | null;
  qualitative_measure: string | null;
  quantitative_measure: number | null;
  mhc_class: string | null;
  mhc_allele_name: string | null;
  mhc_allele_resolution: string | null;
  mhc_allele_evidence: string | null;
  host_organism_name: string | null;
  r_object_source_organism_name: string | null;
  r_object_source_molecule_name: string | null;
  pubmed_id: string | null;
  journal_name: string | null;
  reference_dates: string[] | null;
  reference_authors: string[] | null;
  neoantigen_bool: number;
}

// --- Reference Search ---

export interface ReferenceSearchRecord {
  reference_id: number;
  reference_iri: string;
  pubmed_id: string | null;
  reference_type: string | null;
  reference_title: string | null;
  reference_authors: string[] | null;
  reference_dates: string[] | null;
  journal_name: string | null;
  structure_ids: number[] | null;
  cedar_assay_ids: number[] | null;
  neoantigen_bool: number;
  viral_antigen_bool: number;
  germline_antigen_bool: number;
  other_antigen_bool: number;
}

// --- TCR Search ---

export interface TcrSearchRecord {
  receptor_group_id: number;
  tcr_receptor_group_id: number | null;
  bcr_receptor_group_id: number | null;
  receptor_group_iri: string;
  receptor_type: string | null;
  receptor_species_names: string | null;
  receptor_names: string[] | null;
  chain1_cdr3_seq: string | null;
  chain2_cdr3_seq: string | null;
  receptor_chain1_types: string[] | null;
  receptor_chain2_types: string[] | null;
  receptor_chain1_cdr1_seqs: string[] | null;
  receptor_chain2_cdr1_seqs: string[] | null;
  receptor_chain1_cdr2_seqs: string[] | null;
  receptor_chain2_cdr2_seqs: string[] | null;
  receptor_chain1_cdr3_seqs: string[] | null;
  receptor_chain2_cdr3_seqs: string[] | null;
  receptor_chain1_full_seqs: string[] | null;
  receptor_chain2_full_seqs: string[] | null;
  receptor_ids: number[] | null;
  structure_ids: number[] | null;
  structure_iris: string[] | null;
  structure_types: string[] | null;
  structure_descriptions: string[] | null;
  linear_sequences: string[] | null;
  linear_sequence_lengths: number[] | null;
  mhc_allele_names: string[] | null;
  mhc_classes: string[] | null;
  mhc_allele_resolutions: string[] | null;
  host_organism_names: string[] | null;
  source_organism_names: string[] | null;
  disease_names: string[] | null;
  disease_stages: string[] | null;
  assay_names: string[] | null;
  qualitative_measures: string[] | null;
  reference_ids: number[] | null;
  pubmed_ids: string[] | null;
  journal_names: string[] | null;
  reference_titles: string[] | null;
  reference_authors: string[] | null;
  reference_dates: string[] | null;
  pdb_ids: string[] | null;
  cedar_assay_ids: number[] | null;
  tcell_ids: number[] | null;
  bcell_ids: number[] | null;
  elution_ids: number[] | null;
  neoantigen_bool: number;
  viral_antigen_bool: number;
  germline_antigen_bool: number;
  other_antigen_bool: number;
  mutations: string[] | null;
  e_modifications: string[] | null;
  direct_ex_vivo_bool: number;
  naturally_occuring_disease_bool: number;
  epitope_structures_defined: string[] | null;
}

// --- B Cell Search ---

export interface BcellSearchRecord {
  bcell_id: number;
  bcell_iri: string;
  structure_id: number;
  structure_iri: string;
  linear_sequence: string | null;
  structure_type: string | null;
  structure_description: string | null;
  linear_sequence_length: number | null;
  epitope_structure_defined: string | null;
  mutation: string | null;
  assay_description: string | null;
  assay_names: string | null;
  assay_iris: string | null;
  qualitative_measure: string | null;
  quantitative_measure: number | null;
  antibody_isotype: string | null;
  host_organism_name: string | null;
  host_organism_iri: string | null;
  r_object_source_organism_name: string | null;
  r_object_source_molecule_name: string | null;
  immunization_description: string | null;
  antigen_description: string | null;
  antigen_er: string | null;
  reference_id: number;
  reference_iri: string;
  reference_type: string | null;
  pubmed_id: string | null;
  reference_authors: string[] | null;
  reference_titles: string | null;
  reference_dates: string | null;
  journal_name: string | null;
  disease_names: string[] | null;
  neoantigen_bool: number;
  viral_antigen_bool: number;
  other_antigen_bool: number;
  curated_source_antigen: CuratedSourceAntigen | null;
}

// --- T Cell Export (enrichment data) ---

export interface TcellExportRecord {
  assay_id: number;
  structure_id: number;
  epitope__name: string | null;
  epitope__mutation: string | null;
  epitope__source_molecule: string | null;
  epitope__source_organism: string | null;
  reference__pmid: string | null;
  reference__title: string | null;
  reference__journal: string | null;
  reference__date: string | null;
  host__name: string | null;
  host__sex: string | null;
  host__age: string | null;
  first_in_vivo_process__disease: string | null;
  first_in_vivo_process__disease_stage: string | null;
  assay__method: string | null;
  assay__response_measured: string | null;
  assay__qualitative_measurement: string | null;
  assay__quantitative_measurement: number | null;
  assay__units: string | null;
  assay__number_of_subjects_tested: number | null;
  assay__number_of_subjects_positive: number | null;
  assay__response_frequency_: number | null;
  mhc_restriction__name: string | null;
  mhc_restriction__class: string | null;
  mhc_restriction__evidence_code: string | null;
  effector_cell__tcr_name: string | null;
  complex__pdb_id: string | null;
}

// --- API Metrics ---

export interface ApiMetrics {
  creation_date: string;
  tables: Array<{
    table_name: string;
    record_count: number;
  }>;
}
