import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { loadDocFactsStatuses, startDocFactsExtraction } from "@/lib/factsheet/client";

/**
 * A 'pending' facts row older than this is treated as a dead extraction (the
 * isolate was killed before writing a terminal status) and re-fired. Slightly
 * above the server's PENDING_GRACE_MS (2 min) so a slow-but-alive extraction
 * is never doubled.
 */
const STALE_PENDING_MS = 180_000;

/**
 * When each document's extraction was last kicked off, keyed
 * `${sessionId}:${documentId}`. Module-level so the hook can mount on more
 * than one page without re-firing, and a timestamp (not a fired-once set) so
 * a dead extraction can be retried after STALE_PENDING_MS. Without the retry,
 * one killed isolate left a permanent 'pending' row that was skipped forever,
 * which stalled the whole factsheet pipeline for the session.
 */
const lastFiredAt = new Map<string, number>();

/**
 * Fire extract-docfacts for each uploaded document as soon as it exists, in
 * parallel, mirroring the swarm fan-out style. Fire-and-forget: errors are
 * logged, never surfaced, never blocking. Skips documents whose facts row is
 * terminal (complete/error) or freshly pending; re-fires only when a pending
 * row has gone stale.
 */
export function useDocFactsPrewarm(sessionId: string | null | undefined, paused = false): void {
  useEffect(() => {
    if (!sessionId || paused) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    const tick = async () => {
      if (cancelled) return;
      // Back off to a slow beat once every doc is terminal: this poller is also
      // how a NEW upload gets its extraction (nothing else fires it), so it
      // never fully stops, but a finished set does not need 12 checks a minute.
      let delay = 5000;
      try {
        const [{ data: docs }, statuses] = await Promise.all([
          supabase.from("atad2_session_documents").select("id").eq("session_id", sessionId),
          loadDocFactsStatuses(sessionId),
        ]);
        const now = Date.now();
        const statusByDoc = new Map(statuses.map((s) => [s.document_id, s]));
        let allTerminal = (docs ?? []).length > 0;
        for (const d of docs ?? []) {
          const row = statusByDoc.get(d.id as string);
          const terminal = row?.status === "complete" || row?.status === "error";
          if (!terminal) allTerminal = false;
          const stalePending =
            row?.status === "pending" && now - new Date(row.updated_at).getTime() > STALE_PENDING_MS;
          if (row && !stalePending) continue; // terminal, or a live extraction
          const key = `${sessionId}:${d.id}`;
          const last = lastFiredAt.get(key) ?? 0;
          if (now - last < STALE_PENDING_MS) continue; // fired recently, give it time
          lastFiredAt.set(key, now);
          startDocFactsExtraction(sessionId, d.id as string).catch((e) => {
            // Allow a retry on the next tick if the invoke itself failed.
            lastFiredAt.delete(key);
            console.warn("[docfacts-prewarm] extract failed", d.id, (e as Error).message);
          });
        }
        if (allTerminal) delay = 60_000;
      } catch {
        /* keep polling */
      }
      if (!cancelled) timer = setTimeout(tick, delay);
    };
    timer = setTimeout(tick, 0);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [sessionId, paused]);
}
