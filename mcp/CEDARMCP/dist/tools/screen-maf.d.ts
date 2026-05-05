/**
 * screen_maf_neoantigens tool
 *
 * Screen a MAF file against CEDAR to identify which somatic mutations
 * have known cancer epitopes with experimental evidence.
 */
import { z } from 'zod';
export interface TcellDetailRecord {
    assay_method: string | null;
    response_measured: string | null;
    qualitative_measure: string | null;
    quantitative_measure: number | null;
    units: string | null;
    response_frequency: number | null;
    subjects_tested: number | null;
    subjects_positive: number | null;
    mhc_restriction: string | null;
    mhc_class: string | null;
    mhc_evidence: string | null;
    host: string | null;
    disease: string | null;
    disease_stage: string | null;
    tcr_name: string | null;
    pdb_id: string | null;
    pubmed_id: string | null;
}
export interface EpitopeSummary {
    structure_id: number;
    linear_sequence: string | null;
    mutation: string | null;
    structure_type: string | null;
    source_molecules: string[] | null;
    source_organisms: string[] | null;
    mhc_alleles: string[] | null;
    mhc_classes: string[] | null;
    diseases: string[] | null;
    is_neoantigen: boolean;
    tcell_assay_count: number;
    mhc_assay_count: number;
    bcell_assay_count: number;
    reference_count: number;
    pdb_ids: string[] | null;
    cedar_url: string;
    tcell_details?: TcellDetailRecord[];
}
interface MutationScreenResult {
    hugo_symbol: string;
    hgvsp_short: string;
    mutation_short: string;
    variant_classification: string;
    t_var_freq: number | null;
    protein_position: string | null;
    cedar_hits: EpitopeSummary[];
    hit_count: number;
}
interface SkippedMutation {
    hugo_symbol: string;
    hgvsp_short: string;
    variant_classification: string;
    skip_reason: string;
}
interface MafScreeningResult {
    summary: {
        total_mutations: number;
        missense_mutations: number;
        skipped_mutations: number;
        mutations_with_cedar_hits: number;
        mutations_without_cedar_hits: number;
    };
    mutations: MutationScreenResult[];
    skipped: SkippedMutation[];
}
export declare const screenMafSchema: z.ZodObject<{
    maf_file_path: z.ZodOptional<z.ZodString>;
    mutations: z.ZodOptional<z.ZodArray<z.ZodObject<{
        hugo_symbol: z.ZodString;
        hgvsp_short: z.ZodString;
        variant_classification: z.ZodString;
        t_var_freq: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
        protein_position: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    }, "strip", z.ZodTypeAny, {
        hugo_symbol: string;
        hgvsp_short: string;
        variant_classification: string;
        t_var_freq?: number | null | undefined;
        protein_position?: string | null | undefined;
    }, {
        hugo_symbol: string;
        hgvsp_short: string;
        variant_classification: string;
        t_var_freq?: number | null | undefined;
        protein_position?: string | null | undefined;
    }>, "many">>;
    max_epitopes_per_mutation: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
    include_tcell_details: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
}, "strip", z.ZodTypeAny, {
    max_epitopes_per_mutation: number;
    include_tcell_details: boolean;
    mutations?: {
        hugo_symbol: string;
        hgvsp_short: string;
        variant_classification: string;
        t_var_freq?: number | null | undefined;
        protein_position?: string | null | undefined;
    }[] | undefined;
    maf_file_path?: string | undefined;
}, {
    mutations?: {
        hugo_symbol: string;
        hgvsp_short: string;
        variant_classification: string;
        t_var_freq?: number | null | undefined;
        protein_position?: string | null | undefined;
    }[] | undefined;
    maf_file_path?: string | undefined;
    max_epitopes_per_mutation?: number | undefined;
    include_tcell_details?: boolean | undefined;
}>;
export type ScreenMafInput = z.infer<typeof screenMafSchema>;
export declare function screenMafNeoantigens(input: ScreenMafInput): Promise<MafScreeningResult>;
export declare const screenMafTool: {
    name: string;
    description: string;
    inputSchema: z.ZodObject<{
        maf_file_path: z.ZodOptional<z.ZodString>;
        mutations: z.ZodOptional<z.ZodArray<z.ZodObject<{
            hugo_symbol: z.ZodString;
            hgvsp_short: z.ZodString;
            variant_classification: z.ZodString;
            t_var_freq: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            protein_position: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        }, "strip", z.ZodTypeAny, {
            hugo_symbol: string;
            hgvsp_short: string;
            variant_classification: string;
            t_var_freq?: number | null | undefined;
            protein_position?: string | null | undefined;
        }, {
            hugo_symbol: string;
            hgvsp_short: string;
            variant_classification: string;
            t_var_freq?: number | null | undefined;
            protein_position?: string | null | undefined;
        }>, "many">>;
        max_epitopes_per_mutation: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
        include_tcell_details: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
    }, "strip", z.ZodTypeAny, {
        max_epitopes_per_mutation: number;
        include_tcell_details: boolean;
        mutations?: {
            hugo_symbol: string;
            hgvsp_short: string;
            variant_classification: string;
            t_var_freq?: number | null | undefined;
            protein_position?: string | null | undefined;
        }[] | undefined;
        maf_file_path?: string | undefined;
    }, {
        mutations?: {
            hugo_symbol: string;
            hgvsp_short: string;
            variant_classification: string;
            t_var_freq?: number | null | undefined;
            protein_position?: string | null | undefined;
        }[] | undefined;
        maf_file_path?: string | undefined;
        max_epitopes_per_mutation?: number | undefined;
        include_tcell_details?: boolean | undefined;
    }>;
    handler: typeof screenMafNeoantigens;
};
export {};
//# sourceMappingURL=screen-maf.d.ts.map