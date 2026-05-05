/**
 * get_nomenclature_history tool
 *
 * Track allele name changes across database versions.
 */
import { z } from 'zod';
export declare const getNomenclatureHistorySchema: z.ZodObject<{
    allele: z.ZodString;
}, "strip", z.ZodTypeAny, {
    allele: string;
}, {
    allele: string;
}>;
export type GetNomenclatureHistoryInput = z.infer<typeof getNomenclatureHistorySchema>;
export interface NomenclatureChange {
    version: string;
    name: string;
}
export interface GetNomenclatureHistoryResult {
    current_name: string;
    accession: string;
    history: NomenclatureChange[];
    total_versions: number;
    first_version: string;
    name_changes: Array<{
        from_version: string;
        to_version: string;
        old_name: string;
        new_name: string;
    }>;
}
export declare function getNomenclatureHistory(input: GetNomenclatureHistoryInput): Promise<GetNomenclatureHistoryResult>;
export declare const getNomenclatureHistoryTool: {
    name: string;
    description: string;
    inputSchema: z.ZodObject<{
        allele: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        allele: string;
    }, {
        allele: string;
    }>;
    handler: typeof getNomenclatureHistory;
};
//# sourceMappingURL=get-nomenclature-history.d.ts.map