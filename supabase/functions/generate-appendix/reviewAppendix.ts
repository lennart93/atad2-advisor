// Holistic appendix review / tighten pass — pure, runtime-agnostic core.
//
// After the section swarm and the deterministic layers (mootness, F4 consistency,
// validators) have filled Part B, one Fable 5 pass looks at the WHOLE checklist at
// once and rewrites the row reasoning so the appendix reads as one coherent
// document: it applies the house wording rules, removes the same explanation being
// repeated in six rows (replacing the repeat with a short cross-reference to the
// article where it is set out), and straightens cross-row narrative. It NEVER
// changes a status or a legal conclusion; only the reasoning TEXT of AI rows is
// touched, and only if the result survives a deterministic preservation guard.
//
// Like reviewMemo.ts this file has NO Deno APIs, NO network, NO `@`-alias imports:
// the Fable call is injected as `call(system, user)`, so the prompt + guard logic
// is unit-tested under vitest (a src test imports this by relative path). `fable.ts`
// isolates the client; `index.ts` wires them together behind an off-switch.
//
// The heart of the design: let the model do a full pass, but only ship a row's
// rewrite if the whole-appendix guard holds (no number, entity, citation, or
// status lost); otherwise keep the untouched row. The appendix is never blocked
// and never shipped with a fact dropped.

// --- context shapes --------------------------------------------------------

export interface ReviewRowInput {
  rowId: string;
  /** The client-facing code shown in the appendix, e.g. "B.3.2" (for cross-refs). */
  displayCode: string;
  legalBasis: string;
  conditionTested: string;
  status: string | null;
  reasoning: string;
  /**
   * Whether this row's stored reasoning is the text a reader actually sees, so it
   * is safe to rewrite. False for advisor-edited rows, ungrounded ("-") rows, and
   * moot rows whose displayed text is derived elsewhere. A non-editable row is
   * still shown to the model as CONTEXT (so it can cross-reference it) but its
   * reasoning is never replaced.
   */
  editable: boolean;
}

export interface AppendixReviewContext {
  taxpayerName: string | null;
  /** Every named entity to preserve; the guard checks the ones that appear. */
  entityNames: string[];
  /** The Part A facts summary (buildFactsBlock output), the grounding for the pass. */
  factsBlock: string;
}

export interface AppendixReviewResult {
  /** New reasoning for editable rows the pass changed; other rows keep their text. */
  rows: Array<{ rowId: string; reasoning: string }>;
  /** Cross-row contradictions the pass could not fix by wording (internal warnings). */
  warnings: string[];
  status: 'reviewed' | 'skipped';
  failures: string[];
}

/** The injected Fable 5 call: takes a system + user prompt, returns raw text. */
export type ReviewCall = (system: string, user: string) => Promise<string>;

// --- prompt ----------------------------------------------------------------

export function buildReviewSystemPrompt(ctx: AppendixReviewContext): string {
  return `You are a senior Dutch corporate tax adviser at Svalner Atlas, writing in English. You are given a FILLED ATAD2 technical appendix (Part B: an article-by-article checklist). Each row has a legal condition, a status, and a reasoning paragraph written independently. Your job is a final holistic pass: make the whole appendix read as one coherent document written by one partner, and tighten it. You do NOT re-decide anything.

ABSOLUTE RULES (breaking any one makes your output unusable):
- NEVER change a status or a legal conclusion, and never change its direction. You only ever rewrite the reasoning TEXT. You cannot and must not output a status.
- Ground every fact in the "Established facts" block below. Do not add, guess or change a fact, a number, a percentage, a jurisdiction, a foreign tax treatment, or an entity name that is not in that block or already in the row. Never give an entity a capacity the facts do not state.
- Keep every entity name, number, amount, percentage and statutory reference that a row relies on. You may MOVE a fact out of a row when you replace that row with a cross-reference (see de-duplication), as long as the fact still appears in the row you point to.
- Only rewrite rows marked [editable]. Rows marked [context] are shown so you can refer to them; never return text for them.

WHAT TO FIX:
- House wording (apply throughout): "entity"/"entities" is the neutral default, but "company"/"corporation" is fine where it reads naturally ("a Dutch company treated as a corporation"). For how a tax result reaches an owner write "is allocated to" or "is attributed to", NEVER "flows up", "flow up" or "flows through"; and do not use "flow" to mean a transaction or a payment either (write "transaction" or "payment", not "flow"). When an owner its state taxes as a corporation neutralises the mismatch, explain why (it is taxed as a corporation and is itself not a taxpayer there); you may call it a "blocker entity", but the explanation matters more than the label. "head office and a PE" is fine, never "pairing". BANNED PHRASES (use plain spoken memo English instead): "runs through the structure/chain"; "sit well above"/"well above"/"well over" (write the figure or "above the 25% threshold"); "stakes" (write "shareholding"); "on these facts"/"on these ownership levels"; "this is not a live question"/"not a live question"; "does not come into play" (write "is not relevant"); "financing chain" (write "structure"). No meta or apology sentences ("the model did not ...", "confirm manually", "cannot be assessed"), and never refer to "the file", "the documents" or "the dossier" as an actor ("the file does not trace ..."); phrase a missing or unconfirmed fact as an open point instead, led by "it is unclear whether ..." (or "it is not established that ...").
- Keep the adviser's grounded style: real amounts/parties/instruments, the jurisdiction and its tax treatment ("deductible in Ireland", "taxed in the US"), the consequence tied to the specific article ("art. 12aa(1)(a) does not apply"). Do not strip these specifics out when tightening.
- Tighten: for a clean row (not triggered / N/A) one crisp sentence is usually enough, two at most. State the fact and its consequence once; do not restate the condition back to the reader; do not pad.
- De-duplicate across rows: when the SAME explanation has already been given in another row, do not repeat it. Replace the repeat with a short cross-reference to the ARTICLE where it is set out, e.g. "As addressed under art. 12aa(1)(b), the disregarded status does not give a deduction without inclusion." Use the article reference (stable), not a row number. Keep each row's own conclusion; only the shared supporting explanation is cross-referenced.
- Coherence: where two rows tell the reader slightly different versions of the same fact, make them consistent (same jurisdiction, same treatment, same entity names). If two rows' CONCLUSIONS genuinely contradict each other and you cannot reconcile them by wording alone (that would need a status change, which you must not make), leave both untouched and report it in "contradictions".

OUTPUT: strict JSON only, no prose around it:
{"rows":[{"rowId":"<the rowId>","reasoning":"<the rewritten reasoning>"}, ...], "contradictions":["<short note>", ...]}
Include a row ONLY if you changed its reasoning. Use the exact rowId given for each row (not the B-code). "contradictions" is [] when there are none.

Established facts (Part A) for grounding:
${ctx.factsBlock || '(no established facts provided)'}`;
}

export function buildReviewUserPayload(rows: ReviewRowInput[]): string {
  const lines: string[] = ['The filled Part B rows follow. Rewrite the [editable] ones; treat [context] ones as read-only references.', ''];
  for (const r of rows) {
    const tag = r.editable ? '[editable]' : '[context]';
    lines.push(`${tag} rowId=${r.rowId}  ${r.displayCode}  (${r.legalBasis})  status=${r.status ?? 'none'}`);
    lines.push(`  condition: ${r.conditionTested}`);
    lines.push(`  reasoning: ${r.reasoning || '(empty)'}`);
    lines.push('');
  }
  return lines.join('\n');
}

// --- parse -----------------------------------------------------------------

interface ParsedReview {
  rows: Array<{ rowId: string; reasoning: string }>;
  contradictions: string[];
}

/** Pull the JSON object out of the model text (tolerates a code fence or stray prose). */
export function parseReviewJson(raw: string): ParsedReview | null {
  const text = raw.trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  let obj: unknown;
  try {
    obj = JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
  if (!obj || typeof obj !== 'object') return null;
  const o = obj as Record<string, unknown>;
  const rawRows = Array.isArray(o.rows) ? o.rows : [];
  const rows: Array<{ rowId: string; reasoning: string }> = [];
  for (const r of rawRows) {
    if (!r || typeof r !== 'object') continue;
    const rid = (r as Record<string, unknown>).rowId;
    const reason = (r as Record<string, unknown>).reasoning;
    if (typeof rid === 'string' && typeof reason === 'string' && reason.trim()) {
      rows.push({ rowId: rid, reasoning: reason.trim() });
    }
  }
  const rawContra = Array.isArray(o.contradictions) ? o.contradictions : [];
  const contradictions = rawContra.filter((c): c is string => typeof c === 'string' && c.trim().length > 0);
  return { rows, contradictions };
}

// --- preservation guard (whole-appendix, over the editable rows) -----------

function extractNumbers(s: string): string[] {
  const set = new Set<string>();
  const re = /\d[\d.,]*/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    const tok = m[0].replace(/[.,]+$/, '');
    if (tok) set.add(tok);
  }
  return [...set];
}

function citationCores(s: string): string[] {
  const set = new Set<string>();
  const re = /\bart(?:\.|icle)?\s*(\d+[a-z]*)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) set.add(m[1].toLowerCase());
  return [...set];
}

export interface GuardResult {
  ok: boolean;
  failures: string[];
}

/**
 * Guard the rewrite over the editable rows AS A WHOLE (not per row), so a fact may
 * move from a de-duplicated row into the row it cross-references, but may never
 * disappear from the appendix. `beforeText` / `afterText` are the concatenated
 * reasoning of every editable row (after = the model's text where given, else the
 * original). Statuses are never guarded here because the model never returns one.
 */
export function runReviewGuard(
  beforeText: string,
  afterText: string,
  entityNames: string[],
): GuardResult {
  const failures: string[] = [];

  const missingNums = extractNumbers(beforeText).filter((n) => !afterText.includes(n));
  if (missingNums.length) failures.push(`dropped numbers: ${missingNums.join(', ')}`);

  const afterLower = afterText.toLowerCase();
  const missingCites = citationCores(beforeText).filter((c) => !afterLower.includes(c));
  if (missingCites.length) failures.push(`dropped article references: ${missingCites.join(', ')}`);

  const missingEnts = entityNames.filter((n) => n && beforeText.includes(n) && !afterText.includes(n));
  if (missingEnts.length) failures.push(`dropped entity names: ${missingEnts.join(', ')}`);

  if (/\{\{|\}\}/.test(afterText)) failures.push('contains a {{...}} placeholder');

  // De-duplication legitimately shortens; only guard against gutting or ballooning.
  const ratio = afterText.length / Math.max(1, beforeText.length);
  if (ratio < 0.35 || ratio > 1.4) failures.push(`length out of band (${ratio.toFixed(2)}x)`);

  return { ok: failures.length === 0, failures };
}

// --- orchestration ---------------------------------------------------------

const NO_META = /model did not|confirm manually/i;

/**
 * Run the holistic review. Returns new reasoning for the editable rows the model
 * changed (only those that survive the whole-appendix guard) plus any unresolved
 * contradictions as internal warnings. On a guard failure it retries once with the
 * failures fed back; if the retry still fails, or the call throws, or there is
 * nothing to review, it returns `skipped` with no row changes (the caller keeps the
 * untouched rows). The result is always safe to store.
 */
export async function reviewAppendix(
  rows: ReviewRowInput[],
  ctx: AppendixReviewContext,
  call: ReviewCall,
): Promise<AppendixReviewResult> {
  const editable = rows.filter((r) => r.editable && r.reasoning.trim() && !NO_META.test(r.reasoning));
  if (editable.length < 2) {
    // Nothing meaningful to straighten across (need at least two rows to de-dup).
    return { rows: [], warnings: [], status: 'skipped', failures: ['too few editable rows'] };
  }

  const system = buildReviewSystemPrompt(ctx);
  const editableIds = new Set(editable.map((r) => r.rowId));
  const originalById = new Map(editable.map((r) => [r.rowId, r.reasoning]));
  const beforeText = editable.map((r) => r.reasoning).join('\n');

  let user = buildReviewUserPayload(rows);
  let lastFailures: string[] = [];

  for (let attempt = 0; attempt < 2; attempt++) {
    let raw: string;
    try {
      raw = await call(system, user);
    } catch (err) {
      return { rows: [], warnings: [], status: 'skipped', failures: [`model call failed: ${String(err)}`] };
    }

    const parsed = parseReviewJson(raw);
    if (!parsed) {
      lastFailures = ['unparseable model output'];
      user = buildReviewUserPayload(rows) + '\n\nYour previous output was not valid JSON. Return ONLY the JSON object described.';
      continue;
    }

    // Keep only changed reasoning for known editable rows, and reject a "rewrite"
    // that reintroduced a meta/apology sentence.
    const changes = parsed.rows.filter(
      (r) => editableIds.has(r.rowId) && !NO_META.test(r.reasoning) && r.reasoning !== originalById.get(r.rowId),
    );

    const afterText = editable
      .map((r) => changes.find((c) => c.rowId === r.rowId)?.reasoning ?? r.reasoning)
      .join('\n');

    const guard = runReviewGuard(beforeText, afterText, ctx.entityNames);
    if (guard.ok) {
      return { rows: changes, warnings: parsed.contradictions, status: 'reviewed', failures: [] };
    }

    lastFailures = guard.failures;
    user =
      buildReviewUserPayload(rows) +
      '\n\n---\nYOUR PREVIOUS REWRITE FAILED THESE PRESERVATION CHECKS: ' +
      guard.failures.join('; ') +
      '. Rewrite again. Keep every number, statutory reference and entity name somewhere in the appendix, never change a status, and return ONLY the JSON object.';
  }

  return { rows: [], warnings: [], status: 'skipped', failures: lastFailures };
}
