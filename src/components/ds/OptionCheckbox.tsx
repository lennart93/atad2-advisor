import * as React from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface OptionCheckboxProps {
  checked: boolean;
  onToggle: () => void;
  disabled?: boolean;
  children: React.ReactNode;
  className?: string;
}

/**
 * Subtle, low-weight option checkbox: a small square box plus a label. Deliberately
 * understated so it never competes with a primary action on the same card.
 */
export function OptionCheckbox({ checked, onToggle, disabled, children, className }: OptionCheckboxProps) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      disabled={disabled}
      onClick={onToggle}
      className={cn(
        'group inline-flex select-none items-center gap-2 rounded-sm ring-offset-background',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ds-accent focus-visible:ring-offset-2',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'flex h-4 w-4 items-center justify-center rounded-[4px] border-[1.5px] transition-colors',
          checked
            ? 'border-ds-ink bg-ds-ink group-hover:bg-ds-ink-hover'
            : 'border-ds-hairline bg-ds-card group-hover:border-ds-ink-tertiary',
        )}
      >
        {checked && <Check className="h-2.5 w-2.5 text-ds-card" strokeWidth={3} />}
      </span>
      <span className="text-[13.5px] font-medium text-ds-ink-secondary">{children}</span>
    </button>
  );
}
