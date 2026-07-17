import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AppendixRow, EditableField, SkeletonRow } from '@/lib/appendix/types';
import { cleanReasoning } from '@/lib/appendix/reasoningText';
import { statusDisplayLabel } from '@/lib/appendix/status';
import { rowTone } from '@/lib/appendix/conditionPolarity';
import { controlTypeFor, appendixMootRowIds } from '@/lib/appendix/controlType';
import { StatusControl, RowDetail } from '@/components/appendix/AppendixTable';
import { conditionNeedsAttention, conditionReviewPending, sectionWorstStatus } from '@/lib/appendix/needsAttention';
import { SectionRow } from './SectionRow';
import { DetailPanel } from './DetailPanel';
import { InfoPopover } from './InfoPopover';
import { useAppendixSelection, useRowListKeyNav, useSectionOpenState } from './hooks';

interface Props {
  rows: AppendixRow[];
  skeleton: SkeletonRow[];
  onEdit?: (rowId: string, field: EditableField, value: string) => void;
  onToggleExclude?: (rowId: string, excluded: boolean) => void;
  onToggleReviewed?: (rowId: string, reviewed: boolean) => void;
  sessionId?: string;
  /**
   * Hands the parent a "jump to the first pending condition" action (the footer's
   * Review next button): opens its section, selects the row and scrolls to it.
   * Called with null on unmount. Mirrors FactsPanelV2.
   */
  registerReviewNext?: (fn: (() => void) | null) => void;
}

interface Section { sectionId: string; sectionTitle: string; items: SkeletonRow[]; }

const DIGEST_INFO = (
  <div className="space-y-1.5">
    <p className="font-medium text-foreground">Status key</p>
    <p><span className="text-ds-green-text">Not triggered / N/A</span>, no risk or out of scope.</p>
    <p><span className="text-[#4a5b6b]">Insufficient info</span>, a fact is missing.</p>
    <p><span className="text-[#8a6a2a]">Triggered</span>, a condition fires; review it.</p>
  </div>
);

function dotColor(tone: ReturnType<typeof rowTone>): string {
  return tone === 'risk' ? '#bf8a3c' : tone === 'caution' ? '#5c6f80' : tone === 'na' ? '#b3ad9f' : '#8f9866';
}

/**
 * Part B (spec §6): the condition checklist as resting-state sections. Each skeleton
 * section is a SectionRow showing its worst status; opening a section shows all of
 * its conditions directly (no roll-up). The reasoning, Source panel and
 * visibility toggle move into the one detail panel (reusing the tested RowDetail); the
 * editable status pill stays on the row, and a flagged row carries its own
 * "Mark reviewed" sign-off (the confirm gate counts these, see confirmGuard).
 * The six-part legend is gone (see the (i) status key).
 */
export function ChecklistV2({ rows, skeleton, onEdit, onToggleExclude, onToggleReviewed, sessionId, registerReviewNext }: Props) {
  const byId = useMemo(() => new Map(rows.map((r) => [r.rowId, r])), [rows]);
  const mootSet = useMemo(() => appendixMootRowIds(rows.map((r) => ({ rowId: r.rowId, status: r.status }))), [rows]);

  const sections = useMemo<Section[]>(() => {
    const out: Section[] = [];
    for (const sk of skeleton) {
      if (!byId.has(sk.rowId)) continue;
      let s = out.find((x) => x.sectionId === sk.sectionId);
      if (!s) { s = { sectionId: sk.sectionId, sectionTitle: sk.sectionTitle, items: [] }; out.push(s); }
      s.items.push(sk);
    }
    return out;
  }, [byId, skeleton]);

  const { selectedId, select, close } = useAppendixSelection();
  const onListKeyDown = useRowListKeyNav();
  const [openSources, setOpenSources] = useState<Set<string>>(new Set());
  const toggleSources = (id: string) => setOpenSources((prev) => {
    const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n;
  });

  // Sections start open: the advisor reads the checklist top to bottom; review
  // state lives on the rows and in the footer, not in collapsed sections.
  const sectionDefaults: Record<string, boolean> = {};
  for (const sec of sections) sectionDefaults[sec.sectionId] = true;
  const sectionState = useSectionOpenState(sessionId ? `checklist:${sessionId}` : undefined, sectionDefaults);

  // The footer's "Review next": open the section of the first pending condition,
  // select it (its panel opens) and scroll it into view.
  useEffect(() => {
    if (!registerReviewNext) return;
    registerReviewNext(() => {
      const first = skeleton.find((sk) => {
        const r = byId.get(sk.rowId);
        return r ? conditionReviewPending(r, mootSet) : false;
      });
      if (!first) return;
      sectionState.setOpen(first.sectionId, true);
      select(first.rowId);
      requestAnimationFrame(() => document.getElementById(`v2-cond-${first.rowId}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }));
    });
    return () => registerReviewNext(null);
  });

  const selectedRow = selectedId ? byId.get(selectedId) ?? null : null;
  const selectedSk = selectedId ? skeleton.find((s) => s.rowId === selectedId) ?? null : null;
  const panelOpen = !!(selectedRow && selectedSk);

  const renderRow = (sk: SkeletonRow) => {
    const row = byId.get(sk.rowId)!;
    const ctype = controlTypeFor(row, mootSet);
    const tone = rowTone(row.status, sk.rowId);
    const selected = selectedId === sk.rowId;
    // A flagged condition carries its own review control: "Mark reviewed" signs
    // off the status as it stands (including deliberately keeping "Insufficient
    // info"); a reviewed row shows a quiet undoable check.
    const flagged = !row.excludedFromClient && conditionNeedsAttention(row, mootSet);
    // Outer div is layout only; the label area is the row's button and the
    // StatusControl is a sibling, so no interactive control nests in another.
    return (
      <div
        key={sk.rowId}
        id={`v2-cond-${sk.rowId}`}
        className={cn(
          'group flex items-start gap-3 border-b border-border pr-2 transition-colors hover:bg-accent focus-within:bg-accent',
          selected ? 'border-l-2 border-l-ds-ink bg-ds-fill-muted pl-[10px]' : 'border-l-2 border-l-transparent pl-3',
          row.excludedFromClient && 'opacity-55',
        )}
      >
        <div
          data-appendix-row
          role="button"
          tabIndex={0}
          aria-pressed={selected}
          onClick={() => select(sk.rowId)}
          onKeyDown={(ev) => { if (ev.currentTarget === ev.target && (ev.key === 'Enter' || ev.key === ' ')) { ev.preventDefault(); select(sk.rowId); } }}
          className="flex min-w-0 flex-1 cursor-pointer items-start gap-3 py-2.5 focus:outline-none"
        >
          <span className="flex w-9 shrink-0 items-center gap-1.5 pt-[3px]">
            <span className="h-[7px] w-[7px] shrink-0 rounded-full" style={{ backgroundColor: dotColor(tone) }} aria-hidden />
            <span className="tabular-nums text-[11px] text-muted-foreground">{sk.rowId}</span>
          </span>
          <span className="min-w-0 flex-1 pt-px text-[14px] leading-snug text-foreground">{sk.conditionTested}</span>
        </div>
        {flagged && (
          row.reviewed ? (
            <button
              type="button"
              onClick={() => onToggleReviewed?.(sk.rowId, false)}
              onKeyDown={(e) => e.stopPropagation()}
              aria-label={`Undo review for ${sk.rowId}`}
              title="Reviewed. Click to undo."
              className="inline-flex shrink-0 items-center gap-1.5 self-center rounded-[7px] px-2 py-[5px] text-[12px] text-ds-green-text transition-colors hover:bg-[#f4f2ec]"
            >
              <Check className="h-3.5 w-3.5 text-brand-sage-deep" aria-hidden />
              Reviewed
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onToggleReviewed?.(sk.rowId, true)}
              onKeyDown={(e) => e.stopPropagation()}
              aria-label={`Mark ${sk.rowId} reviewed`}
              title="Confirm this condition was reviewed and its status stands"
              className="inline-flex shrink-0 items-center gap-1.5 self-center rounded-[7px] border border-[#e3dfd6] bg-card px-2.5 py-[5px] text-[12px] font-medium text-ds-ink-secondary transition-colors hover:border-[#cfc9bd] hover:text-foreground"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-brand-terracotta" aria-hidden />
              Mark reviewed
            </button>
          )
        )}
        {/* Keydown only stops the arrow-key list delegation from hijacking the control. */}
        {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions */}
        <span className="shrink-0 self-center" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
          <StatusControl
            rowId={sk.rowId}
            ctype={ctype}
            status={row.status}
            tone={tone}
            allowedStates={sk.allowedStates}
            onChange={(v) => onEdit?.(sk.rowId, 'status', v)}
          />
        </span>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* No counters up here (the review progress lives next to Confirm appendix);
          only the status key stays, on demand behind the (i). */}
      <div className="flex items-center justify-end">
        <InfoPopover label="Status key">{DIGEST_INFO}</InfoPopover>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="min-w-0 space-y-4">
          {sections.map((sec) => {
            const pending = sec.items.filter((sk) => { const r = byId.get(sk.rowId); return r && conditionReviewPending(r, mootSet); });
            const worst = sectionWorstStatus(sec.items.map((sk) => byId.get(sk.rowId)!), mootSet);
            return (
              <SectionRow
                key={sec.sectionId}
                id={`v2-section-cond-${sec.sectionId}`}
                index={sec.sectionId}
                title={sec.sectionTitle}
                summary={worst ? statusDisplayLabel(worst) : `${sec.items.length} conditions`}
                needReview={pending.length}
                verifiedLabel="Complete"
                open={sectionState.isOpen(sec.sectionId)}
                onToggle={() => sectionState.setOpen(sec.sectionId, !sectionState.isOpen(sec.sectionId))}
              >
                {/* Arrow-key delegation for the focusable rows inside; not interactive itself. */}
                {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions */}
                <div onKeyDown={onListKeyDown}>
                  {sec.items.map(renderRow)}
                </div>
              </SectionRow>
            );
          })}
        </div>

        <DetailPanel
          open={panelOpen}
          onClose={close}
          eyebrow={selectedSk?.legalBasis && selectedSk.legalBasis !== 'N/A' ? selectedSk.legalBasis : selectedSk ? `Row ${selectedSk.rowId}` : undefined}
          title={selectedSk?.conditionTested}
        >
          {selectedRow && selectedSk && (() => {
            const ctype = controlTypeFor(selectedRow, mootSet);
            const tone = rowTone(selectedRow.status, selectedSk.rowId);
            const finding = ctype === 'status' && (tone === 'risk' || tone === 'caution');
            return (
              <RowDetail
                sk={selectedSk}
                row={selectedRow}
                reasoning={cleanReasoning(selectedRow.reasoning)}
                finding={finding}
                excluded={selectedRow.excludedFromClient}
                showSources
                ctype={ctype}
                mootSet={mootSet}
                sourcesOpen={openSources.has(selectedSk.rowId)}
                onToggleSources={() => toggleSources(selectedSk.rowId)}
                onEdit={onEdit}
                onToggleExclude={onToggleExclude}
                bare
              />
            );
          })()}
        </DetailPanel>
      </div>
    </div>
  );
}
