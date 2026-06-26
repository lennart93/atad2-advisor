import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { AlertTriangle, Check, ChevronDown, ChevronRight, Eye, EyeOff, Info, Users, ArrowLeftRight, Handshake, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AppendixFacts, FactEntity, AppendixSectionKey } from '@/lib/appendix/types';
import { visibleFacts } from '@/lib/appendix/facts/visibleFacts';
import { isSectionExcluded, withSectionExcluded } from '@/lib/appendix/facts/sections';
import { effJurisdiction, effNlTaxStatus, effNlQualification, effNlQualificationReason, withEntityEdit } from '@/lib/appendix/facts/entityFields';
import { nlQualificationLabel, nlTaxStatusLabel, NL_TAX_STATUSES, type NlQualification } from '@/lib/appendix/facts/nlTaxStatus';
import { withClusterLikelihood, withClusterText, withClusterExclude, withClusterMembers } from '@/lib/appendix/facts/actingCluster';
import { withLocalQualification } from '@/lib/appendix/facts/classificationEdit';
import { ACTING_LIKELIHOODS, type ActingLikelihood } from '@/lib/appendix/facts/actingLikelihood';
import { inScopeEntityIds, localQualification, entityHasQualificationDifference } from '@/lib/appendix/facts/conclusions';
import { relevantTransactions, accountedTransactionGroups, withTransactionRelevance } from '@/lib/appendix/facts/relevance';
import { CountryFlag } from '@/components/CountryFlag';
import { JurisdictionPicker } from '@/components/structure/JurisdictionPicker';
import { countryName } from '@/lib/structure/countries';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface Props {
  facts: AppendixFacts;
  onChange?: (next: AppendixFacts) => void;
  generated?: boolean;
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

function pct(n: number | null): string {
  return n == null ? '-' : `${Number.isInteger(n) ? n : n.toFixed(2)}%`;
}

function nameOf(facts: AppendixFacts, id: string): string {
  return facts.entities.find((e) => e.id === id)?.name ?? id;
}

function likelihoodTint(level: ActingLikelihood): string {
  // Directional + subtle: "likely" end = amber (a group is more likely, a
  // relatedness risk); "unlikely" end = neutral slate; unclear = grey.
  switch (level) {
    case 'highly_likely':
    case 'likely':
      return 'bg-ds-amber-bg text-ds-amber-text';
    case 'unclear':
      return 'bg-muted text-muted-foreground';
    default:
      return 'bg-ds-fill-muted text-ds-ink-secondary';
  }
}

const COMPACT_CONTROL = 'h-7 text-xs bg-white/70';

// ---------------------------------------------------------------------------
// Small reusable control buttons
// ---------------------------------------------------------------------------

function ConfirmBtn({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label="Confirm"
      title="Mark as confirmed"
      onClick={onClick}
      className="inline-flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
    >
      <Check className="h-3 w-3" />
    </button>
  );
}

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

/** "N items fell out of the funnel, because X" - expandable accounting line. */
function AccountedLine({ summary, children }: { summary: string; children?: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-2 rounded-md border border-dashed border-[hsl(var(--border-subtle))] px-2.5 py-1.5 text-[11px] text-muted-foreground">
      <button type="button" className="flex w-full items-center gap-1.5 text-left" onClick={() => setOpen((o) => !o)} disabled={!children}>
        {children ? (open ? <ChevronDown className="h-3 w-3 shrink-0" /> : <ChevronRight className="h-3 w-3 shrink-0" />) : null}
        <span>{summary}</span>
      </button>
      {open && children && <div className="mt-1.5">{children}</div>}
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

/** The derived NL qualification (transparent / non-transparent / to be determined). */
function QualBadge({ q }: { q: NlQualification }) {
  const cls =
    q === 'transparent'
      ? 'bg-ds-amber-bg text-ds-amber-text'
      : q === 'non-transparent'
        ? 'bg-ds-fill-muted text-ds-ink-secondary'
        : 'bg-muted text-muted-foreground';
  return (
    <span className={cn('rounded px-1.5 py-0.5 text-[10.5px] font-medium', cls)}>
      {nlQualificationLabel(q)}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Exhibit collapsible wrapper
// ---------------------------------------------------------------------------

function Exhibit({ icon, title, defaultOpen = true, excluded = false, onToggleExcluded, children }: {
  icon: ReactNode; title: string; defaultOpen?: boolean;
  excluded?: boolean; onToggleExcluded?: () => void; children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={cn('rounded-lg border border-[hsl(var(--border-subtle))] overflow-hidden', excluded && 'opacity-60')}>
      <div className="group flex w-full items-center gap-2 bg-muted/40 px-3 py-2 text-sm font-semibold text-foreground">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex flex-1 items-center gap-2 text-left"
        >
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          {icon}
          {title}
          {excluded && (
            <span className="ml-1 rounded bg-muted px-1.5 py-0.5 text-[10px] font-normal text-muted-foreground">
              excluded from client
            </span>
          )}
        </button>
        {onToggleExcluded && (
          <span className={cn('transition-opacity focus-within:opacity-100', excluded ? 'opacity-100' : 'opacity-0 group-hover:opacity-100')}>
            <ExcludeBtn excluded={excluded} onClick={onToggleExcluded} />
          </span>
        )}
      </div>
      {open && <div className="p-3">{children}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// FactsPanel
// ---------------------------------------------------------------------------

export function FactsPanel({ facts, onChange, generated }: Props) {
  const shown = visibleFacts(facts);
  const editable = !!onChange;

  const hideEntity = (id: string) =>
    onChange?.({ ...facts, entities: facts.entities.map((e) => e.id === id ? { ...e, hidden: true } : e) });

  const restoreHidden = () =>
    onChange?.({ ...facts, entities: facts.entities.map((e) => e.hidden ? { ...e, hidden: false } : e) });

  const hiddenEntities = useMemo(() => facts.entities.filter((e) => e.hidden), [facts.entities]);


  // Whole-section "leave out of the client export" toggle, mirroring the per-item
  // exclude. Editable only; the internal working copy still shows every section.
  const sectionProps = (key: AppendixSectionKey) => ({
    excluded: isSectionExcluded(facts, key),
    onToggleExcluded: editable
      ? () => onChange!(withSectionExcluded(facts, key, !isSectionExcluded(facts, key)))
      : undefined,
  });

  const inScope = useMemo(() => inScopeEntityIds(facts), [facts]);
  const [editCell, setEditCell] = useState<{ id: string; field: 'jurisdiction' | 'entityType' | 'nlTaxStatus' } | null>(null);
  // Master-table row whose local qualification is being edited.
  const [editLocalQual, setEditLocalQual] = useState<string | null>(null);
  // Collapsed remainder of the master table (non-related, no mismatch).
  const [showAllEntities, setShowAllEntities] = useState(false);
  // Register rows whose relationship note is expanded (collapsed by default).
  const [openNotes, setOpenNotes] = useState<Set<string>>(new Set());
  const toggleNote = (id: string) =>
    setOpenNotes((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  // Same toggle, scoped to the Classification (NL) column.
  const [openClsNotes, setOpenClsNotes] = useState<Set<string>>(new Set());
  const toggleClsNote = (id: string) =>
    setOpenClsNotes((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  if (!shown.entities.length && !facts.entities.length) {
    return (
      <div className="rounded-md border border-dashed px-4 py-10 text-center">
        <p className="text-sm font-medium text-foreground">No facts to show yet</p>
        <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
          The entity register is built from the structure chart, which is extracted from the
          uploaded documents. This session has no entities yet. Upload documents with the group
          structure, or use Regenerate once they have been processed.
        </p>
      </div>
    );
  }

  // ONE master table: every entity rendered once, grouped by relevance. The
  // related-parties and classification sections read derived flags from these
  // same rows instead of re-rendering the register.
  const isTaxpayerSide = (e: FactEntity) =>
    e.role === 'Taxpayer' || !!e.memberOfUnityId || !!e.inTaxpayerFiscalUnity;
  const clsByEntity = new Map(shown.classifications.map((c) => [c.entityId, c]));
  const likelyMemberIds = new Set(
    shown.actingTogether
      .filter((a) => !a.excludedFromClient && (a.likelihood === 'likely' || a.likelihood === 'highly_likely'))
      .flatMap((a) => a.memberEntityIds),
  );
  const relatedPctOf = (e: FactEntity) => e.ownershipPct ?? e.relatedViaPct ?? null;
  const hasMismatch = (e: FactEntity) => entityHasQualificationDifference(e, clsByEntity.get(e.id));
  const isRelevantRow = (e: FactEntity) =>
    e.related || !!e.shareholderOfTaxpayer || likelyMemberIds.has(e.id) || hasMismatch(e);

  const taxpayerEnts = shown.entities.filter(isTaxpayerSide);
  const others = shown.entities.filter((e) => !isTaxpayerSide(e));
  const relevantEnts = others
    .filter(isRelevantRow)
    .sort((a, b) => (relatedPctOf(b) ?? -1) - (relatedPctOf(a) ?? -1));
  const restEnts = others.filter((e) => !isRelevantRow(e));

  const notLikelyClusters = shown.actingTogether.filter(
    (a) => !(a.likelihood === 'likely' || a.likelihood === 'highly_likely'),
  ).length;

  const relevantTx = relevantTransactions(shown);
  const accountedTx = accountedTransactionGroups(shown);

  const COLS = editable ? 7 : 6;
  const groupLabelRow = (label: string) => (
    <tr>
      <td colSpan={COLS} className="pt-2 pb-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground/70">
        {label}
      </td>
    </tr>
  );

  /**
   * Subsidiaries say whether the holding is direct; older facts (no flag) stay
   * plain. "Group entity" reads as "Other" (the data value stays Group entity).
   */
  const roleLabel = (e: FactEntity): string => {
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

  const renderEntityRow = (e: FactEntity, tint?: string) => {
    const isMember = !!e.memberOfUnityId;
    const muted = isMember ? 'text-muted-foreground/70' : 'text-muted-foreground';
    const jur = effJurisdiction(e);
    const status = effNlTaxStatus(e);
    const nlQual = effNlQualification(e);
    const nlReason = effNlQualificationReason(e);
    const c = clsByEntity.get(e.id);
    const localQual = c ? localQualification(c.homeClass) : 'undetermined';
    const mismatch = hasMismatch(e);
    const rowTint = tint ?? (mismatch ? 'bg-ds-amber-bg' : undefined);
    return (
      <tr key={e.id} className={cn('group border-t border-[hsl(var(--border-subtle))] align-middle', rowTint)}>
        <td className="py-1 pr-2 font-mono text-ds-ink-secondary">{e.id}</td>
        <td className="pr-2 font-medium text-foreground">
          {isMember && <span className="mr-1 text-muted-foreground">↳</span>}
          {mismatch && <AlertTriangle className="mr-1 inline h-3 w-3 text-ds-amber" aria-label="Qualification difference" />}
          <span className={cn(isMember && 'text-muted-foreground')}>{e.name}</span>
          {/* "Other" means "nothing special"; the relationship lives in the (i) below.
              Only meaningful roles keep a tag. */}
          {roleLabel(e) !== 'Other' && (
            <span className="ml-1.5 text-[9.5px] font-normal uppercase tracking-wide text-muted-foreground/60">{roleLabel(e)}</span>
          )}
          {e.isFiscalUnity && (
            <span className="ml-1.5 rounded bg-ds-fill-muted px-1 text-[10px] font-normal text-ds-ink-secondary">
              fiscal unity
            </span>
          )}
          {e.inTaxpayerFiscalUnity && (
            <span
              className="ml-1.5 rounded bg-ds-fill-muted px-1 text-[10px] font-normal text-ds-ink-secondary"
              title="Forms a Dutch fiscal unity (fiscale eenheid) with E1; part of the same NL taxpayer"
            >
              fiscal unity · taxpayer
            </span>
          )}
          {positionNote(e) && (
            <>
              <button
                type="button"
                aria-expanded={openNotes.has(e.id)}
                aria-label={`How ${e.name} relates to the taxpayer`}
                title="How this entity relates to the taxpayer"
                onClick={() => toggleNote(e.id)}
                className={cn(
                  'ml-1 inline-flex h-5 w-5 items-center justify-center rounded align-middle transition-all hover:bg-muted hover:text-foreground focus-visible:opacity-100',
                  openNotes.has(e.id) ? 'text-foreground opacity-100' : 'text-muted-foreground/60 opacity-0 group-hover:opacity-100',
                )}
              >
                <Info className="h-3 w-3" />
              </button>
              {openNotes.has(e.id) && (
                <div className="mt-0.5 max-w-md text-[10.5px] font-normal leading-snug text-muted-foreground">
                  {positionNote(e)}
                </div>
              )}
            </>
          )}
        </td>

        {/* Jurisdiction */}
        <td className="pr-2 py-0.5">
          <QuietCell
            display={
              <span className={cn('flex items-center gap-1.5', muted)}>
                {jur ? <><CountryFlag iso={jur} /> {countryName(jur) || jur}</> : (editable ? 'Set…' : '-')}
              </span>
            }
            editing={editable && editCell?.id === e.id && editCell?.field === 'jurisdiction'}
            onStartEdit={editable ? () => setEditCell({ id: e.id, field: 'jurisdiction' }) : undefined}
          >
            <JurisdictionPicker
              value={jur ?? ''}
              onChange={(iso) => onChange!(withEntityEdit(facts, e.id, 'jurisdiction', iso || null))}
              defaultOpen
              onSettled={() => setEditCell(null)}
              className={COMPACT_CONTROL}
              placeholder="Set…"
            />
          </QuietCell>
        </td>

        {/* Classification (NL): transparent vs non-transparent, derived from the
            underlying NL tax status; the quiet editor still picks the status. */}
        <td className="pr-2 py-0.5">
          <div className="flex items-center gap-0.5">
          <QuietCell
            display={
              <span className="flex items-center gap-1.5" title={nlTaxStatusLabel(status)}>
                {/* Show the classification: a Dutch corporation falls back to
                    non-transparent, so only a genuinely undetermined entity (a
                    foreign or partnership/hybrid form) stays a quiet dash. */}
                {nlQual === 'undetermined'
                  ? <span className="text-[10.5px] text-muted-foreground/40">–</span>
                  : <QualBadge q={nlQual} />}
              </span>
            }
            editing={editable && editCell?.id === e.id && editCell?.field === 'nlTaxStatus'}
            onStartEdit={editable ? () => setEditCell({ id: e.id, field: 'nlTaxStatus' }) : undefined}
          >
            <Select
              value={status ?? undefined}
              defaultOpen
              onOpenChange={(open) => { if (!open) setEditCell(null); }}
              onValueChange={(v) => onChange!(withEntityEdit(facts, e.id, 'nlTaxStatus', v))}
            >
              <SelectTrigger className={COMPACT_CONTROL}><SelectValue placeholder="Set…" /></SelectTrigger>
              <SelectContent>
                {NL_TAX_STATUSES.map((s) => <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </QuietCell>
          {nlReason && (
            <button
              type="button"
              aria-expanded={openClsNotes.has(e.id)}
              aria-label={`How the NL classification of ${e.name} was reached`}
              title="How this classification was reached"
              onClick={() => toggleClsNote(e.id)}
              className={cn(
                'inline-flex h-5 w-5 items-center justify-center rounded transition-all hover:bg-muted hover:text-foreground focus-visible:opacity-100',
                openClsNotes.has(e.id) ? 'text-foreground opacity-100' : 'text-muted-foreground/60 opacity-0 group-hover:opacity-100',
              )}
            >
              <Info className="h-3 w-3" />
            </button>
          )}
          </div>
          {openClsNotes.has(e.id) && nlReason && (
            <div className="mt-0.5 text-[10.5px] font-normal leading-snug text-muted-foreground">
              {nlReason}
            </div>
          )}
        </td>

        {/* Local (home-state) qualification; advisor-editable, survives regeneration. */}
        <td className="pr-2 py-0.5">
          <QuietCell
            display={
              localQual === 'transparent'
                ? <span className="rounded bg-ds-amber-bg px-1.5 py-0.5 text-[10.5px] font-medium text-ds-amber-text">Transparent{c?.homeState ? ` (${c.homeState})` : ''}</span>
                : <span className={cn('text-[10.5px]', localQual === 'undetermined' ? 'text-muted-foreground/50' : muted)}>
                    {c ? `${nlQualificationLabel(localQual)}${c.homeState ? ` (${c.homeState})` : ''}` : '-'}
                  </span>
            }
            editing={editable && editLocalQual === e.id}
            onStartEdit={editable ? () => setEditLocalQual(e.id) : undefined}
          >
            <Select
              value={localQual === 'undetermined' ? undefined : (localQual === 'transparent' ? 'transparent' : 'opaque')}
              defaultOpen
              onOpenChange={(open) => { if (!open) setEditLocalQual(null); }}
              onValueChange={(v) => onChange!(withLocalQualification(facts, e.id, v as 'transparent' | 'opaque' | 'unknown', effJurisdiction(e)))}
            >
              <SelectTrigger className={COMPACT_CONTROL}><SelectValue placeholder="Set…" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="transparent">Transparent</SelectItem>
                <SelectItem value="opaque">Non-transparent</SelectItem>
                <SelectItem value="unknown">Not determined (-)</SelectItem>
              </SelectContent>
            </Select>
          </QuietCell>
        </td>

        {/* Effective related-party percentage; the taxpayer is the reference point. */}
        <td className={cn('py-1 pl-2 text-right tabular-nums', e.related ? 'font-medium text-foreground' : muted)}>
          {e.role === 'Taxpayer' || isMember ? '' : (relatedPctOf(e) != null ? pct(relatedPctOf(e)) : '-')}
        </td>
        {editable && (
          <td className="pl-1">
            {e.role !== 'Taxpayer' && !isMember && (
              <button
                type="button"
                aria-label={`Mark ${e.name} irrelevant`}
                title="Mark as irrelevant"
                onClick={() => hideEntity(e.id)}
                className="inline-flex h-5 w-5 items-center justify-center rounded text-muted-foreground opacity-0 transition-all hover:bg-muted hover:text-foreground group-hover:opacity-100 focus-visible:opacity-100"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </td>
        )}
      </tr>
    );
  };

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-foreground">Part A · Facts &amp; relationships</h3>

      {/* ------------------------------------------------------------------ */}
      {/* 1. The group and the taxpayer                                        */}
      {/* ------------------------------------------------------------------ */}
      <Exhibit icon={<Users className="h-4 w-4 text-muted-foreground" />} title="1 · The group and the taxpayer" {...sectionProps('entityRegister')}>
        <table className="w-full text-xs">
          <thead className="text-muted-foreground">
            <tr className="text-left">
              <th className="py-1 pr-2 w-8">#</th><th className="pr-2">Entity</th><th className="pr-2 w-[150px]">Jurisdiction</th>
              <th className="pr-2 w-[140px]">Classification (NL)</th><th className="pr-2 w-[150px]">Local</th>
              <th className="pl-2 w-[80px] text-right">Related %</th>
              {editable && <th className="w-6" aria-label="Controls" />}
            </tr>
          </thead>
          {taxpayerEnts.length > 0 && (
            <tbody>
              {groupLabelRow('The taxpayer')}
              {taxpayerEnts.map((e) => renderEntityRow(e, 'bg-ds-fill-muted'))}
            </tbody>
          )}
          {relevantEnts.length > 0 && (
            <tbody>
              {groupLabelRow('Related and relevant')}
              {relevantEnts.map((e) => renderEntityRow(e))}
            </tbody>
          )}
          {restEnts.length > 0 && (
            <tbody>
              <tr className="border-t border-[hsl(var(--border-subtle))]">
                <td colSpan={COLS} className="py-1.5">
                  <button
                    type="button"
                    onClick={() => setShowAllEntities((v) => !v)}
                    className="flex items-center gap-1.5 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {showAllEntities ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                    {restEnts.length} non-related {restEnts.length === 1 ? 'entity' : 'entities'} · below 25%, no qualification difference · {showAllEntities ? 'hide' : 'show all'}
                  </button>
                </td>
              </tr>
              {showAllEntities && restEnts.map((e) => renderEntityRow(e))}
            </tbody>
          )}
        </table>
        {editable && hiddenEntities.length > 0 && (
          <p className="mt-1.5 text-xs text-muted-foreground">
            Hidden ({hiddenEntities.length}): {hiddenEntities.map((e) => e.name).join(', ')}
            {' · '}
            <button
              type="button"
              onClick={restoreHidden}
              className="underline underline-offset-2 hover:text-foreground transition-colors"
            >
              show
            </button>
          </p>
        )}

        {/* Actionable callouts only: hybrid classification differences and any
            local qualification still to be set. The relatedness/classification
            prose is dropped from the screen (it still feeds the memo via
            facts.narratives); the table above is the source of truth. */}
        {(() => {
          const mismatches = shown.entities.filter((e) => hasMismatch(e));
          const tbd = shown.entities.filter((e) => {
            if (isTaxpayerSide(e) || hasMismatch(e) || !inScope.has(e.id)) return false;
            const c = clsByEntity.get(e.id);
            return (c ? localQualification(c.homeClass) : 'undetermined') === 'undetermined';
          });
          if (!mismatches.length && !tbd.length) return null;
          return (
            <div className="mt-2.5 space-y-1.5 text-xs">
              {mismatches.map((e) => {
                const c = clsByEntity.get(e.id);
                const localQ = c ? localQualification(c.homeClass) : 'undetermined';
                return (
                  <div key={e.id} className="flex items-start gap-2 rounded-md border border-ds-amber bg-ds-amber-bg px-2.5 py-1.5">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ds-amber" />
                    <span>
                      <span className="font-mono text-ds-ink-secondary">{e.id}</span>{' '}
                      <span className="font-medium text-foreground">{e.name}</span>
                      <span className="text-muted-foreground">
                        {': '}
                        {nlQualificationLabel(effNlQualification(e)).toLowerCase()} for Dutch purposes, {nlQualificationLabel(localQ).toLowerCase()}
                        {c?.homeState ? ` in ${c.homeState}` : ' locally'}; hybrid classification difference.
                      </span>
                    </span>
                  </div>
                );
              })}
              {tbd.map((e) => (
                <div key={e.id} className="flex items-start gap-2 rounded-md border border-dashed border-[hsl(var(--border-subtle))] px-2.5 py-1.5 text-muted-foreground">
                  <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>
                    <span className="font-mono text-ds-ink-secondary">{e.id}</span>{' '}
                    <span className="font-medium text-foreground">{e.name}</span>
                    {': '}party to a relevant transaction, but the local qualification is still to be determined. Set it in the Local column above.
                  </span>
                </div>
              ))}
            </div>
          );
        })()}
      </Exhibit>

      {/* ------------------------------------------------------------------ */}
      {/* 2. Acting together                                                   */}
      {/* ------------------------------------------------------------------ */}
      <Exhibit icon={<Handshake className="h-4 w-4 text-muted-foreground" />} title="2 · Acting together" {...sectionProps('actingTogether')}>
        <div>
          {shown.actingTogether.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              {generated ? 'No entities that could form an acting-together group.' : 'Not assessed yet.'}
            </p>
          ) : (
            <div className="space-y-2.5">
              {shown.actingTogether.map((a) => (
                <div
                  key={a.id}
                  className={cn(
                    'rounded-md border border-[hsl(var(--border-subtle))] p-2.5',
                    a.excludedFromClient && 'opacity-60',
                  )}
                >
                  <div className="flex items-start gap-2">
                    <div className="flex-1 text-xs">
                      {editable ? (
                        <div className="flex flex-wrap items-center gap-1">
                          {a.memberEntityIds.map((id) => (
                            <span key={id} className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 font-medium text-foreground">
                              {nameOf(facts, id)}
                              <button
                                type="button"
                                aria-label={`Remove ${nameOf(facts, id)} from the group`}
                                title="Remove from the group"
                                onClick={() => onChange!(withClusterMembers(facts, a.id, a.memberEntityIds.filter((m) => m !== id)))}
                                className="text-muted-foreground hover:text-foreground"
                              >
                                <X className="h-2.5 w-2.5" />
                              </button>
                            </span>
                          ))}
                          {(() => {
                            const candidates = shown.entities.filter(
                              (e) => e.role !== 'Taxpayer' && !e.memberOfUnityId && !a.memberEntityIds.includes(e.id),
                            );
                            if (!candidates.length) return null;
                            return (
                              <Select value="" onValueChange={(id) => onChange!(withClusterMembers(facts, a.id, [...a.memberEntityIds, id]))}>
                                <SelectTrigger className="h-5 w-auto gap-1 border-dashed px-1.5 text-[10.5px] text-muted-foreground">
                                  <SelectValue placeholder="Add entity…" />
                                </SelectTrigger>
                                <SelectContent>
                                  {candidates.map((e) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
                                </SelectContent>
                              </Select>
                            );
                          })()}
                          {a.combinedPct != null && <span className="text-muted-foreground"> ≈ {pct(a.combinedPct)}</span>}
                        </div>
                      ) : (
                        <>
                          <span className="font-medium text-foreground">
                            {a.memberEntityIds.map((id) => nameOf(facts, id)).join(' + ')}
                          </span>
                          {a.combinedPct != null && <span className="text-muted-foreground"> ≈ {pct(a.combinedPct)}</span>}
                        </>
                      )}
                    </div>
                    {editable && (
                      <ExcludeBtn
                        excluded={a.excludedFromClient}
                        onClick={() => onChange!(withClusterExclude(facts, a.id, !a.excludedFromClient))}
                      />
                    )}
                  </div>

                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {ACTING_LIKELIHOODS.map((l) => {
                      const active = a.likelihood === l.key;
                      return (
                        <button
                          key={l.key}
                          type="button"
                          disabled={!editable}
                          onClick={() => onChange!(withClusterLikelihood(facts, a.id, l.key))}
                          className={cn(
                            'rounded px-1.5 py-0.5 text-[10.5px] font-medium transition-colors',
                            active ? likelihoodTint(l.key) : 'bg-transparent text-muted-foreground hover:bg-muted',
                            !editable && 'cursor-default',
                          )}
                          aria-pressed={active}
                        >
                          {l.label}
                        </button>
                      );
                    })}
                  </div>

                  {editable ? (
                    <textarea
                      value={a.reasoning}
                      onChange={(e) => onChange!(withClusterText(facts, a.id, e.target.value))}
                      rows={2}
                      className="mt-1.5 w-full resize-y rounded border border-[hsl(var(--border-subtle))] bg-white/70 px-2 py-1 text-[11px] leading-relaxed text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ds-ink-tertiary"
                    />
                  ) : (
                    <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">{a.reasoning}</p>
                  )}
                </div>
              ))}
            </div>
          )}
          {notLikelyClusters > 0 && (
            <AccountedLine
              summary={`${notLikelyClusters} candidate ${notLikelyClusters === 1 ? 'grouping was' : 'groupings were'} considered and not assessed as likely; ${notLikelyClusters === 1 ? 'it is' : 'they are'} left out of the client annex.`}
            />
          )}
        </div>
      </Exhibit>

      {/* ------------------------------------------------------------------ */}
      {/* 3. Relevant transactions                                             */}
      {/* ------------------------------------------------------------------ */}
      <Exhibit icon={<ArrowLeftRight className="h-4 w-4 text-muted-foreground" />} title="3 · Relevant transactions" {...sectionProps('transactions')}>
        {relevantTx.length === 0
          ? <p className="text-xs text-muted-foreground">{generated ? 'No relevant intra-group transactions identified.' : 'Not generated yet.'}</p>
          : (
          <table className="w-full text-xs">
            <thead className="text-muted-foreground">
              <tr className="text-left">
                <th className="py-1 pr-2">#</th>
                <th className="pr-2">Transaction</th>
                <th className="pr-2">Type</th>
                <th className="pr-2">Instrument</th>
                <th className="pr-2">Why relevant</th>
                <th>Article(s)</th>
                {editable && <th className="w-16" aria-label="Controls" />}
              </tr>
            </thead>
            <tbody>
              {relevantTx.map((t) => {
                const confirmed = t.status === 'confirmed';
                return (
                  <tr
                    key={t.id}
                    className={cn('group border-t border-[hsl(var(--border-subtle))]', t.excludedFromClient && 'opacity-60')}
                  >
                    <td className="py-1 pr-2 font-mono text-ds-ink-secondary">{t.id}</td>
                    <td className="pr-2">
                      {nameOf(facts, t.fromEntityId)} → {nameOf(facts, t.toEntityId)}
                    </td>
                    <td className="pr-2 text-muted-foreground">{t.kind}</td>
                    <td className="pr-2 text-muted-foreground">{t.instrument ?? '-'}</td>
                    <td className="pr-2 text-muted-foreground">{t.relevanceReason ?? '-'}</td>
                    <td className="text-muted-foreground">
                      {t.articlesTested.join(' · ')}
                      {confirmed && (
                        <span className="ml-1 text-muted-foreground/60" title="Confirmed">
                          <Check className="inline h-2.5 w-2.5" />
                        </span>
                      )}
                    </td>
                    {editable && (
                      <td className="pl-1">
                        <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                          {!confirmed && (
                            <ConfirmBtn
                              onClick={() => onChange!(withTransaction(facts, t.id, { status: 'confirmed', source: 'edited' }))}
                            />
                          )}
                          <ExcludeBtn
                            excluded={t.excludedFromClient}
                            onClick={() => onChange!(withTransaction(facts, t.id, { excludedFromClient: !t.excludedFromClient }))}
                          />
                          <button
                            type="button"
                            title="Mark as not relevant"
                            aria-label="Mark as not relevant"
                            onClick={() => onChange!(withTransactionRelevance(facts, t.id, false))}
                            className="inline-flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        {/* One collapsed group for every not-relevant transaction, each line
            carrying its own short reason; never more than one hidden group. */}
        {(() => {
          const accountedItems = accountedTx.flatMap((g) =>
            g.transactions.map((t) => ({ t, reason: g.reason })),
          );
          if (!accountedItems.length) return null;
          return (
            <AccountedLine
              summary={`${accountedItems.length} ${accountedItems.length === 1 ? 'transaction' : 'transactions'} not relevant`}
            >
              <div className="space-y-1">
                {accountedItems.map(({ t, reason }) => (
                  <div key={t.id} className="flex items-start gap-2">
                    <span className="shrink-0 font-mono text-ds-ink-secondary">{t.id}</span>
                    <span className="min-w-0 flex-1">
                      {nameOf(facts, t.fromEntityId)} → {nameOf(facts, t.toEntityId)}
                      <span className="text-muted-foreground"> · {t.kind}</span>
                      {reason && <span className="text-muted-foreground/70"> · {reason}</span>}
                    </span>
                    {editable && (
                      <button
                        type="button"
                        className="shrink-0 underline underline-offset-2 hover:text-foreground"
                        onClick={() => onChange!(withTransactionRelevance(facts, t.id, true))}
                      >
                        mark relevant
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </AccountedLine>
          );
        })()}
      </Exhibit>

    </div>
  );
}
