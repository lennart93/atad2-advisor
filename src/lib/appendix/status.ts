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
 * there), keyed by the row's presentation tone (see conditionPolarity.rowTone). One
 * status colour system, identical to the on-screen checklist so the screen, the memo
 * and the export can never disagree:
 *   - 'risk' reads terracotta (a finding), 'caution' amber (facts still missing).
 *   - 'clear' and 'na' read neutral grey (routine, recedes), 'na' a touch lighter so
 *     the two stay distinguishable.
 */
const TONE_COLORS: Record<RowTone, { bg: string; fg: string }> = {
  clear: { bg: '#f1efe9', fg: '#605b52' },
  na: { bg: '#f5f3ef', fg: '#6f6a60' },
  risk: { bg: '#faf2ee', fg: '#a8492d' },
  caution: { bg: '#f7f0e1', fg: '#8a6410' },
};

/** Hex tints driven by the row's tone; the single source of colour for export + memo. */
export function tonePrintColor(tone: RowTone): { bg: string; fg: string } {
  return TONE_COLORS[tone];
}

/**
 * Status-only colour (no polarity), for callers that hold a bare status. Scope rows
 * that are merely "Triggered" still read terracotta here; use tonePrintColor(rowTone(...))
 * to keep a satisfied scope gate calm (grey).
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
