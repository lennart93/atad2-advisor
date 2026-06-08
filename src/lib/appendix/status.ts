import type { Status } from './types';

/** The single controlled vocabulary, in display order. */
export const STATUS_VALUES: Status[] = ['Not triggered', 'Triggered', 'Insufficient information'];

/**
 * Traffic-light tone per status: green when a condition is clear/not triggered,
 * red when it is triggered (a mismatch or correction is in play), amber when the
 * data is incomplete. Used by the on-screen table.
 */
export function statusTone(status: Status | null): {
  cell: string;     // background tint for the status cell
  dot: string;      // small leading indicator
  rowAccent: string; // left border on the row
} {
  switch (status) {
    case 'Not triggered':
      return {
        cell: 'bg-emerald-50 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200',
        dot: 'bg-emerald-500',
        rowAccent: 'border-l-emerald-400',
      };
    case 'Triggered':
      return {
        cell: 'bg-rose-50 text-rose-900 dark:bg-rose-950/40 dark:text-rose-200',
        dot: 'bg-rose-500',
        rowAccent: 'border-l-rose-400',
      };
    case 'Insufficient information':
      return {
        cell: 'bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200',
        dot: 'bg-amber-500',
        rowAccent: 'border-l-amber-400',
      };
    default:
      return { cell: '', dot: 'bg-muted-foreground/40', rowAccent: 'border-l-transparent' };
  }
}

/** Hex tints for the print/export HTML (no Tailwind there). */
export function statusPrintColor(status: Status | null): { bg: string; fg: string } {
  switch (status) {
    case 'Not triggered':
      return { bg: '#e7f6ee', fg: '#0f5132' };
    case 'Triggered':
      return { bg: '#fbe9eb', fg: '#842029' };
    case 'Insufficient information':
      return { bg: '#fff3cd', fg: '#664d03' };
    default:
      return { bg: '#ffffff', fg: '#111111' };
  }
}
