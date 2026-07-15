import { cn } from '@/lib/utils';
import { CountryFlag } from '@/components/CountryFlag';
import { UnknownValue } from './UnknownValue';

/**
 * The register's jurisdiction treatment (small flag + ISO code), shared with the
 * transaction rows so an entity's jurisdiction reads the same everywhere. A
 * missing jurisdiction renders the shared "Unknown" treatment instead.
 */
export function JurisFlagCode({ iso, className }: { iso: string | null; className?: string }) {
  if (!iso) return <UnknownValue className={className} />;
  return (
    <span className={cn('inline-flex items-center gap-1.5', className)}>
      <CountryFlag iso={iso} className="!h-[13px] !w-[18px] shadow-[0_0_0_1px_rgba(20,18,12,0.08)]" />
      <span className="text-[13.5px] uppercase tracking-[0.02em] tabular-nums text-foreground">{iso}</span>
    </span>
  );
}
