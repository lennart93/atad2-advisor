import { Fragment, useState } from 'react';
import type { ReactNode } from 'react';
import { AlertTriangle, Check, ChevronDown, ChevronRight, ChevronUp, Eye, EyeOff, Plus, Trash2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AppendixFacts, FactEntity, AppendixSectionKey, QuadState, TransactionItem } from '@/lib/appendix/types';
import { visibleFacts } from '@/lib/appendix/facts/visibleFacts';
import { isSectionExcluded, withSectionExcluded } from '@/lib/appendix/facts/sections';
import {
  effJurisdiction, effNlTaxStatus, effNlQualification,
  effRelationType, effRelatedPct, effRelationReason, effNlReason, effLocalReason,
  withEntityEdit,
} from '@/lib/appendix/facts/entityFields';
import { nlQualificationLabel, nlTaxStatusLabel, NL_CLASSIFICATION_OPTIONS, type NlQualification } from '@/lib/appendix/facts/nlTaxStatus';
import { withLocalQualification, withForeignClassificationState, clearForeignClassification } from '@/lib/appendix/facts/classificationEdit';
import {
  addManualEntity, promoteToRelevant, removeFromRelevant, setHomeStateInline,
  effRelevanceOverride, effLocalNotRelevant, type HomeStateChoice,
} from '@/lib/appendix/facts/entitySet';
import { actingInClientReport } from '@/lib/appendix/facts/actingAnnex';
import { ActingTogetherSection } from '@/components/appendix/ActingTogetherSection';
import { effLocalQualification, entityHasQualificationDifference, dutchForeignClassification } from '@/lib/appendix/facts/conclusions';
import { relevantTransactions } from '@/lib/appendix/facts/relevance';
import {
  noRiskTransactions, effTxStatus, txStatusReason, txMemoReason, isTxStatusOverridden,
  isOpenState, effCharacteristic, TX_CHARACTERISTICS, stateOptions, stateLabel,
  withTxCharacteristic, withTxRationale, withTxStatusOverride, withTxField,
  type TxCharacteristicKey,
} from '@/lib/appendix/facts/transactionAssessment';
import { shortTransactionType } from '@/lib/appendix/facts/transactionCategory';
import { countryName } from '@/lib/structure/countries';
import { JurisdictionPicker } from '@/components/structure/JurisdictionPicker';
import { CountryFlag } from '@/components/CountryFlag';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';

interface Props {
  facts: AppendixFacts;
  onChange?: (next: AppendixFacts) => void;
  generated?: boolean;
  /** A generation/refine run is currently in flight, so an empty section reads as pending, not final. */
  refining?: boolean;
  /** Rendered inside a wrapping card (the overview): drop the panel's own
   *  eyebrow + title + lede, flatten the framed section boxes so it reads as
   *  card content instead of a card-in-a-card, and let it fill the card width. */
  embedded?: boolean;
}

// ---------------------------------------------------------------------------
// Immutable patch helpers
// ---------------------------------------------------------------------------

function withTransaction(
  facts: AppendixFacts,
  id: string,
  patch: Partial<AppendixFacts['transactions'][number]>,
): AppendixFacts {
  return {
    ...facts,
    transactions: facts.transactions.map((t) =>
      t.id === id ? { ...t, ...patch } : t,
    ),
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Editorial eyebrow, matched to the dashboard / report header rhythm (RULE 2).
const EYEBROW = 'text-[11px] font-normal uppercase tracking-[0.16em] text-muted-foreground';

// Typographic n/a marker. An en dash (not an em dash, RULE 0) reads as "no value"
// without the off-brand hyphen.
const NA = '–';

// One shared group-header rank inside the register / transaction tables: a caps
// eyebrow with a faint count/meta beside it (RULE 2). Used identically for THE
// TAXPAYER / RELATED AND RELEVANT / OTHER and the two transaction groups.
const GROUP_LABEL = 'text-[12px] font-medium uppercase tracking-[0.13em] text-muted-foreground';
const GROUP_META = 'text-[12px] text-muted-foreground/60';

// The relation-to-the-taxpayer vocabulary offered in the register detail. The
// value is stored as an advisor edit; the derived role keeps driving grouping.
const RELATION_TYPES = ['Subsidiary', 'Parent', 'Sister company', 'Associate', 'Branch / PE', 'Other'] as const;

// The inline "home-state classification required" control. Transparent /
// non-transparent record the foreign view; "to be determined" keeps it open; "not
// relevant" dismisses the flag when a hybrid analysis is not in play for the entity.
const HOME_STATE_INLINE_OPTIONS: ReadonlyArray<{ value: HomeStateChoice; label: string }> = [
  { value: 'transparent', label: 'Transparent' },
  { value: 'non-transparent', label: 'Non-transparent' },
  { value: 'undetermined', label: 'To be determined' },
  { value: 'not-relevant', label: 'Not relevant' },
];

/** "T4" / "T4 and T7" / "T4, T7 and T9": a readable id list for the alert copy. */
function joinIds(ids: string[]): string {
  if (ids.length <= 1) return ids[0] ?? '';
  return `${ids.slice(0, -1).join(', ')} and ${ids[ids.length - 1]}`;
}

function pct(n: number | null): string {
  return n == null ? NA : `${Number.isInteger(n) ? n : n.toFixed(2)}%`;
}

/** Jurisdiction display in the register: a small flag chip + the ISO code. */
function JurisFlagCode({ iso }: { iso: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <CountryFlag iso={iso} className="!h-[13px] !w-[18px] shadow-[0_0_0_1px_rgba(20,18,12,0.08)]" />
      <span className="text-[13.5px] uppercase tracking-[0.02em] tabular-nums text-foreground">{iso}</span>
    </span>
  );
}

/**
 * The arrow between two counterparties (and between their jurisdictions). A crisp
 * inline SVG reads cleaner than the bare "→" glyph, which sets unevenly in Neue
 * Haas. Decorative, so it carries the tertiary ink token; pass margin per context.
 */
function FlowArrow({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 23 10"
      width="21"
      height="9"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={cn('inline-block flex-none align-middle text-ds-ink-tertiary', className)}
    >
      <line x1="1" y1="5" x2="20" y2="5" />
      <path d="M16.5 1.5L21 5 16.5 8.5" />
    </svg>
  );
}

function nameOf(facts: AppendixFacts, id: string): string {
  return facts.entities.find((e) => e.id === id)?.name ?? id;
}

// The inline editors in the register detail (RULE: quiet white controls, a
// terracotta ring on focus). The select doubles as the classification control;
// a to-be-determined value flips it terracotta so an open item reads as one.
const EDIT_SELECT =
  'h-9 w-auto min-w-[176px] gap-3 rounded-md border-border bg-card px-3 text-[14px] font-normal text-foreground shadow-none transition-colors hover:border-ds-ink-tertiary focus:ring-0 focus:ring-offset-0 [&>span]:!flex';
const EDIT_SELECT_TODO =
  'border-brand-terracotta bg-brand-terracotta-soft text-brand-terracotta-deep hover:border-brand-terracotta';
const EDIT_FOCUS_RING = 'focus:border-brand-terracotta focus:shadow-[0_0_0_3px_rgba(194,92,60,0.12)]';

/**
 * The editable reasoning under a detail block: a quiet white textarea that holds
 * the AI/derived draft until the advisor rewrites it. Read-only contexts render
 * the same text as plain prose.
 */
function ReasonField({ value, editable, label, placeholder, onCommit }: {
  value: string | null; editable: boolean; label: string; placeholder?: string; onCommit?: (text: string) => void;
}) {
  if (!editable) {
    return value ? <p className="mt-2 max-w-[430px] text-[13px] leading-[1.55] text-[#4a463f]">{value}</p> : null;
  }
  return (
    <textarea
      value={value ?? ''}
      placeholder={placeholder}
      aria-label={label}
      rows={3}
      onChange={(ev) => onCommit?.(ev.target.value)}
      onClick={(ev) => ev.stopPropagation()}
      className={cn(
        'mt-2 block w-full resize-y rounded-md border border-border bg-card px-2.5 py-2 text-[13px] leading-[1.55] text-[#4a463f] outline-none transition-[border-color,box-shadow] placeholder:text-muted-foreground/60 hover:border-ds-ink-tertiary',
        EDIT_FOCUS_RING,
      )}
    />
  );
}

/** The number a % draft commits: null for empty, comma accepted as the decimal separator. */
function parsePct(raw: string): number | null | undefined {
  const trimmed = raw.trim();
  if (trimmed === '') return null;
  const n = Number(trimmed.replace(',', '.'));
  return Number.isFinite(n) ? n : undefined; // undefined = not committable yet
}

/**
 * The numeric interest editor in the relation line. Every committable keystroke
 * commits upward, which keeps the row's Related % cell live. When the value is
 * changed from outside (a background refine replaced the facts), the draft
 * re-seeds so the input never shows a number the register no longer holds.
 */
function PctInput({ value, onCommit }: { value: number | null; onCommit: (n: number | null) => void }) {
  const [draft, setDraft] = useState(value == null ? '' : String(value));
  const [seenValue, setSeenValue] = useState(value);
  if (value !== seenValue) {
    setSeenValue(value);
    const draftValue = parsePct(draft);
    if (draftValue !== value) setDraft(value == null ? '' : String(value));
  }
  return (
    <input
      value={draft}
      inputMode="decimal"
      aria-label="Direct interest percentage"
      onClick={(ev) => ev.stopPropagation()}
      onChange={(ev) => {
        const raw = ev.target.value;
        setDraft(raw);
        const n = parsePct(raw);
        if (n !== undefined) onCommit(n);
      }}
      className={cn(
        'w-14 rounded-md border border-border bg-card px-2 py-1.5 text-right text-[14px] tabular-nums text-foreground outline-none transition-[border-color,box-shadow] hover:border-ds-ink-tertiary',
        EDIT_FOCUS_RING,
      )}
    />
  );
}

/**
 * The labelled client-visibility switch (sage when on): switch position == state,
 * so in/out of the client report is never ambiguous.
 */
function VisibilitySwitch({ on, editable, title, note, onToggle }: {
  on: boolean; editable: boolean; title: string; note: string; onToggle: (on: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-3.5">
      <Switch
        checked={on}
        disabled={!editable}
        onCheckedChange={onToggle}
        aria-label={title}
        className="data-[state=checked]:bg-brand-sage data-[state=unchecked]:bg-[#dcd7cd]"
      />
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="text-[14px] text-foreground">{title}</span>
        <span className="text-[12.5px] leading-snug text-muted-foreground">{note}</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Small reusable control buttons
// ---------------------------------------------------------------------------

function ExcludeBtn({ excluded, onClick }: { excluded: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={excluded ? 'Include in client export' : 'Exclude from client export'}
      title={excluded ? 'Excluded from client export' : 'Visible to client'}
      onClick={onClick}
      className="inline-flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
    >
      {excluded ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
    </button>
  );
}

/**
 * Per-entity client-visibility toggle (the register "Client" column). Eye open in
 * sage = shown in the client report; eye-off = hidden (the row greys and the
 * entity is left out of the report). A plain indicator when not editable.
 */
function ClientEyeBtn({ hidden, editable, onToggle }: { hidden: boolean; editable: boolean; onToggle: () => void }) {
  const Icon = hidden ? EyeOff : Eye;
  if (!editable) {
    return (
      <span className="inline-flex h-6 w-6 items-center justify-center text-muted-foreground/50" aria-hidden>
        <Icon className="h-4 w-4" />
      </span>
    );
  }
  return (
    <button
      type="button"
      role="switch"
      aria-checked={!hidden}
      aria-label={hidden ? 'Show in the client report' : 'Hide from the client report'}
      title={hidden ? 'Hidden from the client report. Click to show.' : 'Shown in the client report. Click to hide.'}
      onClick={(e) => { e.stopPropagation(); onToggle(); }}
      className={cn(
        'inline-flex h-6 w-6 items-center justify-center rounded-[3px] transition-colors',
        hidden ? 'text-muted-foreground hover:bg-muted hover:text-foreground' : 'text-brand-sage-deep hover:bg-brand-sage-soft',
      )}
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}

/** One labelled block in the expanded row detail (uppercase eyebrow + content). */
function DetailBlock({ label, tag, children }: { label: string; tag?: string; children: ReactNode }) {
  return (
    <div>
      <p className="text-[10.5px] font-medium uppercase tracking-[0.11em] text-muted-foreground">
        {label}
        {tag && (
          <span className="ml-1.5 align-baseline text-[11px] font-normal normal-case tracking-normal text-muted-foreground/60">
            {tag}
          </span>
        )}
      </p>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

/** Quiet display text that swaps to its editor on click (register cells). */
function QuietCell({ display, editing, onStartEdit, children }: {
  display: ReactNode; editing: boolean; onStartEdit?: () => void; children: ReactNode;
}) {
  if (editing) return <>{children}</>;
  return (
    <button
      type="button"
      onClick={onStartEdit}
      disabled={!onStartEdit}
      className={cn('inline-flex max-w-full items-center gap-1.5 truncate text-left', onStartEdit && 'hover:underline decoration-dotted underline-offset-2')}
      title={onStartEdit ? 'Click to edit' : undefined}
    >
      {display}
    </button>
  );
}

/**
 * The derived NL qualification. "Transparent" gets a positive sage tint;
 * "non-transparent" is plain ink text (the common, unremarkable case); a
 * to-be-determined value is left to the caller as a quiet dash.
 */
function QualBadge({ q }: { q: NlQualification }) {
  if (q === 'transparent') {
    return (
      <span className="rounded-sm bg-brand-sage-soft px-1.5 py-0.5 text-[10.5px] font-normal text-brand-sage-deep">
        {nlQualificationLabel(q)}
      </span>
    );
  }
  return <span className="text-foreground">{nlQualificationLabel(q)}</span>;
}

// ---------------------------------------------------------------------------
// Section card (wizard-step card chrome: white panel + 3px terracotta letterhead)
// ---------------------------------------------------------------------------

function Exhibit({ number, title, count, defaultOpen = true, excluded = false, onToggleExcluded, embedded = false, children }: {
  number: number; title: string; count?: ReactNode; defaultOpen?: boolean;
  excluded?: boolean; onToggleExcluded?: () => void; embedded?: boolean; children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    // Embedded (overview): flat — no frame, no terracotta top, no inset — so it
    // reads as content inside the wrapping card. Sections are set apart by a
    // hairline instead of a nested card.
    <div className={cn(
      embedded
        ? 'border-t border-ds-hairline pt-6 first:border-t-0 first:pt-0'
        : 'rounded-sm border border-border border-t-[3px] border-t-brand-terracotta bg-card',
      excluded && 'opacity-60',
    )}>
      <div className={cn('group flex w-full items-center gap-3', embedded ? 'py-0.5' : 'px-6 py-4')}>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="flex flex-1 items-center gap-3 text-left"
        >
          <span className="text-[17px] tabular-nums text-muted-foreground/60">{number}</span>
          <span className="text-[17px] font-normal tracking-tight text-foreground">{title}</span>
          {count != null && <span className="text-[13px] text-muted-foreground">{count}</span>}
          {excluded && (
            <span className="rounded-sm bg-muted px-1.5 py-0.5 text-[10px] font-normal text-muted-foreground">
              excluded from client
            </span>
          )}
        </button>
        {onToggleExcluded && (
          <span className={cn('transition-opacity focus-within:opacity-100', excluded ? 'opacity-100' : 'opacity-0 group-hover:opacity-100')}>
            <ExcludeBtn excluded={excluded} onClick={onToggleExcluded} />
          </span>
        )}
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-label={open ? 'Collapse section' : 'Expand section'}
          className="text-muted-foreground transition-colors hover:text-foreground"
        >
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>
      </div>
      {open && <div className={cn(embedded ? 'pt-3' : 'px-6 pb-6')}>{children}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// FactsPanel
// ---------------------------------------------------------------------------

export function FactsPanel({ facts, onChange, generated, refining, embedded }: Props) {
  const shown = visibleFacts(facts);
  const editable = !!onChange;

  // The register "Client" column toggles the existing per-entity hidden flag: a
  // hidden entity stays in the table (greyed) and is left out of the client report.
  const toggleHidden = (id: string) =>
    onChange?.({ ...facts, entities: facts.entities.map((e) => e.id === id ? { ...e, hidden: !e.hidden } : e) });


  // Whole-section "leave out of the client export" toggle, mirroring the per-item
  // exclude. Editable only; the internal working copy still shows every section.
  const sectionProps = (key: AppendixSectionKey) => ({
    excluded: isSectionExcluded(facts, key),
    onToggleExcluded: editable
      ? () => onChange!(withSectionExcluded(facts, key, !isSectionExcluded(facts, key)))
      : undefined,
  });

  // Register row whose jurisdiction picker is open (the only click-to-open cell
  // left; the classification selects in the detail are always-visible controls).
  const [editCell, setEditCell] = useState<{ id: string; field: 'jurisdiction' } | null>(null);
  // Collapsed remainder of the master table (non-related, no mismatch).
  const [showAllEntities, setShowAllEntities] = useState(false);
  // The register row whose reasoning detail is expanded (one open at a time).
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const toggleRow = (id: string) => setExpandedRow((cur) => (cur === id ? null : id));
  // Dutch entity rows whose optional "foreign classification" block has been
  // opened by hand (a stored foreign classification also opens it, so this only
  // holds rows that are mid-add with nothing persisted yet).
  const [foreignOpen, setForeignOpen] = useState<Set<string>>(new Set());
  const openForeign = (id: string) => setForeignOpen((s) => new Set(s).add(id));
  const closeForeign = (id: string) =>
    setForeignOpen((s) => { const n = new Set(s); n.delete(id); return n; });
  // The transaction row whose reasoning detail is expanded (one open at a time).
  const [expandedTx, setExpandedTx] = useState<string | null>(null);
  const toggleTx = (id: string) => setExpandedTx((cur) => (cur === id ? null : id));
  // Whether the "assessed, no risk indicators" transactions group shows its rows.
  // Open by default: the spec frames it as a completeness record meant to be seen.
  const [showAssessed, setShowAssessed] = useState(true);
  // The "Add entity" form (promote from Other, or hand-add a new entity).
  const [addOpen, setAddOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newJur, setNewJur] = useState('');
  const [newQual, setNewQual] = useState<NlQualification>('undetermined');
  const resetAddForm = () => { setNewName(''); setNewJur(''); setNewQual('undetermined'); setAddOpen(false); };

  if (!shown.entities.length && !facts.entities.length) {
    return (
      <div className="rounded-md border border-dashed px-4 py-10 text-center">
        <p className="text-sm font-normal text-foreground">No entities yet</p>
        <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
          Part A is built automatically from the group structure in the uploaded documents.
          This assessment has no entities yet: the documents may still be processing, or none of
          them set out the group structure for the taxpayer. Add the documents that show the group
          structure and it will be prepared automatically.
        </p>
      </div>
    );
  }

  // ONE master table: every entity rendered once, grouped by relevance. The
  // related-parties and classification sections read derived flags from these
  // same rows instead of re-rendering the register.
  const isTaxpayerSide = (e: FactEntity) =>
    e.role === 'Taxpayer' || !!e.memberOfUnityId || !!e.inTaxpayerFiscalUnity;
  // The register table reads every entity (hidden ones render greyed, in place),
  // so its derived maps come from the full facts rather than the visible subset.
  const clsByEntity = new Map(facts.classifications.map((c) => [c.entityId, c]));
  const likelyMemberIds = new Set(
    facts.actingTogether.filter(actingInClientReport).flatMap((a) => a.memberEntityIds),
  );
  const relatedPctOf = effRelatedPct;
  const hasMismatch = (e: FactEntity) => entityHasQualificationDifference(e, clsByEntity.get(e.id));

  // The transactions table and the inline flags are the advisor's working surface
  // (each row carries its own client eye), so they read the full facts, not the
  // client-visible subset: an entity hidden from the client still shows greyed in
  // the register above, and its flows and open actions must not silently disappear.
  const relevantTx = relevantTransactions(facts);
  const assessedTx = noRiskTransactions(facts);
  const relevantPartyIds = new Set(relevantTx.flatMap((t) => [t.fromEntityId, t.toEntityId]));

  // A foreign party to a needs-assessment flow whose home-state (foreign)
  // classification is still unset: the hybrid analysis of that flow cannot be
  // finished. Such an entity is promoted into the relevant list and carries an
  // inline "home-state classification required" flag until it is resolved (a real
  // classification, or the advisor dismissing it as not relevant).
  const needsHomeState = (e: FactEntity): boolean => {
    if (isTaxpayerSide(e) || effLocalNotRelevant(e) || hasMismatch(e)) return false;
    if ((effJurisdiction(e) ?? '').toUpperCase() === 'NL') return false;
    if (!relevantPartyIds.has(e.id)) return false;
    return effLocalQualification(e, clsByEntity.get(e.id)) === 'undetermined';
  };
  // Whether the inline flag should nag on this row: needed, and not explicitly
  // removed from the relevant set (an 'out' override silences it).
  const showHomeStateFlag = (e: FactEntity): boolean => needsHomeState(e) && effRelevanceOverride(e) !== 'out';

  const isRelevantRow = (e: FactEntity): boolean => {
    const ov = effRelevanceOverride(e);
    if (ov === 'out') return false;
    if (ov === 'in') return true;
    return e.related || !!e.shareholderOfTaxpayer || likelyMemberIds.has(e.id) || hasMismatch(e) || needsHomeState(e);
  };

  const taxpayerEnts = facts.entities.filter(isTaxpayerSide);
  const others = facts.entities.filter((e) => !isTaxpayerSide(e));
  // Sort on the chart's base percentage, NOT the edited value: the % editor
  // commits per keystroke, and a live re-sort would move the row (and blur the
  // input) mid-typing. The cells still display the effective (edited) value.
  const basePctOf = (e: FactEntity) => e.ownershipPct ?? e.relatedViaPct ?? null;
  const relevantEnts = others
    .filter(isRelevantRow)
    .sort((a, b) => (basePctOf(b) ?? -1) - (basePctOf(a) ?? -1));
  const restEnts = others.filter((e) => !isRelevantRow(e));
  // Bulk "hide the whole Other group from the client" state. The button reads its
  // on/off state from whether every Other row is already hidden, so individual
  // eyes keep working afterwards (bulk sets state, it does not lock it).
  const restIds = new Set(restEnts.map((e) => e.id));
  const allOtherHidden = restEnts.length > 0 && restEnts.every((e) => e.hidden);
  const setOthersHidden = (hidden: boolean) =>
    onChange?.({ ...facts, entities: facts.entities.map((e) => (restIds.has(e.id) ? { ...e, hidden } : e)) });

  // # · Entity · Juris. · Classification (NL) · Related % · Client · chevron
  const COLS = 7;
  const groupLabelRow = (label: string, meta?: ReactNode) => (
    <tr>
      <td colSpan={COLS} className="pt-4 pb-1.5">
        <span className={GROUP_LABEL}>{label}</span>
        {meta != null && <span className={cn(GROUP_META, 'ml-2.5')}>{meta}</span>}
      </td>
    </tr>
  );

  /**
   * Subsidiaries say whether the holding is direct; older facts (no flag) stay
   * plain. "Group entity" reads as "Other" (the data value stays Group entity).
   */
  const roleLabel = (e: FactEntity): string => {
    const edited = effRelationType(e);
    if (edited) return edited;
    if (e.role === 'Subsidiary' && e.directLink != null) {
      return e.directLink ? 'Subsidiary (direct)' : 'Subsidiary (indirect)';
    }
    if (e.role === 'Group entity') return e.shareholderOfTaxpayer ? 'Shareholder' : 'Other';
    return e.role;
  };

  /**
   * One short line on how a Group entity sits relative to the taxpayer: the hard
   * common-parent link when the graph has one, otherwise the AI's grounded
   * relationship clause. Nothing at all beats a boilerplate non-answer.
   */
  const positionNote = (e: FactEntity): string | null => {
    if (e.role !== 'Group entity' || e.memberOfUnityId) return null;
    if (e.relatedVia) {
      const viaName = nameOf(facts, e.relatedVia);
      return e.relatedViaPct != null
        ? `sister entity: ${viaName} holds ${pct(e.relatedViaPct)} here and >25% in the taxpayer`
        : `sister entity via ${viaName}`;
    }
    return e.position?.trim() || null;
  };

  const renderEntityRow = (e: FactEntity) => {
    const isMember = !!e.memberOfUnityId;
    const isTaxpayer = e.role === 'Taxpayer' || !!e.isFiscalUnity;
    const muted = isMember ? 'text-muted-foreground/70' : 'text-muted-foreground';
    const jur = effJurisdiction(e);
    const status = effNlTaxStatus(e);
    const nlQual = effNlQualification(e);
    const c = clsByEntity.get(e.id);
    // A Dutch entity's home state is the Netherlands, so it has no automatic
    // second block; the advisor can still add an optional foreign classification
    // (how another state sees this NL entity) to bring a hybrid mismatch in.
    const isNl = (jur ?? '').toUpperCase() === 'NL';
    const foreignCls = isNl ? dutchForeignClassification(e, c) : null;
    const showForeign = isNl && (foreignCls != null || foreignOpen.has(e.id));
    const localQual = effLocalQualification(e, c);
    const mismatch = hasMismatch(e);
    const flagged = showHomeStateFlag(e);
    const inRelevant = isRelevantRow(e);
    const expanded = expandedRow === e.id;
    const detailId = `entity-detail-${e.id}`;

    // Relation-to-the-taxpayer line. The taxpayer and fiscal-unity members keep a
    // fixed description; every other row gets the relation-type select + % input.
    const baseRoleName =
      e.role === 'Group entity' ? (e.shareholderOfTaxpayer ? 'Shareholder' : 'Group entity') : e.role;
    const isParentOrSub = e.role === 'Parent' || e.role === 'Subsidiary';
    const directWord = e.directLink == null ? '' : (e.directLink ? 'direct ' : 'indirect ');
    const relPct = relatedPctOf(e);
    const relationEditable = editable && !isTaxpayer && !isMember;
    const relationType = effRelationType(e)
      ?? (e.role === 'Parent' ? 'Parent'
        : e.role === 'Subsidiary' ? 'Subsidiary'
        : e.relatedVia ? 'Sister company'
        : 'Other');
    const relationValue = isTaxpayer
      ? 'The taxpayer'
      : isMember
        ? 'Fiscal unity member'
        : effRelationType(e)
          ? (relPct != null ? `${relationType} · ${pct(relPct)} direct interest` : relationType)
          : isParentOrSub && relPct != null
            ? `${baseRoleName} · ${pct(relPct)} ${directWord}interest`
            : baseRoleName;
    const relationDerivedReason = isTaxpayer
      ? 'The entity the assessment is carried out for.'
      : isMember
        ? 'Part of the Dutch fiscal unity headed by the taxpayer.'
        : positionNote(e);
    const relationReason = effRelationReason(e, relationDerivedReason);
    const nlReason = effNlReason(e);

    // The home-state reasoning draft (foreign entities only): the hybrid
    // difference when it bites, nothing otherwise (the inline flag now carries the
    // "set the home-state classification" prompt, so no standing help text here).
    const localDerivedReason = mismatch
      ? `Hybrid difference: ${nlQualificationLabel(nlQual).toLowerCase()} for Dutch purposes, ${nlQualificationLabel(localQual).toLowerCase()}${c?.homeState ? ` in ${c.homeState}` : ' locally'}.`
      : null;
    const localReason = effLocalReason(e, localDerivedReason);

    const detailValue = 'text-[14.5px] text-foreground';

    return (
      <Fragment key={e.id}>
        <tr
          id={`entity-row-${e.id}`}
          onClick={() => toggleRow(e.id)}
          className={cn(
            'group cursor-pointer border-b border-border align-middle transition-colors hover:bg-accent',
            expanded && 'bg-accent/50',
            e.hidden && 'opacity-40',
          )}
        >
          <td className="py-2.5 pr-2 font-mono text-ds-ink-secondary">{e.id}</td>
          <td className="pr-2 font-normal text-foreground">
            {isMember && <span className="mr-1 text-muted-foreground">↳</span>}
            {mismatch && <AlertTriangle className="mr-1 inline h-3 w-3 text-brand-warning" aria-label="Qualification difference" />}
            {flagged && !mismatch && <AlertTriangle className="mr-1 inline h-3 w-3 text-brand-warning" aria-label="Home-state classification required" />}
            <span className={cn(isMember && 'text-muted-foreground')}>{e.name}</span>
            {e.manual && (
              <span
                className="ml-1.5 rounded-sm bg-muted px-1 text-[10px] font-normal text-muted-foreground"
                title="Added by hand; not derived from the structure chart"
              >
                added
              </span>
            )}
            {/* "Other" means "nothing special"; the relationship lives in the row
                detail. Only meaningful roles keep a tag. */}
            {roleLabel(e) !== 'Other' && (
              <span className="ml-1.5 text-[9.5px] font-normal uppercase tracking-wide text-muted-foreground/60">{roleLabel(e)}</span>
            )}
            {e.isFiscalUnity && (
              <span className="ml-1.5 rounded-sm bg-brand-sage-soft px-1 text-[10px] font-normal text-brand-sage-deep">
                fiscal unity
              </span>
            )}
            {e.inTaxpayerFiscalUnity && (
              <span
                className="ml-1.5 rounded-sm bg-brand-sage-soft px-1 text-[10px] font-normal text-brand-sage-deep"
                title="Forms a Dutch fiscal unity (fiscale eenheid) with E1; part of the same NL taxpayer"
              >
                fiscal unity · taxpayer
              </span>
            )}
          </td>

          {/* Jurisdiction: a flag chip + the ISO code; click opens the country picker. */}
          <td className="py-0.5 pr-2" onClick={(ev) => ev.stopPropagation()}>
            <QuietCell
              display={
                jur
                  ? <JurisFlagCode iso={jur} />
                  : <span className="text-muted-foreground">{editable ? 'Set…' : NA}</span>
              }
              editing={editable && editCell?.id === e.id && editCell?.field === 'jurisdiction'}
              onStartEdit={editable ? () => setEditCell({ id: e.id, field: 'jurisdiction' }) : undefined}
            >
              <JurisdictionPicker
                variant="facts"
                value={jur ?? ''}
                onChange={(iso) => onChange!(withEntityEdit(facts, e.id, 'jurisdiction', iso || null))}
                defaultOpen
                onSettled={() => setEditCell(null)}
                placeholder="Set…"
              />
            </QuietCell>
          </td>

          {/* Classification (NL): display only; the reason + editor live in the row detail. */}
          <td className="pr-2">
            <span title={nlTaxStatusLabel(status)}>
              {nlQual === 'undetermined'
                ? <span className="text-[10.5px] text-muted-foreground/40">{NA}</span>
                : <QualBadge q={nlQual} />}
            </span>
          </td>

          {/* Effective related-party percentage; the taxpayer is the reference point. */}
          <td className={cn('py-2.5 pl-2 text-right tabular-nums', e.related ? 'font-normal text-foreground' : muted)}>
            {e.role === 'Taxpayer' ? NA : isMember ? '' : (relPct != null ? pct(relPct) : NA)}
          </td>

          {/* Client: shown in / hidden from the client report (toggles the hidden flag). */}
          <td className="px-2 text-center" onClick={(ev) => ev.stopPropagation()}>
            {e.role === 'Taxpayer'
              ? <ClientEyeBtn hidden={false} editable={false} onToggle={() => {}} />
              : <ClientEyeBtn hidden={!!e.hidden} editable={editable && !isMember} onToggle={() => toggleHidden(e.id)} />}
          </td>

          {/* Expand / collapse the reasoning detail. */}
          <td className="pl-1 pr-2 text-right">
            <button
              type="button"
              aria-expanded={expanded}
              aria-controls={detailId}
              aria-label={expanded ? `Hide reasoning for ${e.name}` : `Show reasoning for ${e.name}`}
              onClick={(ev) => { ev.stopPropagation(); toggleRow(e.id); }}
              className="inline-flex h-6 w-6 items-center justify-center rounded-[3px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <ChevronDown className={cn('h-4 w-4 transition-transform', expanded && 'rotate-180')} />
            </button>
          </td>
        </tr>

        {/* Inline home-state flag: a foreign party to a needs-assessment flow whose
            home-state view is still unset. Replaces the old "Action needed" popup;
            the classification is set right here, on the row. Hidden while the row is
            expanded, where the full home-state block already carries the same select. */}
        {flagged && !expanded && (() => {
          const parties = relevantTx
            .filter((t) => t.fromEntityId === e.id || t.toEntityId === e.id)
            .map((t) => t.id);
          const txList = parties.length
            ? `transaction${parties.length > 1 ? 's' : ''} ${joinIds(parties)}`
            : 'a needs-assessment transaction';
          const where = c?.homeState || (jur ? countryName(jur) : '');
          return (
            <tr className={cn('border-b border-border', e.hidden && 'opacity-40')}>
              <td colSpan={COLS} className="px-2 pb-3 pt-0">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md border border-brand-warning/40 border-l-[3px] border-l-brand-warning bg-brand-warning-soft px-3 py-2.5">
                  <span className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-brand-warning-deep">
                    <AlertTriangle className="h-3.5 w-3.5 text-brand-warning" aria-hidden />
                    Home-state classification required
                  </span>
                  <span className="min-w-0 flex-1 text-[12px] leading-snug text-brand-warning-deep/80">
                    {e.name} is a party to {txList}; set how {where || 'its home state'} classifies it.
                  </span>
                  {editable ? (
                    <Select
                      value="undetermined"
                      onValueChange={(v) => onChange!(setHomeStateInline(facts, e.id, v as HomeStateChoice, jur))}
                    >
                      <SelectTrigger
                        aria-label={`Set the home-state classification of ${e.name}`}
                        className={cn(EDIT_SELECT, 'h-8 border-brand-warning/50 bg-white text-brand-warning-deep hover:border-brand-warning focus:border-brand-warning focus:shadow-[0_0_0_3px_rgba(196,148,42,0.14)]')}
                      >
                        <SelectValue placeholder="Set classification" />
                      </SelectTrigger>
                      <SelectContent>
                        {HOME_STATE_INLINE_OPTIONS.map((o) => (
                          <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : null}
                </div>
              </td>
            </tr>
          );
        })()}

        {expanded && (
          <tr id={detailId} className={cn('border-b border-border', e.hidden && 'opacity-40')}>
            <td colSpan={COLS} className="p-0">
              <div className="bg-[#fbfaf7] px-5 py-5">
                <div className="grid grid-cols-1 gap-x-12 gap-y-5 sm:grid-cols-2">
                  {/* Relation to the taxpayer: relation-type select + % interest input;
                      the % commits on each keystroke, so the row's Related % cell is live. */}
                  <DetailBlock label="Relation to the taxpayer">
                    {relationEditable ? (
                      <div className="flex flex-wrap items-center gap-2.5">
                        <Select
                          value={relationType}
                          onValueChange={(v) => onChange!(withEntityEdit(facts, e.id, 'relationType', v))}
                        >
                          <SelectTrigger className={cn(EDIT_SELECT, 'min-w-[150px]')} aria-label="Relation to the taxpayer">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {RELATION_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                          </SelectContent>
                        </Select>
                        <span className="text-ds-ink-tertiary" aria-hidden>·</span>
                        <span className="inline-flex items-center gap-2 text-[14.5px] text-foreground">
                          <PctInput
                            key={e.id}
                            value={relPct}
                            onCommit={(n) => onChange!(withEntityEdit(facts, e.id, 'relatedPct', n))}
                          />
                          <span>% direct interest</span>
                        </span>
                      </div>
                    ) : (
                      <p className={detailValue}>{relationValue}</p>
                    )}
                    <ReasonField
                      value={relationReason}
                      editable={relationEditable}
                      label={`Relation reasoning for ${e.name}`}
                      placeholder="Why this entity is or is not a related party for this assessment."
                      onCommit={(text) => onChange!(withEntityEdit(facts, e.id, 'relationReason', text))}
                    />
                  </DetailBlock>

                  {/* Classification (NL): how the Netherlands sees the entity, plus why. */}
                  <DetailBlock label="Classification (NL)">
                    {editable ? (
                      <Select
                        value={nlQual}
                        onValueChange={(v) => {
                          const opt = NL_CLASSIFICATION_OPTIONS.find((o) => o.qual === v);
                          if (opt) onChange!(withEntityEdit(facts, e.id, 'nlTaxStatus', opt.statusKey));
                        }}
                      >
                        <SelectTrigger
                          title={nlTaxStatusLabel(status)}
                          aria-label="Classification for Dutch tax purposes"
                          className={cn(EDIT_SELECT, nlQual === 'undetermined' && EDIT_SELECT_TODO)}
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {NL_CLASSIFICATION_OPTIONS.map((o) => <SelectItem key={o.qual} value={o.qual}>{o.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    ) : (
                      <p className={detailValue}>{nlQualificationLabel(nlQual)}</p>
                    )}
                    <ReasonField
                      value={nlReason}
                      editable={editable}
                      label={`Dutch classification reasoning for ${e.name}`}
                      placeholder="Why the entity qualifies this way for Dutch tax purposes."
                      onCommit={(text) => onChange!(withEntityEdit(facts, e.id, 'nlReason', text))}
                    />
                  </DetailBlock>

                  {/* Home-state classification: foreign entities only. A Dutch entity
                      has no separate home-state view, so it gets no second block. */}
                  {!isNl && (
                    <DetailBlock label={`Classification${jur ? ` (${jur})` : ''}`} tag="home state">
                      {editable ? (
                        <Select
                          value={localQual}
                          onValueChange={(v) => {
                            const mapped = v === 'transparent' ? 'transparent'
                              : v === 'non-transparent' ? 'opaque'
                                : v === 'reverse-hybrid' ? 'reverse_hybrid'
                                  : 'unknown';
                            onChange!(withLocalQualification(facts, e.id, mapped, jur));
                          }}
                        >
                          <SelectTrigger
                            aria-label="Home-state classification"
                            className={cn(EDIT_SELECT, localQual === 'undetermined' && EDIT_SELECT_TODO)}
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {NL_CLASSIFICATION_OPTIONS.map((o) => <SelectItem key={o.qual} value={o.qual}>{o.label}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      ) : (
                        <p className={detailValue}>
                          {nlQualificationLabel(localQual)}{c?.homeState ? ` (${c.homeState})` : ''}
                        </p>
                      )}
                      <ReasonField
                        value={localReason}
                        editable={editable}
                        label={`Home-state classification reasoning for ${e.name}`}
                        placeholder="How the home state views this entity."
                        onCommit={(text) => onChange!(withEntityEdit(facts, e.id, 'localReason', text))}
                      />
                    </DetailBlock>
                  )}

                  {/* Foreign classification (Dutch entities): optional and off by
                      default. The advisor opts in to record how another state
                      classifies this NL entity, bringing a hybrid mismatch into scope. */}
                  {isNl && (showForeign ? (
                    <DetailBlock label="Foreign classification" tag={foreignCls?.state || 'another state'}>
                      {editable ? (
                        <>
                          <div className="flex flex-wrap items-center gap-2.5">
                            <JurisdictionPicker
                              variant="facts"
                              value={foreignCls?.state ?? ''}
                              onChange={(iso) => onChange!(withForeignClassificationState(facts, e.id, iso || null))}
                              placeholder="Country…"
                            />
                            <Select
                              value={foreignCls?.qual ?? 'undetermined'}
                              onValueChange={(v) => {
                                const mapped = v === 'transparent' ? 'transparent'
                                  : v === 'non-transparent' ? 'opaque'
                                    : v === 'reverse-hybrid' ? 'reverse_hybrid'
                                      : 'unknown';
                                onChange!(withLocalQualification(facts, e.id, mapped, foreignCls?.state ?? ''));
                              }}
                            >
                              <SelectTrigger
                                aria-label="Foreign classification"
                                className={cn(EDIT_SELECT, (foreignCls?.qual ?? 'undetermined') === 'undetermined' && EDIT_SELECT_TODO)}
                              >
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {NL_CLASSIFICATION_OPTIONS.map((o) => <SelectItem key={o.qual} value={o.qual}>{o.label}</SelectItem>)}
                              </SelectContent>
                            </Select>
                            <button
                              type="button"
                              aria-label="Remove foreign classification"
                              title="Remove the foreign classification"
                              onClick={() => { closeForeign(e.id); onChange!(clearForeignClassification(facts, e.id)); }}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                          <ReasonField
                            value={localReason}
                            editable={editable}
                            label={`Foreign classification reasoning for ${e.name}`}
                            placeholder="How this other state classifies the entity, and why it matters here."
                            onCommit={(text) => onChange!(withEntityEdit(facts, e.id, 'localReason', text))}
                          />
                        </>
                      ) : (
                        <>
                          <p className={detailValue}>
                            {nlQualificationLabel(localQual)}{foreignCls?.state ? ` (${foreignCls.state})` : ''}
                          </p>
                          <ReasonField
                            value={localReason}
                            editable={false}
                            label={`Foreign classification reasoning for ${e.name}`}
                          />
                        </>
                      )}
                    </DetailBlock>
                  ) : editable ? (
                    <div className="self-start">
                      <button
                        type="button"
                        onClick={() => openForeign(e.id)}
                        className="inline-flex items-center gap-1.5 rounded-[4px] border border-dashed border-border px-2.5 py-1.5 text-[12.5px] text-muted-foreground transition-colors hover:border-ds-ink-tertiary hover:text-foreground"
                      >
                        <Plus className="h-3.5 w-3.5" /> Add foreign classification
                      </button>
                    </div>
                  ) : null)}
                </div>

                {/* Client visibility (hide = kept in the analysis, left out of the
                    client report) sits alongside relevant-set membership (add / remove
                    = whether the entity is part of the relevant entities at all). The
                    two are deliberately independent controls. */}
                {e.role !== 'Taxpayer' && !isMember && (
                  <div className="mt-5 flex flex-wrap items-center justify-between gap-4 border-t border-border pt-4">
                    <VisibilitySwitch
                      on={!e.hidden}
                      editable={editable}
                      title={e.hidden ? 'Hidden from client' : 'Visible to client'}
                      note={e.hidden
                        ? 'Kept internal. This entity is left out of the client report.'
                        : 'Included in the report sent to the client. Switch off to keep it internal.'}
                      onToggle={() => { if (editable) toggleHidden(e.id); }}
                    />
                    {editable && (
                      e.manual ? (
                        <button
                          type="button"
                          onClick={() => onChange!(removeFromRelevant(facts, e.id))}
                          title="Delete this hand-added entity"
                          className="inline-flex shrink-0 items-center gap-1.5 rounded-[4px] border border-border px-2.5 py-1.5 text-[12.5px] text-muted-foreground transition-colors hover:border-brand-terracotta hover:text-brand-terracotta-deep"
                        >
                          <Trash2 className="h-3.5 w-3.5" /> Remove entity
                        </button>
                      ) : inRelevant ? (
                        <button
                          type="button"
                          onClick={() => onChange!(removeFromRelevant(facts, e.id))}
                          title="Move to Other: kept in the register, but out of the relevant entities"
                          className="inline-flex shrink-0 items-center gap-1.5 rounded-[4px] border border-border px-2.5 py-1.5 text-[12.5px] text-muted-foreground transition-colors hover:border-ds-ink-tertiary hover:text-foreground"
                        >
                          <X className="h-3.5 w-3.5" /> Remove from related
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => onChange!(promoteToRelevant(facts, e.id))}
                          title="Add to the relevant entities"
                          className="inline-flex shrink-0 items-center gap-1.5 rounded-[4px] border border-border px-2.5 py-1.5 text-[12.5px] text-muted-foreground transition-colors hover:border-ds-ink-tertiary hover:text-foreground"
                        >
                          <Plus className="h-3.5 w-3.5" /> Add to related
                        </button>
                      )
                    )}
                  </div>
                )}
              </div>
            </td>
          </tr>
        )}
      </Fragment>
    );
  };

  const thLabel = 'pr-2 text-[10px] font-medium uppercase tracking-wide';

  // # · Transaction · Type (short) · Client (eye). Jurisdictions, the verbose type
  // and instrument move into the expand detail; the whole row is the expand toggle
  // (no chevron).
  const TX_COLS = 4;

  const txGroupLabel = (label: string, meta?: ReactNode) => (
    <tr>
      <td colSpan={TX_COLS} className="pt-4 pb-1.5">
        <span className={GROUP_LABEL}>{label}</span>
        {meta != null && <span className={cn(GROUP_META, 'ml-2.5')}>{meta}</span>}
      </td>
    </tr>
  );

  /**
   * The transaction's jurisdictions, payer to recipient, in the same from->to
   * order as the transaction name above: a flag chip + ISO code on each side,
   * reusing the entity-table chip. Falls back to the counterparty names when a
   * jurisdiction is missing.
   */
  const txJurisdictions = (t: AppendixFacts['transactions'][number]): ReactNode => {
    const from = facts.entities.find((e) => e.id === t.fromEntityId);
    const to = facts.entities.find((e) => e.id === t.toEntityId);
    const fj = from ? effJurisdiction(from) : null;
    const tj = to ? effJurisdiction(to) : null;
    if (fj && tj) {
      return (
        <span className="flex items-center gap-1.5">
          <JurisFlagCode iso={fj} />
          <FlowArrow className="mx-px" />
          <JurisFlagCode iso={tj} />
        </span>
      );
    }
    return (
      <span className="flex items-center">
        <span>{nameOf(facts, t.fromEntityId)}</span>
        <FlowArrow className="mx-1" />
        <span>{nameOf(facts, t.toEntityId)}</span>
      </span>
    );
  };

  const fromEntity = (t: TransactionItem) => facts.entities.find((e) => e.id === t.fromEntityId);
  const toEntity = (t: TransactionItem) => facts.entities.find((e) => e.id === t.toEntityId);

  // A characteristic is "open" (drawn in terracotta) when it carries risk: a Yes /
  // To be determined on a mismatch category, or an unknown cross-border status.
  const charIsOpen = (key: TxCharacteristicKey, v: QuadState): boolean =>
    key === 'crossBorder' ? v === 'tbd' : isOpenState(v);

  // The status the advisor can force. `null` = follow the characteristics (Auto).
  const STATUS_CHOICES: ReadonlyArray<{ value: 'needs' | 'no_risk' | null; label: string }> = [
    { value: null, label: 'Auto' },
    { value: 'needs', label: 'Needs assessment' },
    { value: 'no_risk', label: 'No risk identified' },
  ];

  // A quiet inline text editor for the descriptive transaction fields (type,
  // instrument), matched to the register's white-control / terracotta-ring rule.
  const TX_TEXT_INPUT = cn(
    'h-9 w-full min-w-[160px] rounded-md border border-border bg-card px-3 text-[14px] text-foreground outline-none transition-[border-color,box-shadow] placeholder:text-muted-foreground/60 hover:border-ds-ink-tertiary',
    EDIT_FOCUS_RING,
  );

  /** One entity picker for a transaction party (From / To). A render function, not a
   *  nested component, so it does not remount the Select on every keystroke. */
  const partySelect = (value: string, label: string, onPick: (id: string) => void) => (
    <Select value={value} onValueChange={onPick}>
      <SelectTrigger className={cn(EDIT_SELECT, 'h-9 min-w-[150px]')} aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {facts.entities.map((e) => (
          <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  /**
   * One transaction row that expands on click, mirroring the entity register. The
   * collapsed row carries the derived status ("Needs assessment · <reason>" or "No
   * risk identified") and a one-line rationale; the editable assessment panel (the
   * five characteristics, the rationale and the status override) lives beneath.
   */
  const renderTxRow = (t: TransactionItem) => {
    const status = effTxStatus(facts, t);
    const needs = status === 'needs';
    const overridden = isTxStatusOverridden(t);
    const activeOverride = t.assessment?.statusOverride ?? null;
    const overrideReason = t.assessment?.overrideReason ?? '';
    const reason = txStatusReason(facts, t);
    const why = txMemoReason(facts, t);
    const expanded = expandedTx === t.id;
    const detailId = `tx-detail-${t.id}`;
    const fromJur = fromEntity(t) ? effJurisdiction(fromEntity(t)!) : null;
    const toJur = toEntity(t) ? effJurisdiction(toEntity(t)!) : null;
    return (
      <Fragment key={t.id}>
        <tr
          onClick={() => toggleTx(t.id)}
          // The whole row is the expand toggle (no chevron). Keyboard parity with
          // the entity table: the row is focusable and Enter/Space toggles it; the
          // guard keeps a keypress on the inner eye button from also toggling.
          tabIndex={0}
          onKeyDown={(ev) => {
            if (ev.target === ev.currentTarget && (ev.key === 'Enter' || ev.key === ' ')) {
              ev.preventDefault();
              toggleTx(t.id);
            }
          }}
          aria-expanded={expanded}
          aria-controls={detailId}
          // A soft terra wash fading to the right marks a needs-assessment flow.
          // background-image, so the hover/expand background-color still reads.
          style={needs ? { backgroundImage: 'linear-gradient(90deg, hsl(var(--brand-terracotta) / 0.10), transparent 70%)' } : undefined}
          className={cn(
            'group cursor-pointer border-b border-border align-top transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:outline-none',
            expanded && 'bg-accent/50',
            t.excludedFromClient && 'opacity-60',
          )}
        >
          <td className="py-3 pr-2 align-top font-mono text-ds-ink-secondary">{t.id}</td>
          <td className="py-3 pr-3 text-foreground">
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
              <span className="inline-flex items-center">
                {nameOf(facts, t.fromEntityId)}
                <FlowArrow className="mx-1" />
                {nameOf(facts, t.toEntityId)}
              </span>
              {/* The status names the reason it carries, instead of an opaque tag. */}
              {needs ? (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-brand-terracotta/30 bg-white px-2 py-0.5 text-[11px] font-medium text-brand-terracotta-deep">
                  <span className="h-1.5 w-1.5 rounded-full bg-brand-terracotta" aria-hidden />
                  Needs assessment
                  <span className="font-normal text-brand-terracotta-deep/75">· {reason}</span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full bg-brand-sage-soft px-2 py-0.5 text-[11px] font-medium text-brand-sage-deep">
                  <Check className="h-3 w-3" /> No risk identified
                </span>
              )}
              {overridden && (
                <span
                  className="rounded-sm bg-muted px-1.5 py-0.5 text-[10px] font-normal uppercase tracking-wide text-muted-foreground"
                  title="Status set manually, overriding the characteristics"
                >
                  set manually
                </span>
              )}
            </div>
            <p className="mt-1 max-w-[520px] text-[12px] leading-[1.5] text-muted-foreground">{why}</p>
          </td>
          {/* Type: a short category as plain one-line text (no pill); the full
              verbose type lives in the expand panel. */}
          <td className="py-3 pr-2 align-top">
            <span className="block max-w-[150px] truncate text-[13.5px] text-muted-foreground" title={t.kind}>
              {shortTransactionType(t.kind)}
            </span>
          </td>
          {/* Client: shown in / hidden from the client report; the same eye control
              as the entity table. Its click stops propagation so it never expands. */}
          <td className="px-2 py-3 text-center align-top" onClick={(ev) => ev.stopPropagation()}>
            <ClientEyeBtn
              hidden={!!t.excludedFromClient}
              editable={editable}
              onToggle={() => onChange!(withTransaction(facts, t.id, { excludedFromClient: !t.excludedFromClient }))}
            />
          </td>
        </tr>

        {expanded && (
          <tr id={detailId} className={cn('border-b border-border', t.excludedFromClient && 'opacity-60')}>
            <td colSpan={TX_COLS} className="p-0">
              <div
                className="bg-[#fcfbf8] pb-5 pl-[50px] pr-3 pt-3"
                onClick={(ev) => ev.stopPropagation()}
              >
                {/* Descriptors: the flow's parties, jurisdictions, type and instrument. */}
                <div className="grid grid-cols-1 gap-x-10 gap-y-4 sm:grid-cols-2">
                  <DetailBlock label="Parties">
                    {editable ? (
                      <div className="flex flex-wrap items-center gap-2">
                        {partySelect(t.fromEntityId, 'Paying party', (id) => onChange!(withTxField(facts, t.id, { fromEntityId: id })))}
                        <FlowArrow className="mx-px" />
                        {partySelect(t.toEntityId, 'Receiving party', (id) => onChange!(withTxField(facts, t.id, { toEntityId: id })))}
                      </div>
                    ) : (
                      <p className="flex items-center text-[14px] text-foreground">
                        {nameOf(facts, t.fromEntityId)}<FlowArrow className="mx-1" />{nameOf(facts, t.toEntityId)}
                      </p>
                    )}
                  </DetailBlock>
                  <DetailBlock label="Jurisdictions" tag="set on the entity">
                    {editable ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <JurisdictionPicker
                          variant="facts"
                          value={fromJur ?? ''}
                          onChange={(iso) => onChange!(withEntityEdit(facts, t.fromEntityId, 'jurisdiction', iso || null))}
                          placeholder="Set…"
                        />
                        <FlowArrow className="mx-px" />
                        <JurisdictionPicker
                          variant="facts"
                          value={toJur ?? ''}
                          onChange={(iso) => onChange!(withEntityEdit(facts, t.toEntityId, 'jurisdiction', iso || null))}
                          placeholder="Set…"
                        />
                      </div>
                    ) : (
                      <div className="text-[14px] text-foreground">{txJurisdictions(t)}</div>
                    )}
                  </DetailBlock>
                  <DetailBlock label="Type">
                    {editable ? (
                      <input
                        value={t.kind}
                        aria-label="Transaction type"
                        placeholder="e.g. Interest on an intra-group loan"
                        onChange={(ev) => onChange!(withTxField(facts, t.id, { kind: ev.target.value }))}
                        className={TX_TEXT_INPUT}
                      />
                    ) : (
                      <p className="text-[14px] text-foreground">{t.kind || NA}</p>
                    )}
                  </DetailBlock>
                  <DetailBlock label="Instrument">
                    {editable ? (
                      <input
                        value={t.instrument ?? ''}
                        aria-label="Instrument"
                        placeholder="e.g. Shareholder loan"
                        onChange={(ev) => onChange!(withTxField(facts, t.id, { instrument: ev.target.value.trim() === '' ? null : ev.target.value }))}
                        className={TX_TEXT_INPUT}
                      />
                    ) : (
                      <p className="text-[14px] text-foreground">{t.instrument ?? NA}</p>
                    )}
                  </DetailBlock>
                </div>

                {/* Assessment: the five characteristics that drive the status. */}
                <div className="mt-5 border-t border-border pt-4">
                  <p className="text-[10.5px] font-medium uppercase tracking-[0.11em] text-muted-foreground">Assessment</p>
                  <div className="mt-3 grid grid-cols-1 gap-x-10 gap-y-4 sm:grid-cols-2">
                    {TX_CHARACTERISTICS.map((meta) => {
                      const v = effCharacteristic(facts, t, meta.key);
                      const open = charIsOpen(meta.key, v);
                      return (
                        <div key={meta.key}>
                          <p className="text-[12.5px] font-medium text-foreground">{meta.label}</p>
                          {editable ? (
                            <Select
                              value={v}
                              onValueChange={(nv) => onChange!(withTxCharacteristic(facts, t.id, meta.key, nv as QuadState))}
                            >
                              <SelectTrigger
                                aria-label={meta.label}
                                className={cn(EDIT_SELECT, 'mt-1 h-9 min-w-[150px]', open && EDIT_SELECT_TODO)}
                              >
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {stateOptions(meta.key).map((o) => (
                                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            <p className={cn('mt-1 text-[14px]', open ? 'text-brand-terracotta-deep' : 'text-foreground')}>{stateLabel(v)}</p>
                          )}
                          <p className="mt-1 text-[11.5px] leading-snug text-muted-foreground/80">{meta.hint}</p>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Rationale: free text that carries into the memo line for this flow. */}
                <div className="mt-4">
                  <DetailBlock label="Rationale" tag="shown in the memo">
                    <ReasonField
                      value={t.assessment?.rationale ?? null}
                      editable={editable}
                      label={`Assessment rationale for ${t.id}`}
                      placeholder="Explain the assessment of this flow. This text is used in the memo."
                      onCommit={(text) => onChange!(withTxRationale(facts, t.id, text))}
                    />
                  </DetailBlock>
                </div>

                {/* Status: follows the characteristics, with an explicit override. */}
                {editable && (
                  <div className="mt-5 border-t border-border pt-4">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                      <span className="text-[12.5px] font-medium text-foreground">Status</span>
                      <span className="text-[12px] text-muted-foreground">
                        {activeOverride == null
                          ? 'Follows the characteristics above.'
                          : 'Set manually, overriding the characteristics.'}
                      </span>
                    </div>
                    <div className="mt-2 inline-flex flex-wrap gap-1 rounded-md border border-border bg-card p-1">
                      {STATUS_CHOICES.map((choice) => {
                        const active = activeOverride === choice.value;
                        return (
                          <button
                            key={choice.label}
                            type="button"
                            aria-pressed={active}
                            onClick={() => onChange!(withTxStatusOverride(facts, t.id, choice.value, choice.value ? overrideReason : null))}
                            className={cn(
                              'rounded-[4px] px-3 py-1.5 text-[12.5px] transition-colors',
                              active
                                ? choice.value === 'needs'
                                  ? 'bg-brand-terracotta-soft text-brand-terracotta-deep'
                                  : choice.value === 'no_risk'
                                    ? 'bg-brand-sage-soft text-brand-sage-deep'
                                    : 'bg-foreground text-white'
                                : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                            )}
                          >
                            {choice.label}
                          </button>
                        );
                      })}
                    </div>
                    {overridden && (
                      <div className="mt-2.5">
                        <input
                          value={overrideReason}
                          aria-label="Reason for setting the status manually"
                          placeholder="Reason for setting the status manually (required)"
                          onChange={(ev) => onChange!(withTxStatusOverride(facts, t.id, activeOverride!, ev.target.value))}
                          className={cn(TX_TEXT_INPUT, 'max-w-[460px]', !overrideReason.trim() && 'border-brand-warning/60')}
                        />
                        {!overrideReason.trim() && (
                          <p className="mt-1 text-[11.5px] text-brand-warning-deep">A reason is required when the status is set manually.</p>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </td>
          </tr>
        )}
      </Fragment>
    );
  };

  return (
    <div className={cn('space-y-6', !embedded && 'mx-auto max-w-5xl')}>
      {!embedded && (
        <header>
          <p className={EYEBROW}>Appendix · Part A</p>
          <h2 className="mt-2 text-2xl font-normal tracking-tight text-foreground sm:text-3xl">
            Facts &amp; relationships
          </h2>
          <p className="mt-2 max-w-2xl text-[15px] text-muted-foreground">
            The entities, groupings and transactions the assessment relied on. Review and refine before
            the report is generated.
          </p>
        </header>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* 1. The group and the taxpayer                                        */}
      {/* ------------------------------------------------------------------ */}
      <Exhibit
        number={1}
        title="The group and the taxpayer"
        embedded={embedded}
        {...sectionProps('entityRegister')}
      >
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-foreground text-left text-muted-foreground">
              <th className={cn(thLabel, 'py-2 w-8')}>#</th>
              <th className={thLabel}>Entity</th>
              <th className={cn(thLabel, 'w-[100px]')}>Juris.</th>
              <th className={cn(thLabel, 'w-[170px]')}>Classification (NL)</th>
              <th className="w-[90px] pl-2 text-right text-[10px] font-medium uppercase tracking-wide">Related %</th>
              <th className="w-[64px] text-center text-[10px] font-medium uppercase tracking-wide">Client</th>
              <th className="w-10" aria-label="Reasoning" />
            </tr>
          </thead>
          {taxpayerEnts.length > 0 && (
            <tbody>
              {groupLabelRow('The taxpayer', taxpayerEnts.length > 1 ? `${taxpayerEnts.length} entities` : undefined)}
              {taxpayerEnts.map((e) => renderEntityRow(e))}
            </tbody>
          )}
          {relevantEnts.length > 0 && (
            <tbody>
              {groupLabelRow('Related', `${relevantEnts.length} ${relevantEnts.length === 1 ? 'entity' : 'entities'}`)}
              {relevantEnts.map((e) => renderEntityRow(e))}
            </tbody>
          )}
          {restEnts.length > 0 && (
            <tbody>
              {/* The third group reads "Other" at the same eyebrow rank as the two
                  groups above, with a descriptive count. It keeps the Show all / Hide
                  collapse and adds a one-click "hide the whole group from the client"
                  bulk toggle. */}
              <tr className="border-b border-border">
                <td colSpan={COLS} className="py-2.5">
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setShowAllEntities((v) => !v)}
                      aria-expanded={showAllEntities}
                      className="flex items-center gap-2.5 text-left"
                    >
                      <span className={GROUP_LABEL}>Other</span>
                      <span className={GROUP_META}>
                        {restEnts.length} {restEnts.length === 1 ? 'entity' : 'entities'} · below 25%, no qualification difference
                      </span>
                    </button>
                    <span className="flex-1" />
                    {editable && (
                      <button
                        type="button"
                        onClick={() => setOthersHidden(!allOtherHidden)}
                        aria-pressed={allOtherHidden}
                        title={allOtherHidden
                          ? 'Every entity in Other is hidden from the client report. Click to restore all.'
                          : 'Hide every entity in Other from the client report in one step.'}
                        className={cn(
                          'inline-flex items-center gap-1.5 rounded-[3px] border px-2.5 py-1 text-[12px] transition-colors',
                          allOtherHidden
                            ? 'border-brand-sage bg-brand-sage-soft text-brand-sage-deep'
                            : 'border-border text-muted-foreground hover:bg-muted hover:text-foreground',
                        )}
                      >
                        <EyeOff className="h-3.5 w-3.5" />
                        {allOtherHidden ? 'Hidden from client · undo' : 'Hide all from client'}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setShowAllEntities((v) => !v)}
                      aria-expanded={showAllEntities}
                      className="inline-flex items-center gap-1 text-[11px] uppercase tracking-wide text-muted-foreground/70 transition-colors hover:text-foreground"
                    >
                      {showAllEntities ? 'Hide' : 'Show all'}
                      {showAllEntities ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                    </button>
                  </div>
                </td>
              </tr>
              {showAllEntities && restEnts.map((e) => renderEntityRow(e))}
            </tbody>
          )}
        </table>

        {/* Add / manage the relevant set. "Add entity" promotes an entity out of
            "Other" into the relevant list, or hand-adds one that is not in the chart. */}
        {editable && (
          <div className="mt-4">
            {!addOpen ? (
              <button
                type="button"
                onClick={() => setAddOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-[4px] border border-border px-3 py-1.5 text-[12.5px] text-muted-foreground transition-colors hover:border-ds-ink-tertiary hover:text-foreground"
              >
                <Plus className="h-3.5 w-3.5" /> Add entity
              </button>
            ) : (
              <div className="rounded-md border border-border bg-[#fbfaf7] p-4">
                <div className="flex items-center justify-between">
                  <p className="text-[11px] font-medium uppercase tracking-[0.13em] text-muted-foreground">Add entity</p>
                  <button
                    type="button"
                    onClick={resetAddForm}
                    aria-label="Close"
                    className="text-muted-foreground transition-colors hover:text-foreground"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                {/* From the group: pull an entity out of "Other" into the relevant list. */}
                {restEnts.length > 0 && (
                  <div className="mt-3">
                    <p className="text-[11.5px] text-muted-foreground">From the group, currently in Other</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {restEnts.map((e) => (
                        <button
                          key={e.id}
                          type="button"
                          onClick={() => onChange!(promoteToRelevant(facts, e.id))}
                          title={`Add ${e.name} to the relevant entities`}
                          className="inline-flex items-center gap-1.5 rounded-full border border-border bg-white px-2.5 py-1 text-[12px] text-foreground transition-colors hover:border-brand-terracotta hover:text-brand-terracotta-deep"
                        >
                          <Plus className="h-3 w-3" />
                          <span className="font-mono text-[11px] text-ds-ink-secondary">{e.id}</span>
                          {e.name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* New entity: a hand-added party that is not in the structure chart. */}
                <div className={cn(restEnts.length > 0 && 'mt-4 border-t border-border pt-4')}>
                  <p className="text-[11.5px] text-muted-foreground">New entity, not in the chart</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2.5">
                    <input
                      value={newName}
                      onChange={(ev) => setNewName(ev.target.value)}
                      placeholder="Entity name"
                      aria-label="New entity name"
                      className={cn(
                        'h-9 w-[220px] rounded-md border border-border bg-card px-3 text-[14px] text-foreground outline-none transition-[border-color,box-shadow] placeholder:text-muted-foreground/60 hover:border-ds-ink-tertiary',
                        EDIT_FOCUS_RING,
                      )}
                    />
                    <JurisdictionPicker
                      variant="facts"
                      value={newJur}
                      onChange={setNewJur}
                      placeholder="Jurisdiction"
                    />
                    <Select value={newQual} onValueChange={(v) => setNewQual(v as NlQualification)}>
                      <SelectTrigger className={cn(EDIT_SELECT, 'h-9')} aria-label="Classification for Dutch tax purposes">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {NL_CLASSIFICATION_OPTIONS.map((o) => <SelectItem key={o.qual} value={o.qual}>{o.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <button
                      type="button"
                      disabled={!newName.trim()}
                      onClick={() => {
                        const statusKey = NL_CLASSIFICATION_OPTIONS.find((o) => o.qual === newQual)?.statusKey;
                        const nlTaxStatus = newQual === 'undetermined' ? null : statusKey ?? null;
                        const { facts: next, id } = addManualEntity(facts, { name: newName, jurisdiction: newJur || null, nlTaxStatus });
                        onChange!(next);
                        resetAddForm();
                        setExpandedRow(id);
                      }}
                      className="inline-flex items-center gap-1.5 rounded-[4px] bg-foreground px-3 py-2 text-[13px] font-medium text-white transition-colors hover:bg-foreground/90 disabled:opacity-40"
                    >
                      <Plus className="h-3.5 w-3.5" /> Add
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* A quiet recap of confirmed hybrid classification differences (each row also
            carries its own amber marker above). The old "Action needed" home-state
            popup is gone: that prompt now lives inline on the entity row. */}
        {(() => {
          const mismatches = facts.entities.filter((e) => hasMismatch(e));
          if (!mismatches.length) return null;
          return (
            <div className="mt-4 space-y-2.5 text-xs">
              {mismatches.map((e) => {
                const c = clsByEntity.get(e.id);
                const localQ = effLocalQualification(e, c);
                return (
                  <div key={e.id} className="flex items-start gap-2 rounded-sm bg-brand-warning-soft px-3 py-2.5">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-warning" />
                    <span className="text-brand-warning-deep">
                      <span className="font-medium">{e.id} · {e.name}</span>
                      {' '}
                      {nlQualificationLabel(effNlQualification(e)).toLowerCase()} for Dutch purposes, {nlQualificationLabel(localQ).toLowerCase()}
                      {c?.homeState ? ` in ${c.homeState}` : ' locally'}; hybrid classification difference.
                    </span>
                  </div>
                );
              })}
            </div>
          );
        })()}
      </Exhibit>

      {/* ------------------------------------------------------------------ */}
      {/* 2. Acting together                                                   */}
      {/* ------------------------------------------------------------------ */}
      <Exhibit
        number={2}
        title="Acting together"
        embedded={embedded}
        {...sectionProps('actingTogether')}
      >
        <ActingTogetherSection facts={facts} onChange={onChange} generated={generated} refining={refining} />
      </Exhibit>

      {/* ------------------------------------------------------------------ */}
      {/* 3. Relevant transactions                                             */}
      {/* ------------------------------------------------------------------ */}
      <Exhibit
        number={3}
        title="Intra-group transactions"
        embedded={embedded}
        {...sectionProps('transactions')}
      >
        {(() => {
          if (relevantTx.length === 0 && assessedTx.length === 0) {
            return (
              <p className="text-xs text-muted-foreground">
                {generated ? 'No intra-group transactions identified.' : 'Not generated yet.'}
              </p>
            );
          }
          return (
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-foreground text-left text-muted-foreground">
                  <th className={cn(thLabel, 'w-9 py-2')}>#</th>
                  <th className={cn(thLabel, 'min-w-[260px]')}>Transaction</th>
                  <th className={cn(thLabel, 'w-[150px]')}>Type</th>
                  <th className="w-[64px] text-center text-[10px] font-medium uppercase tracking-wide">Client</th>
                </tr>
              </thead>
              {relevantTx.length > 0 && (
                <tbody>
                  {txGroupLabel(
                    'Needs assessment',
                    `${relevantTx.length} ${relevantTx.length === 1 ? 'transaction' : 'transactions'} · one or more risk categories open`,
                  )}
                  {relevantTx.map((t) => renderTxRow(t))}
                </tbody>
              )}
              {assessedTx.length > 0 && (
                <tbody>
                  {/* A completeness record, not garbage: every flow that was reviewed
                      and carries no hybrid element. Full-colour, collapsible. */}
                  <tr className="border-b border-border">
                    <td colSpan={TX_COLS} className="py-2.5">
                      <div className="flex items-center gap-2.5">
                        <button
                          type="button"
                          onClick={() => setShowAssessed((v) => !v)}
                          aria-expanded={showAssessed}
                          className="flex items-center gap-2.5 text-left"
                        >
                          <span className={GROUP_LABEL}>No risk identified</span>
                          <span className={GROUP_META}>
                            {assessedTx.length} {assessedTx.length === 1 ? 'transaction' : 'transactions'}, listed for completeness
                          </span>
                        </button>
                        <span className="flex-1" />
                        <button
                          type="button"
                          onClick={() => setShowAssessed((v) => !v)}
                          aria-expanded={showAssessed}
                          className="inline-flex items-center gap-1 text-[11px] uppercase tracking-wide text-muted-foreground/70 transition-colors hover:text-foreground"
                        >
                          {showAssessed ? 'Hide' : 'Show all'}
                          {showAssessed ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                        </button>
                      </div>
                    </td>
                  </tr>
                  {showAssessed && assessedTx.map((t) => renderTxRow(t))}
                </tbody>
              )}
            </table>
          );
        })()}
      </Exhibit>

    </div>
  );
}
