#!/usr/bin/env node
/**
 * CEDAR MCP Server
 *
 * Model Context Protocol server for accessing the Cancer Epitope Database
 * and Analysis Resource (CEDAR). Provides tools for querying cancer epitopes,
 * neoantigens, T-cell assays, MHC ligand data, and related publications.
 */
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema, } from '@modelcontextprotocol/sdk/types.js';
// Import tools
import { searchEpitopesTool, searchEpitopes } from './tools/search-epitopes.js';
import { getEpitopeTool, getEpitope } from './tools/get-epitope.js';
import { searchAntigensTool, searchAntigens } from './tools/search-antigens.js';
import { searchTcellTool, searchTcellAssays } from './tools/search-tcell.js';
import { searchMhcTool, searchMhcLigands } from './tools/search-mhc.js';
import { searchReferencesTool, searchReferences } from './tools/search-references.js';
import { screenMafTool, screenMafNeoantigens } from './tools/screen-maf.js';
import { searchTcrTool, searchTcr } from './tools/search-tcr.js';
import { searchBcellTool, searchBcellAssays } from './tools/search-bcell.js';
// Tool registry
const tools = [
    searchEpitopesTool,
    getEpitopeTool,
    searchAntigensTool,
    searchTcellTool,
    searchMhcTool,
    searchReferencesTool,
    screenMafTool,
    searchTcrTool,
    searchBcellTool,
];
// Tool handlers map
const toolHandlers = {
    search_epitopes: async (args) => searchEpitopes(searchEpitopesTool.inputSchema.parse(args)),
    get_epitope: async (args) => getEpitope(getEpitopeTool.inputSchema.parse(args)),
    search_antigens: async (args) => searchAntigens(searchAntigensTool.inputSchema.parse(args)),
    search_tcell_assays: async (args) => searchTcellAssays(searchTcellTool.inputSchema.parse(args)),
    search_mhc_ligands: async (args) => searchMhcLigands(searchMhcTool.inputSchema.parse(args)),
    search_references: async (args) => searchReferences(searchReferencesTool.inputSchema.parse(args)),
    screen_maf_neoantigens: async (args) => screenMafNeoantigens(screenMafTool.inputSchema.parse(args)),
    search_tcr: async (args) => searchTcr(searchTcrTool.inputSchema.parse(args)),
    search_bcell_assays: async (args) => searchBcellAssays(searchBcellTool.inputSchema.parse(args)),
};
// Convert Zod schema to JSON Schema for MCP
function zodToJsonSchema(zodSchema) {
    const schema = zodSchema;
    if (schema._def?.typeName === 'ZodObject') {
        const zodObject = zodSchema;
        const properties = {};
        const required = [];
        for (const [key, value] of Object.entries(zodObject.shape)) {
            const fieldSchema = value;
            let type = 'string';
            let enumValues;
            let items;
            let minimum;
            let maximum;
            const def = fieldSchema._def;
            // Handle optional/default wrapper
            let innerDef = def;
            if (def.typeName === 'ZodOptional' || def.typeName === 'ZodDefault') {
                innerDef = def.innerType?._def ?? def;
            }
            if (innerDef.typeName === 'ZodString') {
                type = 'string';
            }
            else if (innerDef.typeName === 'ZodNumber') {
                type = 'number';
                const checks = innerDef.checks ?? [];
                for (const check of checks) {
                    if (check.kind === 'min')
                        minimum = check.value;
                    if (check.kind === 'max')
                        maximum = check.value;
                }
            }
            else if (innerDef.typeName === 'ZodBoolean') {
                type = 'boolean';
            }
            else if (innerDef.typeName === 'ZodEnum') {
                type = 'string';
                enumValues = innerDef.values;
            }
            else if (innerDef.typeName === 'ZodArray') {
                type = 'array';
                const itemType = innerDef.type;
                if (itemType?._def?.typeName === 'ZodString') {
                    items = { type: 'string' };
                }
            }
            const prop = { type };
            if (def.description)
                prop.description = def.description;
            if (enumValues)
                prop.enum = enumValues;
            if (items)
                prop.items = items;
            if (minimum !== undefined)
                prop.minimum = minimum;
            if (maximum !== undefined)
                prop.maximum = maximum;
            properties[key] = prop;
            if (def.typeName !== 'ZodOptional' && def.typeName !== 'ZodDefault') {
                required.push(key);
            }
        }
        return {
            type: 'object',
            properties,
            required: required.length > 0 ? required : undefined,
        };
    }
    return { type: 'object', properties: {} };
}
// Create server
const server = new Server({
    name: 'cedar',
    version: '1.0.0',
}, {
    capabilities: {
        tools: {},
    },
});
// Handle list tools request
server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
        tools: tools.map((tool) => ({
            name: tool.name,
            description: tool.description,
            inputSchema: zodToJsonSchema(tool.inputSchema),
        })),
    };
});
// Handle call tool request
server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const handler = toolHandlers[name];
    if (!handler) {
        throw new Error(`Unknown tool: ${name}`);
    }
    try {
        const result = await handler(args ?? {});
        return {
            content: [
                {
                    type: 'text',
                    text: JSON.stringify(result, null, 2),
                },
            ],
        };
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
            content: [
                {
                    type: 'text',
                    text: JSON.stringify({ error: message }, null, 2),
                },
            ],
            isError: true,
        };
    }
});
// Main entry point
async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error('CEDAR MCP Server running on stdio');
}
main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
});
//# sourceMappingURL=index.js.map