import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Check, ChevronDown, ChevronRight, Eye, EyeOff, Users, Network, Layers, ArrowLeftRight, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AppendixFacts, FactEntity } from '@/lib/appendix/types';
import { visibleFacts } from '@/lib/appendix/facts/visibleFacts';

interface Props {
  facts: AppendixFacts;
  onChange?: (next: AppendixFacts) => void;
  generated?: boolean;
}

// ---------------------------------------------------------------------------
// Immutable patch helpers
// ---------------------------------------------------------------------------

function withClassification(
  facts: AppendixFacts,
  entityId: string,
  patch: Partial<AppendixFacts['classifications'][number]>,
): AppendixFacts {
  return {
    ...facts,
    classifications: facts.classifications.map((c) =>
      c.entityId === entityId ? { ...c, ...patch } : c,
    ),
  };
}

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

function withActing(
  facts: AppendixFacts,
  id: string,
  patch: Partial<AppendixFacts['actingTogether'][number]>,
): AppendixFacts {
  return {
    ...facts,
    actingTogether: facts.actingTogether.map((a) =>
      a.id === id ? { ...a, ...patch } : a,
    ),
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function pct(n: number | null): string {
  return n == null ? '—' : `${Number.isInteger(n) ? n : n.toFixed(2)}%`;
}

function nameOf(facts: AppendixFacts, id: string): string {
  return facts.entities.find((e) => e.id === id)?.name ?? id;
}

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

function DismissBtn({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label="Dismiss"
      title="Dismiss this acting-together cluster"
      onClick={onClick}
      className="inline-flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
    >
      <X className="h-3 w-3" />
    </button>
  );
}

// ---------------------------------------------------------------------------
// Exhibit collapsible wrapper
// ---------------------------------------------------------------------------

function Exhibit({ tag, icon, title, defaultOpen = true, children }: {
  tag: string; icon: ReactNode; title: string; defaultOpen?: boolean; children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-lg border border-[hsl(var(--border-subtle))] overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 bg-muted/40 px-3 py-2 text-left text-sm font-semibold text-foreground"
      >
        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        <span className="font-mono text-xs text-sky-700 dark:text-sky-300">{tag}</span>
        {icon}
        {title}
      </button>
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
    () => shown.entities.filter((e) => e.role !== 'Taxpayer' && !e.memberOfUnityId),
    [shown.entities],
  );

  if (!shown.entities.length && !facts.entities.length) return null;

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-foreground">Part A · Facts &amp; relationships</h3>

      {/* ------------------------------------------------------------------ */}
      {/* E — Entity register                                                  */}
      {/* ------------------------------------------------------------------ */}
      <Exhibit tag="E" icon={<Users className="h-4 w-4 text-muted-foreground" />} title="Entity register">
        <table className="w-full text-xs">
          <thead className="text-muted-foreground">
            <tr className="text-left">
              <th className="py-1 pr-2">#</th><th className="pr-2">Entity</th><th className="pr-2">Jur</th>
              <th className="pr-2">Type</th><th className="pr-2">NL tax status</th><th>Role</th>
              {editable && <th className="w-6" aria-label="Controls" />}
            </tr>
          </thead>
          <tbody>
            {shown.entities.map((e) => {
              const isMember = !!e.memberOfUnityId;
              return (
                <tr key={e.id} className="border-t border-[hsl(var(--border-subtle))]">
                  <td className="py-1 pr-2 font-mono text-sky-700 dark:text-sky-300">{e.id}</td>
                  <td className="pr-2 font-medium text-foreground">
                    {isMember && (
                      <span className="mr-1 text-muted-foreground">↳</span>
                    )}
                    <span className={cn(isMember && 'text-muted-foreground')}>{e.name}</span>
                    {e.isFiscalUnity && (
                      <span className="ml-1.5 rounded bg-sky-100 px-1 text-[10px] font-normal text-sky-700 dark:bg-sky-900/40 dark:text-sky-300">
                        fiscal unity
                      </span>
                    )}
                  </td>
                  <td className={cn('pr-2', isMember ? 'text-muted-foreground/70' : 'text-muted-foreground')}>{e.jurisdiction ?? '—'}</td>
                  <td className={cn('pr-2', isMember ? 'text-muted-foreground/70' : 'text-muted-foreground')}>{e.entityType ?? '—'}</td>
                  <td className={cn('pr-2', isMember ? 'text-muted-foreground/70' : 'text-muted-foreground')}>{e.nlTaxStatus ?? '—'}</td>
                  <td className={cn(isMember ? 'text-muted-foreground/70' : 'text-muted-foreground')}>{e.role}</td>
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
      {/* REL — Relatedness & acting-together                                  */}
      {/* ------------------------------------------------------------------ */}
      <Exhibit tag="REL" icon={<Network className="h-4 w-4 text-muted-foreground" />} title="Relatedness & acting-together">
        <div className="space-y-1 text-xs">
          {related.map((e: FactEntity) => (
            <div key={e.id} className="flex items-center gap-2">
              <span className={cn('h-1.5 w-1.5 rounded-full', e.related ? 'bg-sky-500' : 'bg-muted-foreground/30')} />
              <span className="font-mono text-sky-700 dark:text-sky-300">{e.id}</span>
              <span className={cn(e.related ? 'font-medium text-foreground' : 'text-muted-foreground')}>{e.name}</span>
              <span className="flex-1" />
              <span className="tabular-nums text-muted-foreground">{pct(e.ownershipPct)}</span>
            </div>
          ))}
        </div>
        {shown.actingTogether.length > 0 && (
          <div className="mt-2 space-y-1.5">
            {shown.actingTogether.filter((a) => a.status !== 'dismissed').map((a) => {
              const confirmed = a.status === 'confirmed';
              return (
                <div
                  key={a.id}
                  className={cn(
                    'rounded border-l-2 border-l-amber-500 bg-amber-50/60 px-2 py-1.5 text-[11px] text-amber-900 dark:bg-amber-950/30 dark:text-amber-200',
                    a.excludedFromClient && 'opacity-60',
                  )}
                >
                  <div className="flex items-start gap-1.5">
                    <div className="flex-1">
                      <span className="font-medium">
                        Acting-together {confirmed ? '(confirmed)' : '(proposed)'}:
                      </span>{' '}
                      {a.memberEntityIds.map((id) => nameOf(facts, id)).join(' + ')} ≈ {pct(a.combinedPct)}. {a.rationale}
                    </div>
                    {editable && (
                      <div className="flex shrink-0 items-center gap-0.5 pl-1">
                        {!confirmed && (
                          <>
                            <ConfirmBtn onClick={() => onChange!(withActing(facts, a.id, { status: 'confirmed', source: 'edited' }))} />
                            <DismissBtn onClick={() => onChange!(withActing(facts, a.id, { status: 'dismissed', source: 'edited' }))} />
                          </>
                        )}
                        {confirmed && (
                          <ExcludeBtn
                            excluded={a.excludedFromClient}
                            onClick={() => onChange!(withActing(facts, a.id, { excludedFromClient: !a.excludedFromClient }))}
                          />
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Exhibit>

      {/* ------------------------------------------------------------------ */}
      {/* CLS — Classification matrix                                          */}
      {/* ------------------------------------------------------------------ */}
      <Exhibit tag="CLS" icon={<Layers className="h-4 w-4 text-muted-foreground" />} title="Classification matrix (home vs source)" defaultOpen={false}>
        {shown.classifications.length === 0
          ? <p className="text-xs text-muted-foreground">{generated ? 'None identified.' : 'Not generated yet.'}</p>
          : (
          <table className="w-full text-xs">
            <thead className="text-muted-foreground">
              <tr className="text-left">
                <th className="py-1 pr-2">Entity</th>
                <th className="pr-2">Home</th>
                <th className="pr-2">Source</th>
                <th>Hybrid?</th>
                {editable && <th className="w-10" aria-label="Controls" />}
              </tr>
            </thead>
            <tbody>
              {shown.classifications.map((c) => {
                const confirmed = c.status === 'confirmed';
                return (
                  <tr
                    key={c.entityId}
                    className={cn('border-t border-[hsl(var(--border-subtle))]', c.excludedFromClient && 'opacity-60')}
                  >
                    <td className="py-1 pr-2">
                      <span className="font-mono text-sky-700 dark:text-sky-300">{c.entityId}</span>{' '}
                      {nameOf(facts, c.entityId)}
                    </td>
                    <td className="pr-2 text-muted-foreground">{c.homeState}: {c.homeClass}</td>
                    <td className="pr-2 text-muted-foreground">{c.sourceState ? `${c.sourceState}: ${c.sourceClass}` : '—'}</td>
                    <td>
                      {c.hybrid
                        ? <span className="rounded bg-rose-100 px-1 text-rose-800 dark:bg-rose-900/40 dark:text-rose-200">mismatch</span>
                        : <span className="text-muted-foreground">aligned</span>}
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
                              onClick={() => onChange!(withClassification(facts, c.entityId, { status: 'confirmed', source: 'edited' }))}
                            />
                          )}
                          <ExcludeBtn
                            excluded={c.excludedFromClient}
                            onClick={() => onChange!(withClassification(facts, c.entityId, { excludedFromClient: !c.excludedFromClient }))}
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

      {/* ------------------------------------------------------------------ */}
      {/* T — Transaction map                                                  */}
      {/* ------------------------------------------------------------------ */}
      <Exhibit tag="T" icon={<ArrowLeftRight className="h-4 w-4 text-muted-foreground" />} title="Transaction map" defaultOpen={false}>
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
                    <td className="pr-2 text-muted-foreground">{t.instrument ?? '—'}</td>
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
