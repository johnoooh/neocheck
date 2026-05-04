/**
 * CEDAR MCP Server - Live Integration Tests
 *
 * These tests call the real CEDAR API through the tool handler functions.
 * Run with: npm run test:integration
 */

import { describe, it, expect } from 'vitest';

import { searchEpitopes } from '../src/tools/search-epitopes.js';
import { getEpitope } from '../src/tools/get-epitope.js';
import { searchAntigens } from '../src/tools/search-antigens.js';
import { searchTcellAssays } from '../src/tools/search-tcell.js';
import { searchMhcLigands } from '../src/tools/search-mhc.js';
import { searchReferences } from '../src/tools/search-references.js';
import { screenMafNeoantigens } from '../src/tools/screen-maf.js';
import { searchTcr } from '../src/tools/search-tcr.js';
import { searchBcellAssays } from '../src/tools/search-bcell.js';

describe('CEDAR MCP Tools - Live Integration Tests', () => {
  // ─── 1. search_epitopes ──────────────────────────────────────────

  describe('search_epitopes', () => {
    it('should return epitopes when searching by mutation G12D', async () => {
      const result = await searchEpitopes({ mutation: 'G12D', limit: 10 });

      expect(result).toHaveProperty('epitopes');
      expect(result).toHaveProperty('count');
      expect(result.count).toBeGreaterThan(0);
      expect(result.epitopes.length).toBeGreaterThan(0);

      const first = result.epitopes[0];
      expect(first).toHaveProperty('structure_id');
      expect(first).toHaveProperty('linear_sequence');
      expect(first).toHaveProperty('is_neoantigen');
      expect(first).toHaveProperty('tcell_assay_count');
      expect(first).toHaveProperty('cedar_url');
      expect(typeof first.structure_id).toBe('number');
      expect(first.cedar_url).toMatch(/^https:\/\/cedar\.iedb\.org\/epitope\/\d+$/);
    });

    it('should return only neoantigens when neoantigen_only=true', async () => {
      const result = await searchEpitopes({
        mutation: 'G12D',
        neoantigen_only: true,
        limit: 10,
      });

      expect(result.count).toBeGreaterThan(0);
      for (const epitope of result.epitopes) {
        expect(epitope.is_neoantigen).toBe(true);
      }
    });
  });

  // ─── 2. get_epitope ──────────────────────────────────────────────

  describe('get_epitope', () => {
    it('should return detailed epitope for structure_id 1309311', async () => {
      const result = await getEpitope({ structure_id: 1309311 });

      expect(result.structure_id).toBe(1309311);
      expect(result).toHaveProperty('linear_sequence');
      expect(result).toHaveProperty('structure_iri');
      expect(result).toHaveProperty('is_neoantigen');
      expect(result).toHaveProperty('mhc_alleles');
      expect(result).toHaveProperty('tcell_assay_count');
      expect(result).toHaveProperty('mhc_assay_count');
      expect(result).toHaveProperty('bcell_assay_count');
      expect(result).toHaveProperty('cedar_url');
      expect(result.cedar_url).toBe('https://cedar.iedb.org/epitope/1309311');
      expect(result.mutation).toMatch(/G12D/i);
    });
  });

  // ─── 3. search_antigens ──────────────────────────────────────────

  describe('search_antigens', () => {
    it('should return antigen results when searching human neoantigens', async () => {
      const result = await searchAntigens({
        organism: 'Homo sapiens',
        neoantigen_only: true,
        limit: 10,
      });

      expect(result).toHaveProperty('antigens');
      expect(result).toHaveProperty('count');
      expect(result.count).toBeGreaterThan(0);

      const first = result.antigens[0];
      expect(first).toHaveProperty('antigen_id');
      expect(first).toHaveProperty('names');
      expect(first).toHaveProperty('epitope_count');
      expect(first).toHaveProperty('is_neoantigen');
      expect(first.is_neoantigen).toBe(true);
      expect(typeof first.epitope_count).toBe('number');
    });
  });

  // ─── 4. search_tcell_assays ──────────────────────────────────────

  describe('search_tcell_assays', () => {
    it('should return T-cell assay results for mutation G12D', async () => {
      const result = await searchTcellAssays({ mutation: 'G12D', limit: 10 });

      expect(result).toHaveProperty('assays');
      expect(result).toHaveProperty('count');
      expect(result.count).toBeGreaterThan(0);

      const first = result.assays[0];
      expect(first).toHaveProperty('tcell_id');
      expect(first).toHaveProperty('structure_id');
      expect(first).toHaveProperty('linear_sequence');
      expect(first).toHaveProperty('qualitative_measure');
      expect(first).toHaveProperty('mhc_allele');
      expect(first).toHaveProperty('is_neoantigen');
      expect(typeof first.tcell_id).toBe('number');
    });
  });

  // ─── 5. search_mhc_ligands ──────────────────────────────────────

  describe('search_mhc_ligands', () => {
    it('should return MHC ligand results for mutation G12D', async () => {
      const result = await searchMhcLigands({ mutation: 'G12D', limit: 10 });

      expect(result).toHaveProperty('ligands');
      expect(result).toHaveProperty('count');
      expect(result.count).toBeGreaterThan(0);

      const first = result.ligands[0];
      expect(first).toHaveProperty('elution_id');
      expect(first).toHaveProperty('structure_id');
      expect(first).toHaveProperty('mhc_allele');
      expect(first).toHaveProperty('qualitative_measure');
      expect(first).toHaveProperty('is_neoantigen');
      expect(typeof first.elution_id).toBe('number');
    });
  });

  // ─── 6. search_references ───────────────────────────────────────

  describe('search_references', () => {
    it('should return references matching title "neoantigen"', async () => {
      const result = await searchReferences({ title: 'neoantigen', limit: 10 });

      expect(result).toHaveProperty('references');
      expect(result).toHaveProperty('count');
      expect(result.count).toBeGreaterThan(0);

      const first = result.references[0];
      expect(first).toHaveProperty('reference_id');
      expect(first).toHaveProperty('title');
      expect(first).toHaveProperty('pubmed_id');
      expect(first).toHaveProperty('epitope_count');
      expect(first).toHaveProperty('is_neoantigen');
      expect(typeof first.reference_id).toBe('number');
    });
  });

  // ─── 7. screen_maf_neoantigens ──────────────────────────────────

  describe('screen_maf_neoantigens', () => {
    it('should find CEDAR hits for AKT1 E17K missense mutation', async () => {
      const result = await screenMafNeoantigens({
        mutations: [
          {
            hugo_symbol: 'AKT1',
            hgvsp_short: 'p.E17K',
            variant_classification: 'Missense_Mutation',
          },
        ],
      });

      expect(result.summary.total_mutations).toBe(1);
      expect(result.summary.missense_mutations).toBe(1);
      expect(result.summary.skipped_mutations).toBe(0);

      expect(result.mutations).toHaveLength(1);
      expect(result.mutations[0].hugo_symbol).toBe('AKT1');
      expect(result.mutations[0].mutation_short).toBe('E17K');
      expect(result.mutations[0].hit_count).toBeGreaterThan(0);

      const hit = result.mutations[0].cedar_hits[0];
      expect(hit).toHaveProperty('structure_id');
      expect(hit).toHaveProperty('linear_sequence');
      expect(hit).toHaveProperty('cedar_url');
    });

    it('should populate tcell_details when include_tcell_details=true', async () => {
      const result = await screenMafNeoantigens({
        mutations: [
          {
            hugo_symbol: 'KRAS',
            hgvsp_short: 'p.G12D',
            variant_classification: 'Missense_Mutation',
          },
        ],
        include_tcell_details: true,
      });

      expect(result.mutations).toHaveLength(1);
      const mutation = result.mutations[0];
      expect(mutation.hit_count).toBeGreaterThan(0);

      const hitsWithTcell = mutation.cedar_hits.filter(
        (h) => h.tcell_details && h.tcell_details.length > 0
      );
      expect(hitsWithTcell.length).toBeGreaterThan(0);

      const detail = hitsWithTcell[0].tcell_details![0];
      expect(detail).toHaveProperty('assay_method');
      expect(detail).toHaveProperty('qualitative_measure');
      expect(detail).toHaveProperty('mhc_restriction');
      expect(detail).toHaveProperty('pubmed_id');
    });

    it('should skip non-missense mutations', async () => {
      const result = await screenMafNeoantigens({
        mutations: [
          {
            hugo_symbol: 'TP53',
            hgvsp_short: 'p.R248fs',
            variant_classification: 'Frame_Shift_Del',
          },
        ],
      });

      expect(result.summary.missense_mutations).toBe(0);
      expect(result.summary.skipped_mutations).toBe(1);
      expect(result.mutations).toHaveLength(0);
      expect(result.skipped).toHaveLength(1);
      expect(result.skipped[0].hugo_symbol).toBe('TP53');
      expect(result.skipped[0].skip_reason).toContain('Non-missense');
    });
  });

  // ─── 8. search_tcr ──────────────────────────────────────────────

  describe('search_tcr', () => {
    it('should return TCR results with CDR3 sequences for mutation G12D', async () => {
      const result = await searchTcr({ mutation: 'G12D', limit: 10 });

      expect(result).toHaveProperty('receptors');
      expect(result).toHaveProperty('count');
      expect(result.count).toBeGreaterThan(0);

      const first = result.receptors[0];
      expect(first).toHaveProperty('receptor_group_id');
      expect(first).toHaveProperty('receptor_type');
      expect(first).toHaveProperty('chain2_cdr3');
      expect(first).toHaveProperty('epitope_sequences');
      expect(first).toHaveProperty('mhc_alleles');
      expect(first).toHaveProperty('is_neoantigen');
      expect(typeof first.receptor_group_id).toBe('number');
    });
  });

  // ─── 9. search_bcell_assays ─────────────────────────────────────

  describe('search_bcell_assays', () => {
    it('should return B-cell results or empty array for mutation G12D', async () => {
      const result = await searchBcellAssays({ mutation: 'G12D', limit: 10 });

      expect(result).toHaveProperty('assays');
      expect(result).toHaveProperty('count');
      expect(typeof result.count).toBe('number');
      expect(Array.isArray(result.assays)).toBe(true);

      if (result.count > 0) {
        const first = result.assays[0];
        expect(first).toHaveProperty('bcell_id');
        expect(first).toHaveProperty('structure_id');
        expect(first).toHaveProperty('antibody_isotype');
        expect(first).toHaveProperty('qualitative_measure');
        expect(first).toHaveProperty('is_neoantigen');
        expect(first).toHaveProperty('cedar_url');
        expect(typeof first.bcell_id).toBe('number');
      }
    });
  });
});
