// Memo review / rewrite pass — pure, runtime-agnostic core.
//
// This module rewrites a finished ATAD2 memo so it reads as a fluent Dutch tax
// specialist would write it in English, adds grounded references to the two
// appendices, and enforces a deterministic preservation guard so the rewrite can
// never drop a fact, a number, a citation, an entity name, or a section boundary.
//
// It contains NO Deno APIs, NO network calls, and NO `@`-alias imports on purpose:
//   - the Fable 5 call is injected as `call(system, user)` so the guard + prompt
//     logic can be unit-tested under vitest (a src test imports this by relative
//     path);
//   - `fable.ts` isolates the actual Anthropic/Deno client;
//   - `index.ts` wires them together.
//
// The heart of the design is: let the model do a full rewrite, but only ship the
// result if it survives the guard; otherwise keep the untouched draft. A memo is
// never blocked and never shipped broken.

// --- context shapes --------------------------------------------------------

/** One entity as referenced in Appendix 1 (the `#` column is its id, e.g. "E2"). */
export interface ReviewEntity {
  id: string;
  name: string;
  jurisdiction: string | null;
  classification: string | null;
}

/** One transaction as referenced in Appendix 1 (the `#` column is its id, e.g. "T1"). */
export interface ReviewTransaction {
  id: string;
  fromName: string;
  toName: string;
  kind: string | null;
}

export interface AppendixContext {
  /** Appendix 1 (facts) will render, so the model may reference it. */
  factsAttached: boolean;
  /** Appendix 2 (conditions) will render, so the model may reference it. */
  checklistAttached: boolean;
  entities: ReviewEntity[];
  transactions: ReviewTransaction[];
  /** How many checklist rows landed in each outcome, for the model's awareness. */
  tally: { triggered: number; insufficient: number } | null;
}

export interface ReviewContext {
  taxpayerName: string | null;
  /** Every named entity to preserve (taxpayer + register). Guard checks the ones
   *  that actually appear in the draft. */
  entityNames: string[];
  appendix: AppendixContext | null;
}

export interface GuardResult {
  ok: boolean;
  failures: string[];
}

export type PolishStatus = 'polished' | 'skipped';

export interface ReviewResult {
  markdown: string;
  status: PolishStatus;
  failures: string[];
}

/** The injected Fable 5 call: takes a system + user prompt, returns raw text. */
export type ReviewCall = (system: string, user: string) => Promise<string>;

// --- appendix summary (fed into the prompt) --------------------------------

function classificationLabel(c: string | null): string {
  const v = (c ?? '').trim();
  return v ? v : 'classification not set';
}

/**
 * The `{{APPENDIX_SUMMARY}}` block. Lists the real entity and transaction ids so
 * the model can only reference numbers that exist in the rendered tables, and
 * tells it exactly how to cite them. When an appendix will not render, it is told
 * not to reference that one; when neither renders, it is told to add none.
 */
export function buildAppendixSummary(appendix: AppendixContext | null): string {
  const a = appendix;
  if (!a || (!a.factsAttached && !a.checklistAttached)) {
    return 'No appendices are attached to this memo. Do not add any appendix references.';
  }

  const lines: string[] = [
    'Two appendices will be attached to this memo. You MAY add short in-line references to them, but only where they genuinely help the reader, never on every sentence, and never invent appendix content, ids, or article numbers.',
    '',
  ];

  if (a.factsAttached) {
    lines.push('Appendix 1 (facts): the entities and intra-group transactions, each with a reference number.');
    if (a.entities.length) {
      lines.push('Entities:');
      for (const e of a.entities) {
        const jur = (e.jurisdiction ?? '').trim().toUpperCase() || '?';
        lines.push(`  ${e.id}  ${e.name} (${jur}, ${classificationLabel(e.classification)})`);
      }
    }
    if (a.transactions.length) {
      lines.push('Transactions:');
      for (const t of a.transactions) {
        const kind = (t.kind ?? '').trim() || 'flow';
        lines.push(`  ${t.id}  ${t.fromName} -> ${t.toName} (${kind})`);
      }
    }
    lines.push(
      'Reference these as "(see Appendix 1, no. E2)" for an entity or "(see Appendix 1, transaction T1)" for a transaction. Use ONLY the ids listed above.',
      '',
    );
  } else {
    lines.push('Appendix 1 is not attached; do not reference it.', '');
  }

  if (a.checklistAttached) {
    const tally = a.tally
      ? ` (${a.tally.triggered} condition(s) triggered, ${a.tally.insufficient} with insufficient information)`
      : '';
    lines.push(
      `Appendix 2 (conditions): the article-by-article ATAD2 checklist${tally}. Reference it as "(see Appendix 2)", optionally naming an article you already discuss, e.g. "(see Appendix 2, art. 12aa)". Do not cite an article the memo does not discuss.`,
    );
  } else {
    lines.push('Appendix 2 is not attached; do not reference it.');
  }

  return lines.join('\n');
}

// --- rewrite prompt --------------------------------------------------------

export function buildReviewSystemPrompt(ctx: ReviewContext): string {
  return `You are a senior Dutch corporate tax adviser at Svalner Atlas, writing in English.
You receive a draft ATAD2 memorandum in Markdown. Rewrite it so it reads as if written by a fluent Dutch tax specialist writing in English: plain, natural, and easy to read, in the everyday professional English a good adviser actually uses, flowing smoothly from first line to last. Fix awkward or non-idiomatic English, remove literary or chatty phrasing, and remove any amateurish tone. Actively cut repetition, filler, and mechanically repeated openers so it reads as a partner wrote it, not as a checklist. Do not add analysis and do not change the substance.

ABSOLUTE PRESERVATION RULES (breaking any one makes the rewrite unusable):
- Do not change, add, or remove any legal conclusion or its direction (triggered / not triggered / insufficient information).
- Keep every entity name exactly as written (same spelling, same legal-form suffix).
- Keep every number, amount, percentage, date, fiscal year, and currency figure exactly.
- Keep every statutory reference exactly (e.g. art. 12aa Wet Vpb, art. 2, ATAD2). Keep the terms D/NI and DD where the draft uses them.
- Keep the section structure exactly: the same section headers (whether "**bold**" or "<u>underlined</u>") and the same "---" dividers, in the same order. Do not rename, add, or drop a section header. This is about the HEADED SECTIONS only: within a section you SHOULD still merge redundant paragraphs, drop repeated sentences, and tighten bullets.
- Output Markdown only, the same kind the draft uses. No preamble, no closing note, no explanation of your edits. Return ONLY the rewritten memo.
- No em dashes. Use a comma, a period, or a rewrite instead.
- Keep the established adviser voice ("we"). Never switch to "I" or to app-voice ("I'll", "we will now").

PLAIN, NATURAL LANGUAGE (the most important thing, the memo must simply read well):
- Write the way a good tax adviser actually writes, not like a law professor. Plain, natural, everyday professional English that flows and is easy to read aloud.
- Prefer the ordinary word over the formal or Latinate one: "is / are" not "comprises / constitutes", "target" not "are aimed at", "about" not "in respect of / with regard to", "under" not "pursuant to", "because" not "by virtue of", "so" or "therefore" not "accordingly", "each year" not "on an annual basis". Cut stiff or bureaucratic phrasing.
- Say where a company sits in plain words. Do not write "registered and actual seat"; "seat" is a literal rendering of "zetel" and reads as translated Dutch. Write "based in Rotterdam", or if the distinction matters, "with its registered office in Rotterdam and its place of effective management there too".
- Make it flow: connect ideas naturally and vary sentence length. Do not leave a run of short choppy statements, and do not build long tangled clauses.
- Keep the tax terms that carry precise meaning (hybrid mismatch, D/NI, DD, non-transparent, permanent establishment, fiscal unity, and the entity names and statutory references). Everything around them should read as clear, natural prose.

STYLE (match the house register):
- Each paragraph opens with its conclusion, then the supporting facts. Never open with a sentence that announces what you are about to examine ("We considered", "We turn to", "The most relevant area concerns", "can be set aside").
- Do not rank mismatch types ("the central", "the key", "the most relevant"). Address each on its own footing.
- Name the jurisdiction that gives each treatment; never "because both sides treat it the same".
- One spelling per entity and one term per concept throughout. Define "deemed payments" or "PE" only if the memo actually discusses them.
- Plain sentences that flow; vary their length so the text reads smoothly, not choppy and not bureaucratic. Flowing paragraphs in the technical assessment, no headings or bullets inside it; the flow comes from the order of the analysis, not from connective glue.
- Write "is the parent company of a fiscal unity", not "heads a fiscal unity".

AVOID THE AI CADENCE (this is the clearest tell that a machine wrote it, kill it every time):
- Break up the three-part verb list. A sentence that lines up three polished verbs in a row ("it records the analysis..., evidences compliance..., and sets out the follow-up...") is exactly what a Dutch adviser would never write. Split it into two or three plain sentences that each say one thing.
- Do not turn nouns into verbs to sound formal. Write "shows" not "evidences", "meets" not "satisfies / discharges", "sets out" only where a plain "explains / describes / lists" will not do. Prefer the verb a normal person would say out loud.
- Concretely, a sentence like "This memorandum records the analysis supporting the position taken in the CIT return, evidences compliance with the ATAD2 documentation duty, and sets out any follow-up needed." should become something like: "This memorandum explains the position we take in the corporate income tax return. It also shows that we have met the ATAD2 documentation requirement, and it lists the points that still need follow-up." Two or three simple sentences, one idea each, the way a fluent Dutch adviser at C1 English would actually type it.
- The same goes for any balanced pair or triple built for rhythm rather than meaning ("clear and defensible", "robust and well-documented", "assess, document and report"). Keep the meaning, drop the cadence.
- Do not negate by clipping a noun onto "no". "S4 Energy BV holds no foreign participation", "the financing produces no D/NI", "the structure gives rise to no mismatch" all read as a machine compressing a sentence. Write it out with a normal verb and "does not ... any": "S4 Energy BV does not hold any foreign participation".
- Do not squeeze a whole clause into a possessive plus an abstract verb. "S4 Energy BV's financing produces no D/NI" hides what actually happens. Name the real event: "The interest payments under S4 Energy BV's financing do not lead to a D/NI outcome." Same for "gives rise to", write "create" or "lead to" instead.
- Drop the participial aside ("the structure, being a US shareholder and Swiss and Dutch financing, does not ..."). A Dutch adviser writes it straight: "On the information provided, the US shareholder and the Swiss and Dutch financing do not create a hybrid mismatch."

TRIM (this is what makes drafts read badly, fix it every time):
- Cut repetition. Where the draft makes the same point twice, keep one clear version. In particular the introduction often first describes the two ATAD2 outcomes in prose ("a payment deducted while the income is not taxed anywhere, or the same cost deducted twice") and then restates them as a named D/NI and DD list. Merge these into one clean explanation; do not say the same thing twice. Keep the terms D/NI and DD.
- General background: carry the "we understand" framing ONCE, in the lead-in sentence only ("We have based this assessment on the following facts and understandings:"). Each bullet then states its fact directly. NEVER begin a bullet with "We understand that" or "We understand". Six bullets each opening with the same words is exactly what to remove.
- Do not start consecutive bullets or paragraphs with the same words; vary the openings.
- Remove throat-clearing and filler ("It should be noted that", "It is important to", "At a high level", "As mentioned"). State the point directly.

APPENDICES:
${buildAppendixSummary(ctx.appendix)}`;
}

// --- deterministic cleanup -------------------------------------------------

/** Strip a leading/trailing markdown code fence the model may have wrapped around the memo. */
function stripFences(md: string): string {
  const fence = md.match(/^\s*```(?:markdown|md)?\s*\n([\s\S]*?)\n```\s*$/);
  return fence ? fence[1] : md;
}

/**
 * Deterministic post-processing applied to the model's output before the guard:
 * remove em dashes (house rule) and drop any appendix reference that points at an
 * appendix which will not render or at an id that does not exist. This runs before
 * the guard so a stray reference cannot itself fail the guard.
 */
export function sanitize(md: string, ctx: ReviewContext): string {
  let out = md.replace(/\s*—\s*/g, ', ');

  const app = ctx.appendix;
  const allowIds = new Set<string>([
    ...(app?.entities.map((e) => e.id) ?? []),
    ...(app?.transactions.map((t) => t.id) ?? []),
  ]);

  // Appendix 1 references: drop when not attached, or when they name an unknown id.
  out = out.replace(/\s*\(see appendix 1[^)]*\)/gi, (match) => {
    if (!app?.factsAttached) return '';
    const ids = match.match(/\b[ET]\d+\b/g) ?? [];
    if (ids.some((id) => !allowIds.has(id))) return '';
    return match;
  });

  // Appendix 2 references: drop when not attached.
  out = out.replace(/\s*\(see appendix 2[^)]*\)/gi, (match) => (app?.checklistAttached ? match : ''));

  return out;
}

// --- preservation guard ----------------------------------------------------

const KNOWN_HEADERS = [
  'introduction',
  'risk assessment outcome',
  'executive summary',
  'general background',
  'atad2 technical assessment',
  'technical assessment',
  'conclusion and next steps',
];

function normalizeHeader(line: string): string {
  return line
    .replace(/<\/?[a-z][^>]*>/gi, '') // strip html tags (memo headers use <u>...</u>)
    .replace(/^[\s#*]+/, '')
    .replace(/[\s*]+$/, '')
    .trim()
    .toLowerCase();
}

/** Section headers in order: markdown `#` headings, `**bold**`-only lines,
 *  `<u>...</u>`-only lines (the memo's own header style), or any line whose text
 *  exactly matches a known ATAD2 memo header. The download step (parse-memo)
 *  splits on these headers, so the rewrite must never rename, drop, or reorder one. */
export function extractHeaders(md: string): string[] {
  const out: string[] = [];
  for (const raw of md.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const isMd =
      /^#{1,6}\s+\S/.test(line) ||
      /^\*\*[^*].*\*\*$/.test(line) ||
      /^<u>[\s\S]*<\/u>$/i.test(line);
    const norm = normalizeHeader(line);
    if (isMd || KNOWN_HEADERS.includes(norm)) out.push(norm);
  }
  return out;
}

function countDividers(md: string): number {
  return md.split(/\r?\n/).filter((l) => /^\s{0,3}(-{3,}|_{3,}|\*{3,})\s*$/.test(l.trim())).length;
}

/** Numeric tokens (trailing separators trimmed), deduped. */
export function extractNumbers(md: string): string[] {
  const set = new Set<string>();
  const re = /\d[\d.,]*/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(md))) {
    const tok = m[0].replace(/[.,]+$/, '');
    if (tok) set.add(tok);
  }
  return [...set];
}

/** The article core of each statutory reference (e.g. "12aa", "12ac", "2"). */
export function citationCores(md: string): string[] {
  const set = new Set<string>();
  const re = /\bart(?:\.|icle)?\s*(\d+[a-z]*)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(md))) set.add(m[1].toLowerCase());
  return [...set];
}

const CRITICAL_KEYWORDS = ['D/NI', 'DD', 'EUR', 'ATAD2'];

export function runGuard(draft: string, polish: string, ctx: ReviewContext): GuardResult {
  const failures: string[] = [];
  const polishLower = polish.toLowerCase();

  const dh = extractHeaders(draft);
  const ph = extractHeaders(polish);
  if (dh.length !== ph.length || dh.some((h, i) => h !== ph[i])) {
    failures.push(`headers changed (draft: ${dh.join(' | ')} / polish: ${ph.join(' | ')})`);
  }

  if (countDividers(draft) !== countDividers(polish)) {
    failures.push('number of "---" dividers changed');
  }

  const missingNums = extractNumbers(draft).filter((n) => !polish.includes(n));
  if (missingNums.length) failures.push(`missing numbers: ${missingNums.join(', ')}`);

  const missingCites = citationCores(draft).filter((c) => !polishLower.includes(c));
  if (missingCites.length) failures.push(`missing article references: ${missingCites.join(', ')}`);

  const missingKw = CRITICAL_KEYWORDS.filter((k) => draft.includes(k) && !polish.includes(k));
  if (missingKw.length) failures.push(`missing terms: ${missingKw.join(', ')}`);

  const missingEnts = ctx.entityNames.filter((n) => n && draft.includes(n) && !polish.includes(n));
  if (missingEnts.length) failures.push(`missing entity names: ${missingEnts.join(', ')}`);

  if (/\{\{|\}\}/.test(polish)) failures.push('contains a {{...}} placeholder');

  const ratio = polish.length / Math.max(1, draft.length);
  if (ratio < 0.5 || ratio > 1.4) failures.push(`length out of band (${ratio.toFixed(2)}x)`);

  return { ok: failures.length === 0, failures };
}

// --- orchestration ---------------------------------------------------------

/**
 * Rewrite the memo, then guard it. On a guard failure, retry once with the
 * failures fed back; if the retry still fails (or the model call throws), return
 * the untouched draft marked 'skipped'. The returned markdown is always safe to
 * store as report_md.
 */
export async function reviewMemo(draft: string, ctx: ReviewContext, call: ReviewCall): Promise<ReviewResult> {
  const system = buildReviewSystemPrompt(ctx);
  let user = draft;
  let lastFailures: string[] = [];

  for (let attempt = 0; attempt < 2; attempt++) {
    let raw: string;
    try {
      raw = await call(system, user);
    } catch (err) {
      return { markdown: draft, status: 'skipped', failures: [`model call failed: ${String(err)}`] };
    }

    const cleaned = sanitize(stripFences(raw).trim(), ctx);
    const guard = runGuard(draft, cleaned, ctx);
    if (guard.ok) return { markdown: cleaned, status: 'polished', failures: [] };

    lastFailures = guard.failures;
    user =
      draft +
      '\n\n---\nYOUR PREVIOUS REWRITE FAILED THESE PRESERVATION CHECKS: ' +
      guard.failures.join('; ') +
      '. Rewrite the memo again. Keep every section header, every "---" divider, every number, every statutory reference, and every entity name exactly as in the original. Output ONLY the rewritten memo.';
  }

  return { markdown: draft, status: 'skipped', failures: lastFailures };
}

// --- raw appendix -> ReviewContext adapter ---------------------------------
//
// Kept here (pure) rather than in index.ts so it is unit-tested. Reads the raw
// `atad2_appendix` JSON shape loosely, mirroring only the fields the rewrite needs.

interface RawEntity {
  id?: string;
  name?: string;
  jurisdiction?: string | null;
  nlTaxStatus?: string | null;
  hidden?: boolean;
  edits?: { jurisdiction?: string | null; nlTaxStatus?: string | null } | null;
}
interface RawTransaction {
  id?: string;
  fromEntityId?: string;
  toEntityId?: string;
  kind?: string | null;
  excludedFromClient?: boolean;
}
interface RawRow {
  status?: string | null;
  excludedFromClient?: boolean;
}
export interface RawAppendix {
  facts?: { entities?: RawEntity[]; transactions?: RawTransaction[] } | null;
  rows?: RawRow[] | null;
  facts_skipped?: boolean;
  checklist_skipped?: boolean;
}

export function buildReviewContext(
  taxpayerName: string | null,
  rawAppendix: RawAppendix | null,
): ReviewContext {
  const entityNames = new Set<string>();
  if (taxpayerName && taxpayerName.trim()) entityNames.add(taxpayerName.trim());

  if (!rawAppendix || !rawAppendix.facts) {
    return { taxpayerName, entityNames: [...entityNames], appendix: null };
  }

  const rawEntities = (rawAppendix.facts.entities ?? []).filter((e) => !e.hidden && e.id && e.name);
  const nameById = new Map<string, string>();
  const entities: ReviewEntity[] = rawEntities.map((e) => {
    const name = (e.name ?? '').trim();
    nameById.set(e.id as string, name);
    if (name) entityNames.add(name);
    return {
      id: e.id as string,
      name,
      jurisdiction: e.edits?.jurisdiction ?? e.jurisdiction ?? null,
      classification: e.edits?.nlTaxStatus ?? e.nlTaxStatus ?? null,
    };
  });

  const transactions: ReviewTransaction[] = (rawAppendix.facts.transactions ?? [])
    .filter((t) => !t.excludedFromClient && t.id && t.fromEntityId && t.toEntityId)
    .map((t) => ({
      id: t.id as string,
      fromName: nameById.get(t.fromEntityId as string) ?? (t.fromEntityId as string),
      toName: nameById.get(t.toEntityId as string) ?? (t.toEntityId as string),
      kind: t.kind ?? null,
    }));

  const rows = (rawAppendix.rows ?? []).filter((r) => !r.excludedFromClient);
  const tally = rows.length
    ? {
        triggered: rows.filter((r) => r.status === 'Triggered').length,
        insufficient: rows.filter((r) => r.status === 'Insufficient information').length,
      }
    : null;

  const appendix: AppendixContext = {
    factsAttached: !rawAppendix.facts_skipped && entities.length > 0,
    checklistAttached: !rawAppendix.checklist_skipped && rows.length > 0,
    entities,
    transactions,
    tally,
  };

  return { taxpayerName, entityNames: [...entityNames], appendix };
}
