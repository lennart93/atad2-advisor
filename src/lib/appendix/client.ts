import { supabase } from '@/integrations/supabase/client';
import type { StoredAppendix, AppendixRow, EditableField, GenerationStatus, AppendixFacts } from './types';
import { normalizeFacts } from './facts/emptyFacts';
import { normalizeAiNaStatuses } from './normalizeAiNa';

export function coerceFacts(raw: unknown): AppendixFacts | null {
  if (raw == null || typeof raw !== 'object') return null;
  return normalizeFacts(raw as Partial<AppendixFacts>);
}

const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 360_000;
const TERMINAL: GenerationStatus[] = ['ready', 'error'];

export async function loadAppendix(sessionId: string): Promise<StoredAppendix | null> {
  const { data } = await supabase
    .from('atad2_appendix')
    .select('*')
    .eq('session_id', sessionId)
    .maybeSingle();
  if (!data) return null;
  return {
    id: data.id,
    session_id: data.session_id,
    answers_fingerprint: (data as { answers_fingerprint?: string | null }).answers_fingerprint ?? null,
    review_status: data.review_status as StoredAppendix['review_status'],
    generation_status: data.generation_status as GenerationStatus,
    rows: normalizeAiNaStatuses((data.rows ?? []) as AppendixRow[]),
    facts: coerceFacts((data as { facts?: unknown }).facts),
    facts_skipped: (data as { facts_skipped?: boolean }).facts_skipped ?? false,
    checklist_skipped: (data as { checklist_skipped?: boolean }).checklist_skipped ?? false,
    model: data.model,
    prompt_version: data.prompt_version,
    error_message: data.error_message,
    generated_at: data.generated_at,
    confirmed_at: data.confirmed_at,
    confirmed_by: data.confirmed_by,
    updated_at: data.updated_at,
  };
}

export async function startAppendixGeneration(sessionId: string): Promise<void> {
  const { error } = await supabase.functions.invoke('generate-appendix', {
    body: { session_id: sessionId },
  });
  if (error) throw error;
}

export async function pollAppendixUntilReady(
  sessionId: string,
  onUpdate: (a: StoredAppendix) => void,
  signal?: AbortSignal,
): Promise<GenerationStatus> {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (signal?.aborted) throw new Error('aborted');
    if (Date.now() > deadline) throw new Error('appendix generation timed out');
    const a = await loadAppendix(sessionId);
    if (a) {
      onUpdate(a);
      if (TERMINAL.includes(a.generation_status)) return a.generation_status;
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
}

/** Persist the full rows array + append one change-log entry. */
export async function saveRowEdit(
  appendixId: string,
  rows: AppendixRow[],
  rowId: string,
  field: EditableField | 'excludedFromClient',
  oldValue: string | null,
  newValue: string | null,
  userId: string,
): Promise<void> {
  const { error: upErr } = await supabase
    .from('atad2_appendix')
    .update({ rows: rows as unknown as never, updated_at: new Date().toISOString() })
    .eq('id', appendixId);
  if (upErr) throw upErr;
  const { error: logErr } = await supabase.from('atad2_appendix_edits').insert({
    appendix_id: appendixId,
    row_id: rowId,
    field,
    old_value: oldValue,
    new_value: newValue,
    edited_by: userId,
  });
  if (logErr) throw logErr;
}

/**
 * Persist the rows array without a change-log entry. Used for the review
 * sign-off toggle: the edits table's field CHECK does not cover it, and the
 * who/when audit already lives on the row itself (reviewedBy/reviewedAt).
 */
export async function saveRows(appendixId: string, rows: AppendixRow[]): Promise<void> {
  const { error } = await supabase
    .from('atad2_appendix')
    .update({ rows: rows as unknown as never, updated_at: new Date().toISOString() })
    .eq('id', appendixId);
  if (error) throw error;
}

export async function saveFacts(appendixId: string, facts: AppendixFacts): Promise<void> {
  const { error } = await supabase
    .from('atad2_appendix')
    .update({ facts: facts as unknown as never, updated_at: new Date().toISOString() })
    .eq('id', appendixId);
  if (error) throw error;
}

/** Persist a per-page skip flag (Facts or Checklist) on the appendix row. */
export async function setAppendixSkip(
  appendixId: string,
  page: 'facts' | 'checklist',
  skipped: boolean,
): Promise<void> {
  const column = page === 'facts' ? 'facts_skipped' : 'checklist_skipped';
  const { error } = await supabase
    .from('atad2_appendix')
    .update({ [column]: skipped, updated_at: new Date().toISOString() })
    .eq('id', appendixId);
  if (error) throw error;
}

export async function confirmAppendix(appendixId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('atad2_appendix')
    .update({
      review_status: 'confirmed',
      confirmed_at: new Date().toISOString(),
      confirmed_by: userId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', appendixId);
  if (error) throw error;
}
