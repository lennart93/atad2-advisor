import { useState } from 'react';
import { ChevronDown, ChevronUp, Eye, EyeOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AppendixFacts, FactEntity, TransactionItem } from '@/lib/appendix/types';
import { splitTransactions } from '@/lib/appendix/needsAttention';
import { txRiskShortLabel } from '@/lib/appendix/facts/transactionAssessment';
import { shortTransactionType } from '@/lib/appendix/facts/transactionCategory';
import { isSelfTransaction } from '@/lib/appendix/facts/transactionSet';
import { effJurisdiction } from '@/lib/appendix/facts/entityFields';
import { JurisFlagCode } from './JurisFlagCode';

const GROUP_LABEL = 'text-[12px] font-medium uppercase tracking-[0.13em] text-muted-foreground';
const GROUP_META = 'text-[12px] text-muted-foreground/60';

/**
 * Part A section 3 as a single-line grid that mirrors the entity register table:
 * same header style, same row rhythm, and the jurisdictions in their own fixed
 * JURIS. columns (never inline in the entity names). The RISK column carries a
 * small accent dot + short label; the full phrasing lives in the detail panel.
 * Routine (no-risk) rows fold behind a group row, like the register's "Other".
 */
export function TransactionTable({ facts, onChange, selectedId, onSelect }: {
  facts: AppendixFacts;
  onChange?: (next: AppendixFacts) => void;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const editable = !!onChange;
  const [showRoutine, setShowRoutine] = useState(false);
  const { flagged, routine } = splitTransactions(facts);

  const entityOf = (id: string): FactEntity | undefined => facts.entities.find((e) => e.id === id);
  const nameOf = (id: string) => entityOf(id)?.name ?? id;
  const jurOf = (id: string) => {
    const e = entityOf(id);
    return e ? effJurisdiction(e) : null;
  };

  const toggleHidden = (t: TransactionItem) =>
    onChange?.({
      ...facts,
      transactions: facts.transactions.map((x) =>
        x.id === t.id ? { ...x, excludedFromClient: !x.excludedFromClient } : x,
      ),
    });

  const COLS = 9;

  const renderRow = (t: TransactionItem) => {
    const invalid = isSelfTransaction(t);
    const risk = txRiskShortLabel(facts, t);
    const selected = selectedId === t.id;
    return (
      <tr
        key={t.id}
        data-appendix-row
        role="button"
        tabIndex={0}
        aria-pressed={selected}
        id={`v2-tx-${t.id}`}
        onClick={() => onSelect(t.id)}
        onKeyDown={(ev) => { if (ev.currentTarget === ev.target && (ev.key === 'Enter' || ev.key === ' ')) { ev.preventDefault(); onSelect(t.id); } }}
        className={cn(
          'group cursor-pointer border-b border-border align-middle transition-colors hover:bg-accent focus:bg-accent focus:outline-none',
          selected && 'bg-brand-terracotta-soft/25',
        )}
      >
        <td className={cn('py-2.5 pr-2 font-mono text-ds-ink-secondary', selected ? 'border-l-2 border-l-brand-terracotta pl-2.5' : 'border-l-2 border-l-transparent pl-3')}>{t.id}</td>
        <td className="overflow-hidden text-ellipsis whitespace-nowrap pr-2 text-foreground">
          {nameOf(t.fromEntityId)}
          {t.manual && <span className="ml-1.5 rounded-sm bg-muted px-1 text-[10px] text-muted-foreground">added</span>}
        </td>
        <td className="py-0.5 pr-2"><JurisFlagCode iso={jurOf(t.fromEntityId)} /></td>
        <td className="pr-2 text-muted-foreground" aria-hidden>→</td>
        <td className="overflow-hidden text-ellipsis whitespace-nowrap pr-2 text-foreground">{nameOf(t.toEntityId)}</td>
        <td className="py-0.5 pr-2"><JurisFlagCode iso={jurOf(t.toEntityId)} /></td>
        <td className="pr-2">
          <span className="inline-block rounded-[3px] bg-muted px-1.5 py-0.5 text-[10.5px] text-muted-foreground">
            {shortTransactionType(t.kind)}
          </span>
        </td>
        <td className="pr-2">
          {(invalid || risk) && (
            <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-[11.5px] font-medium text-brand-terracotta-deep">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand-terracotta" aria-hidden />
              {invalid ? 'invalid: same entity' : risk}
            </span>
          )}
        </td>
        <td className="px-2 text-center" onClick={(ev) => ev.stopPropagation()}>
          <button
            type="button"
            aria-label={t.excludedFromClient ? `Show ${t.id} in the client report` : `Hide ${t.id} from the client report`}
            disabled={!editable}
            onClick={(ev) => { ev.stopPropagation(); toggleHidden(t); }}
            className={cn('inline-flex h-6 w-6 items-center justify-center rounded-[3px] transition-colors',
              t.excludedFromClient ? 'text-muted-foreground hover:bg-muted hover:text-foreground' : 'text-brand-sage-deep hover:bg-brand-sage-soft')}
          >
            {t.excludedFromClient ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </td>
      </tr>
    );
  };

  const thLabel = 'pr-2 text-[10px] font-medium uppercase tracking-wide';

  return (
    <table className="w-full table-fixed text-xs">
      <thead>
        <tr className="border-b border-foreground text-left text-muted-foreground">
          <th className={cn(thLabel, 'py-2 w-10 pl-3')}>#</th>
          <th className={thLabel}>From</th>
          <th className={cn(thLabel, 'w-[72px]')}>Juris.</th>
          <th className="w-6 pr-2" aria-hidden />
          <th className={thLabel}>To</th>
          <th className={cn(thLabel, 'w-[72px]')}>Juris.</th>
          <th className={cn(thLabel, 'w-[104px]')}>Type</th>
          <th className={cn(thLabel, 'w-[136px]')}>Risk</th>
          <th className="w-[48px]" aria-hidden />
        </tr>
      </thead>
      {flagged.length > 0 && <tbody>{flagged.map(renderRow)}</tbody>}
      {routine.length > 0 && (
        <tbody>
          <tr className="border-b border-border">
            <td colSpan={COLS} className="py-2.5 pl-3">
              <button type="button" onClick={() => setShowRoutine((v) => !v)} aria-expanded={showRoutine} className="flex items-center gap-2.5 text-left">
                <span className={GROUP_LABEL}>No risk identified</span>
                <span className={GROUP_META}>{routine.length} {routine.length === 1 ? 'transaction' : 'transactions'}</span>
                {showRoutine ? <ChevronUp className="h-3 w-3 text-muted-foreground" /> : <ChevronDown className="h-3 w-3 text-muted-foreground" />}
              </button>
            </td>
          </tr>
          {showRoutine && routine.map(renderRow)}
        </tbody>
      )}
    </table>
  );
}
