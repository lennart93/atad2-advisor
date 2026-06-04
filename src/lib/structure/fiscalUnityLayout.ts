// src/lib/structure/fiscalUnityLayout.ts
//
// Geometry voor fiscale-eenheid (FE) kaders. Wordt gebruikt door:
//  - FiscalUnityFrameNode: rendert het gestippelde rechthoek + label binnen
//    de React Flow viewport, zodat de PNG-snapshot het kader meeneemt.
//  - FiscalUnityOverlay: rendert alleen de sleep-handles op exact dezelfde
//    coordinaten als het frame, alleen wanneer een FE geselecteerd is.
//
// Hier gedeelde laag voorkomt dat node + overlay uit sync raken.
import type { StructureEntity, StructureGroup } from './types';
import { NODE_WIDTH, NODE_HEIGHT } from './labelMeasure';

export const FRAME_PADDING = 16;

export type EdgeDeltas = { dLeft: number; dTop: number; dRight: number; dBottom: number };

export const EMPTY_DELTAS: EdgeDeltas = { dLeft: 0, dTop: 0, dRight: 0, dBottom: 0 };

export function parseDeltas(raw: unknown): EdgeDeltas {
  if (!raw || typeof raw !== 'object') return EMPTY_DELTAS;
  const r = raw as Record<string, unknown>;
  return {
    dLeft: Number(r.dLeft) || 0,
    dTop: Number(r.dTop) || 0,
    dRight: Number(r.dRight) || 0,
    dBottom: Number(r.dBottom) || 0,
  };
}

export function isEmptyDeltas(d: EdgeDeltas): boolean {
  return d.dLeft === 0 && d.dTop === 0 && d.dRight === 0 && d.dBottom === 0;
}

export interface FrameLayout {
  groupingId: string;
  kind: StructureGroup['kind'];
  label: string;
  /** Top-left X of the frame in chart coordinates. */
  x: number;
  /** Top-left Y of the frame in chart coordinates. */
  y: number;
  width: number;
  height: number;
  /** Persisted deltas (for the handle component to pass back on drag start). */
  persistedDeltas: EdgeDeltas;
}

/**
 * Compute the on-canvas bounds of every FE/grouping based on its members'
 * positions, with the user's bounds_override (drag-resized edges) applied.
 *
 * Pure: no React Flow store access. Same inputs → same outputs.
 */
export function computeFrameLayouts(
  groupings: StructureGroup[],
  entities: StructureEntity[],
): FrameLayout[] {
  const entityById = new Map(entities.map((e) => [e.id, e]));
  const out: FrameLayout[] = [];
  for (const g of groupings) {
    const members = g.member_ids
      .map((id) => entityById.get(id))
      .filter((e): e is StructureEntity => Boolean(e));
    if (members.length === 0) continue;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const m of members) {
      if (m.position_x < minX) minX = m.position_x;
      if (m.position_y < minY) minY = m.position_y;
      if (m.position_x + NODE_WIDTH > maxX) maxX = m.position_x + NODE_WIDTH;
      if (m.position_y + NODE_HEIGHT > maxY) maxY = m.position_y + NODE_HEIGHT;
    }

    const d = parseDeltas(g.bounds_override);
    const x = minX - FRAME_PADDING + d.dLeft;
    const y = minY - FRAME_PADDING + d.dTop;
    const width = (maxX - minX + FRAME_PADDING * 2) - d.dLeft + d.dRight;
    const height = (maxY - minY + FRAME_PADDING * 2) - d.dTop + d.dBottom;

    out.push({
      groupingId: g.id,
      kind: g.kind,
      label: g.label ?? '',
      x, y, width, height,
      persistedDeltas: d,
    });
  }
  return out;
}
