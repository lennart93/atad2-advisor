import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { loadDocFactsStatuses, loadFactsheet, startFactsheetBuild, type FactsheetGenerationStatus } from "@/lib/factsheet/client";
import { selectRerunTargets, type RerunCandidate } from "@/lib/factsheet/rerunSelection";
import { runFactsheetRerun } from "@/lib/factsheet/rerun";

export interface FactsheetPrewarmState {
  status: FactsheetGenerationStatus | "waiting_docs";
  version: number;
  rerun: { active: boolean; done: number; total: number };
}

// Build/rerun dedup across mounts (the hook mounts on more than one page).
const buildSignatures = new Set<string>(); // `${sessionId}:${sortedCompleteDocIds}`
const rerunDoneVersions = new Set<string>(); // `${sessionId}:${version}`

const POLL_MS = 5000;

/**
 * Orchestrates the session fact sheet:
 *   1. Once every document has a terminal (complete/error) facts row, kick off
 *      build-factsheet (dedup on the exact document set).
 *   2. Poll generation_status.
 *   3. When a NEW factsheet version lands, re-run the weak, still-pending
 *      prefills with the factsheet attached (progressive quality pass).
 * Everything is fire-and-forget and never throws to the UI.
 */
export function useFactsheetPrewarm(sessionId: string | null | undefined, paused = false): FactsheetPrewarmState {
  const [state, setState] = useState<FactsheetPrewarmState>({
    status: "idle", version: 0, rerun: { active: false, done: 0, total: 0 },
  });
  const rerunningRef = useRef(false);

  useEffect(() => {
    // Paused while the main questionnaire swarm is running, so building the fact
    // sheet + the progressive re-run never compete with it for backend capacity
    // (that competition was tripping the AnalyzingScreen stall watchdog). Resumes
    // the moment the swarm finishes.
    if (!sessionId || paused) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    const tick = async () => {
      if (cancelled) return;
      // Back off to a slow beat once the pipeline is settled (factsheet complete
      // for the current doc set, progressive re-run done). Never a full stop:
      // this poller is also the recovery path that rebuilds a stale/idle
      // factsheet and picks up newly uploaded documents.
      let delay = POLL_MS;
      try {
        const [{ data: docs }, statuses, fs] = await Promise.all([
          supabase.from("atad2_session_documents").select("id").eq("session_id", sessionId),
          loadDocFactsStatuses(sessionId),
          loadFactsheet(sessionId),
        ]);
        const docIds = (docs ?? []).map((d) => d.id as string);

        if (docIds.length === 0) {
          if (!cancelled) setState((s) => ({ ...s, status: "idle", version: fs?.version ?? 0 }));
        } else {
          const byDoc = new Map(statuses.map((s) => [s.document_id, s]));
          const terminal = docIds.filter((id) => {
            const st = byDoc.get(id);
            return st && (st.status === "complete" || st.status === "error");
          });
          const allTerminal = terminal.length === docIds.length;
          const completeIds = statuses.filter((s) => s.status === "complete").map((s) => s.document_id).sort();

          if (!allTerminal) {
            if (!cancelled) setState((s) => ({ ...s, status: "waiting_docs", version: fs?.version ?? 0 }));
          } else {
            // Decide staleness of the current factsheet vs the complete doc set.
            const newestTerminal = statuses
              .filter((s) => s.status === "complete" || s.status === "error")
              .reduce((m, s) => Math.max(m, new Date(s.updated_at).getTime()), 0);
            const fsBuiltAt = fs?.built_at ? new Date(fs.built_at).getTime() : 0;
            const fsDocSet = (fs?.source_document_ids ?? []).slice().sort();
            const docSetChanged = fsDocSet.join(",") !== completeIds.join(",");
            const stale = !fs || fs.generation_status === "idle" || fs.generation_status === "error"
              || docSetChanged || fsBuiltAt < newestTerminal;

            if (stale && fs?.generation_status !== "generating" && completeIds.length > 0) {
              const sig = `${sessionId}:${completeIds.join(",")}`;
              if (!buildSignatures.has(sig)) {
                buildSignatures.add(sig);
                startFactsheetBuild(sessionId).catch((e) => {
                  buildSignatures.delete(sig);
                  console.warn("[factsheet-prewarm] build failed", (e as Error).message);
                });
              }
            }

            if (!cancelled) {
              setState((s) => ({ ...s, status: (fs?.generation_status ?? "idle") as FactsheetGenerationStatus, version: fs?.version ?? 0 }));
            }

            // Progressive re-run once a new version is complete.
            if (fs && fs.generation_status === "complete" && fs.factsheet && fs.version > 0) {
              const verKey = `${sessionId}:${fs.version}`;
              if (!rerunDoneVersions.has(verKey) && !rerunningRef.current) {
                await maybeRerun(sessionId, fs.version, fs.factsheet, verKey, setState, rerunningRef, () => cancelled);
              }
              // Settled: complete factsheet for this exact doc set, re-run done.
              if (!stale && rerunDoneVersions.has(verKey) && !rerunningRef.current) {
                delay = 60_000;
              }
            }
          }
        }
      } catch {
        /* keep polling */
      }
      if (!cancelled) timer = setTimeout(tick, delay);
    };
    timer = setTimeout(tick, 0);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [sessionId, paused]);

  return state;
}

async function maybeRerun(
  sessionId: string,
  version: number,
  factsheet: NonNullable<Awaited<ReturnType<typeof loadFactsheet>>>["factsheet"],
  verKey: string,
  setState: React.Dispatch<React.SetStateAction<FactsheetPrewarmState>>,
  rerunningRef: React.MutableRefObject<boolean>,
  isCancelled: () => boolean,
): Promise<void> {
  // Only re-run prefills whose factsheet_version is behind this version.
  const { data: prefillsRaw } = await supabase
    .from("atad2_question_prefills")
    .select("question_id, user_action, suggested_answer, confidence_pct, factsheet_version")
    .eq("session_id", sessionId);
  const prefills = (prefillsRaw ?? []) as unknown as RerunCandidate[];
  const maxFsVer = prefills.reduce((m, p) => Math.max(m, p.factsheet_version ?? -1), -1);
  if (version <= maxFsVer) { rerunDoneVersions.add(verKey); return; }

  const { questionIds, droppedByCap } = selectRerunTargets(prefills, version);
  if (questionIds.length === 0) { rerunDoneVersions.add(verKey); return; }
  if (droppedByCap > 0) {
    console.log(`[factsheet-prewarm] re-run capped: ${questionIds.length} run, ${droppedByCap} deferred to a later pass`);
  }

  rerunningRef.current = true;
  rerunDoneVersions.add(verKey); // optimistic: don't double-fire this version
  if (!isCancelled()) setState((s) => ({ ...s, rerun: { active: true, done: 0, total: questionIds.length } }));
  try {
    await runFactsheetRerun(sessionId, factsheet!, version, questionIds, (p) => {
      if (!isCancelled()) setState((s) => ({ ...s, rerun: { active: true, done: p.done, total: p.total } }));
    });
  } catch (e) {
    rerunDoneVersions.delete(verKey); // allow a retry on the next tick
    console.warn("[factsheet-prewarm] re-run failed", (e as Error).message);
  } finally {
    rerunningRef.current = false;
    if (!isCancelled()) setState((s) => ({ ...s, rerun: { active: false, done: s.rerun.total, total: s.rerun.total } }));
  }
}
