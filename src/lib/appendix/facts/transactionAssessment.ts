import type {
  AppendixFacts, FactEntity, TransactionItem,
  TransactionAssessment, TriState, QuadState, TxStatus,
} from '@/lib/appendix/types';
import { effJurisdiction } from './entityFields';
import { effLocalQualification, entityHasQualificationDifference } from './conclusions';

// ---------------------------------------------------------------------------
// The intra-group transaction assessment: five directly-editable characteristics
// drive the status, instead of an opaque relevant/not-relevant flag. Cross-border
// is context; the four mismatch categories are what fire ATAD2. Any category
// answered Yes or To be determined => "Needs assessment"; all cleared => "No risk
// identified". An advisor can override the derived status with a mandatory reason.
//
// Untouched transactions fall back to a seed derived from the facts. The AI
// funnel flag does not seed any specific category: it only keeps an untouched
// cross-border flow in "Needs assessment" as "not yet assessed", because the
// flag alone is no evidence for one mismatch category over another.
// ---------------------------------------------------------------------------

/** Whether a flow's raw AI funnel flag reads as relevant. Missing = relevant (old sessions / partial output). */
export function isTransactionRelevant(t: TransactionItem): boolean {
  return t.relevant !== false;
}

/** The four categories that actually drive the status (cross-border is only context). */
export type TxRiskKey =
  | 'hybridEntityMismatch' | 'hybridInstrument' | 'importedMismatch' | 'permanentEstablishment';
export type TxCharacteristicKey = 'crossBorder' | TxRiskKey;

/** Risk categories in the order they name the status reason (most specific first). */
export const TX_RISK_KEYS: TxRiskKey[] = [
  'hybridEntityMismatch', 'hybridInstrument', 'importedMismatch', 'permanentEstablishment',
];

interface CharacteristicMeta {
  key: TxCharacteristicKey;
  /** The label shown above the dropdown. */
  label: string;
  /** A one-line hint under the label. */
  hint: string;
  /** 'tri' = Yes/No/To be determined; 'quad' adds N/A. */
  states: 'tri' | 'quad';
  /** The clause naming the reason when the category is Yes / To be determined. */
  reasonYes: string;
  reasonTbd: string;
}

/** The characteristics in panel order. Cross-border first (context), then the drivers. */
export const TX_CHARACTERISTICS: CharacteristicMeta[] = [
  {
    key: 'crossBorder', label: 'Cross-border', states: 'tri',
    hint: 'The two parties sit in different jurisdictions.',
    reasonYes: 'cross-border transaction', reasonTbd: 'cross-border status to be determined',
  },
  {
    key: 'hybridInstrument', label: 'Hybrid financial instrument', states: 'tri',
    hint: 'The instrument is treated differently (debt vs equity) across the two jurisdictions.',
    reasonYes: 'hybrid financial instrument', reasonTbd: 'possible hybrid financial instrument',
  },
  {
    key: 'hybridEntityMismatch', label: 'Hybrid entity mismatch', states: 'quad',
    hint: 'A party is transparent in one jurisdiction and non-transparent in the other.',
    reasonYes: 'hybrid entity mismatch', reasonTbd: 'possible hybrid entity mismatch',
  },
  {
    key: 'importedMismatch', label: 'Imported mismatch', states: 'quad',
    hint: 'The payment funds a hybrid mismatch elsewhere in the group.',
    reasonYes: 'imported mismatch', reasonTbd: 'possible imported mismatch',
  },
  {
    key: 'permanentEstablishment', label: 'Permanent establishment mismatch', states: 'quad',
    hint: 'A disregarded or diverging permanent establishment (branch mismatch).',
    reasonYes: 'permanent establishment mismatch', reasonTbd: 'possible permanent establishment mismatch',
  },
];

const CHAR_BY_KEY = new Map(TX_CHARACTERISTICS.map((c) => [c.key, c]));

export interface StateOption { value: QuadState; label: string }
export const TRI_OPTIONS: StateOption[] = [
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
  { value: 'tbd', label: 'To be determined' },
];
export const QUAD_OPTIONS: StateOption[] = [...TRI_OPTIONS, { value: 'na', label: 'N/A' }];

export function stateOptions(key: TxCharacteristicKey): StateOption[] {
  return CHAR_BY_KEY.get(key)?.states === 'quad' ? QUAD_OPTIONS : TRI_OPTIONS;
}

export function stateLabel(v: QuadState): string {
  return v === 'yes' ? 'Yes' : v === 'no' ? 'No' : v === 'na' ? 'N/A' : 'To be determined';
}

/** An open category (Yes or To be determined) keeps the flow in "Needs assessment". */
export function isOpenState(v: QuadState): boolean {
  return v === 'yes' || v === 'tbd';
}

// ---------------------------------------------------------------------------
// Seeds: derived from the facts + the AI funnel flag when the advisor has not set
// the characteristic explicitly. They are built so an untouched flow reproduces
// its AI bucket, while naming the concrete reason.
// ---------------------------------------------------------------------------

function partiesOf(facts: AppendixFacts, t: TransactionItem): [FactEntity | undefined, FactEntity | undefined] {
  const from = facts.entities.find((e) => e.id === t.fromEntityId);
  const to = facts.entities.find((e) => e.id === t.toEntityId);
  return [from, to];
}

function crossBorderSeed(facts: AppendixFacts, t: TransactionItem): TriState {
  const [from, to] = partiesOf(facts, t);
  const fj = from ? effJurisdiction(from) : null;
  const tj = to ? effJurisdiction(to) : null;
  if (fj && tj) return fj.toUpperCase() !== tj.toUpperCase() ? 'yes' : 'no';
  return 'tbd';
}

function clsFor(facts: AppendixFacts, id: string) {
  return facts.classifications.find((c) => c.entityId === id);
}

/** A party carries a confirmed hybrid classification difference. */
function partyHasConfirmedMismatch(facts: AppendixFacts, e: FactEntity | undefined): boolean {
  return !!e && entityHasQualificationDifference(e, clsFor(facts, e.id));
}

/** A foreign party whose home-state classification is still unset (hybrid view unfinished). */
function partyLocalUndetermined(facts: AppendixFacts, e: FactEntity | undefined): boolean {
  if (!e) return false;
  if ((effJurisdiction(e) ?? '').toUpperCase() === 'NL') return false;
  return effLocalQualification(e, clsFor(facts, e.id)) === 'undetermined';
}

/** N/A when the flow is domestic (a mismatch needs a cross-border element), else No. */
function neutralQuad(crossBorder: TriState): QuadState {
  return crossBorder === 'no' ? 'na' : 'no';
}

function hybridEntityMismatchSeed(facts: AppendixFacts, t: TransactionItem, crossBorder: TriState): QuadState {
  if (crossBorder === 'no') return 'na';
  const [from, to] = partiesOf(facts, t);
  if (partyHasConfirmedMismatch(facts, from) || partyHasConfirmedMismatch(facts, to)) return 'yes';
  // Only an AI-relevant flow is nudged to "to be determined" on an unset foreign view;
  // a flow the AI cleared stays No so its bucket does not silently flip.
  if (isTransactionRelevant(t) && (partyLocalUndetermined(facts, from) || partyLocalUndetermined(facts, to))) return 'tbd';
  return 'no';
}

// ---------------------------------------------------------------------------
// Effective characteristic values: the advisor's edit wins; otherwise the seed.
// Downstream seeds read the effective upstream value, so setting Cross-border = No
// relaxes the mismatch categories to N/A until the advisor sets them.
// ---------------------------------------------------------------------------

export function effCrossBorder(facts: AppendixFacts, t: TransactionItem): TriState {
  return t.assessment?.crossBorder ?? crossBorderSeed(facts, t);
}

export function effHybridEntityMismatch(facts: AppendixFacts, t: TransactionItem): QuadState {
  return t.assessment?.hybridEntityMismatch ?? hybridEntityMismatchSeed(facts, t, effCrossBorder(facts, t));
}

export function effHybridInstrument(facts: AppendixFacts, t: TransactionItem): TriState {
  // No seed can point at the instrument: the AI funnel flag is not evidence of a
  // hybrid instrument (it only marks a cross-border related-party flow), so an
  // untouched flow reads "No" here and the flow-level flag carries the review duty.
  return t.assessment?.hybridInstrument ?? 'no';
}

export function effImportedMismatch(facts: AppendixFacts, t: TransactionItem): QuadState {
  return t.assessment?.importedMismatch ?? neutralQuad(effCrossBorder(facts, t));
}

export function effPermanentEstablishment(facts: AppendixFacts, t: TransactionItem): QuadState {
  return t.assessment?.permanentEstablishment ?? neutralQuad(effCrossBorder(facts, t));
}

/** The effective value of any characteristic by key. */
export function effCharacteristic(facts: AppendixFacts, t: TransactionItem, key: TxCharacteristicKey): QuadState {
  switch (key) {
    case 'crossBorder': return effCrossBorder(facts, t);
    case 'hybridInstrument': return effHybridInstrument(facts, t);
    case 'hybridEntityMismatch': return effHybridEntityMismatch(facts, t);
    case 'importedMismatch': return effImportedMismatch(facts, t);
    case 'permanentEstablishment': return effPermanentEstablishment(facts, t);
  }
}

// ---------------------------------------------------------------------------
// Per-characteristic reasoning: one sentence naming WHY the preliminary answer
// was reached, grounded on the facts (jurisdictions, classifications, instrument).
// Only a seeded (derived) value gets a sentence; once the advisor has set the
// characteristic themselves it is no longer preliminary, so nothing is shown and
// the free-text rationale carries their why.
// ---------------------------------------------------------------------------

function nameOrFallback(e: FactEntity | undefined): string {
  return e?.name?.trim() || 'the counterparty';
}

function listNames(ents: (FactEntity | undefined)[]): string {
  return ents.map(nameOrFallback).join(' and ');
}

function needsCrossBorder(what: string): string {
  return `${capitalise(what)} requires a cross-border element, which this domestic transaction lacks.`;
}

/**
 * The one-line explanation for a characteristic's PRELIMINARY value, mirroring
 * the seed logic branch by branch so the sentence never contradicts the shown
 * value. Returns null for an advisor-set characteristic.
 */
export function characteristicReason(
  facts: AppendixFacts, t: TransactionItem, key: TxCharacteristicKey,
): string | null {
  if (t.assessment?.[key] != null) return null;
  const [from, to] = partiesOf(facts, t);
  const fj = from ? effJurisdiction(from) : null;
  const tj = to ? effJurisdiction(to) : null;
  const cb = effCrossBorder(facts, t);
  const raw = t.instrument?.trim();
  const instrumentLabel = raw ? (/^(the|a|an)\s/i.test(raw) ? raw : `the ${raw}`) : 'the instrument';

  switch (key) {
    case 'crossBorder': {
      if (!fj || !tj) {
        const missing = [!fj ? from : undefined, !tj ? to : undefined].filter(Boolean) as FactEntity[];
        return `The jurisdiction of ${listNames(missing)} is unknown, so the cross-border status cannot be assessed yet.`;
      }
      return fj.toUpperCase() !== tj.toUpperCase()
        ? `${nameOrFallback(from)} is located in ${fj} and ${nameOrFallback(to)} in ${tj}, so the transaction crosses a border.`
        : `Both parties are located in ${fj}, so the transaction stays within one jurisdiction.`;
    }
    case 'hybridEntityMismatch': {
      if (cb === 'no') return needsCrossBorder('a hybrid entity mismatch');
      const confirmed = [from, to].filter((e) => partyHasConfirmedMismatch(facts, e));
      if (confirmed.length > 0) {
        return `${listNames(confirmed)} ${confirmed.length === 1 ? 'is' : 'are'} classified differently for Dutch purposes and in ${confirmed.length === 1 ? 'its' : 'their'} home jurisdiction.`;
      }
      const undetermined = [from, to].filter((e) => partyLocalUndetermined(facts, e));
      if (isTransactionRelevant(t) && undetermined.length > 0) {
        return `The home-jurisdiction classification of ${listNames(undetermined)} is not yet recorded, so a hybrid entity mismatch cannot be ruled out.`;
      }
      return 'Neither party shows a classification difference between the Netherlands and its home jurisdiction.';
    }
    case 'hybridInstrument': {
      if (cb === 'no') return needsCrossBorder('a hybrid instrument mismatch');
      return `There is no indication that ${instrumentLabel} is treated differently (debt versus equity) in the two jurisdictions.`;
    }
    case 'importedMismatch': {
      if (cb === 'no') return needsCrossBorder('an imported mismatch');
      return 'There is no indication that this payment funds a hybrid mismatch elsewhere in the group.';
    }
    case 'permanentEstablishment': {
      if (cb === 'no') return needsCrossBorder('a permanent establishment mismatch');
      return 'Neither party is recorded as acting through a permanent establishment for this transaction.';
    }
  }
}

// ---------------------------------------------------------------------------
// Derived status + reason
// ---------------------------------------------------------------------------

/**
 * True while the AI funnel flagged this cross-border flow and the advisor has not
 * answered any risk category yet. The flow then stays in "Needs assessment" as
 * simply "not yet assessed": the flag alone does not justify claiming a SPECIFIC
 * mismatch category. Once the advisor answers any risk category (or sets
 * cross-border to No), the characteristics rule.
 */
export function awaitingAssessment(facts: AppendixFacts, t: TransactionItem): boolean {
  if (!isTransactionRelevant(t)) return false;
  if (effCrossBorder(facts, t) === 'no') return false;
  return !TX_RISK_KEYS.some((k) => t.assessment?.[k] != null);
}

/** The status the characteristics imply, ignoring any override. */
export function deriveTxStatus(facts: AppendixFacts, t: TransactionItem): TxStatus {
  const open = TX_RISK_KEYS.some((k) => isOpenState(effCharacteristic(facts, t, k)));
  return open || awaitingAssessment(facts, t) ? 'needs' : 'no_risk';
}

/**
 * True when the ONLY thing keeping this flow in "Needs assessment" is that the
 * advisor has not looked at it yet: every preliminary answer clears its category,
 * and no override is in play. This is exactly the "not yet assessed" state, and
 * the moment a one-click accept makes sense; with any category actually open the
 * advisor has a real question to answer instead.
 */
export function canAcceptPreliminary(facts: AppendixFacts, t: TransactionItem): boolean {
  return effTxStatus(facts, t) === 'needs'
    && awaitingAssessment(facts, t)
    && !TX_RISK_KEYS.some((k) => isOpenState(effCharacteristic(facts, t, k)));
}

/** The status shown and used everywhere: the advisor's override, else the derived one. */
export function effTxStatus(facts: AppendixFacts, t: TransactionItem): TxStatus {
  return t.assessment?.statusOverride ?? deriveTxStatus(facts, t);
}

export function isTxStatusOverridden(t: TransactionItem): boolean {
  return t.assessment?.statusOverride != null;
}

/** True once the advisor has touched any characteristic, a rationale or the override. */
export function isTxAssessmentEdited(t: TransactionItem): boolean {
  const a = t.assessment;
  if (!a) return false;
  return a.statusOverride != null
    || (a.rationale != null && a.rationale.trim() !== '')
    || Object.values(a.lineRationales ?? {}).some((v) => v != null && v.trim() !== '')
    || a.crossBorder != null
    || TX_RISK_KEYS.some((k) => a[k] != null);
}

/**
 * The lowercase clause naming why a flow sits where it does: the first open risk
 * category for "needs", a fixed clause for "no risk". Used in the status pill.
 */
export function txStatusReason(facts: AppendixFacts, t: TransactionItem): string {
  if (effTxStatus(facts, t) === 'no_risk') return 'no hybrid element identified';
  for (const key of TX_RISK_KEYS) {
    const v = effCharacteristic(facts, t, key);
    if (isOpenState(v)) {
      const meta = CHAR_BY_KEY.get(key)!;
      return v === 'yes' ? meta.reasonYes : meta.reasonTbd;
    }
  }
  // No category is open: either the flow simply has not been assessed yet, or it
  // was overridden to "needs" with every category cleared.
  if (awaitingAssessment(facts, t)) return 'cross-border transaction, not yet assessed';
  return 'flagged for assessment';
}

/**
 * The compact risk label for the transaction list (dot + label in the RISK
 * column): the first open risk category, shortened. The full phrasing stays in
 * the detail panel. Null when the transaction carries no open risk.
 */
export function txRiskShortLabel(facts: AppendixFacts, t: TransactionItem): string | null {
  if (effTxStatus(facts, t) === 'no_risk') return null;
  for (const key of TX_RISK_KEYS) {
    if (isOpenState(effCharacteristic(facts, t, key))) {
      switch (key) {
        case 'hybridEntityMismatch': return 'hybrid entity';
        case 'hybridInstrument': return 'hybrid instrument';
        case 'importedMismatch': return 'imported mismatch';
        case 'permanentEstablishment': return 'PE mismatch';
      }
    }
  }
  // Not yet assessed, or overridden to "needs" with every category cleared.
  if (awaitingAssessment(facts, t)) return 'not yet assessed';
  return 'flagged';
}

/** "Needs assessment · possible hybrid financial instrument" / "No risk identified". */
export function txStatusLabel(facts: AppendixFacts, t: TransactionItem): string {
  return effTxStatus(facts, t) === 'needs'
    ? `Needs assessment · ${txStatusReason(facts, t)}`
    : 'No risk identified';
}

function capitalise(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

/** The advisor's documented rationale: the transaction-level note plus any
 *  per-line notes (labelled by their characteristic), joined into one line. */
function advisorRationaleLine(t: TransactionItem): string | null {
  const a = t.assessment;
  const parts: string[] = [];
  if (a?.rationale?.trim()) parts.push(a.rationale.trim());
  for (const meta of TX_CHARACTERISTICS) {
    const note = a?.lineRationales?.[meta.key]?.trim();
    if (note) parts.push(`${meta.label}: ${note}`);
  }
  return parts.length ? parts.join(' ') : null;
}

/**
 * The reason line carried into the memo, the print dossier and the accounted
 * grouping. Priority: the advisor's documented rationale (transaction-level
 * plus per-line notes), then an override reason, then, for an untouched
 * transaction, the AI's original reason, then the derived clause.
 */
export function txMemoReason(facts: AppendixFacts, t: TransactionItem): string {
  const a = t.assessment;
  const documented = advisorRationaleLine(t);
  if (documented) return documented;
  if (a?.statusOverride && a?.overrideReason?.trim()) return a.overrideReason.trim();
  if (!isTxAssessmentEdited(t) && t.relevanceReason?.trim()) return t.relevanceReason.trim();
  return effTxStatus(facts, t) === 'needs'
    ? capitalise(txStatusReason(facts, t))
    : 'No hybrid element identified';
}

// ---------------------------------------------------------------------------
// Buckets
// ---------------------------------------------------------------------------

export function transactionNeedsAssessment(facts: AppendixFacts, t: TransactionItem): boolean {
  return effTxStatus(facts, t) === 'needs';
}

export function needsAssessmentTransactions(facts: AppendixFacts): TransactionItem[] {
  return facts.transactions.filter((t) => transactionNeedsAssessment(facts, t));
}

export function noRiskTransactions(facts: AppendixFacts): TransactionItem[] {
  return facts.transactions.filter((t) => !transactionNeedsAssessment(facts, t));
}

// ---------------------------------------------------------------------------
// Immutable setters (every edit stamps the flow `source: 'edited'` so it survives
// regeneration via mergeFacts)
// ---------------------------------------------------------------------------

function patchTx(
  facts: AppendixFacts, id: string, fn: (t: TransactionItem) => TransactionItem,
): AppendixFacts {
  return { ...facts, transactions: facts.transactions.map((t) => (t.id === id ? fn(t) : t)) };
}

function withAssessment(t: TransactionItem, patch: Partial<TransactionAssessment>): TransactionItem {
  return { ...t, assessment: { ...t.assessment, ...patch }, source: 'edited' };
}

/**
 * Accept the preliminary answers as the advisor's own assessment: every
 * characteristic's current effective value is written into the assessment, so the
 * flow is advisor-set from here on. On a flow where every category clears (the
 * "not yet assessed" state) this moves it to "No risk identified" in one step.
 */
export function acceptPreliminaryAssessment(facts: AppendixFacts, id: string): AppendixFacts {
  return patchTx(facts, id, (t) => withAssessment(t, {
    crossBorder: effCrossBorder(facts, t),
    hybridInstrument: effHybridInstrument(facts, t),
    hybridEntityMismatch: effHybridEntityMismatch(facts, t),
    importedMismatch: effImportedMismatch(facts, t),
    permanentEstablishment: effPermanentEstablishment(facts, t),
  }));
}

/** Set one characteristic. */
export function withTxCharacteristic(
  facts: AppendixFacts, id: string, key: TxCharacteristicKey, value: QuadState,
): AppendixFacts {
  return patchTx(facts, id, (t) => withAssessment(t, { [key]: value }));
}

/** Set the free-text transaction-level rationale (empty string clears it). */
export function withTxRationale(facts: AppendixFacts, id: string, text: string): AppendixFacts {
  const value = text.trim() === '' ? null : text;
  return patchTx(facts, id, (t) => withAssessment(t, { rationale: value }));
}

/** Set or clear the rationale on one assessment line (empty string clears it). */
export function withTxLineRationale(
  facts: AppendixFacts, id: string, key: TxCharacteristicKey, text: string,
): AppendixFacts {
  const value = text.trim() === '' ? null : text.trim();
  return patchTx(facts, id, (t) => {
    const next = { ...t.assessment?.lineRationales };
    if (value == null) delete next[key];
    else next[key] = value;
    return withAssessment(t, { lineRationales: next });
  });
}

/** Set or clear the status override. A null status clears the override and its reason. */
export function withTxStatusOverride(
  facts: AppendixFacts, id: string, status: TxStatus | null, reason: string | null,
): AppendixFacts {
  return patchTx(facts, id, (t) =>
    withAssessment(t, { statusOverride: status, overrideReason: status ? reason : null }),
  );
}

/** Edit a descriptive field (parties, type, instrument). A party edit that would
 *  leave the same entity on both sides is refused (data-layer backstop). */
export function withTxField(
  facts: AppendixFacts, id: string,
  patch: Partial<Pick<TransactionItem, 'kind' | 'instrument' | 'fromEntityId' | 'toEntityId'>>,
): AppendixFacts {
  return patchTx(facts, id, (t) => {
    const next = { ...t, ...patch, source: 'edited' as const };
    if (next.fromEntityId === next.toEntityId) return t;
    return next;
  });
}
