import type { OpenQuestionExportMeta } from "./exportText";

/**
 * Canonical frontend shape of the schema-v2 composed letter: a short prose
 * intro plus 2-4 thematic groups whose questions each cover one or more
 * source register questions (question_ids is the merge mapping). Legacy
 * letters (the deployed v1 edge response and v1/v2 localStorage envelopes)
 * normalize into this shape via normalizeComposedLetter, so every consumer
 * only ever deals with ONE letter type.
 *
 * This module is pure: no React, no storage, no network. It replaces
 * letterStore.ts (codec, storage key, as-of line) and the letter-shaped
 * helpers of composeLetter.ts once the callers swap over.
 */

/** Per-entity grid attached to a question (one row per entity). */
export interface LetterTable {
  columns: string[];
  rows: string[][];
}

/**
 * One output question. question_ids holds the source register question ids
 * this (possibly merged) question covers; excluding the question excludes
 * ALL of them.
 */
export interface LetterQuestion {
  question_ids: string[];
  text: string;
  table: LetterTable | null;
}

/** A thematic group of questions. title "" marks the legacy unnamed group. */
export interface LetterGroup {
  title: string;
  questions: LetterQuestion[];
}

/**
 * The composed letter. intro may contain newlines (legacy letters normalize
 * their understandings into a "We understand that:" bullet block); renderers
 * treat it as pre-line text.
 */
export interface ComposedLetter {
  intro: string;
  groups: LetterGroup[];
}

/**
 * Stable identity of an output question for include toggles and storage.
 * Unique within a letter because the coverage guard keeps question_ids
 * disjoint across questions. For a legacy single-id question the key EQUALS
 * the register id, which is what lets stored v1/v2 includedIds map 1:1 onto
 * includedKeys.
 */
export function questionKey(question: LetterQuestion): string {
  return question.question_ids.join("+");
}

/** All question keys of the letter, flattened in group order. */
export function allQuestionKeys(letter: ComposedLetter): string[] {
  return letter.groups.flatMap((group) => group.questions.map(questionKey));
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === "string");
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function parseTable(value: unknown): LetterTable | null | undefined {
  if (value === undefined || value === null) return null;
  if (typeof value !== "object" || Array.isArray(value)) return undefined;
  const table = value as Record<string, unknown>;
  if (!isStringArray(table.columns) || table.columns.length === 0) return undefined;
  if (!Array.isArray(table.rows) || !table.rows.every(isStringArray)) {
    return undefined;
  }
  return {
    columns: [...table.columns],
    rows: table.rows.map((row) => [...row]),
  };
}

/**
 * Strict parser for the NEW (grouped) shape only. Used directly by the v3
 * envelope decoder, which must REJECT an old-shape letter inside a v3
 * envelope instead of silently normalizing it.
 */
function parseNewShapeLetter(value: unknown): ComposedLetter | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  const obj = value as Record<string, unknown>;
  if (typeof obj.intro !== "string") return null;
  if (!Array.isArray(obj.groups) || obj.groups.length === 0) return null;

  const groups: LetterGroup[] = [];
  for (const rawGroup of obj.groups) {
    if (typeof rawGroup !== "object" || rawGroup === null) return null;
    const group = rawGroup as Record<string, unknown>;
    if (typeof group.title !== "string") return null;
    if (!Array.isArray(group.questions) || group.questions.length === 0) {
      return null;
    }
    const questions: LetterQuestion[] = [];
    for (const rawQuestion of group.questions) {
      if (typeof rawQuestion !== "object" || rawQuestion === null) return null;
      const question = rawQuestion as Record<string, unknown>;
      if (
        !Array.isArray(question.question_ids) ||
        question.question_ids.length === 0 ||
        !question.question_ids.every(isNonEmptyString)
      ) {
        return null;
      }
      if (!isNonEmptyString(question.text)) return null;
      const table = parseTable(question.table);
      if (table === undefined) return null;
      questions.push({
        question_ids: [...question.question_ids],
        text: question.text,
        table,
      });
    }
    groups.push({ title: group.title, questions });
  }
  return { intro: obj.intro, groups };
}

/**
 * Parser + normalizer for the OLD shape ({ understandings, questions }), as
 * the deployed edge returns today and as v1/v2 envelopes store it. The
 * understandings become a "We understand that:" bullet block in the intro
 * (blank entries dropped, like the old renderer) and the questions become
 * ONE unnamed group of single-id questions, so old letters keep rendering
 * and copying exactly as before.
 */
function parseOldShapeLetter(value: unknown): ComposedLetter | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  const obj = value as Record<string, unknown>;
  if (!isStringArray(obj.understandings)) return null;
  if (!Array.isArray(obj.questions) || obj.questions.length === 0) return null;

  const questions: LetterQuestion[] = [];
  for (const rawQuestion of obj.questions) {
    if (typeof rawQuestion !== "object" || rawQuestion === null) return null;
    const question = rawQuestion as Record<string, unknown>;
    if (
      typeof question.question_id !== "string" ||
      typeof question.text !== "string"
    ) {
      return null;
    }
    questions.push({
      question_ids: [question.question_id],
      text: question.text,
      table: null,
    });
  }

  const bullets = obj.understandings
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
  const intro =
    bullets.length > 0
      ? `We understand that:\n${bullets.map((entry) => `- ${entry}`).join("\n")}`
      : "";
  return { intro, groups: [{ title: "", questions }] };
}

/**
 * Normalizes ANY letter payload (new edge response, old edge response,
 * letter from a legacy envelope) into the canonical ComposedLetter, or null
 * when the value matches neither shape. Fail-closed: callers treat null as
 * "no letter" and recompose.
 */
export function normalizeComposedLetter(value: unknown): ComposedLetter | null {
  return parseNewShapeLetter(value) ?? parseOldShapeLetter(value);
}

/**
 * Union of question_ids over the INCLUDED questions, in appearance order,
 * deduped. This is the flip/audit basis: excluding an output question
 * excludes ALL the register questions it covers.
 */
export function coveredQuestionIds(
  letter: ComposedLetter,
  includedKeys: Set<string>,
): string[] {
  const covered: string[] = [];
  const seen = new Set<string>();
  for (const group of letter.groups) {
    for (const question of group.questions) {
      if (!includedKeys.has(questionKey(question))) continue;
      for (const id of question.question_ids) {
        if (!seen.has(id)) {
          seen.add(id);
          covered.push(id);
        }
      }
    }
  }
  return covered;
}

/** Render-ready view of one question: identity, inclusion and number. */
export interface LetterQuestionView {
  key: string;
  text: string;
  table: LetterTable | null;
  included: boolean;
  /** Continuous 1..N over included questions across ALL groups; null when excluded. */
  number: number | null;
}

/** Render-ready view of one group: label "A"/"B"/... or null. */
export interface LetterGroupView {
  title: string;
  label: string | null;
  questions: LetterQuestionView[];
}

/**
 * Computes everything the renderer and the plain-text builder share:
 * numbering is continuous 1..N across groups counting INCLUDED questions
 * only; labels "A", "B", "C"... are assigned in order over groups that have
 * at least one included question (a fully-excluded group gets null and does
 * not consume a letter). The single unnamed legacy group (exactly one group
 * with title "") always gets label null, so old letters render headerless
 * exactly as today.
 */
export function letterGroupViews(
  letter: ComposedLetter,
  includedKeys: Set<string>,
): LetterGroupView[] {
  const legacyUnnamed =
    letter.groups.length === 1 && letter.groups[0].title === "";
  let number = 0;
  let labelIndex = 0;
  return letter.groups.map((group) => {
    const questions = group.questions.map((question) => {
      const key = questionKey(question);
      const included = includedKeys.has(key);
      return {
        key,
        text: question.text,
        table: question.table,
        included,
        number: included ? ++number : null,
      };
    });
    const hasIncluded = questions.some((question) => question.included);
    const label =
      hasIncluded && !legacyUnnamed
        ? String.fromCharCode(65 + labelIndex++)
        : null;
    return { title: group.title, label, questions };
  });
}

/** Regex that matches a polite-opener at the start of a question item. */
const POLITE_OPENER_RE = /^(could you|can you|please)\b/i;

/**
 * Returns "Could you please confirm:" when the included questions (flattened
 * across all groups) are v2-style direct clauses. Returns null for legacy
 * letters where strictly more than half of the included questions open with
 * their own polite phrase, and for an empty included set.
 */
export function letterLeadIn(
  letter: ComposedLetter,
  includedKeys: Set<string>,
): string | null {
  const included = letter.groups
    .flatMap((group) => group.questions)
    .filter((question) => includedKeys.has(questionKey(question)));
  if (included.length === 0) return null;
  const politeCount = included.filter((question) =>
    POLITE_OPENER_RE.test(question.text.trimStart()),
  ).length;
  // Majority = strictly more than half start with a polite opener => legacy.
  return politeCount > included.length / 2 ? null : "Could you please confirm:";
}

/**
 * Plain-text letter for "Copy letter". Header block, the intro emitted
 * verbatim (pre-line, skipped when blank), the optional collective lead-in,
 * then per group with at least one included question: an "A. Title" header
 * (only when the group has a label AND a non-empty title) and its included
 * questions numbered continuously across groups. A question's table follows
 * its text line as tab-separated lines (columns first, then one line per
 * row) so it pastes cleanly into Outlook and Word. Exactly one blank line
 * separates any two blocks; the output ends with exactly one trailing
 * newline, same convention as formatOpenQuestionsText.
 */
export function formatComposedLetterText(
  letter: ComposedLetter,
  includedKeys: Set<string>,
  meta: OpenQuestionExportMeta,
): string {
  const blocks: string[][] = [
    [
      `Questions for ${meta.taxpayerName} (FY ${meta.fiscalYear})`,
      `Recorded on ${meta.dateLong}`,
    ],
  ];

  const intro = letter.intro.trim();
  if (intro.length > 0) blocks.push(intro.split("\n"));

  const leadIn = letterLeadIn(letter, includedKeys);
  if (leadIn !== null) blocks.push([leadIn]);

  for (const group of letterGroupViews(letter, includedKeys)) {
    const included = group.questions.filter((question) => question.included);
    if (included.length === 0) continue;
    if (group.label !== null && group.title.trim().length > 0) {
      blocks.push([`${group.label}. ${group.title}`]);
    }
    for (const question of included) {
      const lines = [`${question.number}. ${question.text}`];
      if (question.table !== null) {
        lines.push(question.table.columns.join("\t"));
        for (const row of question.table.rows) lines.push(row.join("\t"));
      }
      blocks.push(lines);
    }
  }

  return `${blocks.map((block) => block.join("\n")).join("\n\n")}\n`;
}

/**
 * Versioned envelope for a persisted letter (localStorage, per session).
 * v3 stores includedKeys (question keys, see questionKey) instead of the
 * v1/v2 includedIds (register ids); for legacy single-id questions the two
 * are identical strings, so old envelopes migrate losslessly on decode.
 */
export interface StoredLetter {
  v: 3;
  letter: ComposedLetter;
  /** Question keys (question_ids joined with +) of the included questions. */
  includedKeys: string[];
  /** Off-path questions the advisor explicitly added to the letter. */
  addedQuestionIds: string[];
  composedAt: string;
}

/** localStorage key for a session's last composed letter. */
export function letterStorageKey(sessionId: string): string {
  return `client-letter:${sessionId}`;
}

/** Serializes the v3 envelope. composedAt should be an ISO timestamp. */
export function encodeStoredLetter(
  letter: ComposedLetter,
  includedKeys: string[],
  addedQuestionIds: string[],
  composedAt: string,
): string {
  const envelope: StoredLetter = {
    v: 3,
    letter,
    includedKeys,
    addedQuestionIds,
    composedAt,
  };
  return JSON.stringify(envelope);
}

/**
 * Parses a raw stored value back into the envelope, always returning the v3
 * shape. Fail-closed: null input, invalid JSON, a non-object, any other
 * version, a malformed letter, malformed key/id arrays or an unparseable
 * composedAt all return null (callers recompose instead of crashing).
 *
 * - v3: the letter must be NEW-shape (a v3 envelope carrying an old-shape
 *   letter is rejected); includedKeys and addedQuestionIds must be string
 *   arrays.
 * - v1/v2 (legacy letterStore.ts envelopes): the letter must be OLD-shape
 *   and is normalized; includedIds becomes includedKeys verbatim;
 *   addedQuestionIds is taken from the envelope on v2 (string array
 *   required) and is [] on v1.
 */
export function decodeStoredLetter(raw: string | null): StoredLetter | null {
  if (raw === null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const envelope = parsed as Record<string, unknown>;
  if (typeof envelope.composedAt !== "string") return null;
  if (Number.isNaN(new Date(envelope.composedAt).getTime())) return null;

  if (envelope.v === 3) {
    const letter = parseNewShapeLetter(envelope.letter);
    if (letter === null) return null;
    if (!isStringArray(envelope.includedKeys)) return null;
    if (!isStringArray(envelope.addedQuestionIds)) return null;
    return {
      v: 3,
      letter,
      includedKeys: envelope.includedKeys,
      addedQuestionIds: envelope.addedQuestionIds,
      composedAt: envelope.composedAt,
    };
  }

  if (envelope.v === 1 || envelope.v === 2) {
    const letter = parseOldShapeLetter(envelope.letter);
    if (letter === null) return null;
    if (!isStringArray(envelope.includedIds)) return null;
    let addedQuestionIds: string[] = [];
    if (envelope.v === 2) {
      if (!isStringArray(envelope.addedQuestionIds)) return null;
      addedQuestionIds = envelope.addedQuestionIds;
    }
    return {
      v: 3,
      letter,
      includedKeys: envelope.includedIds,
      addedQuestionIds,
      composedAt: envelope.composedAt,
    };
  }

  return null;
}

/**
 * The "Based on the worklist as of 11 June 2026, 14:32" line under the
 * letter. en-GB date plus a 24h clock, rendered in the viewer's local time.
 */
export function formatAsOfLine(composedAtIso: string): string {
  const date = new Date(composedAtIso);
  const day = date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const time = date.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return `Based on the worklist as of ${day}, ${time}`;
}
