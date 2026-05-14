import { describe, it, expect, beforeEach } from 'vitest';
import { wrapLabels, _resetCacheForTests } from '../labelMeasure';
import type { StructureEntity } from '../types';

function ent(id: string, name: string, legal_form: string | null = 'B.V.', iso: string = 'NL'): StructureEntity {
  return {
    id, chart_id: 'c1', name, legal_form, jurisdiction_iso: iso,
    entity_type: 'corporation', is_taxpayer: false,
    position_x: 0, position_y: 0, source: 'ai_extracted',
    created_at: '', updated_at: '',
  };
}

describe('wrapLabels', () => {
  beforeEach(() => _resetCacheForTests());

  it('returns array per entity', () => {
    const m = wrapLabels([ent('a', 'Foo'), ent('b', 'Bar Holding')]);
    expect(m.size).toBe(2);
    expect(Array.isArray(m.get('a'))).toBe(true);
  });

  it('single short name → 1 line', () => {
    const m = wrapLabels([ent('a', 'Foo')]);
    expect(m.get('a')).toEqual(['Foo']);
  });

  it('two-word short name → 1 line if fits', () => {
    const m = wrapLabels([ent('a', 'Foo Bar')]);
    expect(m.get('a')).toEqual(['Foo Bar']);
  });

  it('long multi-word name → wraps to 2-3 lines on word boundaries', () => {
    const m = wrapLabels([
      ent('a', 'De Drie Wijzen uit Oost Holding B.V.'),
    ]);
    const lines = m.get('a')!;
    expect(lines.length).toBeGreaterThanOrEqual(2);
    expect(lines.length).toBeLessThanOrEqual(3);
    // No line exceeds ~22 chars (rough — depends on canvas measurements / fallback)
    for (const line of lines) {
      expect(line.length).toBeLessThanOrEqual(30);
    }
    // No line is empty
    for (const line of lines) {
      expect(line.trim().length).toBeGreaterThan(0);
    }
    // Original words preserved when concatenated
    expect(lines.join(' ')).toBe('De Drie Wijzen uit Oost Holding B.V.');
  });

  it('name exceeding 3 lines → 3 lines with ellipsis', () => {
    // 30 two-char tokens produce 5 wrap lines in the 7px/char fallback,
    // ensuring overflow into ellipsis truncation regardless of environment.
    const longName = 'AA AB AC AD AE AF AG AH AI AJ AK AL AM AN AO AP AQ AR AS AT AU AV AW AX AY AZ AA AB AC AD';
    const m = wrapLabels([ent('a', longName)]);
    const lines = m.get('a')!;
    expect(lines.length).toBe(3);
    expect(lines[2].endsWith('…')).toBe(true);
  });

  it('single token wider than NODE_TEXT_WIDTH → hard-broken', () => {
    const longToken = 'A'.repeat(50);
    const m = wrapLabels([ent('a', longToken)]);
    const lines = m.get('a')!;
    expect(lines.length).toBeGreaterThanOrEqual(1);
    // Each line is at most ~30 chars in the fallback (a's are ~7px each, 128/7 ≈ 18)
    for (const line of lines) {
      expect(line.length).toBeLessThanOrEqual(30);
    }
  });

  it('cache hit returns same array reference', () => {
    const entA = ent('a', 'Foo B.V.');
    const m1 = wrapLabels([entA]);
    const m2 = wrapLabels([entA]);
    expect(m2.get('a')).toBe(m1.get('a'));
  });

  it('cache invalidates when name changes', () => {
    const m1 = wrapLabels([ent('a', 'Short')]);
    const m2 = wrapLabels([ent('a', 'A much longer entity name here')]);
    expect(m2.get('a')).not.toEqual(m1.get('a'));
  });

  it('empty / whitespace-only name returns the raw input', () => {
    const m1 = wrapLabels([ent('a', '')]);
    expect(m1.get('a')).toEqual(['']);
    const m2 = wrapLabels([ent('b', '   ')]);
    expect(m2.get('b')).toEqual(['   ']);
  });
});
