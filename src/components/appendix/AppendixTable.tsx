import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ChevronDown, CircleSlash, Eye, EyeOff, FileText, Info, Link2, Network, Pencil } from 'lucide-react';
import {
  Select, SelectTrigger, SelectContent, SelectItem,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { displayReasoning } from '@/lib/appendix/rowReasoning';
import { statusDisplayLabel } from '@/lib/appendix/status';
import { rowTone, type RowTone } from '@/lib/appendix/conditionPolarity';
import { appendixMootRowIds, controlTypeFor, type ControlType } from '@/lib/appendix/controlType';
import { buildSourcePanelRows, type SourcePanelRow } from '@/lib/appendix/sources';
import type { RelatedParty, RelatedPartiesResult, Relationship } from '@/lib/appendix/relatedParties';
import type { AppendixRow, EditableField, SkeletonRow, Status } from '@/lib/appendix/types';

interface Props {
  rows: AppendixRow[];
  skeleton: SkeletonRow[];
  showSources: boolean;
  relatedParties: RelatedPartiesResult | null;
  onEdit?: (rowId: string, field: EditableField, value: string) => void;
  onToggleExclude?: (rowId: string, excluded: boolean) => void;
  /** Read-only render (e.g. the overview): the status shows as a static pill,
   *  and the Edit reasoning / visibility toggle are dropped. Editing happens
   *  by reopening the appendix step. */
  readOnly?: boolean;
  /** Rendered inside a wrapping card (the overview): drop the panel's own
   *  eyebrow + title + lede (the legend is kept), flatten the framed section
   *  boxes so it reads as card content, and let it fill the card width. */
  embedded?: boolean;
}

interface Section {
  sectionId: string;
  sectionTitle: string;
  items: SkeletonRow[];
}

// ---------------------------------------------------------------------------
// Three controls, so good/attention reads at a glance (see controlType.ts):
//   - GATE: a precondition met -> a single sage check in a round circle, no label.
//   - N/A: does not apply -> a grey slashed circle + "Not applicable" + reason.
//   - STATUS: a tested condition -> a colour-coded pill with a leading icon. A clean
//     outcome reads sage (good), a missing fact amber, a fired mismatch terracotta.
// Colour is driven by the row's tone (which already folds in polarity, and is the
// same engine the Word memo and the print/export read), so a favourable outcome reads
// sage even where the favourable result is technically "Triggered".
// Hexes match the approved design handoff (condition-status-model).
// ---------------------------------------------------------------------------

/**
 * The confirmation check. A checkmark is bottom-heavy at its vertex, so centring the
 * bounding box is not enough (the vertex still reads low). This path lifts the vertex
 * to y=15 in the 0..24 viewBox so it sits ON the circle's centre line, verified against
 * a crosshair (design handoff 57). Used for every check glyph on this screen: the gate
 * bolletje, the legend "Applicable" swatch, and the sage status pills.
 */
function CheckGlyph({ className, strokeWidth = 2, ...rest }: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="24"
      height="24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      {...rest}
    >
      <path d="M6 11.5L9.5 15L18 7" />
    </svg>
  );
}

// Lucide icons and CheckGlyph share this minimal shape so the plain-SVG check can
// stand in for a lucide icon on the sage rows.
type StatusIcon = React.ComponentType<{ className?: string; 'aria-hidden'?: boolean | 'true' | 'false' }>;

interface PillStyle { dot: string; pill: string; Icon: StatusIcon }

/** The colour-coded status pill: sage = clean/good, amber = facts missing, terra = risk. */
function statusPill(tone: RowTone, status: Status | null): PillStyle {
  if (!status) return { dot: 'bg-[#cfc9bd]', pill: 'border-border bg-card text-muted-foreground', Icon: Info };
  if (tone === 'risk') return { dot: 'bg-[#bf8a3c]', pill: 'border-[#ecdcb6] bg-[#fbf4e7] text-[#8a6a2a]', Icon: AlertTriangle };
  if (tone === 'caution') return { dot: 'bg-[#5c6f80]', pill: 'border-[#c7d1da] bg-[#e9edf0] text-[#4a5b6b]', Icon: Info };
  return { dot: 'bg-[#8f9866]', pill: 'border-[#d2d8b8] bg-[#eaedde] text-[#6f7850]', Icon: CheckGlyph };
}

/** The 7px left dot, matching the row's control so the left edge scans as good/attention. */
function rowDot(ctype: ControlType, status: Status | null, tone: RowTone): string {
  if (ctype === 'na') return 'bg-[#b3ad9f]';
  if (ctype === 'gate') {
    if (status === 'N/A' || status === 'Triggered') return 'bg-[#8f9866]';
    if (status === 'Insufficient information') return 'bg-[#5c6f80]';
    return 'bg-[#b3ad9f]';
  }
  return statusPill(tone, status).dot;
}

/**
 * The status control on a row: a Select whose trigger is rendered as a gate check,
 * an N/A circle, or a colour-coded pill. Every variant stays editable (the advisor
 * can override the AI), but only the pill carries a visible dropdown chevron; the
 * gate and N/A circles hide it ([&>svg]:hidden) so they read as plain bolletjes.
 */
export function StatusControl({
  rowId, ctype, status, tone, allowedStates, onChange, readOnly,
}: {
  rowId: string;
  ctype: ControlType;
  status: Status | null;
  tone: RowTone;
  allowedStates: Status[];
  onChange: (v: string) => void;
  readOnly?: boolean;
}) {
  // Read-only render: the exact same visual as the editable trigger, but as a
  // plain span with no Select wrapper and no dropdown affordance.
  if (readOnly) {
    if (ctype === 'gate') {
      const satisfied = status === 'N/A' || status === 'Triggered';
      const insufficient = status === 'Insufficient information';
      if (satisfied) {
        return (
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#8f9866]" title="Applicable">
            <CheckGlyph className="h-3.5 w-3.5 text-white" strokeWidth={2.4} aria-hidden />
          </span>
        );
      }
      if (insufficient) {
        return (
          <span className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full border-[1.5px] border-[#ecdcb6] bg-[#fbf4e7]">
              <Info className="h-3.5 w-3.5 text-[#8a6a2a]" aria-hidden />
            </span>
            <span className="text-[13px] text-[#8a6a2a]">Insufficient info</span>
          </span>
        );
      }
      return (
        <span className="flex items-center gap-2">
          <span className="h-6 w-6 rounded-full border-[1.5px] border-[#cfc9bd]" aria-hidden />
          <span className="text-[13px] text-[#8a8479]">{status === 'Not triggered' ? 'Not met' : 'Not set'}</span>
        </span>
      );
    }
    if (ctype === 'na') {
      return (
        <span className="inline-flex h-7 items-center gap-2 rounded-[8px] border border-border bg-[#f4f2ec] pl-2.5 pr-[11px] text-[13px] font-normal text-muted-foreground">
          <CircleSlash className="h-3.5 w-3.5 shrink-0 opacity-[0.85]" aria-hidden />
          <span>Not applicable</span>
        </span>
      );
    }
    const { pill: roPill, Icon: RoIcon } = statusPill(tone, status);
    return (
      <span className={cn('inline-flex h-7 items-center gap-2 rounded-[8px] border pl-2.5 pr-[11px] text-[13px] font-normal', roPill)}>
        <RoIcon className="h-3.5 w-3.5 shrink-0" aria-hidden />
        <span>{status ? statusDisplayLabel(status) : 'Not set'}</span>
      </span>
    );
  }

  const menu = (
    <SelectContent>
      {allowedStates.map((s) => (
        <SelectItem key={s} value={s} className="text-sm">{statusDisplayLabel(s)}</SelectItem>
      ))}
    </SelectContent>
  );
  // [&>span]:!flex is load-bearing: shadcn's SelectTrigger sets [&>span]:line-clamp-1
  // (for truncating SelectValue text), which forces our direct-child circle span to
  // display:-webkit-box and kills its flex centering, jamming the check into the top-
  // left corner. Forcing flex back restores align/justify-center so the check centres.
  const circleTrigger = 'h-auto w-auto gap-2 border-0 bg-transparent p-0 shadow-none [&>svg]:hidden [&>span]:!flex rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-ds-ink-tertiary focus-visible:ring-offset-2';

  if (ctype === 'gate') {
    const satisfied = status === 'N/A' || status === 'Triggered';
    const insufficient = status === 'Insufficient information';
    return (
      <Select value={status ?? undefined} onValueChange={onChange}>
        <SelectTrigger aria-label={`Status for ${rowId}`} className={circleTrigger}>
          {satisfied ? (
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#8f9866]" title="Applicable">
              <CheckGlyph className="h-3.5 w-3.5 text-white" strokeWidth={2.4} aria-hidden />
            </span>
          ) : insufficient ? (
            <span className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full border-[1.5px] border-[#c7d1da] bg-[#e9edf0]">
                <Info className="h-3.5 w-3.5 text-[#4a5b6b]" aria-hidden />
              </span>
              <span className="text-[13px] text-[#4a5b6b]">Insufficient info</span>
            </span>
          ) : (
            <span className="flex items-center gap-2">
              <span className="h-6 w-6 rounded-full border-[1.5px] border-[#cfc9bd]" aria-hidden />
              <span className="text-[13px] text-[#8a8479]">{status === 'Not triggered' ? 'Not met' : 'Set status'}</span>
            </span>
          )}
        </SelectTrigger>
        {menu}
      </Select>
    );
  }

  if (ctype === 'na') {
    // A quiet neutral pill on the same baseline as the status pills (not a stacked
    // circle-over-label), so N/A reads as "out of scope", clearly apart from a real
    // finding. It keeps the dropdown chevron, so the advisor can still override it.
    // The Select value is only bound when the STORED status really is N/A: a moot
    // row can carry a stale stored status (e.g. 'Not triggered' pre-regenerate)
    // while the pill reads "Not applicable", and a bound Select would swallow the
    // advisor re-selecting that same stored value as a no-op. Unbound, every pick
    // fires onChange and records the override.
    return (
      <Select value={status === 'N/A' ? status : undefined} onValueChange={onChange}>
        <SelectTrigger
          aria-label={`Status for ${rowId}`}
          className="h-7 w-auto gap-2 rounded-[8px] border border-border bg-[#f4f2ec] pl-2.5 pr-[11px] text-[13px] font-normal text-muted-foreground"
        >
          <CircleSlash className="h-3.5 w-3.5 shrink-0 opacity-[0.85]" aria-hidden />
          <span>Not applicable</span>
        </SelectTrigger>
        {menu}
      </Select>
    );
  }

  const { pill, Icon } = statusPill(tone, status);
  return (
    <Select value={status ?? undefined} onValueChange={onChange}>
      <SelectTrigger
        aria-label={`Status for ${rowId}`}
        className={cn('h-7 w-auto gap-2 rounded-[8px] border pl-2.5 pr-[11px] text-[13px] font-normal', pill)}
      >
        <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
        <span>{status ? statusDisplayLabel(status) : 'Set status'}</span>
      </SelectTrigger>
      {menu}
    </Select>
  );
}

function LegendItem({ swatch, term, hint }: { swatch: React.ReactNode; term: string; hint: string }) {
  return (
    <span className="flex items-center gap-1.5">
      {swatch}
      <span className="font-medium text-foreground">{term}</span>
      <span className="text-muted-foreground">{hint}</span>
    </span>
  );
}

/** The compact key under the lede: the five states an advisor will see, spelled out. */
function StatusLegend() {
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 rounded-[6px] border border-border bg-card px-4 py-3 text-[12.5px]">
      <LegendItem
        term="Applicable"
        hint="precondition met"
        swatch={
          <span className="flex h-4 w-4 items-center justify-center rounded-full bg-[#8f9866]">
            <CheckGlyph className="h-2.5 w-2.5 text-white" strokeWidth={3} aria-hidden />
          </span>
        }
      />
      <LegendItem term="Triggered" hint="risk identified" swatch={<span className="h-2 w-2 rounded-full bg-[#bf8a3c]" aria-hidden />} />
      <LegendItem term="Insufficient info" hint="facts missing" swatch={<span className="h-2 w-2 rounded-full bg-[#5c6f80]" aria-hidden />} />
      <LegendItem term="Not triggered" hint="no risk" swatch={<span className="h-2 w-2 rounded-full bg-[#8f9866]" aria-hidden />} />
      {/* Same wording as the row pill; "N/A" in the hint bridges to the Word
          export, which abbreviates. */}
      <LegendItem
        term="Not applicable"
        hint="N/A, does not apply"
        swatch={<CircleSlash className="h-4 w-4 text-[#b3ad9f]" aria-hidden />}
      />
    </div>
  );
}

/** Tag + tile styling per source-panel row kind (condition-footer-source-edit handoff). */
const SOURCE_TAGS: Record<SourcePanelRow['kind'], { label: string; cls: string }> = {
  on_file: { label: 'On file', cls: 'bg-[#eaedde] text-[#6f7850]' },
  missing: { label: 'Missing', cls: 'bg-[#fbf4e7] text-[#8a6a2a]' },
  derived: { label: 'Derived', cls: 'bg-[#f1efe9] text-muted-foreground' },
  internal: { label: 'Internal', cls: 'bg-[#f1efe9] text-muted-foreground' },
};

function SourceRowIcon({ kind }: { kind: SourcePanelRow['kind'] }) {
  if (kind === 'missing') return <AlertTriangle className="h-[15px] w-[15px]" aria-hidden />;
  if (kind === 'derived') return <Link2 className="h-[15px] w-[15px]" aria-hidden />;
  return <FileText className="h-[15px] w-[15px]" aria-hidden />;
}

/**
 * The reveal the "Source" chip opens under the rationale footer: a bordered
 * card of hairline-divided rows, each a 32px icon tile + document name over a
 * one-line note + a status tag. A Missing row renders in amber so what blocks
 * an "Insufficient info" outcome is the loudest thing in the panel.
 */
function SourcePanel({ rows }: { rows: SourcePanelRow[] }) {
  return (
    <div className="mt-3 max-w-[840px] overflow-hidden rounded-[8px] border border-border bg-[#fcfbf8]">
      {rows.length === 0 ? (
        <p className="px-3.5 py-3 text-xs text-muted-foreground">No sources recorded for this row.</p>
      ) : (
        rows.map((s, i) => (
          <div key={`${s.kind}-${i}`} className="flex items-start gap-3 border-b border-border px-3.5 py-3 last:border-b-0">
            <span
              className={cn(
                'flex h-8 w-8 shrink-0 items-center justify-center rounded-[7px] border',
                s.kind === 'missing'
                  ? 'border-[#ecdcb6] bg-[#fbf4e7] text-[#8a6a2a]'
                  : 'border-border bg-card text-muted-foreground',
              )}
            >
              <SourceRowIcon kind={s.kind} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] leading-[1.4] text-foreground">{s.name}</span>
              {s.note && (
                <span className={cn('mt-0.5 block text-xs leading-[1.45]', s.kind === 'missing' ? 'text-[#8a6a2a]' : 'text-muted-foreground')}>
                  {s.note}
                </span>
              )}
            </span>
            <span className={cn('self-center whitespace-nowrap rounded-full px-2 py-[3px] text-[10.5px] font-medium uppercase tracking-[0.04em]', SOURCE_TAGS[s.kind].cls)}>
              {SOURCE_TAGS[s.kind].label}
            </span>
          </div>
        ))
      )}
    </div>
  );
}

function pct(n: number | null): string {
  return n == null ? '?' : `${Number.isInteger(n) ? n : n.toFixed(2)}%`;
}

/** One dense, single-line associated-enterprise row. */
function AssociationRow({ p }: { p: RelatedParty }) {
  const reverse = p.meetsReverse === true;
  const associated = p.meetsRelated === true;
  const dot = reverse ? 'bg-ds-ink' : associated ? 'bg-ds-ink-secondary' : 'bg-muted-foreground/30';
  return (
    <div className="flex items-center gap-1.5 py-1 text-xs leading-tight">
      <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', dot)} aria-hidden />
      <span className={cn('truncate', associated ? 'font-normal text-foreground' : 'text-muted-foreground')} title={p.name}>
        {p.name}
      </span>
      {p.jurisdiction && <span className="shrink-0 text-[10px] uppercase text-muted-foreground">{p.jurisdiction}</span>}
      <span className="flex-1" />
      <span className="shrink-0 tabular-nums text-muted-foreground">{pct(p.ownershipPct)}</span>
      {reverse && <span className="shrink-0 text-[10px] font-normal text-ds-ink-secondary">&ge;50%</span>}
    </div>
  );
}

const GROUPS: { key: Relationship; label: string }[] = [
  { key: 'Parent', label: 'Shareholders' },
  { key: 'Subsidiary', label: 'Subsidiaries' },
  { key: 'Group entity', label: 'Other group' },
];

function AssocLegendDot({ dot, label }: { dot: string; label: string }) {
  return (
    <span className="flex items-center gap-1">
      <span className={cn('h-1.5 w-1.5 rounded-full', dot)} aria-hidden />
      {label}
    </span>
  );
}

/** Full-width, dense association panel shown under the relatedness row. */
function AssociationPanel({ data }: { data: RelatedPartiesResult | null }) {
  if (!data) return <p className="text-xs text-muted-foreground">Structure chart not available.</p>;
  if (!data.parties.length) return <p className="text-xs text-muted-foreground">No related parties found in the structure chart.</p>;
  return (
    <div className="rounded-md border border-ds-hairline bg-ds-fill-muted p-2.5">
      <div className="mb-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="flex items-center gap-1.5 text-xs font-normal text-foreground">
          <Network className="h-3.5 w-3.5 text-ds-ink-secondary" />
          Associated enterprises{data.taxpayerName ? ` of ${data.taxpayerName}` : ''}
        </span>
        <span className="text-[10px] text-muted-foreground">art. 12ac, &gt;25% test</span>
        <span className="flex-1" />
        <span className="flex items-center gap-2.5 text-[10px] text-muted-foreground">
          <AssocLegendDot dot="bg-ds-ink" label="≥50%" />
          <AssocLegendDot dot="bg-ds-ink-secondary" label=">25% associated" />
          <AssocLegendDot dot="bg-muted-foreground/30" label="below" />
        </span>
      </div>
      <div className="grid gap-x-5 gap-y-2 sm:grid-cols-3">
        {GROUPS.map((g) => {
          const items = data.parties.filter((p) => p.relationship === g.key);
          if (!items.length) return null;
          return (
            <div key={g.key}>
              <p className="mb-0.5 text-[10px] font-normal uppercase tracking-wide text-muted-foreground/80">{g.label}</p>
              <div className="divide-y divide-[hsl(var(--border-subtle))]">
                {items.map((p) => <AssociationRow key={p.id} p={p} />)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * "Visible to client" as a real on/off toggle. On: sage track, open eye,
 * "Visible to client" in sage. Off: grey track, crossed eye, "Hidden from
 * client" in muted. Track, knob, label and icon all swap together.
 */
function VisibleToggle({ rowId, excluded, onToggle }: { rowId: string; excluded: boolean; onToggle: (excluded: boolean) => void }) {
  const visible = !excluded;
  const EyeIcon = visible ? Eye : EyeOff;
  return (
    <label className="ml-auto flex cursor-pointer items-center gap-[9px] text-[12.5px]">
      <EyeIcon className={cn('h-[15px] w-[15px]', visible ? 'text-[#6f7850]' : 'text-muted-foreground')} aria-hidden />
      <span className={cn(visible ? 'text-[#6f7850]' : 'text-muted-foreground')}>
        {visible ? 'Visible to client' : 'Hidden from client'}
      </span>
      <Switch
        size="sm"
        checked={visible}
        onCheckedChange={(v) => onToggle(!v)}
        aria-label={visible ? `Hide ${rowId} from the client export` : `Show ${rowId} in the client export`}
        className="data-[state=checked]:bg-[#8f9866] data-[state=unchecked]:bg-[#cfc9bd]"
      />
    </label>
  );
}

/**
 * The expanded body under a condition row: the article kicker, the rationale,
 * and one footer row with the three per-row tools (condition-footer-source-edit
 * handoff): Source chip + Edit reasoning on the left, the visibility toggle
 * pushed right, and the source panel revealed below the footer.
 *
 * Edit reasoning swaps the paragraph for an auto-growing textarea styled as an
 * inline-editable field (white card, terracotta focus ring, caret at the end)
 * and turns itself into a sage "Done". Clicking Done, or anywhere outside the
 * field, commits the edit; onMouseDown preventDefault keeps the textarea's blur
 * from firing first, so Done never re-opens the editor it just closed. The
 * Source chip prevents the blur the same way: the panel and the editor are
 * independent, so peeking at the sources never closes an edit in progress.
 */
export function RowDetail({
  sk, row, reasoning, finding, excluded, showSources, ctype, mootSet, sourcesOpen, onToggleSources, onEdit, onToggleExclude, readOnly, bare,
}: {
  sk: SkeletonRow;
  row: AppendixRow;
  reasoning: string;
  finding: boolean;
  excluded: boolean;
  showSources: boolean;
  ctype: ControlType;
  mootSet: ReadonlySet<string>;
  sourcesOpen: boolean;
  onToggleSources: () => void;
  onEdit?: (rowId: string, field: EditableField, value: string) => void;
  onToggleExclude?: (rowId: string, excluded: boolean) => void;
  readOnly?: boolean;
  /** Flush layout for the V2 detail panel (drops the inline left indent). */
  bare?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(reasoning);
  // The reasoning as it read when editing STARTED. Commit compares against this
  // snapshot, not the live prop: the background refine poll can land a refreshed
  // reasoning under an open editor, and an unchanged draft must then stay a
  // no-op instead of writing the pre-refine text back as an advisor edit.
  const baseline = useRef(reasoning);
  const ref = useRef<HTMLTextAreaElement>(null);

  // Auto-grow: no fixed height, no inner scrollbox.
  useEffect(() => {
    const el = ref.current;
    if (editing && el) {
      el.style.height = 'auto';
      el.style.height = `${el.scrollHeight}px`;
    }
  }, [editing, draft]);
  // Focus with the caret at the end when editing starts.
  useEffect(() => {
    const el = ref.current;
    if (editing && el) {
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    }
  }, [editing]);

  const commit = () => {
    setEditing(false);
    if (draft.trim() !== baseline.current.trim()) onEdit?.(sk.rowId, 'reasoning', draft.trim());
  };

  const panelRows = useMemo(() => buildSourcePanelRows(row, ctype, mootSet), [row, ctype, mootSet]);

  return (
    <div className={cn(bare ? 'pb-1' : 'pb-[18px] pl-16 pr-5')}>
      {sk.legalBasis && sk.legalBasis !== 'N/A' && (
        <div className="mb-1.5">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{sk.legalBasis}</span>
        </div>
      )}
      {editing ? (
        <textarea
          ref={ref}
          value={draft}
          rows={1}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          aria-label={`Reasoning for ${sk.rowId}`}
          className="w-full max-w-[840px] resize-none overflow-hidden rounded-[8px] border border-[#e3dfd6] bg-white px-3.5 py-3 text-sm leading-[1.65] text-foreground caret-[#c25c3c] shadow-[0_0_0_3px_rgba(194,92,60,0.10)] focus-visible:outline-none"
        />
      ) : (
        <p className={cn('max-w-[840px] text-sm leading-[1.65]', finding ? 'text-foreground/90' : 'text-muted-foreground')}>
          {reasoning || 'No reasoning recorded.'}
        </p>
      )}
      {(showSources || !readOnly) && (
        <div className="mt-[18px] flex max-w-[840px] items-center gap-3 border-t border-border pt-3.5">
          {showSources && (
            <button
              type="button"
              // preventDefault keeps the chip from stealing focus: the source
              // panel and the reasoning editor are independent (per the handoff
              // preview), so peeking at the sources must not blur-commit an edit.
              onMouseDown={(e) => e.preventDefault()}
              onClick={onToggleSources}
              aria-expanded={sourcesOpen}
              aria-label={`Sources for ${sk.rowId}`}
              className={cn(
                'inline-flex items-center gap-[7px] rounded-[7px] border px-[11px] py-[6px] text-[12.5px] transition-colors',
                sourcesOpen
                  ? 'border-[#cfc9bd] bg-[#f4f2ec] text-foreground'
                  : 'border-[#e3dfd6] bg-card text-muted-foreground hover:border-[#cfc9bd] hover:text-foreground',
              )}
            >
              <FileText className="h-3.5 w-3.5" aria-hidden />
              Source
            </button>
          )}
          {!readOnly && (
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => { if (editing) commit(); else { baseline.current = reasoning; setDraft(reasoning); setEditing(true); } }}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-[7px] border px-2.5 py-[6px] text-[12.5px] transition-colors',
                editing
                  ? 'border-[#d2d8b8] bg-[#eaedde] text-[#6f7850]'
                  : 'border-transparent text-muted-foreground hover:bg-[#f4f2ec] hover:text-foreground',
              )}
            >
              <Pencil className="h-3.5 w-3.5" aria-hidden />
              {editing ? 'Done' : 'Edit reasoning'}
            </button>
          )}
          {!readOnly && (
            <VisibleToggle rowId={sk.rowId} excluded={excluded} onToggle={(ex) => onToggleExclude?.(sk.rowId, ex)} />
          )}
        </div>
      )}
      {showSources && sourcesOpen && <SourcePanel rows={panelRows} />}
    </div>
  );
}

export function AppendixTable({ rows, skeleton, showSources, relatedParties, onEdit, onToggleExclude, readOnly, embedded }: Props) {
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

  // Findings (a fired condition or one still missing facts) start expanded so the
  // advisor reads them straight away; routine gates, clean tests and N/A rows start
  // collapsed and recede. N/A rows are never auto-expanded, even if a stale status
  // would otherwise read as a finding. Each row is still individually
  // expand/collapsible. Initialized once when rows first arrive so the background
  // refine poll never yanks rows open or shut while the advisor works.
  const [open, setOpen] = useState<Set<string>>(new Set());
  const initializedRef = useRef(false);
  useEffect(() => {
    if (initializedRef.current || rows.length === 0) return;
    initializedRef.current = true;
    setOpen(new Set(
      rows.filter((r) => {
        // Only a substantive condition (a status control) opens on its own; gates
        // and N/A rows stay quiet and collapsed.
        if (controlTypeFor(r, mootSet) !== 'status') return false;
        const t = rowTone(r.status, r.rowId);
        return t === 'risk' || t === 'caution';
      }).map((r) => r.rowId),
    ));
  }, [rows, mootSet]);
  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // Which rows have their source panel open. Lifted out of RowDetail so an open
  // panel (and its active chip) survives collapsing and re-expanding the row,
  // matching the handoff preview, which only hides the detail with CSS.
  const [openSources, setOpenSources] = useState<Set<string>>(new Set());
  const toggleSources = (id: string) =>
    setOpenSources((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className={cn('space-y-6', !embedded && 'mx-auto max-w-5xl')}>
      {embedded ? (
        <StatusLegend />
      ) : (
        <header>
          <p className="text-[11px] font-normal uppercase tracking-[0.16em] text-muted-foreground">Appendix · Part B</p>
          <h2 className="mt-2 text-2xl font-normal tracking-tight text-foreground sm:text-3xl">Condition assessment</h2>
          <p className="mt-2 max-w-2xl text-[15px] text-muted-foreground">
            Each ATAD2 condition tested against the facts. Preconditions are confirmed with a check, substantive conditions carry a colour-coded finding, and conditions that do not apply are marked N/A.
          </p>
          <div className="mt-4">
            <StatusLegend />
          </div>
        </header>
      )}

      <div className="space-y-8">
      {sections.map((sec) => (
        <section key={sec.sectionId}>
          <div className="mb-2.5">
            <p className="text-[11px] font-normal uppercase tracking-[0.14em] text-muted-foreground">Section {sec.sectionId}</p>
            <h3 className="mt-0.5 text-base font-medium text-foreground">{sec.sectionTitle}</h3>
          </div>
          <div className={cn('divide-y divide-border', !embedded && 'overflow-hidden rounded-[4px] border border-border bg-card')}>
            {sec.items.map((sk) => {
              const row = byId.get(sk.rowId)!;
              const excluded = row.excludedFromClient;
              const reasoning = displayReasoning(row, mootSet);
              const ctype = controlTypeFor(row, mootSet);
              const tone = rowTone(row.status, sk.rowId);
              const expanded = open.has(sk.rowId);
              // Only a substantive finding (a fired mismatch or a missing fact) is
              // prominent; gates, clean tests and N/A rows recede.
              const finding = ctype === 'status' && (tone === 'risk' || tone === 'caution');

              return (
                <Fragment key={sk.rowId}>
                  <div className={cn('transition-colors hover:bg-accent/40', excluded && 'opacity-55')}>
                    {/* Header: dot + number | title (toggle) | status control + chevron.
                        The title and chevron toggle the row; the status control sits
                        outside the toggle so clicking it opens the status menu. */}
                    <div className="flex items-start gap-3 px-5 py-[15px]">
                      <button
                        type="button"
                        onClick={() => toggle(sk.rowId)}
                        aria-expanded={expanded}
                        aria-label={expanded ? `Collapse ${sk.rowId}` : `Expand ${sk.rowId}`}
                        className="flex min-w-0 flex-1 items-start gap-1 text-left"
                      >
                        <span className="flex w-10 shrink-0 items-center gap-1.5 pt-[3px]">
                          <span className={cn('h-[7px] w-[7px] shrink-0 rounded-full', rowDot(ctype, row.status, tone))} aria-hidden />
                          <span className="tabular-nums text-[11px] text-muted-foreground">{sk.rowId}</span>
                        </span>
                        <span
                          className={cn(
                            'min-w-0 flex-1 text-[15px] font-normal leading-snug',
                            finding ? 'text-foreground' : 'text-ds-ink-secondary',
                          )}
                        >
                          {sk.conditionTested}
                        </span>
                      </button>
                      <div className="flex shrink-0 items-center gap-1.5 pt-px">
                        {row.stale && (
                          <Badge variant="outline" className="mt-0.5 border-ds-hairline text-[10px] font-normal text-ds-ink-secondary">
                            review again
                          </Badge>
                        )}
                        {row.ungrounded && (
                          // F2: the model never returned this row (even after the
                          // coverage-retry). Show an explicit "not assessed" marker
                          // instead of letting a fallback / derived N/A read as a
                          // normal answer.
                          <Badge
                            variant="outline"
                            className="mt-0.5 border-ds-amber-text/40 text-[10px] font-normal text-ds-amber-text"
                            title="The model returned no grounded answer for this row. Regenerate or edit."
                          >
                            Not assessed
                          </Badge>
                        )}
                        <StatusControl
                          rowId={sk.rowId}
                          ctype={ctype}
                          status={row.status}
                          tone={tone}
                          allowedStates={sk.allowedStates}
                          onChange={(v) => onEdit?.(sk.rowId, 'status', v)}
                          readOnly={readOnly}
                        />
                        <button
                          type="button"
                          onClick={() => toggle(sk.rowId)}
                          aria-label={expanded ? `Collapse ${sk.rowId}` : `Expand ${sk.rowId}`}
                          className="inline-flex h-7 w-7 items-center justify-center rounded text-ds-ink-tertiary transition-colors hover:bg-muted hover:text-foreground"
                        >
                          <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', expanded && 'rotate-180')} />
                        </button>
                      </div>
                    </div>

                    {/* Body: article reference, reasoning, and the per-row tools,
                        separated from the rationale by a hairline. Only when expanded. */}
                    {expanded && (
                      <RowDetail
                        sk={sk}
                        row={row}
                        reasoning={reasoning}
                        finding={finding}
                        excluded={excluded}
                        showSources={showSources}
                        ctype={ctype}
                        mootSet={mootSet}
                        sourcesOpen={openSources.has(sk.rowId)}
                        onToggleSources={() => toggleSources(sk.rowId)}
                        onEdit={onEdit}
                        onToggleExclude={onToggleExclude}
                        readOnly={readOnly}
                      />
                    )}
                  </div>
                  {sk.relatedView === 'inline' && relatedParties && (
                    <div className={cn('px-5 py-4', excluded && 'opacity-55')}>
                      <AssociationPanel data={relatedParties} />
                    </div>
                  )}
                </Fragment>
              );
            })}
          </div>
        </section>
      ))}
      </div>
    </div>
  );
}
