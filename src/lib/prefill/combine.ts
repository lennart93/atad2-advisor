// Helpers that bridge the explanation textarea (stored as a single string in
// atad2_answers.explanation) and the AI portion that lives on
// atad2_question_prefills.committed_text. The UI renders these separately —
// AI text in a locked block above, user notes in the textarea — but the DB
// still stores them as one combined string for downstream reports/PDFs.

export function combineExplanation(
  aiText: string | null | undefined,
  userNotes: string | null | undefined,
): string {
  const ai = (aiText ?? "").trim();
  const user = (userNotes ?? "").trim();
  if (!ai) return user;
  if (!user) return ai;
  return `${ai}\n\n${user}`;
}

// Inverse: given the combined explanation and the known AI text, return the
// user-only portion. Tries leading match (new flow, AI on top) and trailing
// match (legacy flow where the suggestion was appended after user content).
// Falls back to the original explanation if no clean split is found — that
// covers the case where a user inline-edited the AI portion in the textarea
// before this feature existed.
export function splitUserNotes(
  explanation: string | null | undefined,
  aiText: string | null | undefined,
): string {
  const exp = explanation ?? "";
  const ai = (aiText ?? "").trim();
  if (!ai) return exp;
  const expTrim = exp.trim();
  if (expTrim === ai) return "";
  if (expTrim.startsWith(ai)) {
    return expTrim.slice(ai.length).replace(/^\s+/, "");
  }
  if (expTrim.endsWith(ai)) {
    return expTrim.slice(0, -ai.length).replace(/\s+$/, "");
  }
  return exp;
}
