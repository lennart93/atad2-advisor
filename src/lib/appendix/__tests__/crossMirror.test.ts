import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { APPENDIX_SKELETON } from '@/lib/appendix/skeleton';
import { mootNaRowIds as mootFrontend } from '@/lib/appendix/mootness';
import type { Status } from '@/lib/appendix/types';
// The Deno edge-function copies. Deno cannot import from src/, so this legal logic
// is duplicated by hand; these tests fail the moment the two copies drift apart.
import { SKELETON_ROWS } from '../../../../supabase/functions/generate-appendix/skeletonRows';
import { mootNaRowIds as mootDeno } from '../../../../supabase/functions/generate-appendix/mootness';
import { buildEntityRegister as registerFrontend } from '@/lib/appendix/facts/entityRegister';
import { buildEntityRegister as registerDeno } from '../../../../supabase/functions/generate-appendix/factsBuild';
import {
  defaultClassification as defaultsFrontend,
  defaultNlClassification as nlDefaultsFrontend,
} from '@/lib/appendix/classificationDefaults';
import {
  defaultClassification as defaultsDeno,
  defaultNlClassification as nlDefaultsDeno,
} from '../../../../supabase/functions/generate-appendix/classificationDefaults';
import type { StructureEntity, StructureEdge } from '@/lib/structure/types';

// Repo root from this file: __tests__ -> appendix -> lib -> src -> root
const fromRoot = (rel: string) => fileURLToPath(new URL(`../../../../${rel}`, import.meta.url));

describe('cross-mirror: appendix skeleton (frontend vs Deno)', () => {
  // The two skeletons carry the legal rows an advisor signs off on. The frontend
  // copy has extra render-only fields (sectionTitle, kind, effect, relatedView);
  // compare only the legally meaningful shared fields, in the same order.
  const norm = (r: {
    rowId: string;
    legalBasis: string;
    conditionTested: string;
    allowedStates: readonly string[];
    drivenByQuestionIds: readonly string[];
    renderIfQuestionEquals?: { questionId: string; equals: string };
  }) => ({
    rowId: r.rowId,
    legalBasis: r.legalBasis,
    conditionTested: r.conditionTested,
    allowedStates: [...r.allowedStates],
    drivenByQuestionIds: [...r.drivenByQuestionIds],
    renderIfQuestionEquals: r.renderIfQuestionEquals ?? null,
  });

  it('has the same rows, order, legal basis, tested condition and question links', () => {
    expect(APPENDIX_SKELETON.map(norm)).toEqual(SKELETON_ROWS.map(norm));
  });
});

describe('cross-mirror: N/A mootness backstop (frontend vs Deno)', () => {
  const ALL_ROW_IDS = APPENDIX_SKELETON.map((r) => r.rowId);
  const scenario = (triggered: string[]) =>
    ALL_ROW_IDS.map((rowId) => ({
      rowId,
      status: (triggered.includes(rowId) ? 'Triggered' : 'Not triggered') as Status,
    }));

  // A battery of dossiers: nothing, every single row on its own, and a few
  // representative combinations that exercise each downstream cascade.
  const scenarios: string[][] = [
    [],
    ...ALL_ROW_IDS.map((id) => [id]),
    ['1.1', '1.2', '2.1'],
    ['3.1'], ['3.4'], ['3.7'], ['3.7', '3.9'],
    ['5.1', '5.2'],
    ['6.2', '6.3'],
    ['8.1'], ['8.1', '8.2'],
    ['3.1', '5.1', '8.1'],
    ALL_ROW_IDS,
  ];

  it('forces the same set of rows to N/A on every scenario', () => {
    for (const s of scenarios) {
      const rows = scenario(s);
      const front = [...mootFrontend(rows)].sort();
      const deno = [...mootDeno(rows)].sort();
      expect(deno, `diverged on triggered=[${s.join(', ')}]`).toEqual(front);
    }
  });
});

describe('cross-mirror: entity register incl. multiple taxpayers (frontend vs Deno)', () => {
  const ent = (id: string, name: string, taxpayer = false, jur = 'NL') =>
    ({ id, name, is_taxpayer: taxpayer, jurisdiction_iso: jur, entity_type: 'corp' });
  const edge = (from: string, to: string, pct: number | null) =>
    ({ from_entity_id: from, to_entity_id: to, ownership_pct: pct, kind: 'ownership' });
  // register shape the two copies must agree on, row for row.
  const shape = (reg: Array<{ id: string; name: string; role: string; ownershipPct: number | null; related: boolean }>) =>
    reg.map((e) => ({ id: e.id, name: e.name, role: e.role, ownershipPct: e.ownershipPct, related: e.related }));

  const cases: Array<{ label: string; entities: ReturnType<typeof ent>[]; edges: ReturnType<typeof edge>[]; name?: string }> = [
    {
      label: 'single flagged taxpayer with parent + sub',
      entities: [ent('c2', 'Sub Inc', false, 'US'), ent('c1', 'TaxPayer BV', true), ent('c3', 'Parent Coop')],
      edges: [edge('c3', 'c1', 33), edge('c1', 'c2', 100)],
    },
    {
      label: 'two flagged taxpayers share a subsidiary',
      entities: [ent('c1', 'Alpha BV', true), ent('c2', 'Beta BV', true), ent('c3', 'Sub Inc', false, 'US')],
      edges: [edge('c1', 'c3', 100)],
    },
    {
      label: 'named entities anchor when nothing is flagged',
      entities: [ent('c1', 'Alpha BV'), ent('c2', 'Beta BV'), ent('c3', 'Outsider BV')],
      edges: [],
      name: 'Alpha B.V.\nBeta B.V.',
    },
  ];

  it('produces the same register on the frontend and the Deno mirror', () => {
    for (const c of cases) {
      const front = shape(registerFrontend(c.entities as unknown as StructureEntity[], c.edges as unknown as StructureEdge[], [], c.name));
      const deno = shape(registerDeno(c.entities as never, c.edges as never, [], c.name));
      expect(deno, `diverged on: ${c.label}`).toEqual(front);
    }
  });
});

describe('cross-mirror: classification defaults (frontend vs Deno)', () => {
  // A battery over jurisdictions and forms, including the exclusions and the
  // ambiguous short tokens, so a drifting rule table fails loudly.
  const cases: Array<[string | null, string, number?]> = [
    ['LU', 'Duhco S.A. corporation'], ['LU', 'Finco S.à r.l.'], ['LU', 'Fund SCSp'],
    ['LU', 'Holdco S.C.A.'], ['BE', 'Duvel Moortgat N.V. corporation'], ['BE', 'Brouwerij BVBA'],
    ['BE', 'Mystery Vorm'], ['DE', 'Brau GmbH'], ['DE', 'Brau AG'], ['DE', 'Beteiligungs KG'],
    ['US', 'WMC Energy Corp.', undefined], ['US', 'Delaware Holdings LLC', 1],
    ['US', 'Delaware Holdings LLC', 2], ['US', 'Brewery Ommegang corporation'],
    ['US', 'Salsa Brands corporation'], ['HK', 'WMC Group Asia Limited corporation'],
    ['IE', 'Joshua Energy One Designated Activity Company'], ['CH', 'Uhren AG'],
    ['CN', 'Duvel Moortgat Shanghai Ltd. corporation'], ['GB', 'Beer Group Plc'],
    ['IT', 'Birra S.p.A.'], ['FR', 'Brasserie SAS'], ['SE', 'Bryggeri AB'],
    ['NO', 'Bryggeri AS'], ['FI', 'Panimo Oy'], ['DK', 'Bryghus ApS'],
    ['NL', 'Duhco Nederland B.V. corporation'], [null, 'Duhco S.A.'],
  ];
  it('produces the same home-state default on both copies', () => {
    for (const [jur, form, members] of cases) {
      expect(defaultsDeno(jur, form, members), `diverged on ${jur}/${form}`)
        .toEqual(defaultsFrontend(jur, form, members));
    }
  });
  it('produces the same NL-view default on both copies', () => {
    for (const [jur, form] of cases) {
      expect(nlDefaultsDeno(jur, form), `diverged on ${jur}/${form}`)
        .toEqual(nlDefaultsFrontend(jur, form));
    }
  });
});

describe('cross-mirror: legal-suffix normalisation table (3 copies)', () => {
  // SUFFIX_REPLACEMENTS is triplicated (frontend + two Deno functions) and kept in
  // sync by hand. The Deno copies use double quotes; normalise quotes + whitespace
  // and assert the three literal blocks are otherwise identical.
  const files = [
    'src/lib/legalName.ts',
    'supabase/functions/generate-appendix/factsBuild.ts',
    'supabase/functions/extract-structure/index.ts',
  ];
  const extractBlock = (rel: string): string => {
    const src = readFileSync(fromRoot(rel), 'utf8');
    const m = src.match(/SUFFIX_REPLACEMENTS[\s\S]*?=\s*\[([\s\S]*?)\];/);
    if (!m) throw new Error(`SUFFIX_REPLACEMENTS not found in ${rel}`);
    return m[1].replace(/\s+/g, '').replace(/"/g, "'");
  };

  it('is byte-identical (quotes/whitespace aside) across all three copies', () => {
    const [canonical, ...rest] = files.map(extractBlock);
    for (let i = 0; i < rest.length; i++) {
      expect(rest[i], `${files[i + 1]} diverged from ${files[0]}`).toBe(canonical);
    }
  });
});
