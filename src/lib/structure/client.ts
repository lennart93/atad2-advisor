// src/lib/structure/client.ts
import { supabase } from '@/integrations/supabase/client';
import type {
  StructureChart, StructureEntity, StructureEdge, StructureGroup,
  StructureFlowRouting,
  EdgeKind,
} from './types';

// Every atad2_structure_charts column EXCEPT snapshot_png — that column can be
// a multi-MB base64 string and loadChart runs in a polling loop, so we never
// want to drag it over the wire. snapshot_captured_at is tiny, so it stays in.
const CHART_COLUMNS =
  'id, session_id, status, draft_extracted_at, finalized_at, canvas_width, ' +
  'canvas_height, warnings, snapshot_captured_at, created_at, updated_at';

export async function loadChart(sessionId: string) {
  const { data: chart } = await supabase
    .from('atad2_structure_charts')
    .select(CHART_COLUMNS)
    .eq('session_id', sessionId)
    .maybeSingle();
  if (!chart) return null;

  const [{ data: entities }, { data: edges }, { data: groupings }] = await Promise.all([
    supabase.from('atad2_structure_entities').select('*').eq('chart_id', chart.id),
    supabase.from('atad2_structure_edges').select('*').eq('chart_id', chart.id),
    supabase.from('atad2_structure_groupings').select('*').eq('chart_id', chart.id),
  ]);

  return {
    chart: chart as StructureChart,
    entities: (entities ?? []) as StructureEntity[],
    edges: (edges ?? []) as StructureEdge[],
    groupings: (groupings ?? []) as StructureGroup[],
  };
}

export async function listGroupings(chart_id: string): Promise<StructureGroup[]> {
  const { data, error } = await supabase
    .from('atad2_structure_groupings')
    .select('*')
    .eq('chart_id', chart_id);
  if (error) throw error;
  return (data ?? []) as StructureGroup[];
}

export async function listFlowRouting(chart_id: string): Promise<StructureFlowRouting[]> {
  const { data, error } = await supabase
    .from('atad2_structure_flow_routing')
    .select('*')
    .eq('chart_id', chart_id);
  if (error) throw error;
  return (data ?? []) as StructureFlowRouting[];
}

export async function upsertFlowRouting(
  row: Pick<StructureFlowRouting, 'chart_id' | 'from_entity_id' | 'to_entity_id'> &
    Partial<Pick<StructureFlowRouting, 'waypoints' | 'label_position' | 'routing_mode'>>,
): Promise<StructureFlowRouting> {
  const { data, error } = await supabase
    .from('atad2_structure_flow_routing')
    .upsert(row, { onConflict: 'chart_id,from_entity_id,to_entity_id' })
    .select()
    .single();
  if (error) throw error;
  return data as StructureFlowRouting;
}

export async function deleteFlowRouting(
  chart_id: string,
  from_entity_id: string,
  to_entity_id: string,
): Promise<void> {
  const { error } = await supabase
    .from('atad2_structure_flow_routing')
    .delete()
    .eq('chart_id', chart_id)
    .eq('from_entity_id', from_entity_id)
    .eq('to_entity_id', to_entity_id);
  if (error) throw error;
}

export async function deleteAllFlowRouting(chart_id: string): Promise<void> {
  const { error } = await supabase
    .from('atad2_structure_flow_routing')
    .delete()
    .eq('chart_id', chart_id);
  if (error) throw error;
}

export async function refreshChartStatus(chartId: string) {
  const { data } = await supabase
    .from('atad2_structure_charts')
    .select('status, warnings, draft_extracted_at')
    .eq('id', chartId)
    .maybeSingle();
  return data;
}

export async function upsertEntity(input: Partial<StructureEntity> & { chart_id: string }) {
  const payload = { ...input, source: input.source ?? 'user_edited' };
  if (input.id) {
    const { data, error } = await supabase
      .from('atad2_structure_entities')
      .update(payload).eq('id', input.id).select('*').single();
    if (error) throw error;
    return data as StructureEntity;
  }
  const { data, error } = await supabase
    .from('atad2_structure_entities')
    .insert({ ...payload, source: 'user_added' }).select('*').single();
  if (error) throw error;
  return data as StructureEntity;
}

export async function deleteEntity(id: string) {
  const { error } = await supabase.from('atad2_structure_entities').delete().eq('id', id);
  if (error) throw error;
}

export async function upsertEdge(input: Partial<StructureEdge> & {
  chart_id: string; from_entity_id: string; to_entity_id: string; kind: EdgeKind;
}) {
  const payload = { ...input, source: input.source ?? 'user_edited' };
  if (input.id) {
    const { data, error } = await supabase
      .from('atad2_structure_edges')
      .update(payload).eq('id', input.id).select('*').single();
    if (error) throw error;
    return data as StructureEdge;
  }
  const { data, error } = await supabase
    .from('atad2_structure_edges')
    .insert({ ...payload, source: 'user_added' }).select('*').single();
  if (error) throw error;
  return data as StructureEdge;
}

export async function deleteEdge(id: string) {
  const { error } = await supabase.from('atad2_structure_edges').delete().eq('id', id);
  if (error) throw error;
}

export async function updateEntityPosition(id: string, x: number, y: number) {
  const { error } = await supabase
    .from('atad2_structure_entities')
    .update({ position_x: x, position_y: y })
    .eq('id', id);
  if (error) throw error;
}

export async function finalizeChart(chartId: string) {
  await supabase.from('atad2_structure_charts')
    .update({ status: 'finalized', finalized_at: new Date().toISOString() })
    .eq('id', chartId);
}

/**
 * Escape hatch: when an extraction stage is stuck, manually flip the chart
 * to draft_ready so the user can see what we have so far. Used by the
 * "Continue without transactions" button in AtlasLoader.
 */
export async function forceDraftReady(chartId: string, warningMessage: string) {
  const { data: existing } = await supabase
    .from('atad2_structure_charts')
    .select('warnings')
    .eq('id', chartId)
    .maybeSingle();
  const prev = Array.isArray(existing?.warnings)
    ? (existing!.warnings as Array<{ stage: number; message: string }>)
    : [];
  const next = [...prev, { stage: 3, message: warningMessage }];
  await supabase
    .from('atad2_structure_charts')
    .update({
      status: 'draft_ready',
      draft_extracted_at: new Date().toISOString(),
      warnings: next,
    })
    .eq('id', chartId);
}

/**
 * Persist a transparent-PNG snapshot of the accepted chart. The blob is large,
 * so it lives in its own column and is never pulled by loadChart's polling.
 */
export async function saveChartSnapshot(chartId: string, pngDataUrl: string) {
  const { error } = await supabase
    .from('atad2_structure_charts')
    .update({
      snapshot_png: pngDataUrl,
      snapshot_captured_at: new Date().toISOString(),
    })
    .eq('id', chartId);
  if (error) throw error;
}

export interface ChartSnapshotInfo {
  snapshot_png: string | null;
  finalized_at: string | null;
}

/**
 * Reads ONLY the snapshot + finalized_at columns — used by the report page.
 * finalized_at set + snapshot_png null = capture failed (degraded state).
 */
export async function loadChartSnapshot(sessionId: string): Promise<ChartSnapshotInfo> {
  const { data } = await supabase
    .from('atad2_structure_charts')
    .select('snapshot_png, finalized_at')
    .eq('session_id', sessionId)
    .maybeSingle();
  return {
    snapshot_png: data?.snapshot_png ?? null,
    finalized_at: data?.finalized_at ?? null,
  };
}
