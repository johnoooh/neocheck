/**
 * get_cell tool
 *
 * Get detailed information about a specific cell line.
 */
import { z } from 'zod';
export declare const getCellSchema: z.ZodObject<{
    cell_id: z.ZodString;
}, "strip", z.ZodTypeAny, {
    cell_id: string;
}, {
    cell_id: string;
}>;
export type GetCellInput = z.infer<typeof getCellSchema>;
export interface GetCellResult {
    id: string;
    name: string;
    ethnicity?: string;
    origin?: string;
    source?: string;
    typing?: Array<{
        locus: string;
        alleles: string[];
    }>;
}
export declare function getCell(input: GetCellInput): Promise<GetCellResult>;
export declare const getCellTool: {
    name: string;
    description: string;
    inputSchema: z.ZodObject<{
        cell_id: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        cell_id: string;
    }, {
        cell_id: string;
    }>;
    handler: typeof getCell;
};
//# sourceMappingURL=get-cell.d.ts.map