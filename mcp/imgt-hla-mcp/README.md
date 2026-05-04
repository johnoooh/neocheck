# IMGT/HLA MCP Server

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue.svg)](https://www.typescriptlang.org/)
[![MCP](https://img.shields.io/badge/MCP-1.0-green.svg)](https://modelcontextprotocol.io/)

A [Model Context Protocol](https://modelcontextprotocol.io/) (MCP) server that gives Claude and other LLM clients direct access to the [IPD-IMGT/HLA Database](https://www.ebi.ac.uk/ipd/imgt/hla/) — the authoritative source for HLA allele sequences, nomenclature, and related immunogenetics data.

## Overview

The Human Leukocyte Antigen (HLA) system is central to immune function, transplantation, disease association, and pharmacogenomics. This MCP server provides **14 tools** that allow an LLM to query alleles, retrieve sequences, compare variants, detect typing ambiguities, and generate interactive visualizations — all without the user needing to navigate the database manually.

### Key capabilities

- **Search and retrieve** allele details, sequences, cell lines, and nomenclature history
- **Compare alleles** using IMGT's pre-computed alignments with proper handling of partial sequences
- **Detect ambiguous allele pairs** that are indistinguishable by standard typing methods
- **Generate interactive HTML visualizations** with protein domain mapping and peptide-binding site annotations
- **Look up P groups** (alleles with identical antigen-binding domain proteins)
- **Extract PubMed citations** for integration with literature MCP servers
- **Cache responses** to minimize redundant API calls

## Installation

```bash
git clone https://github.com/orgeraj/imgt-hla-mcp.git
cd imgt-hla-mcp
npm install
npm run build
```

Requires Node.js 18+.

## Configuration

### Claude Desktop (macOS)

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "imgt-hla": {
      "command": "node",
      "args": ["/absolute/path/to/imgt-hla-mcp/dist/index.js"]
    }
  }
}
```

### Claude Desktop (Windows)

Add to `%APPDATA%\Claude\claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "imgt-hla": {
      "command": "node",
      "args": ["C:\\path\\to\\imgt-hla-mcp\\dist\\index.js"]
    }
  }
}
```

### Running standalone

```bash
npm start
# or
node dist/index.js
```

The server communicates over stdio using the MCP protocol.

## Tools Reference

### Basic Query Tools

| Tool | Description |
|------|-------------|
| `search_alleles` | Search by name pattern, locus, or query (supports exact, startsWith, contains) |
| `get_allele` | Get full details for an allele — features, citations, cells, optionally sequences and history |
| `get_sequence` | Retrieve coding, genomic, or protein sequence in raw or FASTA format |
| `list_locus_alleles` | Paginated listing of all alleles at a locus |

### Cell Data Tools

| Tool | Description |
|------|-------------|
| `search_cells` | Search cell lines by name or ethnicity |
| `get_cell` | Get cell line details including HLA typing |

### Bulk Data Tools

| Tool | Description |
|------|-------------|
| `download_sequences` | Bulk FASTA download filtered by locus or query |
| `get_alignment` | Pre-computed multiple sequence alignments from IMGT/GitHub |

### Nomenclature Tools

| Tool | Description |
|------|-------------|
| `get_nomenclature_history` | Track allele name changes across database versions |
| `check_allele_expression` | Check expression status: Null (N), Low (L), Secreted (S), Cytoplasmic (C), Aberrant (A), Questionable (Q) |

### Analysis Tools

| Tool | Description |
|------|-------------|
| `compare_alleles` | Compare 2+ alleles — reports coding and protein differences, P group membership, percent identity. Uses pre-computed alignments to correctly handle partial sequences. |
| `visualize_comparison` | Generate an interactive HTML report with sequence alignment, difference distribution plot, protein domain mapping, and peptide-binding site annotations. macOS-inspired visual design. |
| `find_ambiguous_pairs` | Find allele pairs that produce identical heterozygous patterns — critical for resolving HLA typing ambiguities when phase is unknown. |

### Citation Tool

| Tool | Description |
|------|-------------|
| `get_allele_citations` | Extract PubMed IDs and metadata from an allele's citations. Designed for use alongside a PubMed MCP server. |

## Usage Examples

These are natural-language prompts you can use with Claude once the server is configured:

```
What alleles start with A*02:01?

Tell me about HLA-A*01:01:01:01 — include its sequence and citation history.

Compare A*02:327 and A*02:01 — how do they differ at the protein level?

Are A*02:01:01:01 and A*68:01:01:01 ambiguous with any other allele pair?

Generate a visualization comparing C*05:01 and C*03:03 and save it as an HTML file.

Is B*57:01:01:01 a null allele?

What papers have been published about A*02:01:01:01?

Show me the protein alignment for A*01:01:01:01 and A*02:01:01:01.
```

## Architecture

```
src/
├── index.ts                 # MCP server entry point, tool registration
├── api/
│   ├── imgt-client.ts       # REST client for IPD-IMGT/HLA API
│   └── github-client.ts     # Client for ANHIG/IMGTHLA GitHub repository
├── cache/
│   └── cache-manager.ts     # In-memory cache with configurable TTL
├── tools/                   # 14 tool implementations
├── analysis/
│   └── ambiguity-detector.ts
└── types/
    └── imgt.ts              # TypeScript interfaces and utilities
```

### Data sources

| Source | Used for |
|--------|----------|
| [IPD-IMGT/HLA REST API](https://www.ebi.ac.uk/cgi-bin/ipd/api/) | Allele details, sequences, cells, citations, nomenclature history |
| [ANHIG/IMGTHLA GitHub](https://github.com/ANHIG/IMGTHLA) | Pre-computed alignments, P/G group definitions, bulk data |

### Alignment handling

The `compare_alleles` and `visualize_comparison` tools use **pre-computed alignments** from IMGT/GitHub rather than aligning sequences from scratch. This is critical because many rare alleles have only partial sequences (e.g., exons 2–3 only). The pre-computed alignments use:

- `*` — unknown/missing sequence (skipped during comparison)
- `.` — alignment gap (skipped during comparison)
- `-` — matches the reference allele (expanded by the parser)

This ensures that comparisons report only **real** differences, not artifacts from misaligned partial sequences.

### Caching

All API and GitHub responses are cached in memory with configurable TTL:

| Data type | TTL |
|-----------|-----|
| Allele details | Medium (1 hour) |
| Alignments | Long (24 hours) |
| P/G group data | Long (24 hours) |

## PubMed Integration

The `get_allele_citations` tool extracts PubMed IDs from allele records. To fetch full abstracts, add a PubMed MCP server alongside this one:

```json
{
  "mcpServers": {
    "imgt-hla": {
      "command": "node",
      "args": ["/path/to/imgt-hla-mcp/dist/index.js"]
    },
    "pubmed": {
      "command": "npx",
      "args": ["-y", "@cyanheads/pubmed-mcp-server"],
      "env": {
        "NCBI_API_KEY": "your_ncbi_api_key"
      }
    }
  }
}
```

Claude will then be able to:
1. Call `get_allele_citations` to get PubMed IDs for an allele
2. Call `pubmed_fetch_contents` to retrieve abstracts
3. Synthesize the literature into a summary

## Development

```bash
npm run dev     # Watch mode — recompiles on changes
npm run build   # One-time build
npm start       # Run the server
```

## License

MIT

## Acknowledgments

This server accesses data from the [IPD-IMGT/HLA Database](https://www.ebi.ac.uk/ipd/imgt/hla/), maintained by the Anthony Nolan Research Institute and the European Bioinformatics Institute (EMBL-EBI).

> Robinson J, Barker DJ, Georgiou X, Cooper MA, Flicek P, Marsh SGE.
> IPD-IMGT/HLA Database.
> Nucleic Acids Research (2020) 48:D783–D788.

Please cite this reference when using HLA data obtained through this tool in publications.
