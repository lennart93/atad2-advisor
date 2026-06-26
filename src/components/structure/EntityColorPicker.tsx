import { useState } from 'react';
import { Check, Ban } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import {
  ENTITY_PALETTE_ROWS,
  ENTITY_PALETTE_COLUMN_NAMES,
  isDarkColor,
  normalizeColor,
} from '@/lib/structure/entityPalette';

interface Props {
  id?: string;
  /** Current colour ("#RRGGBB") or null for the default white fill. */
  value: string | null;
  /** Fires with a palette hex, or null when the user clears the colour. */
  onChange: (color: string | null) => void;
}

/**
 * Office-style "Theme Colors" swatch chooser. Reproduces the supplied palette
 * exactly: a top row of ten base theme colours, then five rows of their
 * lighter/darker variations (see entityPalette.ts). A trigger button shows the
 * current swatch and opens the grid; "No colour" clears back to the default.
 */
export function EntityColorPicker({ id, value, onChange }: Props) {
  const current = normalizeColor(value);
  const [open, setOpen] = useState(false);
  // Picking a colour applies it and closes the grid, like the Office control.
  const pick = (color: string | null) => {
    onChange(color);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          id={id}
          type="button"
          className="flex h-9 w-full items-center gap-2.5 rounded-md border border-ds-hairline bg-white/70 px-2.5
                     text-left transition-colors hover:bg-white focus-visible:outline-none
                     focus-visible:ring-1 focus-visible:ring-ds-ink-tertiary"
        >
          <span
            className="h-5 w-5 shrink-0 rounded-[4px] border border-black/15"
            style={
              current
                ? { backgroundColor: current }
                : {
                    // Diagonal slash = "no colour / default white".
                    backgroundColor: '#ffffff',
                    backgroundImage:
                      'linear-gradient(135deg, transparent calc(50% - 0.75px), #c0392b calc(50% - 0.75px), #c0392b calc(50% + 0.75px), transparent calc(50% + 0.75px))',
                  }
            }
          />
          <span className="text-[12.5px] text-ds-ink">
            {current ? current : 'No color (default)'}
          </span>
        </button>
      </PopoverTrigger>

      <PopoverContent className="w-auto p-3" align="start">
        <div className="mb-2 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-ds-ink-secondary">
          Theme Colors
        </div>

        {/* Base theme-colour row. */}
        <div className="grid grid-cols-10 gap-1">
          {ENTITY_PALETTE_ROWS[0].map((hex, col) => (
            <Swatch
              key={hex}
              hex={hex}
              label={ENTITY_PALETTE_COLUMN_NAMES[col]}
              selected={current === hex}
              onSelect={() => pick(hex)}
            />
          ))}
        </div>

        {/* Lighter/darker variation rows, with a small gap below the base row. */}
        <div className="mt-1.5 grid grid-cols-10 gap-1">
          {ENTITY_PALETTE_ROWS.slice(1).flatMap((row, rowIdx) =>
            row.map((hex, col) => (
              <Swatch
                key={`${rowIdx}-${col}-${hex}`}
                hex={hex}
                label={`${ENTITY_PALETTE_COLUMN_NAMES[col]} ${hex}`}
                selected={current === hex}
                onSelect={() => pick(hex)}
              />
            )),
          )}
        </div>

        <button
          type="button"
          onClick={() => pick(null)}
          className="mt-3 flex w-full items-center gap-2 rounded-md border border-ds-hairline px-2.5 py-1.5
                     text-[12px] text-ds-ink-secondary transition-colors hover:bg-ds-fill-muted hover:text-ds-ink"
        >
          <Ban className="h-3.5 w-3.5" />
          No color (default white)
        </button>
      </PopoverContent>
    </Popover>
  );
}

function Swatch({
  hex,
  label,
  selected,
  onSelect,
}: {
  hex: string;
  label: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={selected}
      onClick={onSelect}
      className={cn(
        'flex h-5 w-5 items-center justify-center rounded-[3px] border border-black/15 transition-transform',
        'hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ds-ink focus-visible:ring-offset-1',
        selected && 'ring-2 ring-ds-ink ring-offset-1',
      )}
      style={{ backgroundColor: hex }}
    >
      {selected && (
        <Check
          className="h-3 w-3"
          style={{ color: isDarkColor(hex) ? '#ffffff' : '#1a1a1a' }}
          strokeWidth={3}
        />
      )}
    </button>
  );
}
