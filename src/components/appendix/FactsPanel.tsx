import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Check, ChevronDown, ChevronRight, Eye, EyeOff, Users, Network, Layers, ArrowLeftRight, Handshake, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AppendixFacts, FactEntity, AppendixSectionKey, NarrativeKey, Narrative } from '@/lib/appendix/types';
import { visibleFacts } from '@/lib/appendix/facts/visibleFacts';
import { isSectionExcluded, withSectionExcluded } from '@/lib/appendix/facts/sections';
import { effJurisdiction, effEntityType, effNlTaxStatus, withEntityEdit } from '@/lib/appendix/facts/entityFields';
import { nlQualification, nlQualificationLabel, nlTaxStatusLabel, NL_TAX_STATUSES } from '@/lib/appendix/facts/nlTaxStatus';
import { withClusterLikelihood, withClusterText, withClusterExclude } from '@/lib/appendix/facts/actingCluster';
import { ACTING_LIKELIHOODS, type ActingLikelihood } from '@/lib/appendix/facts/actingLikelihood';
import { deriveConclusions, inScopeEntityIds, localQualification } from '@/lib/appendix/facts/conclusions';
import { relevantTransactions, accountedTransactionGroups, withTransactionRelevance } from '@/lib/appendix/facts/relevance';
import { withNarrative } from '@/lib/appendix/facts/narratives';
import { CountryFlag } from '@/components/CountryFlag';
import { JurisdictionPicker } from '@/components/structure/JurisdictionPicker';
import { ENTITY_TYPES } from '@/lib/structure/types';
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
      return 'bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200';
    case 'unclear':
      return 'bg-muted text-muted-foreground';
    default:
      return 'bg-stone-100 text-stone-700 dark:bg-stone-800 dark:text-stone-300';
  }
}

function entityTypeLabel(key: string | null): string {
  return ENTITY_TYPES.find((t) => t.key === key)?.label ?? (key && key.trim() ? key : '-');
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

/** One connective AI sentence under a section title; click to edit. */
function NarrativeLine({ narrative, onSave }: { narrative?: Narrative; onSave?: (text: string) => void }) {
  const [editing, setEditing] = useState(false);
  if (!narrative?.text && !editing) return null;
  if (editing && onSave) {
    return (
      <textarea
        autoFocus
        defaultValue={narrative?.text ?? ''}
        rows={2}
        onBlur={(e) => { setEditing(false); onSave(e.target.value.trim()); }}
        className="mb-2 w-full resize-y rounded border border-[hsl(var(--border-subtle))] bg-white/70 px-2 py-1 text-[11.5px] leading-relaxed text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-stone-400"
      />
    );
  }
  return (
    <p
      className={cn('mb-2 text-[11.5px] leading-relaxed text-muted-foreground', onSave && 'cursor-text hover:text-foreground')}
      title={onSave ? 'Click to edit' : undefined}
      onClick={onSave ? () => setEditing(true) : undefined}
    >
      {narrative?.text}
    </p>
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
function QualBadge({ status }: { status: string | null }) {
  const q = nlQualification(status);
  const cls =
    q === 'transparent'
      ? 'bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200'
      : q === 'non-transparent'
        ? 'bg-stone-100 text-stone-700 dark:bg-stone-800 dark:text-stone-300'
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

function Exhibit({ tag, icon, title, defaultOpen = true, excluded = false, onToggleExcluded, children }: {
  tag: string; icon: ReactNode; title: string; defaultOpen?: boolean;
  excluded?: boolean; onToggleExcluded?: () => void; children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={cn('rounded-lg border border-[hsl(var(--border-subtle))] overflow-hidden', excluded && 'opacity-60')}>
      <div className="flex w-full items-center gap-2 bg-muted/40 px-3 py-2 text-sm font-semibold text-foreground">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex flex-1 items-center gap-2 text-left"
        >
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          <span className="font-mono text-xs text-sky-700 dark:text-sky-300">{tag}</span>
          {icon}
          {title}
          {excluded && (
            <span className="ml-1 rounded bg-muted px-1.5 py-0.5 text-[10px] font-normal text-muted-foreground">
              excluded from client
            </span>
          )}
        </button>
        {onToggleExcluded && <ExcludeBtn excluded={excluded} onClick={onToggleExcluded} />}
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

  const related = useMemo(
    () => shown.entities.filter((e) => e.role !== 'Taxpayer' && !e.memberOfUnityId && !e.inTaxpayerFiscalUnity),
    [shown.entities],
  );

  // Whole-section "leave out of the client export" toggle, mirroring the per-item
  // exclude. Editable only; the internal working copy still shows every section.
  const sectionProps = (key: AppendixSectionKey) => ({
    excluded: isSectionExcluded(facts, key),
    onToggleExcluded: editable
      ? () => onChange!(withSectionExcluded(facts, key, !isSectionExcluded(facts, key)))
      : undefined,
  });

  const flags = useMemo(() => deriveConclusions(facts), [facts]);
  const inScope = useMemo(() => inScopeEntityIds(facts), [facts]);
  const [editCell, setEditCell] = useState<{ id: string; field: 'jurisdiction' | 'entityType' | 'nlTaxStatus' } | null>(null);
  const narrative = (key: NarrativeKey) => facts.narratives?.[key];
  const saveNarrative = editable ? (key: NarrativeKey) => (text: string) => onChange!(withNarrative(facts, key, text)) : undefined;

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

  // Funnel split for section 1: the taxpayer side (incl. fiscal-unity members)
  // versus the rest of the group.
  const isTaxpayerSide = (e: FactEntity) =>
    e.role === 'Taxpayer' || !!e.memberOfUnityId || !!e.inTaxpayerFiscalUnity;
  const taxpayerEnts = shown.entities.filter(isTaxpayerSide);
  const otherEnts = shown.entities.filter((e) => !isTaxpayerSide(e));

  const relatedYes = related.filter((e) => e.related);
  const relatedNo = related.filter((e) => !e.related);
  const notLikelyClusters = shown.actingTogether.filter(
    (a) => !(a.likelihood === 'likely' || a.likelihood === 'highly_likely'),
  ).length;

  const relevantTx = relevantTransactions(shown);
  const accountedTx = accountedTransactionGroups(shown);

  const groupLabelRow = (label: string) => (
    <tr>
      <td colSpan={editable ? 7 : 6} className="pt-2 pb-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground/70">
        {label}
      </td>
    </tr>
  );

  const renderEntityRow = (e: FactEntity, tint?: string) => {
    const isMember = !!e.memberOfUnityId;
    const muted = isMember ? 'text-muted-foreground/70' : 'text-muted-foreground';
    const jur = effJurisdiction(e);
    const type = effEntityType(e);
    const status = effNlTaxStatus(e);
    return (
      <tr key={e.id} className={cn('border-t border-[hsl(var(--border-subtle))] align-middle', tint)}>
        <td className="py-1 pr-2 font-mono text-sky-700 dark:text-sky-300">{e.id}</td>
        <td className="pr-2 font-medium text-foreground">
          {isMember && <span className="mr-1 text-muted-foreground">↳</span>}
          <span className={cn(isMember && 'text-muted-foreground')}>{e.name}</span>
          {e.isFiscalUnity && (
            <span className="ml-1.5 rounded bg-sky-100 px-1 text-[10px] font-normal text-sky-700 dark:bg-sky-900/40 dark:text-sky-300">
              fiscal unity
            </span>
          )}
          {e.inTaxpayerFiscalUnity && (
            <span
              className="ml-1.5 rounded bg-sky-100 px-1 text-[10px] font-normal text-sky-700 dark:bg-sky-900/40 dark:text-sky-300"
              title="Forms a Dutch fiscal unity (fiscale eenheid) with E1; part of the same NL taxpayer"
            >
              fiscal unity · taxpayer
            </span>
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
              onChange={(iso) => {
                setEditCell(null);
                onChange!(withEntityEdit(facts, e.id, 'jurisdiction', iso || null));
              }}
              className={COMPACT_CONTROL}
              placeholder="Set…"
            />
          </QuietCell>
        </td>

        {/* Type */}
        <td className="pr-2 py-0.5">
          {e.isFiscalUnity ? (
            <span className={muted}>Fiscal unity</span>
          ) : (
            <QuietCell
              display={<span className={muted}>{entityTypeLabel(type)}</span>}
              editing={editable && editCell?.id === e.id && editCell?.field === 'entityType'}
              onStartEdit={editable ? () => setEditCell({ id: e.id, field: 'entityType' }) : undefined}
            >
              <Select
                value={type ?? undefined}
                onValueChange={(v) => {
                  setEditCell(null);
                  onChange!(withEntityEdit(facts, e.id, 'entityType', v));
                }}
              >
                <SelectTrigger className={COMPACT_CONTROL}><SelectValue placeholder="Set…" /></SelectTrigger>
                <SelectContent>
                  {ENTITY_TYPES.map((t) => <SelectItem key={t.key} value={t.key}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </QuietCell>
          )}
        </td>

        {/* NL tax status */}
        <td className="pr-2 py-0.5">
          <QuietCell
            display={<span className={muted}>{nlTaxStatusLabel(status)}</span>}
            editing={editable && editCell?.id === e.id && editCell?.field === 'nlTaxStatus'}
            onStartEdit={editable ? () => setEditCell({ id: e.id, field: 'nlTaxStatus' }) : undefined}
          >
            <Select
              value={status ?? undefined}
              onValueChange={(v) => {
                setEditCell(null);
                onChange!(withEntityEdit(facts, e.id, 'nlTaxStatus', v));
              }}
            >
              <SelectTrigger className={COMPACT_CONTROL}><SelectValue placeholder="Set…" /></SelectTrigger>
              <SelectContent>
                {NL_TAX_STATUSES.map((s) => <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </QuietCell>
        </td>

        <td className={muted}>{e.role}</td>
        {editable && (
          <td className="pl-1">
            {e.role !== 'Taxpayer' && !isMember && (
              <button
                type="button"
                aria-label={`Mark ${e.name} irrelevant`}
                title="Mark as irrelevant"
                onClick={() => hideEntity(e.id)}
                className="inline-flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </td>
        )}
      </tr>
    );
  };

  const renderRelatedRow = (e: FactEntity) => {
    const viaName = e.relatedVia ? nameOf(facts, e.relatedVia) : null;
    const shownPct = e.ownershipPct ?? e.relatedViaPct ?? null;
    return (
      <div key={e.id} className="flex items-center gap-2">
        <span className={cn('h-1.5 w-1.5 rounded-full', e.related ? 'bg-sky-500' : 'bg-muted-foreground/30')} />
        <span className="font-mono text-sky-700 dark:text-sky-300">{e.id}</span>
        <span className={cn(e.related ? 'font-medium text-foreground' : 'text-muted-foreground')}>{e.name}</span>
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground/70">{e.role}</span>
        {viaName && <span className="text-[11px] text-muted-foreground">via {viaName}</span>}
        <span className="flex-1" />
        <span className="tabular-nums text-muted-foreground">{pct(shownPct)}</span>
      </div>
    );
  };

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-foreground">Part A · Facts &amp; relationships</h3>

      {/* ------------------------------------------------------------------ */}
      {/* Summary strip: deterministic funnel conclusions                     */}
      {/* ------------------------------------------------------------------ */}
      <div className="rounded-lg border border-[hsl(var(--border-subtle))] px-3 py-2.5">
        <table className="w-full text-xs">
          <tbody>
            <tr>
              <td className="py-0.5 pr-2 text-muted-foreground">Cross-border flows with related parties</td>
              <td className="py-0.5 text-right font-medium text-foreground">
                {flags.crossBorderRelatedFlows > 0 ? `${flags.crossBorderRelatedFlows} identified` : 'None identified'}
              </td>
            </tr>
            <tr>
              <td className="py-0.5 pr-2 text-muted-foreground">Hybrid qualification differences (NL vs local)</td>
              <td className="py-0.5 text-right font-medium text-foreground">
                {flags.hybridDifferences > 0 ? `${flags.hybridDifferences} identified` : 'None identified'}
              </td>
            </tr>
            <tr>
              <td className="py-0.5 pr-2 text-muted-foreground">Acting-together group considered likely</td>
              <td className="py-0.5 text-right font-medium text-foreground">
                {flags.likelyActingTogether > 0 ? `${flags.likelyActingTogether} ${flags.likelyActingTogether === 1 ? 'cluster' : 'clusters'}` : 'None'}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* E - 1. The group and the taxpayer                                    */}
      {/* ------------------------------------------------------------------ */}
      <Exhibit tag="E" icon={<Users className="h-4 w-4 text-muted-foreground" />} title="1 · The group and the taxpayer" {...sectionProps('entityRegister')}>
        <NarrativeLine narrative={narrative('register')} onSave={saveNarrative?.('register')} />
        <table className="w-full text-xs">
          <thead className="text-muted-foreground">
            <tr className="text-left">
              <th className="py-1 pr-2">#</th><th className="pr-2">Entity</th><th className="pr-2 min-w-[150px]">Jurisdiction</th>
              <th className="pr-2 min-w-[130px]">Type</th><th className="pr-2 min-w-[160px]">NL tax status</th><th>Role</th>
              {editable && <th className="w-6" aria-label="Controls" />}
            </tr>
          </thead>
          {taxpayerEnts.length > 0 && (
            <tbody>
              {groupLabelRow('The taxpayer')}
              {taxpayerEnts.map((e) => renderEntityRow(e, 'bg-sky-50/50 dark:bg-sky-950/20'))}
            </tbody>
          )}
          {otherEnts.length > 0 && (
            <tbody>
              {groupLabelRow('Other group entities')}
              {otherEnts.map((e) => renderEntityRow(e))}
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
      </Exhibit>

      {/* ------------------------------------------------------------------ */}
      {/* REL - 2. Related parties (incl. acting together)                     */}
      {/* ------------------------------------------------------------------ */}
      <Exhibit tag="REL" icon={<Network className="h-4 w-4 text-muted-foreground" />} title="2 · Related parties" {...sectionProps('relatedness')}>
        <NarrativeLine narrative={narrative('related')} onSave={saveNarrative?.('related')} />
        {relatedYes.length === 0 ? (
          <p className="text-xs text-muted-foreground">No related parties outside the taxpayer.</p>
        ) : (
          <div className="space-y-1 text-xs">
            {relatedYes.map(renderRelatedRow)}
          </div>
        )}
        {relatedNo.length > 0 && (
          <AccountedLine
            summary={`${relatedNo.length} further group ${relatedNo.length === 1 ? 'entity does' : 'entities do'} not meet the 25% relatedness test.`}
          >
            <div className="space-y-1 text-xs">
              {relatedNo.map(renderRelatedRow)}
            </div>
          </AccountedLine>
        )}

        <div className="mt-3 border-t border-[hsl(var(--border-subtle))] pt-2.5">
          <div className="mb-1.5 flex items-center gap-2 text-xs font-medium text-foreground">
            <Handshake className="h-3.5 w-3.5 text-muted-foreground" />
            Acting together (on top of direct relatedness)
            <span className="flex-1" />
            {editable && (
              <ExcludeBtn
                excluded={isSectionExcluded(facts, 'actingTogether')}
                onClick={() => onChange!(withSectionExcluded(facts, 'actingTogether', !isSectionExcluded(facts, 'actingTogether')))}
              />
            )}
          </div>
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
                      <span className="font-medium text-foreground">
                        {a.memberEntityIds.map((id) => nameOf(facts, id)).join(' + ')}
                      </span>
                      <span className="text-muted-foreground"> ≈ {pct(a.combinedPct)}</span>
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
                      className="mt-1.5 w-full resize-y rounded border border-[hsl(var(--border-subtle))] bg-white/70 px-2 py-1 text-[11px] leading-relaxed text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-stone-400"
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
              summary={`${notLikelyClusters} candidate ${notLikelyClusters === 1 ? 'grouping was' : 'groupings were'} considered and assessed as not likely; ${notLikelyClusters === 1 ? 'it is' : 'they are'} left out of the client annex.`}
            />
          )}
        </div>
      </Exhibit>

      {/* ------------------------------------------------------------------ */}
      {/* T - 3. Relevant flows                                                */}
      {/* ------------------------------------------------------------------ */}
      <Exhibit tag="T" icon={<ArrowLeftRight className="h-4 w-4 text-muted-foreground" />} title="3 · Relevant flows" {...sectionProps('transactions')}>
        <NarrativeLine narrative={narrative('flows')} onSave={saveNarrative?.('flows')} />
        {relevantTx.length === 0
          ? <p className="text-xs text-muted-foreground">{generated ? 'No relevant intra-group flows identified.' : 'Not generated yet.'}</p>
          : (
          <table className="w-full text-xs">
            <thead className="text-muted-foreground">
              <tr className="text-left">
                <th className="py-1 pr-2">#</th>
                <th className="pr-2">Flow</th>
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
                    className={cn('border-t border-[hsl(var(--border-subtle))]', t.excludedFromClient && 'opacity-60')}
                  >
                    <td className="py-1 pr-2 font-mono text-sky-700 dark:text-sky-300">{t.id}</td>
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
                        <div className="flex items-center gap-0.5">
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
        {accountedTx.map((g) => (
          <AccountedLine key={g.reason} summary={`${g.transactions.length} ${g.transactions.length === 1 ? 'flow' : 'flows'} not relevant: ${g.reason}`}>
            <div className="space-y-1">
              {g.transactions.map((t) => (
                <div key={t.id} className="flex items-center gap-2">
                  <span className="font-mono text-sky-700 dark:text-sky-300">{t.id}</span>
                  <span>{nameOf(facts, t.fromEntityId)} → {nameOf(facts, t.toEntityId)}</span>
                  <span className="text-muted-foreground">{t.kind}</span>
                  <span className="flex-1" />
                  {editable && (
                    <button
                      type="button"
                      className="underline underline-offset-2 hover:text-foreground"
                      onClick={() => onChange!(withTransactionRelevance(facts, t.id, true))}
                    >
                      mark relevant
                    </button>
                  )}
                </div>
              ))}
            </div>
          </AccountedLine>
        ))}
      </Exhibit>

      {/* ------------------------------------------------------------------ */}
      {/* CLS - 4. Classification of the relevant entities                     */}
      {/* ------------------------------------------------------------------ */}
      <Exhibit tag="CLS" icon={<Layers className="h-4 w-4 text-muted-foreground" />} title="4 · Classification of the relevant entities" {...sectionProps('classification')}>
        <NarrativeLine narrative={narrative('classification')} onSave={saveNarrative?.('classification')} />
        {(() => {
          const inScopeEnts = shown.entities.filter((e) => inScope.has(e.id));
          const outCount = shown.entities.length - inScopeEnts.length;
          const clsByEntity = new Map(shown.classifications.map((c) => [c.entityId, c]));
          return (
            <>
              <table className="w-full text-xs">
                <thead className="text-muted-foreground">
                  <tr className="text-left">
                    <th className="py-1 pr-2">Entity</th><th className="pr-2">NL qualification</th>
                    <th className="pr-2">Local qualification</th><th>Mismatch?</th>
                  </tr>
                </thead>
                <tbody>
                  {inScopeEnts.map((e) => {
                    const c = clsByEntity.get(e.id);
                    const nl = nlQualification(effNlTaxStatus(e));
                    const local = c ? localQualification(c.homeClass) : 'undetermined';
                    const mismatch = !!c?.hybrid || (nl !== 'undetermined' && local !== 'undetermined' && nl !== local);
                    return (
                      <tr key={e.id} className="border-t border-[hsl(var(--border-subtle))]">
                        <td className="py-1 pr-2">
                          <span className="font-mono text-sky-700 dark:text-sky-300">{e.id}</span>{' '}
                          <span>{e.name}</span>
                        </td>
                        <td className="pr-2"><QualBadge status={effNlTaxStatus(e)} /></td>
                        <td className="pr-2 text-muted-foreground">
                          {c ? `${nlQualificationLabel(local)}${c.homeState ? ` (${c.homeState})` : ''}` : 'To be determined'}
                        </td>
                        <td className={cn(mismatch ? 'font-medium text-amber-700 dark:text-amber-400' : 'text-muted-foreground')}>
                          {mismatch ? 'Yes' : 'No'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {outCount > 0 && (
                <AccountedLine summary={`The remaining ${outCount} group ${outCount === 1 ? 'entity is' : 'entities are'} not party to a relevant flow and ${outCount === 1 ? 'carries' : 'carry'} no qualification difference.`} />
              )}
            </>
          );
        })()}
      </Exhibit>
    </div>
  );
}
