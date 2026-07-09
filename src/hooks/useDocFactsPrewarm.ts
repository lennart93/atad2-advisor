import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { loadDocFactsStatuses, startDocFactsExtraction } from "@/lib/factsheet/client";

/**
 * Documents whose per-doc extraction has already been kicked off this session,
 * keyed `${sessionId}:${documentId}`. Module-level so the hook can mount on more
 * than one page without re-firing.
 */
const firedDocs = new Set<string>();

/**
 * Fire extract-docfacts for each uploaded document as soon as it exists, in
 * parallel, mirroring the swarm fan-out style. Fire-and-forget: errors are
 * logged, never surfaced, never blocking. Skips documents that already have a
 * facts row (any status) so a page reload does not re-extract everything.
 */
export function useDocFactsPrewarm(sessionId: string | null | undefined, paused = false): void {
  useEffect(() => {
    if (!sessionId || paused) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    const tick = async () => {
      if (cancelled) return;
      try {
        const [{ data: docs }, statuses] = await Promise.all([
          supabase.from("atad2_session_documents").select("id").eq("session_id", sessionId),
          loadDocFactsStatuses(sessionId),
        ]);
        const haveRow = new Set(statuses.map((s) => s.document_id));
        for (const d of docs ?? []) {
          const key = `${sessionId}:${d.id}`;
          if (firedDocs.has(key) || haveRow.has(d.id as string)) continue;
          firedDocs.add(key);
          startDocFactsExtraction(sessionId, d.id as string).catch((e) => {
            // Allow a retry on the next tick if the invoke itself failed.
            firedDocs.delete(key);
            console.warn("[docfacts-prewarm] extract failed", d.id, (e as Error).message);
          });
        }
      } catch {
        /* keep polling */
      }
      if (!cancelled) timer = setTimeout(tick, 5000);
    };
    timer = setTimeout(tick, 0);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [sessionId, paused]);
}
