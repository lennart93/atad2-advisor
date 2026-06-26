// src/components/assessment/DossierTag.tsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { differenceInCalendarDays } from 'date-fns';
import { Check, ChevronRight, Fingerprint, Folder, FolderOpen, Plus } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { StatusPill } from '@/components/ds';
import { useOpenQuestions } from '@/hooks/useOpenQuestions';
import { useSessionDocuments } from '@/hooks/usePrefill';
import { DOCUMENT_CATEGORIES } from '@/lib/prefill/types';
import { formatDate } from '@/utils/formatDate';
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

const OUTCOME_PILLS: Record<string, { status: 'triggered' | 'insufficient' | 'complete'; label: string }> = {
  risk_identified: { status: 'triggered', label: 'ATAD2 risk identified' },
  insufficient_information: { status: 'insufficient', label: 'Insufficient information' },
  low_risk: { status: 'complete', label: 'Low ATAD2 risk' },
};

const CATEGORY_LABELS = new Map(DOCUMENT_CATEGORIES.map((c) => [c.value as string, c.label]));

const MAX_DOC_ROWS = 5;

function daysAgoLabel(iso: string): string {
  const days = differenceInCalendarDays(new Date(), new Date(iso));
  if (days <= 0) return 'today';
  if (days === 1) return '1 day ago';
  return `${days} days ago`;
}

/**
 * The "which file am I working on" anchor, visible on every assessment step.
 * The folder tab opens a small cockpit: identity, where the assessment
 * stands, the documents feeding it, and a way out. Every row navigates
 * somewhere; the only static thing is who and which year.
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
  completed,
}: DossierTagProps) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [copied, setCopied] = useState(false);

  // Cockpit data loads only once the card opens; the shell stays quiet.
  const { data: docs } = useSessionDocuments(open ? sessionId : null);
  const { data: questionRows } = useOpenQuestions(open ? sessionId : null);

  if (!taxpayerName) return null;

  const FolderIcon = open || hovered ? FolderOpen : Folder;
  const fyLabel = fiscalYear ? `FY${fiscalYear}` : null;

  // The boekjaar range only earns a mention when it is not simply the
  // calendar year of the fiscal year.
  const isCalendarYear =
    !!fiscalYear &&
    (!periodStart || periodStart === `${fiscalYear}-01-01`) &&
    (!periodEnd || periodEnd === `${fiscalYear}-12-31`);
  const showPeriod = !!periodStart && !!periodEnd && !isCalendarYear;

  const effectiveOutcome = outcomeOverridden && overrideOutcome ? overrideOutcome : preliminaryOutcome;
  const outcomePill = effectiveOutcome ? OUTCOME_PILLS[effectiveOutcome] : undefined;
  const outcomeHref = completed
    ? `/assessment-report/${sessionId}`
    : `/assessment-confirmation/${sessionId}`;

  const sentRows = (questionRows ?? []).filter((r) => r.status === 'taken_to_client');
  const lastSentAt = sentRows
    .map((r) => r.taken_to_client_at ?? r.updated_at)
    .filter(Boolean)
    .sort()
    .at(-1);

  const goToDocuments = () => {
    setOpen(false);
    navigate(`/assessment/upload?session=${sessionId}`);
  };

  const copyId = async () => {
    try {
      await navigator.clipboard.writeText(sessionId);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard unavailable; nothing actionable for the user here.
    }
  };

  const rowClasses =
    'flex w-full items-center gap-2 rounded-ds-control px-2 py-1.5 text-left text-[13px] transition-colors duration-150 hover:bg-ds-fill-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ds-accent';

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Current dossier: ${taxpayerName}${fyLabel ? `, ${fyLabel}` : ''}`}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          className="inline-flex max-w-[260px] shrink-0 items-center gap-2 rounded-ds-control border border-ds-hairline bg-ds-card px-2.5 py-1.5 text-left transition-colors duration-150 hover:bg-ds-fill-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ds-accent"
        >
          <FolderIcon className="size-3.5 shrink-0 text-ds-ink-secondary" aria-hidden="true" />
          <span className="truncate text-[13px] font-medium text-ds-ink">{taxpayerName}</span>
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
      <PopoverContent align="start" className="w-[330px] p-0">
        {/* Identity: the one block that just states the facts. */}
        <div className="px-3 py-3">
          <p className="text-[13px] font-medium text-ds-ink">
            {taxpayerName}
            {fyLabel && (
              <span className="ds-tabular-nums"> · {fyLabel}</span>
            )}
          </p>
          <p className="ds-tabular-nums mt-0.5 text-[13px] text-ds-ink-secondary">
            {showPeriod && (
              <>
                Fiscal year {formatDate(periodStart)} to {formatDate(periodEnd)}
                {startedAt && ' · '}
              </>
            )}
            {startedAt && <>started {formatDate(startedAt)}</>}
          </p>
        </div>

        {/* Status: where the assessment stands, with a way to jump there. */}
        <div className="border-t border-ds-hairline px-1.5 py-1.5">
          {outcomePill ? (
            <button
              type="button"
              className={rowClasses}
              onClick={() => {
                setOpen(false);
                navigate(outcomeHref);
              }}
            >
              <StatusPill status={outcomePill.status}>{outcomePill.label}</StatusPill>
              <span className="text-ds-ink-secondary">
                {outcomeOverridden ? 'adjusted outcome' : 'preliminary outcome'}
              </span>
              <ChevronRight className="ml-auto size-3.5 shrink-0 text-ds-ink-tertiary" aria-hidden="true" />
            </button>
          ) : (
            <div className="flex items-center gap-2 px-2 py-1.5 text-[13px]">
              <StatusPill status="neutral">In progress</StatusPill>
              <span className="text-ds-ink-secondary">no outcome yet</span>
            </div>
          )}
          {sentRows.length > 0 && (
            <button
              type="button"
              className={rowClasses}
              onClick={() => {
                setOpen(false);
                navigate(`/assessment/upload?session=${sessionId}&worklist=sent`);
              }}
            >
              <span className="text-ds-ink">
                <span className="ds-tabular-nums">{sentRows.length}</span>{' '}
                {sentRows.length === 1 ? 'point' : 'points'} with the client
                {lastSentAt && (
                  <span className="text-ds-ink-secondary"> · {daysAgoLabel(lastSentAt)}</span>
                )}
              </span>
              <ChevronRight className="ml-auto size-3.5 shrink-0 text-ds-ink-tertiary" aria-hidden="true" />
            </button>
          )}
        </div>

        {/* Documents: what feeds the analysis, plus the door to add more. */}
        <div className="border-t border-ds-hairline px-1.5 py-1.5">
          {(docs ?? []).slice(0, MAX_DOC_ROWS).map((doc) => (
            <button key={doc.id} type="button" className={rowClasses} onClick={goToDocuments}>
              <span className="min-w-0 truncate text-ds-ink">{doc.doc_label || doc.filename}</span>
              <span className="ml-auto shrink-0 text-ds-ink-secondary">
                {doc.status === 'summarizing'
                  ? 'analyzing...'
                  : CATEGORY_LABELS.get(doc.category) ?? doc.category}
              </span>
            </button>
          ))}
          {(docs?.length ?? 0) > MAX_DOC_ROWS && (
            <button type="button" className={rowClasses} onClick={goToDocuments}>
              <span className="text-ds-ink-secondary">
                and <span className="ds-tabular-nums">{docs!.length - MAX_DOC_ROWS}</span> more
              </span>
              <ChevronRight className="ml-auto size-3.5 shrink-0 text-ds-ink-tertiary" aria-hidden="true" />
            </button>
          )}
          <button type="button" className={rowClasses} onClick={goToDocuments}>
            <Plus className="size-3.5 shrink-0 text-ds-ink-secondary" aria-hidden="true" />
            <span className="text-ds-ink">Add a document</span>
            <span className="ml-auto text-ds-ink-secondary">analysis updates</span>
          </button>
        </div>

        {/* Footer: the way out, and the support escape hatch. */}
        <div className="flex items-center justify-between border-t border-ds-hairline px-1.5 py-1.5">
          <button
            type="button"
            className={cn(rowClasses, 'w-auto text-ds-ink-secondary hover:text-ds-ink')}
            onClick={() => {
              setOpen(false);
              navigate('/');
            }}
          >
            Other assessment
          </button>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label="Copy session id for support"
                onClick={copyId}
                className={cn(
                  'inline-flex size-7 items-center justify-center rounded-ds-control transition-colors duration-150 hover:bg-ds-fill-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ds-accent',
                  copied ? 'text-ds-green' : 'text-ds-ink-secondary',
                )}
              >
                {copied ? (
                  <Check className="size-3.5" aria-hidden="true" />
                ) : (
                  <Fingerprint className="size-3.5" aria-hidden="true" />
                )}
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              {copied ? 'Copied' : 'Copy session id for support'}
            </TooltipContent>
          </Tooltip>
        </div>
      </PopoverContent>
    </Popover>
  );
}
