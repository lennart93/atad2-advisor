import { useState } from 'react';
import { Lightbulb, Pencil, Plus, RotateCcw, Trash2, Users, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AppendixFacts, ActingTogetherCluster, FactEntity } from '@/lib/appendix/types';
import { visibleFacts } from '@/lib/appendix/facts/visibleFacts';
import { ACTING_BASES, actingBasisLabel, type ActingBasis } from '@/lib/appendix/facts/actingBasis';
import { actingTogetherCandidateEntities } from '@/lib/appendix/facts/actingCandidates';
import {
  addActingGroup,
  adoptActingSuggestion,
  removeActingCluster,
  resetClusterReasoning,
  withClusterBasis,
  withClusterMembers,
  withClusterName,
  withClusterTarget,
  withClusterText,
  withClusterVisibility,
} from '@/lib/appendix/facts/actingCluster';
import { effRelatedPct } from '@/lib/appendix/facts/entityFields';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';

interface Props {
  facts: AppendixFacts;
  onChange?: (next: AppendixFacts) => void;
  generated?: boolean;
  /** A generation/refine run is in flight, so an empty section reads as pending, not final. */
  refining?: boolean;
}

// The associated-enterprise threshold: shareholders combine into a related party
// once their joint stake reaches this line.
const THRESHOLD = 25;

// Warm-neutral ramp for the combined-holding meter. Each holder segment and its
// chip dot share an index, so the bar and the chip list read as one figure.
const SEGMENT_COLORS = ['#8a8479', '#a49d90', '#bcb5a8', '#d0cabd', '#e1dbcf'];
const segmentColor = (i: number) => SEGMENT_COLORS[i % SEGMENT_COLORS.length];

function pct(n: number | null): string {
  return n == null ? '–' : `${Number.isInteger(n) ? n : n.toFixed(1)}%`;
}

function nameOf(facts: AppendixFacts, id: string): string {
  return facts.entities.find((e) => e.id === id)?.name ?? id;
}

/** A holder's stake, advisor edits included (the same value the register shows). */
function holdingOf(facts: AppendixFacts, id: string): number | null {
  const e = facts.entities.find((x) => x.id === id);
  return e ? effRelatedPct(e) : null;
}

/** The entities the advisor can group: parents and direct shareholders of the
 *  taxpayer (the parties whose holdings an acting-together assessment combines).
 *  Subsidiaries and other downstream group entities hold nothing in the taxpayer,
 *  so they are never offered as members. Fiscal-unity parties sit on the taxpayer
 *  side and are excluded too. */
function memberCandidates(facts: AppendixFacts): FactEntity[] {
  return actingTogetherCandidateEntities(facts.entities).filter(
    (e) => !e.isFiscalUnity && !e.memberOfUnityId,
  );
}

// ---------------------------------------------------------------------------

/** The 0-to-30% combined-holding meter with per-holder segments + threshold line. */
function CombinedMeter({ facts, cluster }: { facts: AppendixFacts; cluster: ActingTogetherCluster }) {
  const holdings = cluster.memberEntityIds.map((id) => holdingOf(facts, id));
  const sum = holdings.reduce<number>((n, h) => n + (h ?? 0), 0);
  const combined = holdings.some((h) => h != null) ? sum : null;
  const trackMax = Math.max(30, combined ?? 0, ...holdings.map((h) => h ?? 0));
  const thresholdLeft = (THRESHOLD / trackMax) * 100;
  const belowCount = cluster.memberEntityIds.length;

  return (
    <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div className="min-w-0 flex-1 basis-[300px]">
        <p className="text-[10.5px] font-medium uppercase tracking-[0.13em] text-muted-foreground">Combined holding</p>
        <div className="mt-3 max-w-[440px]">
          <div className="relative mb-1 h-4">
            <span
              className="absolute -translate-x-1/2 whitespace-nowrap text-[10.5px] font-medium text-brand-terracotta"
              style={{ left: `${thresholdLeft}%` }}
            >
              {THRESHOLD}% associated
            </span>
          </div>
          <div className="relative h-2.5">
            <div className="absolute inset-0 flex overflow-hidden rounded-full bg-ds-fill-muted">
              {cluster.memberEntityIds.map((id, i) => (
                <div
                  key={id}
                  style={{ width: `${((holdings[i] ?? 0) / trackMax) * 100}%`, backgroundColor: segmentColor(i) }}
                />
              ))}
            </div>
            <div
              className="absolute -top-1 -bottom-1 w-0 border-l border-dashed border-brand-terracotta"
              style={{ left: `${thresholdLeft}%` }}
              aria-hidden
            />
          </div>
          <div className="mt-1.5 flex items-center justify-between text-[11px] text-muted-foreground">
            <span className="tabular-nums">0%</span>
            <span>{belowCount} holders combined</span>
          </div>
        </div>
      </div>
      <div className="shrink-0 text-right">
        <div className="text-[34px] font-normal leading-none tracking-tight tabular-nums text-foreground">{pct(combined)}</div>
        <div className="mt-1 text-[11px] text-muted-foreground">combined, if grouped</div>
      </div>
    </div>
  );
}

// A quiet white select, terracotta ring on focus (matches the register editors).
const SELECT_CLS =
  'h-9 w-auto min-w-[150px] gap-3 rounded-md border-border bg-card px-3 text-[13.5px] font-normal text-foreground shadow-none transition-colors hover:border-ds-ink-tertiary focus:ring-0 focus:ring-offset-0 focus:border-brand-terracotta focus:shadow-[0_0_0_3px_rgba(194,92,60,0.12)] [&>span]:!flex';

// ---------------------------------------------------------------------------

/** One advisor-built group: name + category, members, target, reasoning, visibility.
 *  `bare` drops the outer card chrome so it can sit flush inside the V2 detail panel. */
export function ManualGroupCard({ facts, cluster, editable, onChange, bare }: {
  facts: AppendixFacts;
  cluster: ActingTogetherCluster;
  editable: boolean;
  onChange?: (next: AppendixFacts) => void;
  bare?: boolean;
}) {
  const candidates = memberCandidates(facts);
  const addable = candidates.filter((e) => !cluster.memberEntityIds.includes(e.id));
  const hasHoldings = cluster.memberEntityIds.some((id) => holdingOf(facts, id) != null);
  const visible = !cluster.excludedFromClient;

  return (
    <div className={cn(!bare && 'rounded-lg border border-border bg-card')}>
      {/* Header: name + category + remove */}
      <div className={cn('flex flex-wrap items-center gap-2.5', bare ? 'pb-3' : 'border-b border-border bg-[#fdfcf9] px-4 py-3')}>
        {editable ? (
          <input
            value={cluster.name ?? ''}
            onChange={(e) => onChange!(withClusterName(facts, cluster.id, e.target.value))}
            placeholder="Group name (e.g. The Jansen family)"
            aria-label="Group name"
            className="min-w-0 flex-1 basis-[220px] rounded-md border border-transparent bg-transparent px-1.5 py-1 text-[15px] font-medium text-foreground outline-none transition-colors placeholder:font-normal placeholder:text-muted-foreground/60 hover:border-border focus:border-brand-terracotta focus:shadow-[0_0_0_3px_rgba(194,92,60,0.12)]"
          />
        ) : (
          <p className="min-w-0 flex-1 text-[15px] font-medium text-foreground">
            {cluster.name?.trim() || cluster.memberEntityIds.map((id) => nameOf(facts, id)).join(' + ')}
          </p>
        )}
        {editable ? (
          <Select value={cluster.basis ?? 'other'} onValueChange={(v) => onChange!(withClusterBasis(facts, cluster.id, v as ActingBasis))}>
            <SelectTrigger className={SELECT_CLS} aria-label="Legal basis category"><SelectValue /></SelectTrigger>
            <SelectContent>
              {ACTING_BASES.map((b) => <SelectItem key={b.key} value={b.key}>{b.label}</SelectItem>)}
            </SelectContent>
          </Select>
        ) : (
          <span className="rounded-full border border-border px-2.5 py-1 text-[12px] text-muted-foreground">
            {actingBasisLabel(cluster.basis)}
          </span>
        )}
        {editable && (
          <button
            type="button"
            aria-label="Remove this group"
            title="Remove this group"
            onClick={() => onChange!(removeActingCluster(facts, cluster.id))}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-brand-terracotta-soft hover:text-brand-terracotta-deep"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className={cn('space-y-5 py-4', !bare && 'px-4')}>
        {hasHoldings && <CombinedMeter facts={facts} cluster={cluster} />}

        {/* Members */}
        <div>
          <p className="text-[10.5px] font-medium uppercase tracking-[0.13em] text-muted-foreground">Members</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {cluster.memberEntityIds.map((id, i) => (
              <span
                key={id}
                className="inline-flex items-center gap-2 rounded-full border border-border bg-card py-1 pl-2.5 pr-2 text-[12.5px]"
              >
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: segmentColor(i) }} aria-hidden />
                <span className="text-foreground">{nameOf(facts, id)}</span>
                {holdingOf(facts, id) != null && <span className="tabular-nums text-muted-foreground">{pct(holdingOf(facts, id))}</span>}
                {editable && cluster.memberEntityIds.length > 2 && (
                  <button
                    type="button"
                    aria-label={`Remove ${nameOf(facts, id)} from the group`}
                    title="Remove from the group"
                    onClick={() => onChange!(withClusterMembers(facts, cluster.id, cluster.memberEntityIds.filter((m) => m !== id)))}
                    className="ml-0.5 inline-flex h-4 w-4 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </span>
            ))}
            {editable && addable.length > 0 && (
              <Select value="" onValueChange={(id) => onChange!(withClusterMembers(facts, cluster.id, [...cluster.memberEntityIds, id]))}>
                <SelectTrigger className="h-[30px] w-auto gap-1.5 rounded-full border border-dashed border-border bg-transparent px-3 text-[12.5px] text-muted-foreground hover:text-foreground [&>span]:!flex">
                  <Plus className="h-3 w-3" />
                  <SelectValue placeholder="Add member" />
                </SelectTrigger>
                <SelectContent>
                  {addable.map((e) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
          </div>
          {editable && cluster.memberEntityIds.length <= 2 && (
            <p className="mt-1.5 text-[11px] text-muted-foreground/70">A group needs at least two members.</p>
          )}
        </div>

        {/* Target */}
        <div className="flex flex-wrap items-center gap-2.5">
          <p className="text-[10.5px] font-medium uppercase tracking-[0.13em] text-muted-foreground">Acts together over</p>
          {editable ? (
            <Select value={cluster.targetEntityId ?? ''} onValueChange={(v) => onChange!(withClusterTarget(facts, cluster.id, v))}>
              <SelectTrigger className={SELECT_CLS} aria-label="Target entity"><SelectValue placeholder="Select entity" /></SelectTrigger>
              <SelectContent>
                {facts.entities.map((e) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
              </SelectContent>
            </Select>
          ) : (
            <span className="text-[13.5px] text-foreground">{cluster.targetEntityId ? nameOf(facts, cluster.targetEntityId) : 'the taxpayer'}</span>
          )}
        </div>

        {/* Reasoning */}
        <div>
          <div className="flex items-center justify-between gap-3">
            <p className="text-[10.5px] font-medium uppercase tracking-[0.13em] text-muted-foreground">Reasoning · feeds the memo</p>
            <div className="flex items-center gap-2">
              {editable && (
                <button
                  type="button"
                  onClick={() => onChange!(resetClusterReasoning(facts, cluster.id))}
                  title="Replace the text with the suggested wording for this category"
                  className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <RotateCcw className="h-2.5 w-2.5" /> Reset to suggested text
                </button>
              )}
              <span className="inline-flex items-center gap-1 rounded-full bg-brand-warning-soft px-2 py-0.5 text-[10.5px] font-medium text-brand-warning-deep">
                <Pencil className="h-2.5 w-2.5" /> Draft, review and adjust
              </span>
            </div>
          </div>
          {editable ? (
            <textarea
              value={cluster.reasoning}
              onChange={(e) => onChange!(withClusterText(facts, cluster.id, e.target.value))}
              aria-label="Acting-together reasoning"
              rows={4}
              className="mt-2 w-full resize-y rounded-md border border-border bg-[#fdfcf9] px-3 py-2.5 text-[13px] leading-[1.6] text-foreground transition-colors focus-visible:border-brand-terracotta focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-terracotta"
            />
          ) : (
            <p className="mt-2 rounded-md border border-border bg-[#fdfcf9] px-3 py-2.5 text-[13px] leading-[1.6] text-foreground">
              {cluster.reasoning}
            </p>
          )}
        </div>

        {/* Client visibility */}
        <div className="flex items-center gap-3.5 rounded-lg border border-border bg-[#fbfaf7] px-4 py-3">
          <Switch
            checked={visible}
            disabled={!editable}
            onCheckedChange={(on) => onChange!(withClusterVisibility(facts, cluster.id, on))}
            aria-label={visible ? 'Hide this group from the client report' : 'Show this group in the client report'}
            className="data-[state=checked]:bg-brand-sage data-[state=unchecked]:bg-[#dcd7cd]"
          />
          <div className="min-w-0 flex-1">
            <p className="text-[14px] text-foreground">{visible ? 'Shown in the client appendix and memo' : 'Kept internal'}</p>
            <p className="mt-0.5 text-[12.5px] leading-[1.45] text-muted-foreground">
              {visible ? 'Included in the report sent to the client. Switch off to keep it internal.' : 'Left out of the client report. Switch on to include it.'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

/** The "Add acting-together group" form: pick 2+ members, name, category, target. */
export function GroupBuilder({ facts, defaultTargetId, onCreate, onCancel }: {
  facts: AppendixFacts;
  defaultTargetId: string | null;
  onCreate: (input: { memberEntityIds: string[]; name: string; basis: ActingBasis; targetEntityId: string | null }) => void;
  onCancel: () => void;
}) {
  const candidates = memberCandidates(facts);
  const [selected, setSelected] = useState<string[]>([]);
  const [name, setName] = useState('');
  const [basis, setBasis] = useState<ActingBasis>('family');
  const [targetId, setTargetId] = useState<string>(defaultTargetId ?? '');

  const toggle = (id: string) =>
    setSelected((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  const canCreate = selected.length >= 2;

  return (
    <div className="rounded-lg border border-brand-terracotta/40 bg-[#fdfcf9] p-4">
      <p className="text-[13.5px] font-medium text-foreground">New acting-together group</p>
      <p className="mt-0.5 text-[12.5px] text-muted-foreground">Select the entities or persons that act together, name the group, and choose the basis.</p>

      {/* Members */}
      <div className="mt-4">
        <p className="text-[10.5px] font-medium uppercase tracking-[0.13em] text-muted-foreground">Members {selected.length > 0 && <span className="text-muted-foreground/60">· {selected.length} selected</span>}</p>
        {candidates.length === 0 ? (
          <p className="mt-2 text-[12.5px] text-muted-foreground">No parents or direct shareholders of the taxpayer are available to group yet.</p>
        ) : (
          <div className="mt-2 flex flex-wrap gap-2">
            {candidates.map((e) => {
              const on = selected.includes(e.id);
              return (
                <button
                  key={e.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggle(e.id)}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12.5px] transition-colors',
                    on
                      ? 'border-brand-terracotta bg-brand-terracotta-soft text-brand-terracotta-deep'
                      : 'border-border bg-card text-foreground hover:border-ds-ink-tertiary',
                  )}
                >
                  <span className={cn('inline-flex h-3.5 w-3.5 items-center justify-center rounded-full border', on ? 'border-brand-terracotta bg-brand-terracotta text-white' : 'border-muted-foreground/40')}>
                    {on && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
                  </span>
                  {e.name}
                  {holdingOf(facts, e.id) != null && <span className="tabular-nums text-muted-foreground">{pct(holdingOf(facts, e.id))}</span>}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Name + category + target */}
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <p className="text-[10.5px] font-medium uppercase tracking-[0.13em] text-muted-foreground">Group name</p>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Optional (e.g. The Jansen family)"
            aria-label="Group name"
            className="mt-2 w-full rounded-md border border-border bg-card px-3 py-2 text-[13.5px] text-foreground outline-none transition-colors hover:border-ds-ink-tertiary focus:border-brand-terracotta focus:shadow-[0_0_0_3px_rgba(194,92,60,0.12)]"
          />
        </div>
        <div>
          <p className="text-[10.5px] font-medium uppercase tracking-[0.13em] text-muted-foreground">Basis / category</p>
          <Select value={basis} onValueChange={(v) => setBasis(v as ActingBasis)}>
            <SelectTrigger className={cn(SELECT_CLS, 'mt-2 w-full')} aria-label="Legal basis category"><SelectValue /></SelectTrigger>
            <SelectContent>
              {ACTING_BASES.map((b) => <SelectItem key={b.key} value={b.key}>{b.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <p className="text-[10.5px] font-medium uppercase tracking-[0.13em] text-muted-foreground">Acts together over</p>
          <Select value={targetId} onValueChange={setTargetId}>
            <SelectTrigger className={cn(SELECT_CLS, 'mt-2 w-full')} aria-label="Target entity"><SelectValue placeholder="Select entity" /></SelectTrigger>
            <SelectContent>
              {facts.entities.map((e) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-2">
        <button
          type="button"
          disabled={!canCreate}
          onClick={() => onCreate({ memberEntityIds: selected, name, basis, targetEntityId: targetId || null })}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-md px-3.5 py-2 text-[13px] font-medium transition-colors',
            canCreate ? 'bg-foreground text-background hover:bg-foreground/90' : 'cursor-not-allowed bg-muted text-muted-foreground',
          )}
        >
          <Plus className="h-3.5 w-3.5" /> Add group
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md px-3 py-2 text-[13px] text-muted-foreground transition-colors hover:text-foreground"
        >
          Cancel
        </button>
        {!canCreate && <span className="text-[11.5px] text-muted-foreground/70">Select at least two members.</span>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

/** A non-binding AI suggestion the advisor can adopt into a real group or dismiss. */
export function HintCard({ facts, cluster, onChange }: {
  facts: AppendixFacts;
  cluster: ActingTogetherCluster;
  onChange: (next: AppendixFacts) => void;
}) {
  const members = cluster.memberEntityIds.map((id) => nameOf(facts, id)).join(', ');
  return (
    <div className="rounded-lg border border-dashed border-border bg-[#fbfaf7] px-4 py-3">
      <div className="flex items-start gap-2.5">
        <Lightbulb className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-[13px] text-foreground">{members || 'Suggested grouping'}</p>
          {cluster.reasoning && <p className="mt-0.5 text-[12.5px] leading-[1.5] text-muted-foreground">{cluster.reasoning}</p>}
        </div>
      </div>
      <div className="mt-2.5 flex items-center gap-2 pl-6">
        <button
          type="button"
          onClick={() => onChange(adoptActingSuggestion(facts, cluster.id))}
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1 text-[12px] text-foreground transition-colors hover:border-ds-ink-tertiary"
        >
          <Plus className="h-3 w-3" /> Use as a group
        </button>
        <button
          type="button"
          onClick={() => onChange(removeActingCluster(facts, cluster.id))}
          className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[12px] text-muted-foreground transition-colors hover:text-foreground"
        >
          <X className="h-3 w-3" /> Dismiss
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

/**
 * Section 2 of Part A. The advisor builds the acting-together (samenwerkende
 * groep) groupings by hand: who cooperates, on what basis, and the reasoning that
 * feeds the memo. Any automatic detection is offered only as a non-binding hint.
 */
export function ActingTogetherSection({ facts, onChange, generated, refining }: Props) {
  const shown = visibleFacts(facts);
  const editable = !!onChange;
  const manualGroups = shown.actingTogether.filter((c) => c.origin === 'manual');
  const hints = shown.actingTogether.filter((c) => c.origin !== 'manual');
  const [building, setBuilding] = useState(false);

  const taxpayerId = shown.entities.find((e) => e.role === 'Taxpayer')?.id ?? shown.entities[0]?.id ?? null;

  const create = (input: { memberEntityIds: string[]; name: string; basis: ActingBasis; targetEntityId: string | null }) => {
    onChange!(addActingGroup(facts, input));
    setBuilding(false);
  };

  return (
    <div className="space-y-6">
      {/* Clarity lede: what the test is and why it is an advisor judgement call. */}
      <p className="max-w-[900px] text-[14.5px] leading-[1.62] text-foreground">
        For ATAD2, a shareholder is associated from <span className="font-medium">{THRESHOLD}%</span>. Separate holders that
        <span className="font-medium"> act together</span> count as one group, so a 10% holder can join a party already above the
        line, or several small stakes can cross it together. Documents rarely say who cooperates, so define any groups that act
        together in the meaning of the law.
      </p>

      {manualGroups.map((cluster) => (
        <ManualGroupCard key={cluster.id} facts={facts} cluster={cluster} editable={editable} onChange={onChange} />
      ))}

      {/* Add-group affordance */}
      {editable && (building ? (
        <GroupBuilder facts={shown} defaultTargetId={taxpayerId} onCreate={create} onCancel={() => setBuilding(false)} />
      ) : (
        <button
          type="button"
          onClick={() => setBuilding(true)}
          className={cn(
            'inline-flex items-center gap-2 rounded-lg border border-dashed px-4 text-[13.5px] transition-colors',
            manualGroups.length === 0
              ? 'w-full justify-center border-brand-terracotta/40 bg-[#fdfcf9] py-5 text-brand-terracotta-deep hover:bg-brand-terracotta-soft/50'
              : 'border-border py-2.5 text-muted-foreground hover:border-ds-ink-tertiary hover:text-foreground',
          )}
        >
          <Users className="h-4 w-4" /> Add acting-together group
        </button>
      ))}

      {/* Non-binding AI suggestions */}
      {hints.length > 0 && (
        <div className="space-y-2.5">
          <p className="text-[10.5px] font-medium uppercase tracking-[0.13em] text-muted-foreground">
            Suggested from the documents · not binding
          </p>
          {hints.map((cluster) =>
            editable
              ? <HintCard key={cluster.id} facts={facts} cluster={cluster} onChange={onChange!} />
              : (
                <div key={cluster.id} className="rounded-lg border border-dashed border-border bg-[#fbfaf7] px-4 py-3 text-[12.5px] text-muted-foreground">
                  {cluster.memberEntityIds.map((id) => nameOf(facts, id)).join(', ')}: {cluster.reasoning}
                </div>
              ),
          )}
        </div>
      )}

      {/* Empty states */}
      {manualGroups.length === 0 && hints.length === 0 && (
        editable ? (
          refining ? (
            <p className="text-xs text-muted-foreground">Looking for possible groupings in the background.</p>
          ) : null
        ) : (
          <p className="text-xs text-muted-foreground">
            {generated ? 'No acting-together group has been recorded for this assessment.' : 'Not assessed yet.'}
          </p>
        )
      )}
    </div>
  );
}
