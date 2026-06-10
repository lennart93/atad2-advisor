export interface SessionFacts {
  answerCount: number;
  hasMemorandum: boolean;
  memorandumDate: string | undefined;
}

/**
 * Groups bulk-fetched answer and report rows back per session, replacing the
 * old per-session N+1 queries on the dashboard. Rows for sessions outside
 * `sessionIds` are ignored; sessions without rows get zero/false defaults.
 */
export function groupSessionFacts(
  sessionIds: string[],
  answerRows: Array<{ session_id: string }>,
  reportRows: Array<{ session_id: string; generated_at: string }>,
): Map<string, SessionFacts> {
  const facts = new Map<string, SessionFacts>();
  for (const id of sessionIds) {
    facts.set(id, { answerCount: 0, hasMemorandum: false, memorandumDate: undefined });
  }
  for (const row of answerRows) {
    const f = facts.get(row.session_id);
    if (f) f.answerCount += 1;
  }
  for (const row of reportRows) {
    const f = facts.get(row.session_id);
    if (!f) continue;
    if (!f.memorandumDate || row.generated_at > f.memorandumDate) {
      f.memorandumDate = row.generated_at;
    }
    f.hasMemorandum = true;
  }
  return facts;
}
