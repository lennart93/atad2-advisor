// src/components/structure/StructureChartStep.tsx
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AssessmentFooterSlot } from '@/components/assessment/AssessmentFooterSlot';
import { StructureChart } from './StructureChart';
import { FloatingPalette } from './FloatingPalette';
import { FloatingInspector } from './FloatingInspector';
import { FloatingToolbar } from './FloatingToolbar';
import { BlockingBanner } from './BlockingBanner';
import { tierLayout, clusterId, type PositionedEntity, type TierLayoutResult } from '@/lib/structure/tierLayout';
import { groupNonRelevantSiblings, deriveClusterName, type Cluster } from '@/lib/structure/relevance';
import { validate, type ValidatorResult } from '@/lib/structure/validator';
import { wrapLabels } from '@/lib/structure/labelMeasure';
import {
  loadChart,
  saveChartSnapshot,
  listGroupings,
  upsertEntity,
  deleteEntity,
  upsertEdge,
  deleteEdge,
  updateEntityPosition,
  finalizeChart,
  unfinalizeChart,
  forceDraftReady,
  createGrouping,
  updateGrouping,
  deleteGrouping,
} from '@/lib/structure/client';
import { addOrMergeFiscalUnity } from '@/lib/structure/fiscalUnity';
import { computeFrameLayouts } from '@/lib/structure/fiscalUnityLayout';
import { startExtraction, pollUntilTerminal } from '@/lib/structure/extraction';
import { FiscalUnityEditPopover } from './overlays/FiscalUnityEditPopover';
import { captureChartSnapshot } from '@/lib/structure/captureChartSnapshot';
import type { Node } from '@xyflow/react';
import type {
  StructureChart as Chart,
  StructureEntity,
  StructureEdge,
  StructureGroup,
  ChartStatus,
  EntityType,
} from '@/lib/structure/types';
import type { ClusterNodeData } from './nodes/ClusterNode';
import { AtlasLoader } from './AtlasLoader';
import { AnimatedLogo } from '@/components/AnimatedLogo';
import { StructureRefiningCallout } from './StructureRefiningCallout';

type ClusterLayout = Array<{
  id: string;
  position: { x: number; y: number };
  data: ClusterNodeData;
}>;

function buildClusterLayout(
  clusters: Cluster[],
  positions: Map<string, PositionedEntity>,
  entities: StructureEntity[],
): ClusterLayout {
  return clusters
    .map((c) => {
      const idStr = clusterId(c);
      const pos = positions.get(idStr);
      if (!pos) return null;
      const members = c.member_ids
        .map((id) => entities.find((e) => e.id === id))
        .filter((e): e is StructureEntity => Boolean(e));
      const jurisdictions: Record<string, number> = {};
      for (const m of members) {
        const iso = (m.jurisdiction_iso || '').toUpperCase();
        jurisdictions[iso] = (jurisdictions[iso] ?? 0) + 1;
      }
      const allNL = Object.keys(jurisdictions).every((iso) => iso === 'NL');
      const allForeign = Object.keys(jurisdictions).every((iso) => iso !== 'NL' && iso !== '');
      const mix: ClusterNodeData['jurisdictionMix'] = allNL
        ? 'all-NL'
        : allForeign
        ? 'all-foreign'
        : 'mixed';
      return {
        id: idStr,
        position: { x: pos.x, y: pos.y },
        data: {
          count: members.length,
          jurisdictions,
          jurisdictionMix: mix,
          name: deriveClusterName(members),
          // onExpand placeholder; the component re-binds it below.
          onExpand: () => {},
        },
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);
}

export function StructureChartStep({ sessionId }: { sessionId: string }) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  // When the user opens this step via "Edit" on the Overview, hide Previous
  // and re-label the forward CTA — they're not progressing, they're returning.
  const editFromOverview = searchParams.get('from') === 'overview';
  const [chart, setChart] = useState<Chart | null>(null);
  const [entities, setEntities] = useState<StructureEntity[]>([]);
  const [edges, setEdgesState] = useState<StructureEdge[]>([]);
  const [groupings, setGroupings] = useState<StructureGroup[]>([]);
  type Selection =
    | { kind: 'node'; id: string }
    | { kind: 'edge'; id: string }
    | { kind: 'nodes'; ids: string[] }
    | null;
  const [selection, setSelection] = useState<Selection>(null);
  const [selectedGroupingId, setSelectedGroupingId] = useState<string | null>(null);
  const [editingGrouping, setEditingGrouping] = useState<{
    grouping: StructureGroup;
    screenX: number;
    screenY: number;
  } | null>(null);

  // Delete-key op een geselecteerde fiscale eenheid: verwijder het kader
  // (zonder confirmatie — undo is via terug-toevoegen). Negeer als focus in
  // een tekstveld zit anders eet je delete in formulieren op.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return;
      if (!selectedGroupingId) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      const id = selectedGroupingId;
      setSelectedGroupingId(null);
      setGroupings((prev) => prev.filter((g) => g.id !== id));
      deleteGrouping(id).catch((err) => console.error('[FE] delete failed', err));
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [selectedGroupingId]);

  // Delete-key op een (multi)entity- of edge-selectie. Verwijdert optimistisch
  // uit de UI en vuurt de delete naar de DB op de achtergrond. Edges die aan
  // verwijderde entities hangen halen we ook lokaal weg zodat ze niet als
  // dangling stub blijven hangen tot de volgende refresh.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return;
      if (!selection) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;

      if (selection.kind === 'node') {
        const id = selection.id;
        setSelection(null);
        setEntities((prev) => prev.filter((en) => en.id !== id));
        setEdgesState((prev) =>
          prev.filter((ed) => ed.from_entity_id !== id && ed.to_entity_id !== id),
        );
        deleteEntity(id).catch((err) => console.error('[FE] delete entity failed', err));
      } else if (selection.kind === 'nodes') {
        const ids = new Set(selection.ids);
        if (ids.size === 0) return;
        setSelection(null);
        setEntities((prev) => prev.filter((en) => !ids.has(en.id)));
        setEdgesState((prev) =>
          prev.filter((ed) => !ids.has(ed.from_entity_id) && !ids.has(ed.to_entity_id)),
        );
        Promise.all([...ids].map((id) => deleteEntity(id))).catch((err) =>
          console.error('[FE] bulk delete failed', err),
        );
      } else if (selection.kind === 'edge') {
        const id = selection.id;
        setSelection(null);
        setEdgesState((prev) => prev.filter((ed) => ed.id !== id));
        deleteEdge(id).catch((err) => console.error('[FE] delete edge failed', err));
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [selection]);
  const [status, setStatus] = useState<ChartStatus | 'loading'>('loading');
  const [busy, setBusy] = useState(false);
  // Tracks which clusters the user has explicitly COLLAPSED. Default empty =
  // nothing collapsed = the chart opens fully expanded. New entities from
  // Phase B inherit the default (not in the set → expanded).
  const [collapsedClusters, setCollapsedClusters] = useState<Set<string>>(new Set());
  // Persist collapse state per chart in localStorage so the editor opens with
  // the same set the user last saw. Keeps the editor symmetric with the
  // overview snapshot, which captures whatever was collapsed at navigate-time.
  // hydratedKey is state (not a ref) so React commits the hydrate setState
  // before the write effect re-runs — otherwise the write would wipe the saved
  // entry with the still-empty initial Set in the same render.
  const collapseStorageKey = chart ? `atad2.collapsedClusters:${chart.id}` : null;
  const [hydratedKey, setHydratedKey] = useState<string | null>(null);
  useEffect(() => {
    if (!collapseStorageKey || hydratedKey === collapseStorageKey) return;
    try {
      const raw = window.localStorage.getItem(collapseStorageKey);
      if (raw) {
        const ids = JSON.parse(raw);
        if (Array.isArray(ids)) setCollapsedClusters(new Set(ids.filter((s) => typeof s === 'string')));
      }
    } catch {
      // Corrupt entry: ignore and start expanded.
    }
    setHydratedKey(collapseStorageKey);
  }, [collapseStorageKey, hydratedKey]);
  useEffect(() => {
    if (!collapseStorageKey || hydratedKey !== collapseStorageKey) return;
    try {
      if (collapsedClusters.size === 0) window.localStorage.removeItem(collapseStorageKey);
      else window.localStorage.setItem(collapseStorageKey, JSON.stringify([...collapsedClusters]));
    } catch {
      // Quota/private-mode: silently degrade to in-memory only.
    }
  }, [collapseStorageKey, collapsedClusters, hydratedKey]);
  const [clusterLayout, setClusterLayout] = useState<ClusterLayout>([]);
  const activeClustersRef = useRef<Cluster[]>([]);
  // Capture API handed up from StructureChart on init — used by goNext to grab
  // a transparent PNG of the whole chart before finalizing.
  const captureApiRef = useRef<{
    getViewportEl: () => HTMLElement | null;
    getNodes: () => Node[];
  } | null>(null);
  const [showOrphans, setShowOrphans] = useState(false);
  const [tierResult, setTierResult] = useState<TierLayoutResult | null>(null);
  const gridVisible = true;

  // Hide orphans: an entity is "visible" only if it has an ownership-edge path
  // to the chart anchor (taxpayer, or first entity as fallback). Entities that
  // were extracted but never wired into the ownership graph are excluded from
  // the rendered chart, the layout pass, the toolbar counts, and exports.
  const visibleEntities = useMemo(() => {
    if (entities.length === 0) return entities;
    const ownership = edges.filter((e) => e.kind === 'ownership');
    const taxpayer = entities.find((e) => e.is_taxpayer);
    const anchorId = taxpayer?.id ?? entities[0]?.id;
    if (!anchorId) return entities;
    const connected = new Set<string>([anchorId]);
    const queue = [anchorId];
    while (queue.length > 0) {
      const cur = queue.shift()!;
      for (const e of ownership) {
        if (e.from_entity_id === cur && !connected.has(e.to_entity_id)) {
          connected.add(e.to_entity_id);
          queue.push(e.to_entity_id);
        }
        if (e.to_entity_id === cur && !connected.has(e.from_entity_id)) {
          connected.add(e.from_entity_id);
          queue.push(e.from_entity_id);
        }
      }
    }
    return entities.filter((e) => connected.has(e.id));
  }, [entities, edges]);

  const visibleEdges = useMemo(() => {
    const ids = new Set(visibleEntities.map((e) => e.id));
    return edges.filter(
      (e) => ids.has(e.from_entity_id) && ids.has(e.to_entity_id),
    );
  }, [edges, visibleEntities]);

  // Validation — gates layout and chart render.
  const validation = useMemo<ValidatorResult>(
    () => validate(visibleEntities, visibleEdges),
    [visibleEntities, visibleEdges],
  );

  // Label line-breaks — drives multi-line name rendering in EntityNode. Includes
  // orphan entities so they render correctly when the user clicks
  // "N disconnected · Show".
  const labelLineBreaks = useMemo(
    () => wrapLabels([...visibleEntities, ...(tierResult?.orphans ?? [])]),
    [visibleEntities, tierResult],
  );

  // Synthesize parent → cluster_placeholder ownership edges so the cluster
  // placeholder is visibly connected to its parent in the chart.
  const clusterEdges = useMemo<StructureEdge[]>(() => {
    if (!chart) return [];
    const out: StructureEdge[] = [];
    for (const c of activeClustersRef.current) {
      const idStr = clusterId(c);
      out.push({
        id: `cluster-edge-${idStr}`,
        chart_id: chart.id,
        from_entity_id: c.parent_id,
        to_entity_id: idStr,
        kind: 'ownership',
        ownership_pct: null,
        ownership_voting_only: null,
        transaction_type: null,
        amount_eur: null,
        is_mismatch: false,
        mismatch_classification: null,
        mismatch_atad2_article: null,
        label: null,
        source: 'ai_extracted',
        created_at: '',
        updated_at: '',
      });
    }
    return out;
    // Recompute when clusterLayout changes (which happens when runLayout fires).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chart, clusterLayout]);

  const renderableEdges = useMemo<StructureEdge[]>(
    () => [...visibleEdges, ...clusterEdges],
    [visibleEdges, clusterEdges],
  );

  // When showOrphans is true, append orphan entities at the bottom of the chart
  // (below the lowest positioned tier). They are excluded from the main layout
  // pass (visibleEntities BFS excludes them), and only shown when the user
  // explicitly opts in via the toolbar toggle.
  //
  // Also filters out cluster members that the layout folded into a cluster
  // placeholder (they are absent from tierResult.positions). Without this filter,
  // collapsed-then-re-collapsed members keep rendering at their last-known
  // positions alongside the placeholder, causing a visual duplicate.
  const renderEntities = useMemo<StructureEntity[]>(() => {
    // Filter visibleEntities to only those the layout actually placed.
    // Cluster members get folded into their cluster placeholder, so they
    // aren't in tierResult.positions and should NOT render individually.
    const placed = visibleEntities.filter(
      (e) => !tierResult || tierResult.positions.has(e.id),
    );

    if (!showOrphans || !tierResult || tierResult.orphans.length === 0) {
      return placed;
    }

    const tierMaxY = Array.from(tierResult.positions.values()).reduce(
      (max, p) => Math.max(max, p.y),
      0,
    );
    const orphanY = tierMaxY + 200;
    const orphanCount = tierResult.orphans.length;
    const placedOrphans = tierResult.orphans.map((o, i) => ({
      ...o,
      position_x: (i - (orphanCount - 1) / 2) * 170,
      position_y: orphanY,
    }));
    return [...placed, ...placedOrphans];
  }, [showOrphans, tierResult, visibleEntities]);

  // Defensive: if visible entities all share the same position (e.g., stale
  // (0,0) values from a pre-tierLayout broken run), force a layout pass right
  // after load. The normal layout-on-data-change effect already runs, but this
  // guarantees the *first* render shows correct positions instead of a brief
  // pile-up.
  const positionsLookBroken = useMemo(() => {
    if (visibleEntities.length < 2) return false;
    const first = visibleEntities[0];
    const allSame = visibleEntities.every(
      (e) => e.position_x === first.position_x && e.position_y === first.position_y,
    );
    if (allSame) return true;
    return visibleEntities.every((e) => e.position_x === 0 && e.position_y === 0);
  }, [visibleEntities]);

  useEffect(() => {
    let aborted = false;
    (async () => {
      const loaded = await loadChart(sessionId);
      if (loaded?.chart) {
        if (aborted) return;
        setChart(loaded.chart);
        setEntities(loaded.entities);
        setEdgesState(loaded.edges);
        setGroupings(loaded.groupings);
        setStatus(loaded.chart.status as ChartStatus);
        // Poll if extraction is mid-flight. For phase_a_ready, auto-trigger
        // Phase B: Assessment.tsx fires it fire-and-forget after Q&A, but if
        // that call failed (network blip, raced the self-chain) the chart
        // sits in phase_a_ready forever and the loader dead-ends. 409 means
        // Phase A is still running — fall through and poll; the backend
        // self-chain will fire Phase B on A's completion.
        const onPollTick = async (s: ChartStatus) => {
          if (aborted) return;
          setStatus(s);
          const refreshed = await loadChart(sessionId);
          if (refreshed && !aborted) {
            setChart(refreshed.chart);
            setEntities(refreshed.entities);
            setEdgesState(refreshed.edges);
            setGroupings(refreshed.groupings);
          }
        };
        if (loaded.chart.status.startsWith('extracting:')) {
          await pollUntilTerminal(loaded.chart.id, onPollTick);
        } else if (loaded.chart.status === 'phase_a_ready') {
          try {
            await startExtraction(sessionId, 'refine');
          } catch (err) {
            if ((err as { status?: number })?.status !== 409) {
              console.warn('[StructureChartStep] Phase B trigger failed', err);
            }
          }
          await pollUntilTerminal(loaded.chart.id, onPollTick);
        }
      } else {
        // No chart row yet. Phase A may still be priming. Show the loader and
        // wait — Phase B (triggered by the user's "Continue" from Q&A) will
        // create the chart row if Phase A never did.
        setStatus('extracting:stage1' as ChartStatus);
        let attempts = 0;
        while (!aborted && attempts < 30) {
          await new Promise((r) => setTimeout(r, 2000));
          attempts += 1;
          const polled = await loadChart(sessionId);
          if (polled?.chart) {
            setChart(polled.chart);
            setEntities(polled.entities);
            setEdgesState(polled.edges);
            setGroupings(polled.groupings);
            setStatus(polled.chart.status as ChartStatus);
            if (polled.chart.status.startsWith('extracting:')) {
              await pollUntilTerminal(polled.chart.id, async (s) => {
                if (aborted) return;
                setStatus(s);
                const refreshed = await loadChart(sessionId);
                if (refreshed && !aborted) {
                  setChart(refreshed.chart);
                  setEntities(refreshed.entities);
                  setEdgesState(refreshed.edges);
                  setGroupings(refreshed.groupings);
                }
              });
            }
            return;
          }
        }
        // 60s passed and still no chart row — Phase A and Phase B both failed
        // to fire. Fall back: trigger Phase B ourselves so the user isn't stuck.
        try {
          await startExtraction(sessionId, 'refine');
          const refreshed = await loadChart(sessionId);
          if (refreshed) {
            setChart(refreshed.chart);
            setEntities(refreshed.entities);
            setEdgesState(refreshed.edges);
            setGroupings(refreshed.groupings);
            setStatus(refreshed.chart.status as ChartStatus);
            await pollUntilTerminal(refreshed.chart.id, async (s) => {
              if (aborted) return;
              setStatus(s);
              const ref2 = await loadChart(sessionId);
              if (ref2 && !aborted) {
                setChart(ref2.chart);
                setEntities(ref2.entities);
                setEdgesState(ref2.edges);
                setGroupings(ref2.groupings);
              }
            });
          }
        } catch (err) {
          console.error('[StructureChartStep] Fallback Phase B start failed', err);
          setStatus('extraction_failed' as ChartStatus);
        }
      }
    })().catch((err) => {
      console.error(err);
      setStatus('extraction_failed' as ChartStatus);
    });
    return () => {
      aborted = true;
    };
  }, [sessionId]);

  const runLayout = useCallback(() => {
    if (!chart) return;
    if (validation.hasBlocking) return;

    const ownership = visibleEdges.filter((e) => e.kind === 'ownership');
    const taxpayer = visibleEntities.find((e) => e.is_taxpayer);

    const allClusters = groupNonRelevantSiblings(
      visibleEntities,
      ownership,
      taxpayer?.id ?? '',
    );
    // Default = expanded for everyone. We only fold a cluster when the user
    // has explicitly collapsed it (its ID lives in collapsedClusters).
    const activeClusters = allClusters.clusters.filter(
      (c) => collapsedClusters.has(clusterId(c)),
    );
    activeClustersRef.current = activeClusters;

    const result = tierLayout({
      entities: visibleEntities,
      ownershipEdges: ownership,
      clusters: activeClusters,
      groupings,
    });
    setTierResult(result);

    setEntities((prev) =>
      prev.map((e) => {
        const p = result.positions.get(e.id);
        return p ? { ...e, position_x: p.x, position_y: p.y } : e;
      }),
    );
    for (const [, p] of result.positions) updateEntityPosition(p.id, p.x, p.y);

    setClusterLayout(buildClusterLayout(activeClusters, result.clusterPositions, visibleEntities));
  }, [chart, visibleEntities, visibleEdges, collapsedClusters, validation.hasBlocking, groupings]);

  // "Collapse all": fold every cluster that the current data shape can produce.
  // Recompute against the live entity/edge set so newly-arrived Phase B
  // entities also collapse instead of staying visible.
  const handleCollapseAll = useCallback(() => {
    const ownership = visibleEdges.filter((e) => e.kind === 'ownership');
    const taxpayer = visibleEntities.find((e) => e.is_taxpayer);
    const { clusters } = groupNonRelevantSiblings(
      visibleEntities,
      ownership,
      taxpayer?.id ?? '',
      groupings,
    );
    setCollapsedClusters(new Set(clusters.map((c) => clusterId(c))));
  }, [visibleEntities, visibleEdges, groupings]);

  // Re-bind onExpand handlers each render so they capture current state.
  // Expanding a cluster removes its ID from the collapsed set.
  const clusterNodes = useMemo<ClusterLayout>(
    () =>
      clusterLayout.map((c) => ({
        ...c,
        data: {
          ...c.data,
          onExpand: () => {
            setCollapsedClusters((prev) => {
              if (!prev.has(c.id)) return prev;
              const next = new Set(prev);
              next.delete(c.id);
              return next;
            });
          },
        },
      })),
    [clusterLayout],
  );

  // Re-run layout on every meaningful data change. Sync, deterministic, fast
  // (<5ms for 200 entities). No (0,0) gate; ensures the chart never appears
  // stacked at the origin even if stored positions are stale.
  useEffect(() => {
    if (!chart) return;
    if (entities.length === 0) return;
    if (validation.hasBlocking) return;
    runLayout();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chart?.id, entities.length, edges.length, collapsedClusters, validation.hasBlocking, groupings.length]);

  // Fiscale-eenheid kaders worden binnen de viewport gerenderd als React
  // Flow nodes (zodat ze meegaan in de PNG-capture). De geometrie hangt af
  // van de live member-posities + persisted bounds_override.
  const frameLayouts = useMemo(
    () => computeFrameLayouts(groupings, visibleEntities),
    [groupings, visibleEntities],
  );

  useEffect(() => {
    if (!chart) return;
    if (!positionsLookBroken) return;
    // Only re-layout when extraction is finished — during extraction the
    // entities-arrive-stacked is normal and the existing layout effect handles it.
    const isExtracting = typeof status === 'string' && status.startsWith('extracting:');
    if (isExtracting) return;
    runLayout();
  }, [chart, positionsLookBroken, status, runLayout]);

  const handleReExtract = async () => {
    if (!chart) return;
    setBusy(true);
    setStatus('extracting:stage1' as ChartStatus);
    setCollapsedClusters(new Set());
    setClusterLayout([]);
    await startExtraction(sessionId);
    await pollUntilTerminal(chart.id, async (s) => {
      setStatus(s);
      const refreshed = await loadChart(sessionId);
      if (refreshed) {
        setEntities(refreshed.entities);
        setEdgesState(refreshed.edges);
        setGroupings(refreshed.groupings);
      }
    });
    try {
      const loadedGroupings = await listGroupings(chart.id);
      setGroupings(loadedGroupings);
    } catch {
      // Non-fatal: groupings may be empty.
    }
    setBusy(false);
  };

  const handleCreateEntity = async (payload: {
    entityType: EntityType;
    name: string;
    jurisdiction_iso: string;
    relatedId: string;
    direction: 'above' | 'below';
    ownershipPct: number;
  }) => {
    if (!chart) return;
    const created = await upsertEntity({
      chart_id: chart.id,
      name: payload.name,
      legal_form: null,
      jurisdiction_iso: payload.jurisdiction_iso,
      entity_type: payload.entityType,
      is_taxpayer: false,
      position_x: 200,
      position_y: 200,
      source: 'user_added',
    } as Partial<StructureEntity> & { chart_id: string });
    // direction === 'below': new entity is owned by relatedId  → edge related → new
    // direction === 'above': new entity owns relatedId           → edge new → related
    const fromId = payload.direction === 'below' ? payload.relatedId : created.id;
    const toId = payload.direction === 'below' ? created.id : payload.relatedId;
    const createdEdge = await upsertEdge({
      chart_id: chart.id,
      from_entity_id: fromId,
      to_entity_id: toId,
      kind: 'ownership',
      ownership_pct: payload.ownershipPct,
      ownership_voting_only: false,
      source: 'user_added',
    });
    setEntities((prev) => [...prev, created]);
    setEdgesState((prev) => [...prev, createdEdge]);
  };

  const handlePctChange = useCallback(async (edgeId: string, newPct: number) => {
    const edge = edges.find((e) => e.id === edgeId);
    if (!edge) return;
    const updated = await upsertEdge({ ...edge, ownership_pct: newPct });
    setEdgesState((prev) => prev.map((e) => (e.id === edgeId ? updated : e)));
  }, [edges]);

  const handleLabelTChange = useCallback(async (edgeId: string, newT: number) => {
    const edge = edges.find((e) => e.id === edgeId);
    if (!edge) return;
    // Optimistisch in lokale state, dan persist. Bij DB-fout valt 'ie terug
    // op de oude waarde via de gebruikelijke load-paden.
    setEdgesState((prev) =>
      prev.map((e) => (e.id === edgeId ? { ...e, label_t: newT } : e)),
    );
    try {
      await upsertEdge({ ...edge, label_t: newT });
    } catch (err) {
      console.error('[Edge] persist label_t failed', err);
    }
  }, [edges]);

  const handleConnect = async (from: string, to: string) => {
    if (!chart) return;
    const created = await upsertEdge({
      chart_id: chart.id,
      from_entity_id: from,
      to_entity_id: to,
      kind: 'ownership',
      ownership_pct: 100,
      ownership_voting_only: false,
      source: 'user_added',
    });
    setEdgesState((prev) => [...prev, created]);
  };

  const selectedEntity =
    selection?.kind === 'node' ? entities.find((e) => e.id === selection.id) ?? null : null;
  const selectedEdge =
    selection?.kind === 'edge' ? edges.find((e) => e.id === selection.id) ?? null : null;

  const updateSelectedEntity = (patch: Partial<StructureEntity>) => {
    if (!selectedEntity) return;
    setEntities((prev) =>
      prev.map((e) => (e.id === selectedEntity.id ? { ...e, ...patch } : e)),
    );
    upsertEntity({ ...selectedEntity, ...patch });
  };
  const deleteSelectedEntity = async () => {
    if (!selectedEntity) return;
    await deleteEntity(selectedEntity.id);
    setEntities((prev) => prev.filter((e) => e.id !== selectedEntity.id));
    setSelection(null);
  };
  const updateSelectedEdge = (patch: Partial<StructureEdge>) => {
    if (!selectedEdge) return;
    setEdgesState((prev) =>
      prev.map((e) => (e.id === selectedEdge.id ? { ...e, ...patch } : e)),
    );
    upsertEdge({ ...selectedEdge, ...patch });
  };
  const deleteSelectedEdge = async () => {
    if (!selectedEdge) return;
    await deleteEdge(selectedEdge.id);
    setEdgesState((prev) => prev.filter((e) => e.id !== selectedEdge.id));
    setSelection(null);
  };

  const goNext = async () => {
    if (chart) {
      // Wis de selectie voordat we de snapshot pakken — anders zien we de
      // blauwe selectie-ring rond een entity terug in de gefinalizede PNG.
      setSelection(null);
      const api = captureApiRef.current;
      api?.clearSelection();
      // Geef React één frame om de selectie-class te laten verdwijnen.
      await new Promise((r) => requestAnimationFrame(() => r(null)));
      // Capture a transparent PNG of the whole chart and persist it. Fully
      // non-blocking: a null snapshot or a save failure must never stop the
      // user from continuing to the report.
      const snapshot = api
        ? await captureChartSnapshot(api.getViewportEl(), api.getNodes())
        : null;
      if (snapshot) {
        try {
          await saveChartSnapshot(chart.id, snapshot);
        } catch (err) {
          console.warn('[StructureChartStep] snapshot save failed', err);
        }
      }
      await finalizeChart(chart.id);
    }
    navigate(`/assessment-report/${sessionId}`);
  };

  const skipNext = async () => {
    if (chart) {
      try {
        await unfinalizeChart(chart.id);
      } catch (err) {
        console.warn('[StructureChartStep] unfinalize failed', err);
      }
    }
    navigate(`/assessment-report/${sessionId}`);
  };

  const isExtracting = typeof status === 'string' && status.startsWith('extracting:');
  const isFailed = status === 'extraction_failed';
  // Block the canvas only while the data isn't yet showable. As soon as Phase
  // A has produced entities and ownership edges (status hits phase_a_ready or
  // beyond), we render the chart. Phase B's refine pass runs in the
  // background and the polling effect updates the chart live — no need to
  // stare at a loader for ~2 min while the user's Q&A is folded in.
  const showLoader =
    status === 'loading' ||
    status === 'extracting:stage1' ||
    status === 'extracting:stage2';

  return (
    <div className="flex h-full flex-col">
      <AssessmentFooterSlot
        left={
          editFromOverview ? null : (
            <Button
              variant="outline"
              onClick={() => navigate(`/assessment-confirmation/${sessionId}`)}
              className="transition-all duration-fast"
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Previous
            </Button>
          )
        }
        right={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={skipNext}
              disabled={status === 'loading' || isExtracting}
              className="transition-all duration-fast"
            >
              Continue without structure chart
            </Button>
            <Button
              onClick={goNext}
              disabled={status === 'loading' || isExtracting}
              className="transition-all duration-fast"
            >
              {editFromOverview ? (
                'Save structure chart and return to overview'
              ) : (
                <>
                  Save structure chart and continue
                  <ArrowRight className="ml-2 h-4 w-4" />
                </>
              )}
            </Button>
          </div>
        }
      />

      <main className="relative flex-1 min-h-0">
        {showLoader ? (
            <div className="absolute inset-0 flex items-center justify-center bg-card">
              <AtlasLoader
                status={status}
                warnings={
                  (chart?.warnings as Array<{ stage: number; message: string }>) ?? []
                }
                detail={{ entitiesFound: visibleEntities.length || undefined }}
                onSkipRemaining={chart ? async () => {
                  await forceDraftReady(
                    chart.id,
                    'Extraction skipped by user.',
                  );
                  // Refresh chart state so the UI flips to draft_ready immediately.
                  const refreshed = await loadChart(sessionId);
                  if (refreshed) {
                    setChart(refreshed.chart);
                    setEntities(refreshed.entities);
                    setEdgesState(refreshed.edges);
                    setGroupings(refreshed.groupings);
                    setStatus(refreshed.chart.status as ChartStatus);
                  }
                } : undefined}
                onResumeFromPhaseA={status === 'phase_a_ready' && chart ? async () => {
                  await startExtraction(sessionId, 'refine');
                  await pollUntilTerminal(chart.id, async (s) => {
                    setStatus(s);
                    const refreshed = await loadChart(sessionId);
                    if (refreshed) {
                      setChart(refreshed.chart);
                      setEntities(refreshed.entities);
                      setEdgesState(refreshed.edges);
                      setGroupings(refreshed.groupings);
                    }
                  });
                } : undefined}
              />
            </div>
          ) : isFailed ? (
            <div className="absolute inset-0 flex items-center justify-center bg-card">
              <div className="flex flex-col items-center gap-3 text-center max-w-md px-6">
                <AnimatedLogo state="idle" size={36} className="opacity-35" />
                <div className="text-sm font-bold">Extraction failed</div>
                <p className="text-xs text-muted-foreground">
                  {(chart?.warnings as Array<{ stage: number; message: string }> | undefined)?.[0]?.message ?? 'Unknown error.'}
                </p>
                <Button onClick={handleReExtract}>Try again</Button>
              </div>
            </div>
          ) : validation.hasBlocking ? (
            <BlockingBanner
              result={validation}
              entities={visibleEntities}
              onOpenEntity={(id) => setSelection({ kind: 'node', id })}
            />
          ) : (
            <>
              <div className="absolute inset-0 hidden lg:flex">
                <div className="relative flex-1">
                <StructureChart
                  entities={renderEntities}
                edges={renderableEdges}
                clusterNodes={clusterNodes}
                onSelectionChange={(s) => {
                  setSelection(s);
                  // Node/edge/pane-klik wist de FE-kader-selectie ook, anders
                  // blijft de delete-toets per ongeluk een FE wegblazen
                  // terwijl je een entity geselecteerd hebt.
                  setSelectedGroupingId(null);
                }}
                onNodePositionEnd={(id, x, y) => {
                  setEntities((prev) =>
                    prev.map((e) =>
                      e.id === id ? { ...e, position_x: x, position_y: y } : e,
                    ),
                  );
                  updateEntityPosition(id, x, y);
                }}
                onConnect={handleConnect}
                onPctChange={handlePctChange}
                onLabelTChange={handleLabelTChange}
                ranks={tierResult?.ranks ?? new Map()}
                frameLayouts={frameLayouts}
                labelLineBreaks={labelLineBreaks}
                gridVisible={gridVisible}
                onCaptureReady={(api) => {
                  captureApiRef.current = api;
                }}
                onGroupingLabelClick={(groupId, screenX, screenY) => {
                  const g = groupings.find((x) => x.id === groupId);
                  if (g) setEditingGrouping({ grouping: g, screenX, screenY });
                }}
                onGroupingFrameClick={(groupId) => {
                  setSelectedGroupingId((prev) => (prev === groupId ? null : groupId));
                  setSelection(null);
                }}
                onGroupingBoundsOverride={async (groupId, deltas) => {
                  // Optimistisch in lokale state, dan persist via updateGrouping.
                  // bounds_override = null wist de handmatige override → terug
                  // naar pure auto-fit.
                  setGroupings((prev) =>
                    prev.map((g) =>
                      g.id === groupId ? { ...g, bounds_override: deltas } : g,
                    ),
                  );
                  try {
                    await updateGrouping(groupId, { bounds_override: deltas });
                  } catch (err) {
                    console.error('[FE] persist bounds_override failed', err);
                  }
                }}
                selectedGroupingId={selectedGroupingId}
              />

              <FloatingPalette
                entities={visibleEntities}
                taxpayerId={visibleEntities.find((e) => e.is_taxpayer)?.id ?? null}
                onCreateEntity={handleCreateEntity}
              />

              <StructureRefiningCallout chartId={chart?.id ?? null} status={status} />

              <FloatingToolbar
                isExtracting={typeof status === 'string' && status.startsWith('extracting:')}
                busy={busy}
                collapsedClusterCount={collapsedClusters.size}
                onExpandAll={() => setCollapsedClusters(new Set())}
                onCollapseAll={handleCollapseAll}
                orphanCount={tierResult?.orphans.length ?? 0}
                orphansVisible={showOrphans}
                onToggleOrphans={() => setShowOrphans((v) => !v)}
                onAutoArrange={runLayout}
                selectedEntityIds={selection?.kind === 'nodes' ? selection.ids : []}
                onCreateFiscalUnity={async () => {
                  if (!chart || selection?.kind !== 'nodes') return;
                  const { groupings: next } = await addOrMergeFiscalUnity(
                    chart.id,
                    selection.ids,
                    groupings,
                  );
                  setGroupings(next);
                  setSelection(null);
                }}
              />
                </div>
              </div>

              <div className="flex h-full items-center justify-center p-8 text-center lg:hidden">
                <p className="text-sm text-muted-foreground">
                  The structure chart is best viewed on a wider screen.
                </p>
              </div>
            </>
          )}

        {/* Inspector lives outside the chart/blocking branches so the
            "Open in inspector" buttons in BlockingBanner can actually open it. */}
        {!showLoader && !isFailed && (
          <FloatingInspector
            selectedEntity={selectedEntity}
            selectedEdge={selectedEdge}
            onEntityChange={updateSelectedEntity}
            onEntityDelete={deleteSelectedEntity}
            fiscalUnities={groupings}
            onAddToFiscalUnity={async (groupId) => {
              if (!chart || !selectedEntity) return;
              const target = groupings.find((g) => g.id === groupId);
              if (!target) return;
              const memberSet = [...target.member_ids, selectedEntity.id];
              const { groupings: next } = await addOrMergeFiscalUnity(
                chart.id,
                memberSet,
                groupings,
              );
              setGroupings(next);
            }}
            onRemoveFromFiscalUnity={async (groupId) => {
              if (!selectedEntity) return;
              const g = groupings.find((x) => x.id === groupId);
              if (!g) return;
              const remaining = g.member_ids.filter((id) => id !== selectedEntity.id);
              if (remaining.length < 2) {
                await deleteGrouping(g.id);
                setGroupings((prev) => prev.filter((x) => x.id !== g.id));
              } else {
                const updated = await updateGrouping(g.id, { member_ids: remaining });
                setGroupings((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
              }
            }}
            onEdgeChange={updateSelectedEdge}
            onEdgeDelete={deleteSelectedEdge}
            onClose={() => setSelection(null)}
          />
        )}
      </main>

      {editingGrouping && (
        <FiscalUnityEditPopover
          grouping={editingGrouping.grouping}
          screenX={editingGrouping.screenX}
          screenY={editingGrouping.screenY}
          onRename={async (newLabel) => {
            const updated = await updateGrouping(editingGrouping.grouping.id, { label: newLabel });
            setGroupings((prev) => prev.map((g) => (g.id === updated.id ? updated : g)));
          }}
          onDelete={async () => {
            await deleteGrouping(editingGrouping.grouping.id);
            setGroupings((prev) => prev.filter((g) => g.id !== editingGrouping.grouping.id));
          }}
          onClose={() => setEditingGrouping(null)}
        />
      )}
    </div>
  );
}
