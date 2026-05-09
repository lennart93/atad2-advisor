// src/lib/structure/client.ts
import { supabase } from '@/integrations/supabase/client';
import type {
  StructureChart, StructureEntity, StructureEdge, StructureGroup,
  EdgeKind,
} from './types';

export async function loadChart(sessionId: string) {
  const { data: chart } = await supabase
    .from('atad2_structure_charts')
    .select('*')
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
