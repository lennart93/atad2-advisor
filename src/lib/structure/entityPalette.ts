// src/lib/structure/entityPalette.ts
//
// The fixed colour palette an advisor can assign to an entity in the structure
// chart. It is the Office "Theme Colors" grid: a top row of 10 base theme
// colours, then five rows of the standard lighter/darker variations of each
// column. The hex values below were sampled pixel-exact from the supplied
// palette screenshot (every swatch was a perfectly uniform fill), so the
// chooser reproduces that grid one-to-one — same colours, same rows, same
// column order.
//
// Column order (left → right), following Office's convention:
//   1 Background 1 (white)   2 Text 1 (black)     3 Background 2 (light)
//   4 Text 2 (dark)          5 Accent 1 (teal)    6 Accent 2 (sage)
//   7 Accent 3 (coral)       8 Accent 4 (sand)    9 Accent 5 (sky)
//  10 Accent 6 (slate)
//
// Row order (top → bottom):
//   0 base theme colour
//   1 lighter 80%   2 lighter 60%   3 lighter 40%   4 darker 25%   5 darker 50%
// (rows 1–5 are the verbatim variations Office shows; we store the rendered
// hexes rather than recompute them, so the grid is exact.)

/** The 6 × 10 theme-colour grid, exactly as shown in the Office picker. */
export const ENTITY_PALETTE_ROWS: readonly (readonly string[])[] = [
  ['#FFFFFF', '#000000', '#FBFAF9', '#605C55', '#455F5B', '#A8AE8C', '#C96F53', '#E2D3B0', '#8CB6BF', '#323849'],
  ['#F2F2F2', '#7F7F7F', '#E7E1DA', '#E0DEDC', '#D6E1E0', '#EDEEE8', '#F4E2DC', '#F9F6EF', '#E8F0F2', '#D1D4DF'],
  ['#D8D8D8', '#595959', '#C8BBAE', '#C1BEB9', '#AEC4C1', '#DCDED1', '#E9C5BA', '#F3EDDF', '#D1E1E5', '#A3AAC0'],
  ['#BFBFBF', '#3F3F3F', '#967D63', '#A29D96', '#86A7A2', '#CACEBA', '#DEA897', '#EDE4CF', '#BAD3D8', '#7580A0'],
  ['#A5A5A5', '#262626', '#4B3E31', '#47443F', '#334744', '#828A61', '#A24D32', '#C7AA66', '#58939F', '#252936'],
  ['#7F7F7F', '#0C0C0C', '#1E1913', '#302E2A', '#222F2D', '#575C40', '#6C3321', '#937735', '#3B626A', '#181C24'],
] as const;

/** Optional human labels for the ten columns (used as swatch tooltips). */
export const ENTITY_PALETTE_COLUMN_NAMES: readonly string[] = [
  'White', 'Black', 'Light', 'Dark', 'Teal', 'Sage', 'Coral', 'Sand', 'Sky', 'Slate',
];

/** Flat list of every swatch hex, for membership checks. */
export const ENTITY_PALETTE_FLAT: readonly string[] = ENTITY_PALETTE_ROWS.flat();

const PALETTE_SET = new Set(ENTITY_PALETTE_FLAT.map((c) => c.toUpperCase()));

/** Normalise a stored colour to the canonical "#RRGGBB" upper-case form (or null). */
export function normalizeColor(hex: string | null | undefined): string | null {
  if (!hex) return null;
  const v = hex.trim().toUpperCase();
  return /^#[0-9A-F]{6}$/.test(v) ? v : null;
}

/** True when the given hex is one of the palette swatches. */
export function isPaletteColor(hex: string | null | undefined): boolean {
  const v = normalizeColor(hex);
  return v != null && PALETTE_SET.has(v);
}

/**
 * Perceived luminance (0 = black, 1 = white) of an "#RRGGBB" colour. Used to
 * decide whether label text on a filled node should be dark or light. A
 * non-hex input returns 1 (treated as light) so callers fall back to dark ink.
 */
export function luminance(hex: string): number {
  const v = normalizeColor(hex);
  if (!v) return 1;
  const r = parseInt(v.slice(1, 3), 16);
  const g = parseInt(v.slice(3, 5), 16);
  const b = parseInt(v.slice(5, 7), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

/**
 * True when a fill is dark enough that label text and inner glyphs should flip
 * to light. Threshold 0.62 keeps the sage/sand/sky tints on dark ink while the
 * teal/slate/coral/black ends switch to white text.
 */
export function isDarkColor(hex: string): boolean {
  return luminance(hex) < 0.62;
}
