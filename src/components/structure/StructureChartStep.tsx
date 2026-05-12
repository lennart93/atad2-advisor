// src/components/structure/StructureChartStep.tsx
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { StructureChart } from './StructureChart';
import { FloatingPalette } from './FloatingPalette';
import { FloatingInspector } from './FloatingInspector';
import { FloatingToolbar } from './FloatingToolbar';
import { exportToPptx } from './exports/exportToPptx';
import { tierLayout, clusterId, type PositionedEntity } from '@/lib/structure/tierLayout';
import { groupNonRelevantSiblings, type Cluster } from '@/lib/structure/relevance';
import {
  loadChart,
  upsertEntity,
  deleteEntity,
  upsertEdge,
  deleteEdge,
  updateEntityPosition,
  finalizeChart,
  forceDraftReady,
} from '@/lib/structure/client';
import { startExtraction, pollUntilTerminal } from '@/lib/structure/extraction';
import type {
  StructureChart as Chart,
  StructureEntity,
  StructureEdge,
  ChartStatus,
  EntityType,
} from '@/lib/structure/types';
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
  const [selection, setSelection] = useState<{ kind: 'node' | 'edge'; id: string } | null>(null);
  const [status, setStatus] = useState<ChartStatus | 'loading'>('loading');
  const [busy, setBusy] = useState(false);
  const [expandedClusters, setExpandedClusters] = useState<Set<string>>(new Set());
  const [clusterLayout, setClusterLayout] = useState<ClusterLayout>([]);
  const activeClustersRef = useRef<Cluster[]>([]);
  const [showTransactions, setShowTransactions] = useState(true);

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
    return entities.filter(
      (e) => connected.has(e.id) || e.source === 'user_added' || e.source === 'user_edited',
    );
  }, [entities, edges]);

  const visibleEdges = useMemo(() => {
    const ids = new Set(visibleEntities.map((e) => e.id));
    return edges.filter(
      (e) => ids.has(e.from_entity_id) && ids.has(e.to_entity_id),
    );
  }, [edges, visibleEntities]);

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
    // Recompute when clusterLayout changes (which happens when handleAutoLayout fires).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chart, clusterLayout]);

  const edgesWithCluster = useMemo<StructureEdge[]>(
    () => [...visibleEdges, ...clusterEdges],
    [visibleEdges, clusterEdges],
  );

  const renderableEdges = useMemo<StructureEdge[]>(
    () => (showTransactions ? edgesWithCluster : edgesWithCluster.filter((e) => e.kind === 'ownership')),
    [edgesWithCluster, showTransactions],
  );

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
        setStatus(loaded.chart.status as ChartStatus);
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
            setStatus(refreshed.chart.status as ChartStatus);
            await pollUntilTerminal(refreshed.chart.id, async (s) => {
              if (aborted) return;
              setStatus(s);
              const ref2 = await loadChart(sessionId);
              if (ref2 && !aborted) {
                setChart(ref2.chart);
                setEntities(ref2.entities);
                setEdgesState(ref2.edges);
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

  const handleAutoLayout = useCallback(() => {
    if (!chart) return;
    // Layout only over the connected (non-orphan) graph — orphans are filtered
    // out earlier, so the layout pass never needs to deal with them.
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

    const { positions, clusterPositions } = tierLayout({
      entities: visibleEntities,
      ownershipEdges: ownership,
      clusters: activeClusters,
    });

    setEntities((prev) =>
      prev.map((e) => {
        const p = positions.get(e.id);
        return p ? { ...e, position_x: p.x, position_y: p.y } : e;
      }),
    );
    for (const [, p] of positions) updateEntityPosition(p.id, p.x, p.y);

    setClusterLayout(buildClusterLayout(activeClusters, clusterPositions, visibleEntities));
  }, [chart, visibleEntities, visibleEdges, expandedClusters]);

  const handleCollapseAll = useCallback(() => {
    setExpandedClusters(new Set());
  }, []);

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
    handleAutoLayout();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chart?.id, entities.length, edges.length, expandedClusters]);

  useEffect(() => {
    if (!chart) return;
    if (!positionsLookBroken) return;
    // Only re-layout when extraction is finished — during extraction the
    // entities-arrive-stacked is normal and the existing layout effect handles it.
    const isExtracting = typeof status === 'string' && status.startsWith('extracting:');
    if (isExtracting) return;
    handleAutoLayout();
  }, [chart, positionsLookBroken, status, handleAutoLayout]);

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
      }
    });
    setBusy(false);
  };

  const handleAddEntity = async (entityType: EntityType) => {
    if (!chart) return;
    const created = await upsertEntity({
      chart_id: chart.id,
      name: 'New entity',
      legal_form: null,
      jurisdiction_iso: 'NL',
      entity_type: entityType,
      is_taxpayer: false,
      position_x: 200,
      position_y: 200,
      source: 'user_added',
    } as Partial<StructureEntity> & { chart_id: string });
    setEntities((prev) => [...prev, created]);
  };

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
          ) : (
            <>
              <StructureChart
                entities={visibleEntities}
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
              />

              <FloatingPalette onAdd={handleAddEntity} />

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
                onAutoLayout={handleAutoLayout}
                onReExtract={handleReExtract}
                onExportPptx={() => {
                  exportToPptx({
                    entities: visibleEntities,
                    edges: visibleEdges,
                    taxpayerName: '',
                  });
                }}
                busy={busy}
                transactionsVisible={showTransactions}
                onToggleTransactions={() => setShowTransactions((v) => !v)}
                expandedClusterCount={expandedClusters.size}
                onCollapseAll={handleCollapseAll}
              />
            </>
          )}
        </main>
      </div>
    </div>
  );
}
