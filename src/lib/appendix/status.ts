import type { RowKind, Status } from './types';

/** The single controlled vocabulary, in display order. */
export const STATUS_VALUES: Status[] = ['Not triggered', 'Triggered', 'Insufficient information'];

interface Tone {
  cell: string;      // background tint for the status cell / trigger
  dot: string;       // small leading indicator
  rowAccent: string; // left border on the row
}

const TONES = {
  amber: {
    cell: 'bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200',
    dot: 'bg-amber-500',
    rowAccent: 'border-l-amber-400',
  },
  red: {
    cell: 'bg-rose-50 text-rose-900 dark:bg-rose-950/40 dark:text-rose-200',
    dot: 'bg-rose-500',
    rowAccent: 'border-l-rose-400',
  },
  green: {
    cell: 'bg-emerald-50 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200',
    dot: 'bg-emerald-500',
    rowAccent: 'border-l-emerald-400',
  },
  blue: {
    cell: 'bg-sky-50 text-sky-900 dark:bg-sky-950/40 dark:text-sky-200',
    dot: 'bg-sky-500',
    rowAccent: 'border-l-sky-300',
  },
  grey: {
    cell: 'bg-muted text-muted-foreground',
    dot: 'bg-muted-foreground/40',
    rowAccent: 'border-l-transparent',
  },
  none: { cell: '', dot: 'bg-muted-foreground/40', rowAccent: 'border-l-transparent' },
} satisfies Record<string, Tone>;

/**
 * Traffic light ONLY for operative rows (where a triggered row is a real ATAD2
 * adjustment): green when clean, red when it bites. Gate rows (scope, definitions,
 * thresholds) stay neutral, present in blue and absent in grey, because there a
 * "Triggered" is just an informational fact, not a problem. Missing info is amber
 * in every case.
 */
export function statusTone(status: Status | null, kind: RowKind): Tone {
  if (status === 'Insufficient information') return TONES.amber;
  if (kind === 'operative') {
    if (status === 'Triggered') return TONES.red;
    if (status === 'Not triggered') return TONES.green;
    return TONES.none;
  }
  // gate
  if (status === 'Triggered') return TONES.blue;
  if (status === 'Not triggered') return TONES.grey;
  return TONES.none;
}

/** Hex tints for the print/export HTML (no Tailwind there). */
export function statusPrintColor(status: Status | null, kind: RowKind): { bg: string; fg: string } {
  if (status === 'Insufficient information') return { bg: '#fff3cd', fg: '#664d03' };
  if (kind === 'operative') {
    if (status === 'Triggered') return { bg: '#fbe9eb', fg: '#842029' };
    if (status === 'Not triggered') return { bg: '#e7f6ee', fg: '#0f5132' };
    return { bg: '#ffffff', fg: '#111111' };
  }
  if (status === 'Triggered') return { bg: '#e7f1fb', fg: '#0b4a8a' };
  if (status === 'Not triggered') return { bg: '#f1f3f5', fg: '#495057' };
  return { bg: '#ffffff', fg: '#111111' };
}
