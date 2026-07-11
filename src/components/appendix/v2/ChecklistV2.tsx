import { useMemo, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import type { AppendixRow, EditableField, SkeletonRow } from '@/lib/appendix/types';
import { cleanReasoning } from '@/lib/appendix/reasoningText';
import { statusDisplayLabel } from '@/lib/appendix/status';
import { rowTone } from '@/lib/appendix/conditionPolarity';
import { controlTypeFor, appendixMootRowIds } from '@/lib/appendix/controlType';
import { StatusControl, RowDetail } from '@/components/appendix/AppendixTable';
import { partBDigest, conditionNeedsAttention, sectionWorstStatus } from '@/lib/appendix/needsAttention';
import { AppendixDigest } from './AppendixDigest';
import { SectionRow } from './SectionRow';
import { RolledUpGroup } from './RolledUpGroup';
import { DetailPanel } from './DetailPanel';
import { InfoPopover } from './InfoPopover';
import { useAppendixSelection, useRowListKeyNav, useSectionOpenState } from './hooks';

interface Props {
  rows: AppendixRow[];
  skeleton: SkeletonRow[];
  onEdit?: (rowId: string, field: EditableField, value: string) => void;
  onToggleExclude?: (rowId: string, excluded: boolean) => void;
  sessionId?: string;
}

interface Section { sectionId: string; sectionTitle: string; items: SkeletonRow[]; }

const DIGEST_INFO = (
  <div className="space-y-1.5">
    <p className="font-medium text-foreground">Status key</p>
    <p><span className="text-brand-sage-deep">Not triggered / N/A</span>, no risk or out of scope.</p>
    <p><span className="text-[#4a5b6b]">Insufficient info</span>, a fact is missing.</p>
    <p><span className="text-[#8a6a2a]">Triggered</span>, a condition fires; review it.</p>
  </div>
);

function dotColor(tone: ReturnType<typeof rowTone>): string {
  return tone === 'risk' ? '#bf8a3c' : tone === 'caution' ? '#5c6f80' : tone === 'na' ? '#b3ad9f' : '#8f9866';
}

/**
 * Part B (spec §6): the condition checklist as resting-state sections. Each skeleton
 * section is a SectionRow showing its worst status; triggered / insufficient / not-
 * assessed conditions stay visible, the rest roll up. The reasoning, Source panel and
 * visibility toggle move into the one detail panel (reusing the tested RowDetail); the
 * editable status pill stays on the row. The six-part legend is gone (see the digest (i)).
 */
export function ChecklistV2({ rows, skeleton, onEdit, onToggleExclude, sessionId }: Props) {
  const byId = useMemo(() => new Map(rows.map((r) => [r.rowId, r])), [rows]);
  const mootSet = useMemo(() => appendixMootRowIds(rows.map((r) => ({ rowId: r.rowId, status: r.status }))), [rows]);
  const digest = useMemo(() => partBDigest(rows), [rows]);

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

  // Section open defaults: sections with a flagged condition open, verified collapsed.
  const sectionDefaults: Record<string, boolean> = {};
  for (const sec of sections) {
    sectionDefaults[sec.sectionId] = sec.items.some((sk) => {
      const r = byId.get(sk.rowId); return r ? conditionNeedsAttention(r, mootSet) : false;
    });
  }
  const sectionState = useSectionOpenState(sessionId ? `checklist:${sessionId}` : undefined, sectionDefaults);

  const selectedRow = selectedId ? byId.get(selectedId) ?? null : null;
  const selectedSk = selectedId ? skeleton.find((s) => s.rowId === selectedId) ?? null : null;
  const panelOpen = !!(selectedRow && selectedSk);

  const jumpToFirstFlagged = () => {
    for (const sec of sections) {
      const hit = sec.items.find((sk) => { const r = byId.get(sk.rowId); return r && conditionNeedsAttention(r, mootSet); });
      if (hit) {
        sectionState.setOpen(sec.sectionId, true);
        requestAnimationFrame(() => document.getElementById(`v2-cond-${hit.rowId}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }));
        return;
      }
    }
  };

  const renderRow = (sk: SkeletonRow) => {
    const row = byId.get(sk.rowId)!;
    const ctype = controlTypeFor(row, mootSet);
    const tone = rowTone(row.status, sk.rowId);
    const selected = selectedId === sk.rowId;
    return (
      <div
        key={sk.rowId}
        id={`v2-cond-${sk.rowId}`}
        data-appendix-row
        role="button"
        tabIndex={0}
        aria-pressed={selected}
        onClick={() => select(sk.rowId)}
        onKeyDown={(ev) => { if (ev.currentTarget === ev.target && (ev.key === 'Enter' || ev.key === ' ')) { ev.preventDefault(); select(sk.rowId); } }}
        className={cn(
          'group flex cursor-pointer items-start gap-3 border-b border-border py-2.5 pr-2 transition-colors hover:bg-accent focus:bg-accent focus:outline-none',
          selected ? 'border-l-2 border-l-ds-ink bg-ds-fill-muted pl-[10px]' : 'border-l-2 border-l-transparent pl-3',
          row.excludedFromClient && 'opacity-55',
        )}
      >
        <span className="flex w-9 shrink-0 items-center gap-1.5 pt-[3px]">
          <span className="h-[7px] w-[7px] shrink-0 rounded-full" style={{ backgroundColor: dotColor(tone) }} aria-hidden />
          <span className="tabular-nums text-[11px] text-muted-foreground">{sk.rowId}</span>
        </span>
        <span className="min-w-0 flex-1 pt-px text-[14px] leading-snug text-foreground">{sk.conditionTested}</span>
        {/* Handlers only stop propagation to the row; StatusControl inside is the interactive element. */}
        {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions */}
        <span className="shrink-0" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
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
      <div className="flex items-center gap-2">
        <div className="flex-1">
          <AppendixDigest
            counts={[`${digest.conditions} conditions`]}
            needReview={digest.needReview}
            onNeedReviewClick={jumpToFirstFlagged}
          />
        </div>
        {/* The removed six-part legend lives here on demand (spec §8). */}
        <InfoPopover label="Status key">{DIGEST_INFO}</InfoPopover>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="min-w-0 space-y-4">
          {sections.map((sec) => {
            const flagged = sec.items.filter((sk) => { const r = byId.get(sk.rowId); return r && conditionNeedsAttention(r, mootSet); });
            const routine = sec.items.filter((sk) => !flagged.includes(sk));
            const worst = sectionWorstStatus(sec.items.map((sk) => byId.get(sk.rowId)!), mootSet);
            return (
              <SectionRow
                key={sec.sectionId}
                id={`v2-section-cond-${sec.sectionId}`}
                index={sec.sectionId}
                title={sec.sectionTitle}
                summary={worst ? statusDisplayLabel(worst) : `${sec.items.length} conditions`}
                needReview={flagged.length}
                verifiedLabel="Complete"
                open={sectionState.isOpen(sec.sectionId)}
                onToggle={() => sectionState.setOpen(sec.sectionId, !sectionState.isOpen(sec.sectionId))}
              >
                {/* Arrow-key delegation for the focusable rows inside; not interactive itself. */}
                {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions */}
                <div onKeyDown={onListKeyDown}>
                  {flagged.map(renderRow)}
                  {routine.length > 0 && (
                    <RolledUpGroup summary={`${routine.length} ${routine.length === 1 ? 'condition' : 'conditions'} · no action needed`}>
                      {routine.map(renderRow)}
                    </RolledUpGroup>
                  )}
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
