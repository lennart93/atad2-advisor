import type { Status } from './types';
import type { RowTone } from './conditionPolarity';

/** The single controlled vocabulary, in display order. */
export const STATUS_VALUES: Status[] = ['Not triggered', 'N/A', 'Triggered', 'Insufficient information'];

/**
 * The one label shown everywhere (condition screen, memo, print). The stored
 * enum keeps the long 'Insufficient information' value; the reader sees the
 * short 'Insufficient info'. 'N/A', 'Triggered' and 'Not triggered' read as-is.
 */
export function statusDisplayLabel(status: Status | null): string {
  switch (status) {
    case 'Not triggered':
      return 'Not triggered';
    case 'N/A':
      return 'N/A';
    case 'Triggered':
      return 'Triggered';
    case 'Insufficient information':
      return 'Insufficient info';
    default:
      return '';
  }
}

/**
 * The shared tint palette for the print/export HTML and the Word memo (no Tailwind
 * there), keyed by the row's presentation tone (see conditionPolarity.rowTone):
 *   - 'clear' and 'na' read green (resolved/clean vs does-not-apply), 'na' a lighter
 *     green so the two stay distinguishable.
 *   - 'risk' and 'caution' read amber (no red, no blue).
 */
const TONE_COLORS: Record<RowTone, { bg: string; fg: string }> = {
  clear: { bg: '#e7f6ee', fg: '#0f5132' },
  na: { bg: '#f1f7ef', fg: '#3f5a4a' },
  risk: { bg: '#faeeda', fg: '#854f0b' },
  caution: { bg: '#fff3cd', fg: '#664d03' },
};

/** Hex tints driven by the row's tone; the single source of colour for export + memo. */
export function tonePrintColor(tone: RowTone): { bg: string; fg: string } {
  return TONE_COLORS[tone];
}

/**
 * Status-only colour (no polarity), for callers that hold a bare status. Scope rows
 * that are merely "Triggered" still read amber here; use tonePrintColor(rowTone(...))
 * to keep a satisfied scope gate calm.
 */
export function statusPrintColor(status: Status | null): { bg: string; fg: string } {
  switch (status) {
    case 'Not triggered':
      return TONE_COLORS.clear;
    case 'N/A':
      return TONE_COLORS.na;
    case 'Triggered':
      return TONE_COLORS.risk;
    case 'Insufficient information':
      return TONE_COLORS.caution;
    default:
      return { bg: '#ffffff', fg: '#111111' };
  }
}
