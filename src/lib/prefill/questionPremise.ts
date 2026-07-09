// Derive each questionnaire question's PREMISE from the decision tree, so the
// swarm (which answers every question in isolation) knows WHY a question is
// reached instead of guessing it from the wording.
//
// The questionnaire is a mostly-tree-shaped DAG: 35 of 49 questions have a
// single predecessor, the rest converge. We walk UP the predecessor chain while
// it stays unambiguous (exactly one predecessor question) and collect the
// gating conditions (the answers that route into the chain), stopping the moment
// paths converge or the root/cap is reached. That yields the full, unambiguous
// prefix of the premise without any manual authoring.
//
// A "gating" predecessor is one that routes DIFFERENT answers to different
// questions (so reaching the child required a specific answer). A pass-through
// question (all answers lead to the same next question) is walked past but not
// listed as a condition, since it does not constrain anything.

export interface QEdge {
  question_id: string;
  answer_option: string;
  next_question_id: string | null;
}

export interface PremiseStep {
  question_id: string;
  question: string;
  answers: string[]; // the answer(s) that route into the premise chain
}

const CAP = 5;

function uniq(xs: string[]): string[] {
  return Array.from(new Set(xs));
}

/**
 * Map every question_id to its ordered premise steps (root-ward first). A
 * question with no gating ancestors maps to an empty array (or is absent).
 */
export function buildPremiseMap(edges: QEdge[], textOf: (id: string) => string): Map<string, PremiseStep[]> {
  // incoming: target -> (fromQuestion -> answers[] that lead to target)
  const incoming = new Map<string, Map<string, string[]>>();
  // distinct next-questions each question routes to (to detect gating vs pass-through)
  const outTargets = new Map<string, Set<string>>();

  for (const e of edges) {
    if (!e.next_question_id) continue;
    let m = incoming.get(e.next_question_id);
    if (!m) { m = new Map(); incoming.set(e.next_question_id, m); }
    const arr = m.get(e.question_id) ?? [];
    arr.push(e.answer_option);
    m.set(e.question_id, arr);

    const s = outTargets.get(e.question_id) ?? new Set<string>();
    s.add(e.next_question_id);
    outTargets.set(e.question_id, s);
  }

  const questionIds = new Set(edges.map((e) => e.question_id));
  const result = new Map<string, PremiseStep[]>();

  for (const qid of questionIds) {
    const steps: PremiseStep[] = [];
    let current = qid;
    const visited = new Set<string>([qid]);
    for (let i = 0; i < CAP; i++) {
      const inc = incoming.get(current);
      if (!inc || inc.size !== 1) break; // root, or convergence (ambiguous) -> stop
      const [fromQ, answers] = [...inc.entries()][0];
      if (fromQ === current || visited.has(fromQ)) break; // guard cycles
      visited.add(fromQ);
      const gates = (outTargets.get(fromQ)?.size ?? 0) > 1;
      if (gates) {
        steps.unshift({ question_id: fromQ, question: textOf(fromQ), answers: uniq(answers) });
      }
      current = fromQ;
    }
    if (steps.length) result.set(qid, steps);
  }

  return result;
}

/**
 * Render the premise steps into a compact "Question context" block appended to a
 * question's explanation. NEUTRAL by design: it states the premise and asks the
 * model to verify it against the facts; it gives NO instruction on how to answer
 * (that fiscal steering is a separate, sign-off-gated prompt rule).
 */
export function formatPremise(steps: PremiseStep[] | undefined): string {
  if (!steps || steps.length === 0) return "";
  const lines = steps.map((s) => `- "${s.question}" was answered ${s.answers.join("/")}`);
  return [
    "Question context (why this question is reached):",
    "This question in the ATAD2 flow is only reached when the following were established:",
    ...lines,
    "Treat these as the premise of the question. Verify each against the documents and the fact sheet before answering; do not assume a premise the facts do not support.",
  ].join("\n");
}

/** Convenience: build the map and return a per-question-id premise string. */
export function buildPremiseText(edges: QEdge[], textOf: (id: string) => string): Map<string, string> {
  const map = buildPremiseMap(edges, textOf);
  const out = new Map<string, string>();
  for (const [qid, steps] of map) {
    const text = formatPremise(steps);
    if (text) out.set(qid, text);
  }
  return out;
}
