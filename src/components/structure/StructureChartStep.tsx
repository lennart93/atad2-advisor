// src/components/structure/StructureChartStep.tsx
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { StructureChart } from './StructureChart';
import { FloatingPalette } from './FloatingPalette';
import { FloatingInspector } from './FloatingInspector';
import { FloatingToolbar } from './FloatingToolbar';
import { BlockingBanner } from './BlockingBanner';
import { exportToPptx } from './exports/exportToPptx';
import { tierLayout, clusterId, type PositionedEntity, type TierLayoutResult } from '@/lib/structure/tierLayout';
import { groupNonRelevantSiblings, deriveClusterName, type Cluster } from '@/lib/structure/relevance';
import { validate, type ValidatorResult } from '@/lib/structure/validator';
import { wrapLabels, NODE_HEIGHT } from '@/lib/structure/labelMeasure';
import {
  loadChart,
  listGroupings,
  upsertEntity,
  deleteEntity,
  upsertEdge,
  deleteEdge,
  updateEntityPosition,
  finalizeChart,
  forceDraftReady,
  listFlowRouting,
  upsertFlowRouting,
  deleteFlowRouting,
  deleteAllFlowRouting,
} from '@/lib/structure/client';
import { useFlowEditHistory, type FlowEditSnapshot } from './flowEditing/useFlowEditHistory';
import { startExtraction, pollUntilTerminal } from '@/lib/structure/extraction';
import type {
  StructureChart as Chart,
  StructureEntity,
  StructureEdge,
  StructureGroup,
  StructureFlowRouting,
  FlowWaypoint,
  ChartStatus,
  EntityType,
  TransactionType,
  MismatchClassification,
} from '@/lib/structure/types';
import type { RoutedFlowPoint } from '@/lib/structure/flowRouting';
import type { ClusterNodeData } from './nodes/ClusterNode';
import { AtlasLoader } from './AtlasLoader';
import { AnimatedLogo } from '@/components/AnimatedLogo';

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
  const [chart, setChart] = useState<Chart | null>(null);
  const [entities, setEntities] = useState<StructureEntity[]>([]);
  const [edges, setEdgesState] = useState<StructureEdge[]>([]);
  const [groupings, setGroupings] = useState<StructureGroup[]>([]);
  const [selection, setSelection] = useState<{ kind: 'node' | 'edge'; id: string } | null>(null);
  const [status, setStatus] = useState<ChartStatus | 'loading'>('loading');
  const [busy, setBusy] = useState(false);
  const [expandedClusters, setExpandedClusters] = useState<Set<string>>(new Set());
  const [clusterLayout, setClusterLayout] = useState<ClusterLayout>([]);
  const activeClustersRef = useRef<Cluster[]>([]);
  const [focusedEntityIds, setFocusedEntityIds] = useState<Set<string>>(new Set());
  const [showOrphans, setShowOrphans] = useState(false);
  const [tierResult, setTierResult] = useState<TierLayoutResult | null>(null);
  const [flowRouting, setFlowRouting] = useState<Map<string, StructureFlowRouting>>(new Map());
  const [liveFlowPoints, setLiveFlowPoints] = useState<Map<string, RoutedFlowPoint[]>>(new Map());
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [gridVisible, setGridVisible] = useState(false);
  const history = useFlowEditHistory();

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

  // Map from child_id → sum_pct for ownership-sum warnings.
  const ownershipSumIssuesMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const i of validation.ownershipSumIssues) m.set(i.child_id, i.sum_pct);
    return m;
  }, [validation]);

  // Set of orphan entity IDs from the last layout result.
  const orphanIds = useMemo(() => {
    if (!tierResult) return new Set<string>();
    return new Set(tierResult.orphans.map((o) => o.id));
  }, [tierResult]);

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

  const edgesWithCluster = useMemo<StructureEdge[]>(
    () => [...visibleEdges, ...clusterEdges],
    [visibleEdges, clusterEdges],
  );

  // All edges (ownership + transactions) passed to chart; bundle aggregation
  // in StructureChart filters transactions to focused entities only.
  const renderableEdges = edgesWithCluster;

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

  const tierBands = useMemo(() => {
    const byY = new Map<number, { topY: number; bottomY: number }>();
    for (const e of visibleEntities) {
      const key = Math.round(e.position_y);
      if (!byY.has(key)) byY.set(key, { topY: e.position_y, bottomY: e.position_y + NODE_HEIGHT });
    }
    return Array.from(byY.values()).sort((a, b) => a.topY - b.topY);
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
        const loadedRouting = await listFlowRouting(loaded.chart.id);
        if (!aborted) {
          setFlowRouting(new Map(loadedRouting.map((r) => [`${r.from_entity_id}|${r.to_entity_id}`, r])));
        }
        // Poll if extraction is mid-flight (any non-terminal status that isn't
        // phase_a_ready — phase_a_ready means Phase A finished and we're now
        // waiting for the user-driven Phase B trigger from Q&A).
        if (loaded.chart.status.startsWith('extracting:')) {
          await pollUntilTerminal(loaded.chart.id, async (s) => {
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
          await startExtraction(sessionId, 'refine_and_transactions');
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
    const transactions = visibleEdges.filter((e) => e.kind === 'transaction');
    const taxpayer = visibleEntities.find((e) => e.is_taxpayer);

    const allClusters = groupNonRelevantSiblings(
      visibleEntities,
      ownership,
      transactions,
      taxpayer?.id ?? '',
    );
    // Honor user's expand toggles: clusters whose ID is in expandedClusters
    // are removed (their members go back to being individual nodes).
    const activeClusters = allClusters.clusters.filter(
      (c) => !expandedClusters.has(clusterId(c)),
    );
    activeClustersRef.current = activeClusters;

    const result = tierLayout({
      entities: visibleEntities,
      ownershipEdges: ownership,
      clusters: activeClusters,
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
  }, [chart, visibleEntities, visibleEdges, expandedClusters, validation.hasBlocking]);

  const handleCollapseAll = useCallback(() => {
    setExpandedClusters(new Set());
  }, []);

  const handleToggleFocus = useCallback((entityId: string) => {
    setFocusedEntityIds((prev) => {
      const next = new Set(prev);
      if (next.has(entityId)) next.delete(entityId);
      else next.add(entityId);
      return next;
    });
  }, []);

  const handleClearFocus = useCallback(() => {
    setFocusedEntityIds(new Set());
  }, []);

  const handleSelectTransaction = useCallback((txnId: string) => {
    setSelection({ kind: 'edge', id: txnId });
  }, []);

  // --- Flow routing persistence handlers ---

  const snapshotFlows = useCallback((): FlowEditSnapshot[] => {
    return Array.from(flowRouting.values()).map((r) => ({
      bundleId: `${r.from_entity_id}|${r.to_entity_id}`,
      waypoints: r.waypoints,
      labelPosition: r.label_position,
    }));
  }, [flowRouting]);

  const persistFlow = useCallback(async (
    bundleId: string,
    patch: { waypoints?: FlowWaypoint[]; label_position?: FlowWaypoint | null },
  ) => {
    if (!chart) return;
    const [from, to] = bundleId.split('|');
    const existing = flowRouting.get(bundleId);
    const row = await upsertFlowRouting({
      chart_id: chart.id,
      from_entity_id: from,
      to_entity_id: to,
      waypoints: patch.waypoints ?? existing?.waypoints ?? [],
      label_position:
        patch.label_position !== undefined ? patch.label_position : existing?.label_position ?? null,
      routing_mode: 'manual',
    });
    setFlowRouting((prev) => new Map(prev).set(bundleId, row));
  }, [chart, flowRouting]);

  // Live preview — called every pointer-move frame. Cheap: only updates transient
  // state, no history push, no DB write.
  const handleFlowPathChange = useCallback((bundleId: string, points: RoutedFlowPoint[]) => {
    setLiveFlowPoints((prev) => new Map(prev).set(bundleId, points));
  }, []);

  // Commit — called once on pointer-up. Pushes history + persists to DB, then
  // clears the transient live entry so the persisted value takes over.
  const handleFlowPathCommit = useCallback((bundleId: string, points: RoutedFlowPoint[]) => {
    history.push(snapshotFlows());
    void persistFlow(bundleId, { waypoints: points });
    setLiveFlowPoints((prev) => {
      const m = new Map(prev);
      m.delete(bundleId);
      return m;
    });
  }, [history, snapshotFlows, persistFlow]);

  const handleFlowLabelMove = useCallback((bundleId: string, position: RoutedFlowPoint) => {
    history.push(snapshotFlows());
    void persistFlow(bundleId, { label_position: position });
  }, [history, snapshotFlows, persistFlow]);

  // The edge computes the new geometry (add/remove waypoint) and hands us the
  // full path — works uniformly whether the flow was auto or already manual;
  // the first such edit creates the manual routing row.
  const handleFlowAddWaypoint = useCallback((bundleId: string, points: RoutedFlowPoint[]) => {
    history.push(snapshotFlows());
    void persistFlow(bundleId, { waypoints: points });
  }, [history, snapshotFlows, persistFlow]);

  const handleFlowRemoveWaypoint = useCallback((bundleId: string, points: RoutedFlowPoint[]) => {
    history.push(snapshotFlows());
    void persistFlow(bundleId, { waypoints: points });
  }, [history, snapshotFlows, persistFlow]);

  const handleFlowReconnect = useCallback(async (bundleId: string, _newFrom: string, _newTo: string) => {
    if (!chart) return;
    const [from, to] = bundleId.split('|');
    // Only an undoable step if there was a manual routing row to clear.
    if (flowRouting.has(bundleId)) history.push(snapshotFlows());
    await deleteFlowRouting(chart.id, from, to);
    setFlowRouting((prev) => {
      const m = new Map(prev);
      m.delete(bundleId);
      return m;
    });
    // NOTE: updating the underlying transaction edge rows' from/to to the new
    // entities is out of scope for this task — the flow routing override is
    // simply cleared so the (still-original) bundle re-routes automatically.
    // A follow-up will wire the actual edge-row reconnection.
  }, [chart, flowRouting, history, snapshotFlows]);

  const handleFlowResetRouting = useCallback(async (bundleId: string) => {
    if (!chart) return;
    if (!flowRouting.has(bundleId)) return; // already auto — nothing to reset
    history.push(snapshotFlows());
    const [from, to] = bundleId.split('|');
    await deleteFlowRouting(chart.id, from, to);
    setFlowRouting((prev) => {
      const m = new Map(prev);
      m.delete(bundleId);
      return m;
    });
  }, [chart, flowRouting, history, snapshotFlows]);

  const handleResetAllRouting = useCallback(async () => {
    if (!chart) return;
    history.push(snapshotFlows());
    await deleteAllFlowRouting(chart.id);
    setFlowRouting(new Map());
  }, [chart, history, snapshotFlows]);

  const applyFlowSnapshots = useCallback(async (snaps: FlowEditSnapshot[]) => {
    if (!chart) return;
    const keep = new Set(snaps.map((s) => s.bundleId));
    for (const [bundleId] of flowRouting) {
      if (!keep.has(bundleId)) {
        const [from, to] = bundleId.split('|');
        await deleteFlowRouting(chart.id, from, to);
      }
    }
    const nextMap = new Map<string, StructureFlowRouting>();
    for (const s of snaps) {
      const [from, to] = s.bundleId.split('|');
      const row = await upsertFlowRouting({
        chart_id: chart.id,
        from_entity_id: from,
        to_entity_id: to,
        waypoints: s.waypoints,
        label_position: s.labelPosition,
        routing_mode: 'manual',
      });
      nextMap.set(s.bundleId, row);
    }
    setFlowRouting(nextMap);
  }, [chart, flowRouting]);

  // Re-bind onExpand handlers each render so they capture the current setExpandedClusters.
  const clusterNodes = useMemo<ClusterLayout>(
    () =>
      clusterLayout.map((c) => ({
        ...c,
        data: {
          ...c.data,
          onExpand: () => {
            setExpandedClusters((prev) => {
              const next = new Set(prev);
              next.add(c.id);
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
  }, [chart?.id, entities.length, edges.length, expandedClusters, validation.hasBlocking]);

  useEffect(() => {
    if (!chart) return;
    if (!positionsLookBroken) return;
    // Only re-layout when extraction is finished — during extraction the
    // entities-arrive-stacked is normal and the existing layout effect handles it.
    const isExtracting = typeof status === 'string' && status.startsWith('extracting:');
    if (isExtracting) return;
    runLayout();
  }, [chart, positionsLookBroken, status, runLayout]);

  // Undo/redo keyboard listener for flow routing edits.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Don't hijack Ctrl/Cmd+Z from text inputs — let the browser's native
      // text undo handle it when the user is editing a field.
      const target = e.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable) return;
      }
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      if (e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        const restored = history.undo(snapshotFlows());
        if (restored) void applyFlowSnapshots(restored);
      } else if ((e.key === 'z' && e.shiftKey) || e.key === 'y') {
        e.preventDefault();
        const restored = history.redo(snapshotFlows());
        if (restored) void applyFlowSnapshots(restored);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [history, snapshotFlows, applyFlowSnapshots]);

  const handleReExtract = async () => {
    if (!chart) return;
    setBusy(true);
    setStatus('extracting:stage1' as ChartStatus);
    setExpandedClusters(new Set());
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
    // Also refresh groupings and flow routing after re-extraction completes.
    try {
      const loadedGroupings = await listGroupings(chart.id);
      setGroupings(loadedGroupings);
      const loadedRouting = await listFlowRouting(chart.id);
      setFlowRouting(new Map(loadedRouting.map((r) => [`${r.from_entity_id}|${r.to_entity_id}`, r])));
    } catch {
      // Non-fatal: groupings/routing may be empty or stale.
    }
    setBusy(false);
  };

  const handleCreateEntity = async (payload: {
    entityType: EntityType;
    name: string;
    jurisdiction_iso: string;
    parentId: string;
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
    const createdEdge = await upsertEdge({
      chart_id: chart.id,
      from_entity_id: payload.parentId,
      to_entity_id: created.id,
      kind: 'ownership',
      ownership_pct: payload.ownershipPct,
      ownership_voting_only: false,
      source: 'user_added',
    });
    setEntities((prev) => [...prev, created]);
    setEdgesState((prev) => [...prev, createdEdge]);
  };

  const handleCreateTransaction = useCallback(async (payload: {
    from_entity_id: string;
    to_entity_id: string;
    transaction_type: TransactionType;
    amount_eur: number | null;
    is_mismatch: boolean;
    mismatch_classification: MismatchClassification | null;
    mismatch_atad2_article: string | null;
  }) => {
    if (!chart) return;
    const created = await upsertEdge({
      chart_id: chart.id,
      from_entity_id: payload.from_entity_id,
      to_entity_id: payload.to_entity_id,
      kind: 'transaction',
      transaction_type: payload.transaction_type,
      amount_eur: payload.amount_eur,
      is_mismatch: payload.is_mismatch,
      mismatch_classification: payload.mismatch_classification,
      mismatch_atad2_article: payload.mismatch_atad2_article,
      source: 'user_added',
    });
    setEdgesState((prev) => [...prev, created]);
  }, [chart]);

  const handlePctChange = useCallback(async (edgeId: string, newPct: number) => {
    const edge = edges.find((e) => e.id === edgeId);
    if (!edge) return;
    const updated = await upsertEdge({ ...edge, ownership_pct: newPct });
    setEdgesState((prev) => prev.map((e) => (e.id === edgeId ? updated : e)));
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
    if (chart) await finalizeChart(chart.id);
    navigate(`/assessment-confirmation/${sessionId}`);
  };

  const isExtracting = typeof status === 'string' && status.startsWith('extracting:');
  const isFailed = status === 'extraction_failed';
  const showLoader =
    status === 'loading' ||
    isExtracting ||
    status === 'phase_a_ready';

  return (
    <div className="min-h-screen bg-neutral-50 p-6">
      <div className="bg-white border border-neutral-300 rounded-xl shadow-sm overflow-hidden">
        <header className="px-5 py-3.5 border-b border-neutral-200 flex items-center justify-between">
          <div>
            <h1 className="text-base font-semibold">Step 5 · Review structure chart</h1>
            <p className="text-xs text-neutral-500">
              Review the AI-generated draft, edit as needed, then continue to the report.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => navigate(-1)}>
              Back
            </Button>
            <Button onClick={goNext} disabled={status === 'loading' || isExtracting}>
              Next
            </Button>
          </div>
        </header>

        <main className="relative h-[calc(100vh-8rem)]">
          {showLoader ? (
            <div className="absolute inset-0 flex items-center justify-center bg-white">
              <AtlasLoader
                status={status}
                warnings={
                  (chart?.warnings as Array<{ stage: number; message: string }>) ?? []
                }
                detail={{ entitiesFound: visibleEntities.length || undefined }}
                onSkipRemaining={chart ? async () => {
                  await forceDraftReady(
                    chart.id,
                    'Stage 3 (transactions) skipped by user — extraction was taking too long.',
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
                  await startExtraction(sessionId, 'refine_and_transactions');
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
            <div className="absolute inset-0 flex items-center justify-center bg-white">
              <div className="flex flex-col items-center gap-3 text-center max-w-md px-6">
                <AnimatedLogo state="idle" size={36} className="opacity-35" />
                <div className="text-sm font-bold">Extraction failed</div>
                <p className="text-xs text-neutral-500">
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
              <StructureChart
                entities={renderEntities}
                edges={renderableEdges}
                clusterNodes={clusterNodes}
                onSelectionChange={setSelection}
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
                ranks={tierResult?.ranks ?? new Map()}
                groupings={groupings}
                labelLineBreaks={labelLineBreaks}
                ownershipSumIssues={ownershipSumIssuesMap}
                orphanIds={orphanIds}
                focusedEntityIds={focusedEntityIds}
                onToggleFocus={handleToggleFocus}
                onSelectTransaction={handleSelectTransaction}
                flowRouting={flowRouting}
                tierBands={tierBands}
                snapEnabled={snapEnabled}
                gridVisible={gridVisible}
                liveFlowPoints={liveFlowPoints}
                onFlowPathChange={handleFlowPathChange}
                onFlowPathCommit={handleFlowPathCommit}
                onFlowLabelMove={handleFlowLabelMove}
                onFlowAddWaypoint={handleFlowAddWaypoint}
                onFlowRemoveWaypoint={handleFlowRemoveWaypoint}
                onFlowReconnect={handleFlowReconnect}
                onFlowResetRouting={handleFlowResetRouting}
              />

              <FloatingPalette
                entities={visibleEntities}
                taxpayerId={visibleEntities.find((e) => e.is_taxpayer)?.id ?? null}
                onCreateEntity={handleCreateEntity}
                onCreateTransaction={handleCreateTransaction}
              />

              <FloatingInspector
                selectedEntity={selectedEntity}
                selectedEdge={selectedEdge}
                onEntityChange={updateSelectedEntity}
                onEntityDelete={deleteSelectedEntity}
                onEdgeChange={updateSelectedEdge}
                onEdgeDelete={deleteSelectedEdge}
                onClose={() => setSelection(null)}
              />

              <FloatingToolbar
                status={typeof status === 'string' ? status : ''}
                entityCount={visibleEntities.length}
                ownershipCount={visibleEdges.filter((e) => e.kind === 'ownership').length}
                transactionCount={visibleEdges.filter((e) => e.kind === 'transaction').length}
                onReExtract={handleReExtract}
                onExportPptx={() => {
                  exportToPptx({
                    entities: visibleEntities,
                    edges: visibleEdges,
                    groupings,
                    focusedEntityIds,
                    taxpayerName: visibleEntities.find((e) => e.is_taxpayer)?.name ?? '',
                  });
                }}
                busy={busy}
                focusedCount={focusedEntityIds.size}
                onClearFocus={handleClearFocus}
                expandedClusterCount={expandedClusters.size}
                onCollapseAll={handleCollapseAll}
                orphanCount={tierResult?.orphans.length ?? 0}
                orphansVisible={showOrphans}
                onToggleOrphans={() => setShowOrphans((v) => !v)}
                onAutoArrange={runLayout}
                onResetAllRouting={handleResetAllRouting}
                gridVisible={gridVisible}
                onToggleGrid={() => setGridVisible((v) => !v)}
                snapEnabled={snapEnabled}
                onToggleSnap={() => setSnapEnabled((v) => !v)}
              />
            </>
          )}
        </main>
      </div>
    </div>
  );
}
