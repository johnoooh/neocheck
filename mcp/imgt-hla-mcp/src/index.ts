#!/usr/bin/env node

/**
 * IMGT/HLA MCP Server
 *
 * Model Context Protocol server for accessing the IPD-IMGT/HLA database.
 * Provides tools for querying HLA alleles, sequences, alignments, and
 * detecting ambiguous allele pairs for typing interpretation.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

// Import tools
import { searchAllelesTool, searchAlleles } from './tools/search-alleles.js';
import { getAlleleTool, getAllele } from './tools/get-allele.js';
import { getSequenceTool, getSequence } from './tools/get-sequence.js';
import { listLocusAllelesTool, listLocusAlleles } from './tools/list-locus-alleles.js';
import { searchCellsTool, searchCells } from './tools/search-cells.js';
import { getCellTool, getCell } from './tools/get-cell.js';
import { downloadSequencesTool, downloadSequences } from './tools/download-sequences.js';
import { getAlignmentTool, getAlignment } from './tools/get-alignment.js';
import {
  getNomenclatureHistoryTool,
  getNomenclatureHistory,
} from './tools/get-nomenclature-history.js';
import { checkExpressionTool, checkExpression } from './tools/check-expression.js';
import { findAmbiguousPairsTool, findAmbiguousPairs } from './tools/find-ambiguous-pairs.js';
import { compareAllelesTool, compareAlleles } from './tools/compare-alleles.js';
import {
  visualizeComparisonTool,
  visualizeComparison,
} from './tools/visualize-comparison.js';
import {
  getAlleleCitationsTool,
  getAlleleCitations,
} from './tools/get-allele-citations.js';

// Tool registry
const tools = [
  searchAllelesTool,
  getAlleleTool,
  getSequenceTool,
  listLocusAllelesTool,
  searchCellsTool,
  getCellTool,
  downloadSequencesTool,
  getAlignmentTool,
  getNomenclatureHistoryTool,
  checkExpressionTool,
  findAmbiguousPairsTool,
  compareAllelesTool,
  visualizeComparisonTool,
  getAlleleCitationsTool,
];

// Tool handlers map
const toolHandlers: Record<string, (args: unknown) => Promise<unknown>> = {
  search_alleles: async (args) => searchAlleles(searchAllelesTool.inputSchema.parse(args)),
  get_allele: async (args) => getAllele(getAlleleTool.inputSchema.parse(args)),
  get_sequence: async (args) => getSequence(getSequenceTool.inputSchema.parse(args)),
  list_locus_alleles: async (args) =>
    listLocusAlleles(listLocusAllelesTool.inputSchema.parse(args)),
  search_cells: async (args) => searchCells(searchCellsTool.inputSchema.parse(args)),
  get_cell: async (args) => getCell(getCellTool.inputSchema.parse(args)),
  download_sequences: async (args) =>
    downloadSequences(downloadSequencesTool.inputSchema.parse(args)),
  get_alignment: async (args) => getAlignment(getAlignmentTool.inputSchema.parse(args)),
  get_nomenclature_history: async (args) =>
    getNomenclatureHistory(getNomenclatureHistoryTool.inputSchema.parse(args)),
  check_allele_expression: async (args) =>
    checkExpression(checkExpressionTool.inputSchema.parse(args)),
  find_ambiguous_pairs: async (args) =>
    findAmbiguousPairs(findAmbiguousPairsTool.inputSchema.parse(args)),
  compare_alleles: async (args) => compareAlleles(compareAllelesTool.inputSchema.parse(args)),
  visualize_comparison: async (args) =>
    visualizeComparison(visualizeComparisonTool.inputSchema.parse(args)),
  get_allele_citations: async (args) =>
    getAlleleCitations(getAlleleCitationsTool.inputSchema.parse(args)),
};

// Convert Zod schema to JSON Schema for MCP
function zodToJsonSchema(zodSchema: unknown): Record<string, unknown> {
  // Use Zod's built-in JSON schema conversion if available
  // For now, we'll manually construct the schema based on the tool definitions
  const schema = zodSchema as { _def?: { typeName?: string } };

  if (schema._def?.typeName === 'ZodObject') {
    const zodObject = zodSchema as {
      shape: Record<string, unknown>;
      _def: { description?: string };
    };
    const properties: Record<string, unknown> = {};
    const required: string[] = [];

    for (const [key, value] of Object.entries(zodObject.shape)) {
      const fieldSchema = value as {
        _def: {
          typeName: string;
          description?: string;
          defaultValue?: unknown;
          innerType?: { _def: { typeName: string; values?: string[] } };
          values?: string[];
          type?: { _def: { typeName: string } };
          checks?: Array<{ kind: string; value: number }>;
        };
        isOptional?: () => boolean;
      };

      let type = 'string';
      let enumValues: string[] | undefined;
      let items: Record<string, unknown> | undefined;
      let minimum: number | undefined;
      let maximum: number | undefined;

      const def = fieldSchema._def;

      // Handle optional wrapper
      let innerDef = def;
      if (def.typeName === 'ZodOptional' || def.typeName === 'ZodDefault') {
        innerDef = (def.innerType as { _def: typeof def })?._def ?? def;
      }

      // Determine type
      if (innerDef.typeName === 'ZodString') {
        type = 'string';
      } else if (innerDef.typeName === 'ZodNumber') {
        type = 'number';
        // Check for min/max
        const checks = innerDef.checks ?? [];
        for (const check of checks) {
          if (check.kind === 'min') minimum = check.value;
          if (check.kind === 'max') maximum = check.value;
        }
      } else if (innerDef.typeName === 'ZodBoolean') {
        type = 'boolean';
      } else if (innerDef.typeName === 'ZodEnum') {
        type = 'string';
        enumValues = innerDef.values as string[];
      } else if (innerDef.typeName === 'ZodArray') {
        type = 'array';
        const itemType = innerDef.type as { _def: { typeName: string } } | undefined;
        if (itemType?._def?.typeName === 'ZodString') {
          items = { type: 'string' };
        }
      }

      const prop: Record<string, unknown> = { type };
      if (def.description) {
        prop.description = def.description;
      }
      if (enumValues) {
        prop.enum = enumValues;
      }
      if (items) {
        prop.items = items;
      }
      if (minimum !== undefined) {
        prop.minimum = minimum;
      }
      if (maximum !== undefined) {
        prop.maximum = maximum;
      }

      properties[key] = prop;

      // Check if required (not optional and no default)
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

  // Fallback for unknown schemas
  return { type: 'object', properties: {} };
}

// Create server
const server = new Server(
  {
    name: 'imgt-hla',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

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
  } catch (error) {
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
  console.error('IMGT/HLA MCP Server running on stdio');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
