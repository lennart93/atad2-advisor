// Progressive re-run selection (pure, unit-tested).
//
// After a fresh factsheet (generation_status = 'complete', version = V) the
// client re-fires the swarm ONLY for the prefills that stand to improve, with
// the factsheet block attached. A row qualifies when ALL hold:
//   1. user_action === 'pending'        — never touch an advisor-actioned row.
//   2. the draft is weak                 — suggested_answer 'unknown' OR
//                                          confidence_pct < 60 (null counts as weak).
//   3. it has not already been re-run at this version
//                                        — factsheet_version == null || < V.
// Weakest drafts first (lowest confidence), capped so one run never fans out
// unboundedly. The caller logs how many were dropped by the cap.

export const RERUN_CONFIDENCE_THRESHOLD = 60;
export const RERUN_CAP = 40;

export interface RerunCandidate {
  question_id: string;
  user_action: string;
  suggested_answer: "yes" | "no" | "unknown" | null;
  confidence_pct: number | null;
  factsheet_version: number | null;
}

export interface RerunSelection {
  questionIds: string[];
  /** How many qualified candidates were dropped because of the cap. */
  droppedByCap: number;
}

export function selectRerunTargets(
  prefills: RerunCandidate[],
  currentVersion: number,
  cap: number = RERUN_CAP,
): RerunSelection {
  const qualified = prefills.filter((p) => {
    if (p.user_action !== "pending") return false;
    const weak = p.suggested_answer === "unknown" || (p.confidence_pct ?? 0) < RERUN_CONFIDENCE_THRESHOLD;
    if (!weak) return false;
    const alreadyAtVersion = p.factsheet_version != null && p.factsheet_version >= currentVersion;
    return !alreadyAtVersion;
  });

  // Weakest first: lowest confidence (null = 0) leads, so the cap keeps the
  // rows that most need the factsheet.
  qualified.sort((a, b) => (a.confidence_pct ?? 0) - (b.confidence_pct ?? 0));

  const selected = qualified.slice(0, cap);
  return {
    questionIds: selected.map((p) => p.question_id),
    droppedByCap: Math.max(0, qualified.length - selected.length),
  };
}
