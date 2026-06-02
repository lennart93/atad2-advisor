// Fiscal-unity-merge helpers — enforce the rule that any entity can be in
// AT MOST ONE fiscal_unity. When the user creates a new FE with members that
// already belong to existing FEs, those FEs are merged into a single one.
// When an entity is added to an FE via the inspector and the entity is already
// in another FE, the two FEs merge.

import type { StructureGroup } from './types';
import { createGrouping, updateGrouping, deleteGrouping } from './client';

interface MergeResult {
  groupings: StructureGroup[];
}

/**
 * Apply the "members can be in at most one fiscal_unity" rule.
 *
 * Given a set of member_ids that the user wants in the SAME fiscal unity,
 * either:
 *   - create a new FE if none of those members are in an existing FE, OR
 *   - merge all overlapping existing FEs into one (keeping the first by
 *     creation time), and add any new members to it.
 *
 * Returns the resulting groupings array (post-mutation), so the caller can
 * call setGroupings(result.groupings) to refresh local state.
 */
export async function addOrMergeFiscalUnity(
  chartId: string,
  newMemberIds: string[],
  currentGroupings: StructureGroup[],
): Promise<MergeResult> {
  if (newMemberIds.length === 0) return { groupings: currentGroupings };

  const fes = currentGroupings.filter((g) => g.kind === 'fiscal_unity');
  const others = currentGroupings.filter((g) => g.kind !== 'fiscal_unity');

  // Find all existing FEs that share at least one member with newMemberIds.
  const overlapping = fes.filter((g) =>
    g.member_ids.some((id) => newMemberIds.includes(id)),
  );

  if (overlapping.length === 0) {
    // No overlap → simple create.
    const created = await createGrouping({
      chart_id: chartId,
      kind: 'fiscal_unity',
      label: '',
      member_ids: dedupe(newMemberIds),
    });
    return { groupings: [...currentGroupings, created] };
  }

  // Sort overlapping FEs by created_at ascending so we keep the oldest one
  // (most stable identity for the user — the one they made first).
  overlapping.sort((a, b) => a.created_at.localeCompare(b.created_at));
  const keep = overlapping[0];
  const drop = overlapping.slice(1);

  // Union of: keep's members + every dropped FE's members + new members.
  const merged = new Set<string>(keep.member_ids);
  for (const d of drop) for (const id of d.member_ids) merged.add(id);
  for (const id of newMemberIds) merged.add(id);

  // Pick a label: the first non-empty one wins.
  const inheritedLabel =
    [keep, ...drop].map((g) => g.label.trim()).find((l) => l.length > 0) ?? '';
  const patchLabel = inheritedLabel && inheritedLabel !== keep.label
    ? inheritedLabel
    : undefined;

  const updated = await updateGrouping(keep.id, {
    member_ids: Array.from(merged),
    ...(patchLabel !== undefined ? { label: patchLabel } : {}),
  });

  // Delete the dropped FEs in parallel.
  await Promise.all(drop.map((d) => deleteGrouping(d.id)));

  const dropIds = new Set(drop.map((d) => d.id));
  const remainingFes = fes.filter((g) => g.id !== keep.id && !dropIds.has(g.id));
  return { groupings: [...others, ...remainingFes, updated] };
}

function dedupe(ids: string[]): string[] {
  return Array.from(new Set(ids));
}
