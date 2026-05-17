import { supabase } from '@/integrations/supabase/client';
import { startExtraction } from '@/lib/structure/extraction';

/**
 * Fire-and-forget Phase A trigger with a localStorage-backed fingerprint so we
 * don't re-extract when the user navigates Documents → Questions without
 * changing the doc set. New uploads get fresh UUIDs and deletes shrink the
 * set, so sorted IDs alone are a sufficient content fingerprint.
 *
 * On any extraction error (incl. 409 from the concurrent-invocation guard) we
 * clear the stored fingerprint so the next navigation re-evaluates against the
 * current doc set.
 */
export async function maybePrewarmPhaseA(sessionId: string): Promise<void> {
  const { data, error } = await supabase
    .from('atad2_session_documents')
    .select('id')
    .eq('session_id', sessionId);
  if (error) {
    console.warn('[phaseAPrewarm] failed to list documents', error);
    return;
  }
  const ids = (data ?? []).map((d) => d.id as string);
  if (ids.length === 0) return;

  const fingerprint = [...ids].sort().join('|');
  const key = `phaseA:${sessionId}`;
  if (localStorage.getItem(key) === fingerprint) return;

  localStorage.setItem(key, fingerprint);
  try {
    await startExtraction(sessionId, 'docs_only');
  } catch (err) {
    localStorage.removeItem(key);
    console.warn('[phaseAPrewarm] startExtraction failed', err);
  }
}
