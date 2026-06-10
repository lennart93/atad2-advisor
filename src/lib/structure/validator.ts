import type { StructureEntity, StructureEdge } from './types';

export type ValidatorSeverity = 'block' | 'warn';

export interface OwnershipSumIssue {
  child_id: string;
  sum_pct: number;
}

export interface MissingFieldsEntry {
  entity_id: string;
  missing: 'jurisdiction_iso'[];
}

export interface ValidatorResult {
  cycles: string[][];
  missingFields: MissingFieldsEntry[];
  ownershipSumIssues: OwnershipSumIssue[];
  hasBlocking: boolean;
}

const TOLERANCE = 0.01;

export function validate(
  entities: StructureEntity[],
  edges: StructureEdge[],
): ValidatorResult {
  const ownershipEdges = edges.filter((e) => e.kind === 'ownership');

  const ownershipSumIssues = computeOwnershipSumIssues(entities, ownershipEdges);
  const missingFields = computeMissingFields(entities);
  const cycles = detectCycles(entities, ownershipEdges);

  return {
    cycles,
    missingFields,
    ownershipSumIssues,
    hasBlocking: cycles.length > 0 || missingFields.length > 0,
  };
}

function computeOwnershipSumIssues(
  entities: StructureEntity[],
  ownershipEdges: StructureEdge[],
): OwnershipSumIssue[] {
  const incomingByChild = new Map<string, StructureEdge[]>();
  for (const e of ownershipEdges) {
    const list = incomingByChild.get(e.to_entity_id) ?? [];
    list.push(e);
    incomingByChild.set(e.to_entity_id, list);
  }

  const issues: OwnershipSumIssue[] = [];
  for (const [childId, incoming] of incomingByChild) {
    if (incoming.length === 0) continue;
    if (!entities.some((x) => x.id === childId)) continue;
    const sum = incoming.reduce((acc, e) => acc + (e.ownership_pct ?? 100), 0);
    if (Math.abs(sum - 100) > TOLERANCE) {
      issues.push({ child_id: childId, sum_pct: sum });
    }
  }
  return issues;
}

function computeMissingFields(entities: StructureEntity[]): MissingFieldsEntry[] {
  // legal_form is intentionally NOT validated: it was a constant source of
  // false blocking (PE funds, foreign vehicles often have no BV/NV-style legal
  // form), so the app no longer tracks it. Only jurisdiction is required.
  const out: MissingFieldsEntry[] = [];
  for (const e of entities) {
    const missing: 'jurisdiction_iso'[] = [];
    if (e.jurisdiction_iso == null || e.jurisdiction_iso.trim() === '') {
      missing.push('jurisdiction_iso');
    }
    if (missing.length > 0) out.push({ entity_id: e.id, missing });
  }
  return out;
}

function detectCycles(
  entities: StructureEntity[],
  ownershipEdges: StructureEdge[],
): string[][] {
  const children = new Map<string, string[]>();
  for (const e of ownershipEdges) {
    const list = children.get(e.from_entity_id) ?? [];
    list.push(e.to_entity_id);
    children.set(e.from_entity_id, list);
  }

  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map<string, number>();
  for (const e of entities) color.set(e.id, WHITE);

  const cycles: string[][] = [];
  const reportedCycleSets = new Set<string>();

  function dfs(id: string, stack: string[]): void {
    color.set(id, GRAY);
    stack.push(id);
    const kids = children.get(id) ?? [];
    for (const c of kids) {
      const cColor = color.get(c);
      if (cColor === GRAY) {
        // Found a cycle: walk back from current stack to where c appears.
        const startIdx = stack.indexOf(c);
        if (startIdx >= 0) {
          const cycle = stack.slice(startIdx);
          const key = [...cycle].sort().join('|');
          if (!reportedCycleSets.has(key)) {
            reportedCycleSets.add(key);
            cycles.push(cycle);
          }
        }
      } else if (cColor === WHITE) {
        dfs(c, stack);
      }
    }
    stack.pop();
    color.set(id, BLACK);
  }

  for (const e of entities) {
    if (color.get(e.id) === WHITE) dfs(e.id, []);
  }

  return cycles;
}
