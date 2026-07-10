import { useState } from 'react';
import { Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AppendixFacts, ActingTogetherCluster } from '@/lib/appendix/types';
import { effRelatedPct } from '@/lib/appendix/facts/entityFields';
import { actingBasisLabel, type ActingBasis } from '@/lib/appendix/facts/actingBasis';
import { addActingGroup, withClusterVisibility } from '@/lib/appendix/facts/actingCluster';
import { GroupBuilder, HintCard } from '@/components/appendix/ActingTogetherSection';
import { AppendixRowItem } from './AppendixRowItem';
import { RolledUpGroup } from './RolledUpGroup';

function nameOf(facts: AppendixFacts, id: string): string {
  return facts.entities.find((e) => e.id === id)?.name ?? id;
}

/** The group's combined stake (advisor edits included), or null if no holdings. */
function combinedPct(facts: AppendixFacts, cluster: ActingTogetherCluster): number | null {
  const hs = cluster.memberEntityIds.map((id) => {
    const e = facts.entities.find((x) => x.id === id);
    return e ? effRelatedPct(e) : null;
  });
  return hs.some((h) => h != null) ? hs.reduce<number>((n, h) => n + (h ?? 0), 0) : null;
}
function fmtPct(n: number | null): string {
  return n == null ? '' : `${Number.isInteger(n) ? n : n.toFixed(1)}%`;
}

/**
 * Part A section 2 (spec §5): each acting-together group is one row (name/members
 * + combined %); all editing lives in the detail panel. The "Add group" builder is
 * a collapsed affordance, and the non-binding document suggestions collapse into
 * one muted roll-up (Use as group / Dismiss in place).
 */
export function ActingTogetherSectionV2({ facts, onChange, selectedId, onSelect }: {
  facts: AppendixFacts;
  onChange?: (next: AppendixFacts) => void;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const editable = !!onChange;
  const change = onChange ?? (() => { /* read-only */ });
  const [building, setBuilding] = useState(false);

  const manualGroups = facts.actingTogether.filter((c) => c.origin === 'manual');
  const hints = facts.actingTogether.filter((c) => c.origin !== 'manual');
  const taxpayerId = facts.entities.find((e) => e.role === 'Taxpayer')?.id ?? facts.entities[0]?.id ?? null;

  const create = (input: { memberEntityIds: string[]; name: string; basis: ActingBasis; targetEntityId: string | null }) => {
    const next = addActingGroup(facts, input);
    const prevIds = new Set(facts.actingTogether.map((c) => c.id));
    const created = next.actingTogether.find((c) => !prevIds.has(c.id));
    change(next);
    setBuilding(false);
    if (created) onSelect(created.id);
  };

  return (
    <div>
      {manualGroups.length === 0 && hints.length === 0 && !building && (
        <p className="mb-2 text-[13px] text-muted-foreground">
          No acting-together group recorded. Separate holders that act together count as one associated party; add a group if one applies.
        </p>
      )}

      <div>
        {manualGroups.map((cluster) => {
          const label = cluster.name?.trim() || cluster.memberEntityIds.map((id) => nameOf(facts, id)).join(' + ');
          return (
            <AppendixRowItem
              key={cluster.id}
              rowId={cluster.id}
              domId={`v2-group-${cluster.id}`}
              label={label}
              meta={fmtPct(combinedPct(facts, cluster)) || actingBasisLabel(cluster.basis)}
              reason={cluster.name?.trim() ? cluster.memberEntityIds.map((id) => nameOf(facts, id)).join(' + ') : null}
              selected={selectedId === cluster.id}
              onSelect={() => onSelect(cluster.id)}
              eye={editable ? {
                hidden: !!cluster.excludedFromClient,
                onToggle: () => change(withClusterVisibility(facts, cluster.id, !!cluster.excludedFromClient)),
                label: cluster.excludedFromClient ? 'Show this group in the client report' : 'Hide this group from the client report',
              } : null}
            />
          );
        })}
      </div>

      {/* Add-group affordance (collapsed by default). */}
      {editable && (building ? (
        <div className="mt-3">
          <GroupBuilder facts={facts} defaultTargetId={taxpayerId} onCreate={create} onCancel={() => setBuilding(false)} />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setBuilding(true)}
          className={cn('mt-3 inline-flex items-center gap-2 rounded-[4px] border border-border px-3 py-1.5 text-[12.5px] text-muted-foreground transition-colors hover:border-ds-ink-tertiary hover:text-foreground')}
        >
          <Users className="h-3.5 w-3.5" /> Add acting-together group
        </button>
      ))}

      {/* Non-binding document suggestions, rolled up. */}
      {hints.length > 0 && (
        <div className="mt-3">
          <RolledUpGroup summary={`${hints.length} ${hints.length === 1 ? 'suggestion' : 'suggestions'} from documents`}>
            <div className="space-y-2.5 py-2">
              {hints.map((cluster) => (
                editable
                  ? <HintCard key={cluster.id} facts={facts} cluster={cluster} onChange={change} />
                  : (
                    <div key={cluster.id} className="rounded-lg border border-dashed border-border bg-[#fbfaf7] px-4 py-3 text-[12.5px] text-muted-foreground">
                      {cluster.memberEntityIds.map((id) => nameOf(facts, id)).join(', ')}: {cluster.reasoning}
                    </div>
                  )
              ))}
            </div>
          </RolledUpGroup>
        </div>
      )}
    </div>
  );
}
