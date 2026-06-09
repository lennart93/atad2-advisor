import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Check, ChevronDown, ChevronRight, Eye, EyeOff, Users, Network, Layers, ArrowLeftRight, Handshake, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AppendixFacts, FactEntity, AppendixSectionKey } from '@/lib/appendix/types';
import { visibleFacts } from '@/lib/appendix/facts/visibleFacts';
import { isSectionExcluded, withSectionExcluded } from '@/lib/appendix/facts/sections';
import { effJurisdiction, effEntityType, effNlTaxStatus, withEntityEdit } from '@/lib/appendix/facts/entityFields';
import { nlQualification, nlQualificationLabel, nlTaxStatusLabel, NL_TAX_STATUSES } from '@/lib/appendix/facts/nlTaxStatus';
import { withClusterLikelihood, withClusterText, withClusterExclude } from '@/lib/appendix/facts/actingCluster';
import { ACTING_LIKELIHOODS, type ActingLikelihood } from '@/lib/appendix/facts/actingLikelihood';
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

  if (!shown.entities.length && !facts.entities.length) return null;

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-foreground">Part A · Facts &amp; relationships</h3>

      {/* ------------------------------------------------------------------ */}
      {/* E — Entity register                                                  */}
      {/* ------------------------------------------------------------------ */}
      <Exhibit tag="E" icon={<Users className="h-4 w-4 text-muted-foreground" />} title="Entity register" {...sectionProps('entityRegister')}>
        <table className="w-full text-xs">
          <thead className="text-muted-foreground">
            <tr className="text-left">
              <th className="py-1 pr-2">#</th><th className="pr-2">Entity</th><th className="pr-2 min-w-[150px]">Jurisdiction</th>
              <th className="pr-2 min-w-[130px]">Type</th><th className="pr-2 min-w-[160px]">NL tax status</th><th>Role</th>
              {editable && <th className="w-6" aria-label="Controls" />}
            </tr>
          </thead>
          <tbody>
            {shown.entities.map((e) => {
              const isMember = !!e.memberOfUnityId;
              const muted = isMember ? 'text-muted-foreground/70' : 'text-muted-foreground';
              const jur = effJurisdiction(e);
              const type = effEntityType(e);
              const status = effNlTaxStatus(e);
              return (
                <tr key={e.id} className="border-t border-[hsl(var(--border-subtle))] align-middle">
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
                    {editable ? (
                      <JurisdictionPicker
                        value={jur ?? ''}
                        onChange={(iso) => onChange!(withEntityEdit(facts, e.id, 'jurisdiction', iso || null))}
                        className={COMPACT_CONTROL}
                        placeholder="Set…"
                      />
                    ) : (
                      <span className={cn('flex items-center gap-1.5', muted)}>
                        {jur ? <><CountryFlag iso={jur} /> {countryName(jur) || jur}</> : '-'}
                      </span>
                    )}
                  </td>

                  {/* Type */}
                  <td className="pr-2 py-0.5">
                    {editable && !e.isFiscalUnity ? (
                      <Select
                        value={type ?? undefined}
                        onValueChange={(v) => onChange!(withEntityEdit(facts, e.id, 'entityType', v))}
                      >
                        <SelectTrigger className={COMPACT_CONTROL}><SelectValue placeholder="Set…" /></SelectTrigger>
                        <SelectContent>
                          {ENTITY_TYPES.map((t) => <SelectItem key={t.key} value={t.key}>{t.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    ) : (
                      <span className={muted}>{e.isFiscalUnity ? 'Fiscal unity' : entityTypeLabel(type)}</span>
                    )}
                  </td>

                  {/* NL tax status */}
                  <td className="pr-2 py-0.5">
                    {editable ? (
                      <Select
                        value={status ?? undefined}
                        onValueChange={(v) => onChange!(withEntityEdit(facts, e.id, 'nlTaxStatus', v))}
                      >
                        <SelectTrigger className={COMPACT_CONTROL}><SelectValue placeholder="Set…" /></SelectTrigger>
                        <SelectContent>
                          {NL_TAX_STATUSES.map((s) => <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    ) : (
                      <span className={muted}>{nlTaxStatusLabel(status)}</span>
                    )}
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
            })}
          </tbody>
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
      {/* REL — Relatedness                                                    */}
      {/* ------------------------------------------------------------------ */}
      <Exhibit tag="REL" icon={<Network className="h-4 w-4 text-muted-foreground" />} title="Relatedness (>25%)" {...sectionProps('relatedness')}>
        {related.length === 0 ? (
          <p className="text-xs text-muted-foreground">No related parties outside the taxpayer.</p>
        ) : (
          <div className="space-y-1 text-xs">
            {related.map((e: FactEntity) => {
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
            })}
          </div>
        )}
      </Exhibit>

      {/* ------------------------------------------------------------------ */}
      {/* AT — Acting together                                                 */}
      {/* ------------------------------------------------------------------ */}
      <Exhibit tag="AT" icon={<Handshake className="h-4 w-4 text-muted-foreground" />} title="Acting together" {...sectionProps('actingTogether')}>
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
      </Exhibit>

      {/* ------------------------------------------------------------------ */}
      {/* CLS — Classification (NL perspective), derived from NL tax status     */}
      {/* ------------------------------------------------------------------ */}
      <Exhibit tag="CLS" icon={<Layers className="h-4 w-4 text-muted-foreground" />} title="Classification (NL perspective)" defaultOpen={false} {...sectionProps('classification')}>
        <table className="w-full text-xs">
          <thead className="text-muted-foreground">
            <tr className="text-left">
              <th className="py-1 pr-2">Entity</th>
              <th className="pr-2">NL tax status</th>
              <th>NL qualification</th>
            </tr>
          </thead>
          <tbody>
            {shown.entities.map((e) => {
              const isMember = !!e.memberOfUnityId;
              const status = effNlTaxStatus(e);
              return (
                <tr key={e.id} className="border-t border-[hsl(var(--border-subtle))]">
                  <td className="py-1 pr-2">
                    {isMember && <span className="mr-1 text-muted-foreground">↳</span>}
                    <span className="font-mono text-sky-700 dark:text-sky-300">{e.id}</span>{' '}
                    <span className={cn(isMember && 'text-muted-foreground')}>{e.name}</span>
                  </td>
                  <td className="pr-2 text-muted-foreground">{nlTaxStatusLabel(status)}</td>
                  <td><QualBadge status={status} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="mt-2 text-[10.5px] leading-snug text-muted-foreground">
          Derived from each entity's NL tax status. Hybrid mismatches (home vs source) are analysed in the article rows below.
        </p>
      </Exhibit>

      {/* ------------------------------------------------------------------ */}
      {/* T — Transaction map                                                  */}
      {/* ------------------------------------------------------------------ */}
      <Exhibit tag="T" icon={<ArrowLeftRight className="h-4 w-4 text-muted-foreground" />} title="Transaction map" defaultOpen={false} {...sectionProps('transactions')}>
        {shown.transactions.length === 0
          ? <p className="text-xs text-muted-foreground">{generated ? 'None identified.' : 'Not generated yet.'}</p>
          : (
          <table className="w-full text-xs">
            <thead className="text-muted-foreground">
              <tr className="text-left">
                <th className="py-1 pr-2">#</th>
                <th className="pr-2">Flow</th>
                <th className="pr-2">Type</th>
                <th className="pr-2">Instrument</th>
                <th>Article(s)</th>
                {editable && <th className="w-10" aria-label="Controls" />}
              </tr>
            </thead>
            <tbody>
              {shown.transactions.map((t) => {
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
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Exhibit>
    </div>
  );
}
