/**
 * search_cells tool
 *
 * Search for cell lines in the database.
 */
import { z } from 'zod';
export declare const searchCellsSchema: z.ZodObject<{
    query: z.ZodOptional<z.ZodString>;
    ethnicity: z.ZodOptional<z.ZodString>;
    limit: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
}, "strip", z.ZodTypeAny, {
    limit: number;
    query?: string | undefined;
    ethnicity?: string | undefined;
}, {
    limit?: number | undefined;
    query?: string | undefined;
    ethnicity?: string | undefined;
}>;
export type SearchCellsInput = z.infer<typeof searchCellsSchema>;
export interface SearchCellsResult {
    cells: Array<{
        id: string;
        name: string;
    }>;
    total: number;
    has_more: boolean;
}
export declare function searchCells(input: SearchCellsInput): Promise<SearchCellsResult>;
export declare const searchCellsTool: {
    name: string;
    description: string;
    inputSchema: z.ZodObject<{
        query: z.ZodOptional<z.ZodString>;
        ethnicity: z.ZodOptional<z.ZodString>;
        limit: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
    }, "strip", z.ZodTypeAny, {
        limit: number;
        query?: string | undefined;
        ethnicity?: string | undefined;
    }, {
        limit?: number | undefined;
        query?: string | undefined;
        ethnicity?: string | undefined;
    }>;
    handler: typeof searchCells;
};
//# sourceMappingURL=search-cells.d.ts.map