// src/components/assessment/DossierTag.tsx
import { useState, type ReactNode } from 'react';
import { FileText, Folder, FolderOpen } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useSessionDocuments } from '@/hooks/usePrefill';
import { DOCUMENT_CATEGORIES } from '@/lib/prefill/types';
import { formatDate } from '@/utils/formatDate';
import { formatFiscalYears, parseFiscalYears } from '@/utils/formatFiscalYears';
import { dedupeEntityNames, parseTaxpayerNames, taxpayerSubjectLabel } from '@/lib/taxpayer';
import { TaxpayerSubject } from '@/components/TaxpayerSubject';
import { cn } from '@/lib/utils';

export interface DossierTagProps {
  sessionId: string;
  taxpayerName: string | null;
  fiscalYear: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  startedAt: string | null;
  preliminaryOutcome: string | null;
  overrideOutcome: string | null;
  outcomeOverridden: boolean;
  completed: boolean;
}

// Status dot + label by outcome. The dot colour follows the app's status
// palette: terracotta (the accent) = in progress, amber = ATAD2 risk or
// insufficient information, sage = no risk identified / done. Amber stays
// risk-only, so the in-progress dot uses the terracotta accent (matching the
// dashboard), not amber. The stored value stays `low_risk`; only the label changed.
const OUTCOME_DOT: Record<string, { dot: string; label: string }> = {
  risk_identified: { dot: 'bg-ds-amber', label: 'ATAD2 risk identified' },
  insufficient_information: { dot: 'bg-ds-amber', label: 'Insufficient information' },
  low_risk: { dot: 'bg-ds-green', label: 'No risk identified' },
};

const CATEGORY_LABELS = new Map(DOCUMENT_CATEGORIES.map((c) => [c.value as string, c.label]));

const MAX_DOC_ROWS = 5;
const MAX_ENTITY_ROWS = 5;

/**
 * Shared chrome for the popover's capped lists (Entities, Documents): hairline
 * divider, uppercase header with an optional count, the rows, and an
 * "and N more" tail once the cap cuts the list off.
 */
function CappedSection({
  title,
  count,
  overflowCount = 0,
  children,
}: {
  title: string;
  count?: number;
  overflowCount?: number;
  children: ReactNode;
}) {
  return (
    <div className="border-t border-ds-hairline px-1.5 py-1.5">
      <p className="px-2 pb-1 pt-1 text-[11px] font-medium uppercase tracking-[0.16em] text-ds-ink-tertiary">
        {title}
        {count !== undefined && (
          <>
            {' · '}
            <span className="ds-tabular-nums">{count}</span>
          </>
        )}
      </p>
      {children}
      {overflowCount > 0 && (
        <p className="px-2 py-1.5 text-[13px] text-ds-ink-tertiary">
          and <span className="ds-tabular-nums">{overflowCount}</span> more
        </p>
      )}
    </div>
  );
}

/**
 * The "which file am I working on" anchor, visible on every assessment step.
 * The folder tab opens a glanceable, read-only summary of the current session:
 * who and which year, where the assessment stands, and the documents feeding
 * it. No actions live here, adding documents and switching assessments happen
 * on their own steps.
 */
export function DossierTag({
  sessionId,
  taxpayerName,
  fiscalYear,
  periodStart,
  periodEnd,
  startedAt,
  preliminaryOutcome,
  overrideOutcome,
  outcomeOverridden,
}: DossierTagProps) {
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState(false);

  // Cockpit data loads only once the card opens; the shell stays quiet.
  const { data: docs } = useSessionDocuments(open ? sessionId : null);

  // An assessment can name several entities (stored newline-joined). Everywhere
  // in this card the subject reads as lead entity plus a count; the full list
  // gets its own capped section below, like Documents. Single-entity is unchanged.
  // Parsing first (rather than a bare falsy check) also hides the card for a
  // legacy whitespace-only value, which would otherwise render a nameless anchor.
  const entityNames = dedupeEntityNames(parseTaxpayerNames(taxpayerName));
  if (entityNames.length === 0) return null;

  const taxpayerLabel = taxpayerSubjectLabel(taxpayerName);
  const FolderIcon = open || hovered ? FolderOpen : Folder;
  const fyLabel = fiscalYear ? `FY${formatFiscalYears(fiscalYear)}` : null;

  // The boekjaar range only earns a mention when it is not simply the calendar
  // span of the selected year(s). For a multi-year assessment that span runs
  // from the first selected year's Jan 1 to the last year's Dec 31; only a real
  // custom window deviates from it and earns the line.
  const fyYears = parseFiscalYears(fiscalYear);
  const fyMin = fyYears[0];
  const fyMax = fyYears[fyYears.length - 1];
  const isCalendarYear =
    fyYears.length > 0 &&
    (!periodStart || periodStart === `${fyMin}-01-01`) &&
    (!periodEnd || periodEnd === `${fyMax}-12-31`);
  const showPeriod = !!periodStart && !!periodEnd && !isCalendarYear;

  const effectiveOutcome = outcomeOverridden && overrideOutcome ? overrideOutcome : preliminaryOutcome;
  const outcome = effectiveOutcome ? OUTCOME_DOT[effectiveOutcome] : undefined;

  const docCount = docs?.length ?? 0;

  // Read-only rows: this card is a glance, not a nav surface, so the document
  // rows carry no hover/pointer affordance.
  const docRowClasses = 'flex w-full items-center gap-2 rounded-ds-control px-2 py-1.5 text-left text-[13px]';

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Current dossier: ${taxpayerLabel}${fyLabel ? `, ${fyLabel}` : ''}`}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          className="inline-flex max-w-[260px] min-w-0 items-center gap-2 rounded-ds-control border border-ds-hairline bg-ds-card px-2.5 py-1.5 text-left transition-colors duration-150 hover:bg-ds-fill-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ds-accent"
        >
          <FolderIcon className="size-3.5 shrink-0 text-ds-ink-secondary" aria-hidden="true" />
          {/* Lead entity + "+N", matching the dashboard ledger; the full list
              lives in the popover below. A comma-joined run clips to noise. */}
          <TaxpayerSubject
            stored={taxpayerName}
            className="text-[13px] font-normal text-ds-ink"
            moreClassName="text-[12px]"
          />
          {fyLabel && (
            <>
              <span aria-hidden="true" className="h-3 w-px shrink-0 bg-ds-hairline" />
              <span className="ds-tabular-nums shrink-0 text-[13px] text-ds-ink-secondary">
                {fyLabel}
              </span>
            </>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[330px] border-t-2 border-t-ds-accent p-0 shadow-[0_18px_50px_rgba(20,18,12,0.16)]"
      >
        {/* Identity + status: who, which year, and where the assessment stands.
            Plain flowing text so a long legal name wraps and stays fully
            readable; the trigger may truncate, the popover never does. */}
        <div className="px-3.5 py-3">
          <p className="text-[15px] font-normal text-ds-ink">
            {taxpayerLabel}
            {fyLabel && (
              <>
                <span className="text-ds-ink-tertiary"> · </span>
                <span className="ds-tabular-nums">{fyLabel}</span>
              </>
            )}
          </p>
          <p className="ds-tabular-nums mt-0.5 text-[12.5px] text-ds-ink-secondary">
            {showPeriod && (
              <>
                Fiscal year {formatDate(periodStart)} to {formatDate(periodEnd)}
                {startedAt && <span className="text-ds-ink-tertiary"> · </span>}
              </>
            )}
            {startedAt && <>Started {formatDate(startedAt)}</>}
          </p>

          <div className="mt-2.5 flex items-center gap-2 text-[13px]">
            <span
              aria-hidden="true"
              className={cn('size-[7px] shrink-0 rounded-full', outcome ? outcome.dot : 'bg-ds-accent')}
            />
            <span className="text-ds-ink">{outcome ? outcome.label : 'In progress'}</span>
            <span className="text-[12px] text-ds-ink-tertiary">
              {outcome
                ? outcomeOverridden
                  ? 'adjusted outcome'
                  : 'preliminary outcome'
                : 'No outcome yet'}
            </span>
          </div>
        </div>

        {/* Entities assessed together: a capped list instead of a comma-run,
            mirroring the Documents section. Rows wrap rather than truncate,
            this list exists to show the full names. Single-entity dossiers
            skip it. */}
        {entityNames.length > 1 && (
          <CappedSection
            title="Entities"
            count={entityNames.length}
            overflowCount={entityNames.length - MAX_ENTITY_ROWS}
          >
            {entityNames.slice(0, MAX_ENTITY_ROWS).map((name) => (
              <p key={name} className="break-words px-2 py-1 text-[13px] text-ds-ink">
                {name}
              </p>
            ))}
          </CappedSection>
        )}

        {/* Documents: what feeds the analysis. Rows still open the documents step. */}
        <CappedSection
          title="Documents"
          count={docCount > 0 ? docCount : undefined}
          overflowCount={docCount - MAX_DOC_ROWS}
        >
          {docCount === 0 ? (
            <p className="px-2 py-1.5 text-[13px] text-ds-ink-tertiary">No documents yet.</p>
          ) : (
            (docs ?? []).slice(0, MAX_DOC_ROWS).map((doc) => (
              <div key={doc.id} className={docRowClasses}>
                <FileText className="size-3.5 shrink-0 text-ds-ink-tertiary" aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate text-ds-ink">
                  {doc.doc_label || doc.filename}
                </span>
                <span className="shrink-0 rounded-ds-chip border border-ds-hairline px-1.5 py-0.5 text-[11px] text-ds-ink-secondary">
                  {doc.status === 'summarizing'
                    ? 'analyzing...'
                    : CATEGORY_LABELS.get(doc.category) ?? doc.category}
                </span>
              </div>
            ))
          )}
        </CappedSection>
      </PopoverContent>
    </Popover>
  );
}
