import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { ChevronDown, ChevronRight, Users, Network, Layers, ArrowLeftRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AppendixFacts, FactEntity } from '@/lib/appendix/types';

interface Props { facts: AppendixFacts; }

function pct(n: number | null): string {
  return n == null ? '—' : `${Number.isInteger(n) ? n : n.toFixed(2)}%`;
}

function nameOf(facts: AppendixFacts, id: string): string {
  return facts.entities.find((e) => e.id === id)?.name ?? id;
}

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

export function FactsPanel({ facts }: Props) {
  const entities = facts.entities;
  const related = useMemo(() => entities.filter((e) => e.role !== 'Taxpayer'), [entities]);

  if (!entities.length) return null;

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-foreground">Part A · Facts &amp; relationships</h3>

      <Exhibit tag="E" icon={<Users className="h-4 w-4 text-muted-foreground" />} title="Entity register">
        <table className="w-full text-xs">
          <thead className="text-muted-foreground">
            <tr className="text-left">
              <th className="py-1 pr-2">#</th><th className="pr-2">Entity</th><th className="pr-2">Jur</th>
              <th className="pr-2">Type</th><th className="pr-2">NL tax status</th><th>Role</th>
            </tr>
          </thead>
          <tbody>
            {entities.map((e) => (
              <tr key={e.id} className="border-t border-[hsl(var(--border-subtle))]">
                <td className="py-1 pr-2 font-mono text-sky-700 dark:text-sky-300">{e.id}</td>
                <td className="pr-2 font-medium text-foreground">{e.name}</td>
                <td className="pr-2 text-muted-foreground">{e.jurisdiction ?? '—'}</td>
                <td className="pr-2 text-muted-foreground">{e.entityType ?? '—'}</td>
                <td className="pr-2 text-muted-foreground">{e.nlTaxStatus ?? '—'}</td>
                <td className="text-muted-foreground">{e.role}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Exhibit>

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
        {facts.actingTogether.length > 0 && (
          <div className="mt-2 space-y-1.5">
            {facts.actingTogether.filter((a) => a.status !== 'dismissed').map((a) => (
              <div key={a.id} className="rounded border-l-2 border-l-amber-500 bg-amber-50/60 px-2 py-1.5 text-[11px] text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
                <span className="font-medium">Acting-together {a.status === 'confirmed' ? '(confirmed)' : '(proposed)'}:</span>{' '}
                {a.memberEntityIds.map((id) => nameOf(facts, id)).join(' + ')} ≈ {pct(a.combinedPct)}. {a.rationale}
              </div>
            ))}
          </div>
        )}
      </Exhibit>

      <Exhibit tag="CLS" icon={<Layers className="h-4 w-4 text-muted-foreground" />} title="Classification matrix (home vs source)" defaultOpen={false}>
        {facts.classifications.length === 0
          ? <p className="text-xs text-muted-foreground">Not proposed yet.</p>
          : (
          <table className="w-full text-xs">
            <thead className="text-muted-foreground"><tr className="text-left"><th className="py-1 pr-2">Entity</th><th className="pr-2">Home</th><th className="pr-2">Source</th><th>Hybrid?</th></tr></thead>
            <tbody>
              {facts.classifications.map((c) => (
                <tr key={c.entityId} className="border-t border-[hsl(var(--border-subtle))]">
                  <td className="py-1 pr-2"><span className="font-mono text-sky-700 dark:text-sky-300">{c.entityId}</span> {nameOf(facts, c.entityId)}</td>
                  <td className="pr-2 text-muted-foreground">{c.homeState}: {c.homeClass}</td>
                  <td className="pr-2 text-muted-foreground">{c.sourceState ? `${c.sourceState}: ${c.sourceClass}` : '—'}</td>
                  <td>{c.hybrid ? <span className="rounded bg-rose-100 px-1 text-rose-800 dark:bg-rose-900/40 dark:text-rose-200">mismatch</span> : <span className="text-muted-foreground">aligned</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Exhibit>

      <Exhibit tag="T" icon={<ArrowLeftRight className="h-4 w-4 text-muted-foreground" />} title="Transaction map" defaultOpen={false}>
        {facts.transactions.length === 0
          ? <p className="text-xs text-muted-foreground">Not proposed yet.</p>
          : (
          <table className="w-full text-xs">
            <thead className="text-muted-foreground"><tr className="text-left"><th className="py-1 pr-2">#</th><th className="pr-2">Flow</th><th className="pr-2">Type</th><th className="pr-2">Instrument</th><th>Article(s)</th></tr></thead>
            <tbody>
              {facts.transactions.map((t) => (
                <tr key={t.id} className="border-t border-[hsl(var(--border-subtle))]">
                  <td className="py-1 pr-2 font-mono text-sky-700 dark:text-sky-300">{t.id}</td>
                  <td className="pr-2">{nameOf(facts, t.fromEntityId)} → {nameOf(facts, t.toEntityId)}</td>
                  <td className="pr-2 text-muted-foreground">{t.kind}</td>
                  <td className="pr-2 text-muted-foreground">{t.instrument ?? '—'}</td>
                  <td className="text-muted-foreground">{t.articlesTested.join(' · ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Exhibit>
    </div>
  );
}
