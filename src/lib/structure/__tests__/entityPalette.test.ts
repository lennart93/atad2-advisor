import { describe, it, expect } from 'vitest';
import {
  ENTITY_PALETTE_ROWS,
  ENTITY_PALETTE_FLAT,
  ENTITY_PALETTE_COLUMN_NAMES,
  normalizeColor,
  isPaletteColor,
  isDarkColor,
  luminance,
} from '@/lib/structure/entityPalette';

describe('entityPalette grid', () => {
  it('is exactly 6 rows of 10 columns', () => {
    expect(ENTITY_PALETTE_ROWS).toHaveLength(6);
    for (const row of ENTITY_PALETTE_ROWS) expect(row).toHaveLength(10);
    expect(ENTITY_PALETTE_FLAT).toHaveLength(60);
    expect(ENTITY_PALETTE_COLUMN_NAMES).toHaveLength(10);
  });

  it('every swatch is a canonical #RRGGBB upper-case hex', () => {
    for (const hex of ENTITY_PALETTE_FLAT) {
      expect(hex).toMatch(/^#[0-9A-F]{6}$/);
    }
  });

  it('matches the sampled palette anchors exactly', () => {
    // Base row (theme colours), sampled pixel-exact from the supplied screenshot.
    expect(ENTITY_PALETTE_ROWS[0]).toEqual([
      '#FFFFFF', '#000000', '#FBFAF9', '#605C55', '#455F5B',
      '#A8AE8C', '#C96F53', '#E2D3B0', '#8CB6BF', '#323849',
    ]);
    // A couple of variation cells, to lock the row order too.
    expect(ENTITY_PALETTE_ROWS[1][0]).toBe('#F2F2F2'); // white, lighter
    expect(ENTITY_PALETTE_ROWS[5][1]).toBe('#0C0C0C'); // black, darker
    expect(ENTITY_PALETTE_ROWS[4][9]).toBe('#252936'); // slate, darker 25%
  });
});

describe('normalizeColor / isPaletteColor', () => {
  it('normalises case and whitespace, rejects junk', () => {
    expect(normalizeColor(' #455f5b ')).toBe('#455F5B');
    expect(normalizeColor('#FFFFFF')).toBe('#FFFFFF');
    expect(normalizeColor(null)).toBeNull();
    expect(normalizeColor('')).toBeNull();
    expect(normalizeColor('red')).toBeNull();
    expect(normalizeColor('#12345')).toBeNull();
  });

  it('recognises palette membership regardless of case', () => {
    expect(isPaletteColor('#c96f53')).toBe(true);
    expect(isPaletteColor('#323849')).toBe(true);
    expect(isPaletteColor('#123456')).toBe(false);
    expect(isPaletteColor(null)).toBe(false);
  });
});

describe('isDarkColor (label contrast)', () => {
  it('treats the dark end of the palette as dark (light ink)', () => {
    for (const hex of ['#000000', '#323849', '#455F5B', '#605C55', '#0C0C0C', '#181C24']) {
      expect(isDarkColor(hex)).toBe(true);
    }
  });

  it('treats the light/mid tints as light (dark ink)', () => {
    for (const hex of ['#FFFFFF', '#FBFAF9', '#A8AE8C', '#E2D3B0', '#8CB6BF', '#F2F2F2']) {
      expect(isDarkColor(hex)).toBe(false);
    }
  });

  it('luminance is monotonic at the extremes', () => {
    expect(luminance('#000000')).toBeCloseTo(0, 5);
    expect(luminance('#FFFFFF')).toBeCloseTo(1, 5);
  });
});
