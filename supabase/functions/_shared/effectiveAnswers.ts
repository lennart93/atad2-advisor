// Pure, dependency-vrije logica. DUAL MAINTENANCE: het blok tussen de
// BEGIN/END SHARED markers is de mirror van
// src/lib/assessment/effectiveAnswers.ts. Beide bijwerken bij elke wijziging
// (zelfde regel als skeleton.ts / skeletonRows.ts). Geen Deno-specifieke
// imports: dit bestand wordt door vitest cross-geimporteerd voor de
// pariteitstest.

// ===== BEGIN SHARED =====
export interface RealAnswerInput {
  question_id: string;
  answer: string;
  explanation: string | null;
  question_text?: string | null;
}
export interface PrefillInput {
  question_id: string;
  suggested_answer: 'yes' | 'no' | 'unknown' | null;
  suggested_toelichting: string | null;
  contextual_hint: string | null;
  suggested_toelichting_unknown: string | null;
}
export interface EffectiveAnswer {
  question_id: string;
  answer: string;
  explanation: string | null;
  question_text: string | null;
  source: 'answer' | 'suggestion';
}

/**
 * The best answer set available right now: the recorded answer where the
 * question is answered, otherwise the prefill suggestion. A plain accept
 * copies the suggestion verbatim into the answer, so speculative and final
 * sets are identical unless the user genuinely deviated.
 */
export function mergeEffectiveAnswers(
  real: RealAnswerInput[],
  prefills: PrefillInput[],
): EffectiveAnswer[] {
  const out = new Map<string, EffectiveAnswer>();
  for (const r of real) {
    if (out.has(r.question_id)) continue;
    out.set(r.question_id, {
      question_id: r.question_id,
      answer: r.answer,
      explanation: r.explanation,
      question_text: r.question_text ?? null,
      source: 'answer',
    });
  }
  for (const p of prefills) {
    if (out.has(p.question_id)) continue;
    if (p.suggested_answer === 'yes' || p.suggested_answer === 'no') {
      out.set(p.question_id, {
        question_id: p.question_id,
        answer: p.suggested_answer,
        explanation: p.suggested_toelichting?.trim() || null,
        question_text: null,
        source: 'suggestion',
      });
      continue;
    }
    // Unknown route: an explicit 'unknown' suggestion, or the Route B
    // companion (no suggested_answer, but a contextual hint with the unknown
    // toelichting). Only counts when there is actual text; a bare unknown
    // adds nothing to the model input.
    const unknownText = p.suggested_toelichting_unknown?.trim() || p.suggested_toelichting?.trim() || '';
    const isUnknownRoute = p.suggested_answer === 'unknown'
      || (p.suggested_answer === null && !!p.contextual_hint && !!p.suggested_toelichting_unknown);
    if (isUnknownRoute && unknownText) {
      out.set(p.question_id, {
        question_id: p.question_id,
        answer: 'unknown',
        explanation: unknownText,
        question_text: null,
        source: 'suggestion',
      });
    }
  }
  return [...out.values()].sort((a, b) => a.question_id.localeCompare(b.question_id));
}

/**
 * Canonical form for the fingerprint: one line per question,
 * `id=lowercase(answer)|trim(explanation)`, sorted by question_id. Lowercasing
 * bridges the 'Yes' (recorded answer) vs 'yes' (suggestion) casing difference.
 */
export function canonicalAnswersString(
  answers: Array<{ question_id: string; answer: string; explanation: string | null }>,
): string {
  return [...answers]
    .sort((a, b) => a.question_id.localeCompare(b.question_id))
    .map((a) => `${a.question_id}=${a.answer.toLowerCase()}|${(a.explanation ?? '').trim()}`)
    .join('\n');
}

/** sha256 hex over the canonical form. crypto.subtle exists in browser, Deno and Node (vitest). */
export async function answersFingerprint(
  answers: Array<{ question_id: string; answer: string; explanation: string | null }>,
): Promise<string> {
  const buf = await globalThis.crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(canonicalAnswersString(answers)),
  );
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}
// ===== END SHARED =====
