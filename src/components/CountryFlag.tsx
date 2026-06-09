import { cn } from '@/lib/utils';
import { isKnownCountryIso } from '@/lib/structure/countries';

interface Props {
  /** ISO 3166-1 alpha-2 code (any case). Unknown/custom codes render a neutral placeholder. */
  iso: string | null | undefined;
  className?: string;
}

/**
 * A small country flag from the flag-icons sprite. Renders nothing recognisable
 * for codes outside the ISO alpha-2 set (e.g. the AI's legacy alpha-3 output) -
 * just a muted rounded box - so the UI never shows a broken sprite.
 */
export function CountryFlag({ iso, className }: Props) {
  const code = (iso ?? '').toLowerCase();
  if (!iso || !isKnownCountryIso(iso)) {
    return <span className={cn('inline-block h-3 w-4 rounded-[2px] bg-muted align-[-2px]', className)} aria-hidden />;
  }
  return (
    <span
      className={cn(`fi fi-${code} rounded-[2px] align-[-2px]`, className)}
      title={iso.toUpperCase()}
      aria-hidden
    />
  );
}
