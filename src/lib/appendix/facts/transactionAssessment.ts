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
// Untouched transactions fall back to a seed derived from the facts and the AI
// funnel flag, so the buckets an existing dossier already shows do not shift; the
// characteristics simply name why a flow needs assessment.
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
    reasonYes: 'cross-border flow', reasonTbd: 'cross-border status to be determined',
  },
  {
    key: 'hybridInstrument', label: 'Hybrid financial instrument', states: 'tri',
    hint: 'The instrument is treated differently (debt vs equity) across the two states.',
    reasonYes: 'hybrid financial instrument', reasonTbd: 'possible hybrid financial instrument',
  },
  {
    key: 'hybridEntityMismatch', label: 'Hybrid entity mismatch', states: 'quad',
    hint: 'A party is transparent in one state and non-transparent in the other.',
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

function hybridInstrumentSeed(crossBorder: TriState, aiRelevant: boolean, hybridEntity: QuadState): TriState {
  if (crossBorder === 'no') return 'no';
  // The AI flagged the flow but no entity-level reason fired: the open question is
  // the instrument itself, so name it rather than a vague "risk indicators present".
  if (aiRelevant && hybridEntity === 'no') return 'tbd';
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
  if (t.assessment?.hybridInstrument != null) return t.assessment.hybridInstrument;
  // The AI nudge that names the instrument as the open item only makes sense while
  // the entity question is still untouched. Once the advisor has answered the
  // hybrid-entity characteristic themselves (e.g. resolved it to "No"), do NOT
  // re-open the instrument in its place: that made clearing one category silently
  // re-flag the same flow under another reason, so the advisor's outcome looked
  // like it was ignored.
  const advisorSetEntity = t.assessment?.hybridEntityMismatch != null;
  return hybridInstrumentSeed(
    effCrossBorder(facts, t),
    isTransactionRelevant(t) && !advisorSetEntity,
    effHybridEntityMismatch(facts, t),
  );
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
// Derived status + reason
// ---------------------------------------------------------------------------

/** The status the characteristics imply, ignoring any override. */
export function deriveTxStatus(facts: AppendixFacts, t: TransactionItem): TxStatus {
  const open = TX_RISK_KEYS.some((k) => isOpenState(effCharacteristic(facts, t, k)));
  return open ? 'needs' : 'no_risk';
}

/** The status shown and used everywhere: the advisor's override, else the derived one. */
export function effTxStatus(facts: AppendixFacts, t: TransactionItem): TxStatus {
  return t.assessment?.statusOverride ?? deriveTxStatus(facts, t);
}

export function isTxStatusOverridden(t: TransactionItem): boolean {
  return t.assessment?.statusOverride != null;
}

/** True once the advisor has touched any characteristic, the rationale or the override. */
export function isTxAssessmentEdited(t: TransactionItem): boolean {
  const a = t.assessment;
  if (!a) return false;
  return a.statusOverride != null
    || (a.rationale != null && a.rationale.trim() !== '')
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
  // Overridden to "needs" with every category cleared: no derived clause to name.
  return 'flagged for assessment';
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

/**
 * The reason line carried into the memo, the print dossier and the accounted
 * grouping. Priority: the advisor's rationale, then an override reason, then, for
 * an untouched flow, the AI's original reason, then the derived clause.
 */
export function txMemoReason(facts: AppendixFacts, t: TransactionItem): string {
  const a = t.assessment;
  if (a?.rationale?.trim()) return a.rationale.trim();
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

/** Set one characteristic. */
export function withTxCharacteristic(
  facts: AppendixFacts, id: string, key: TxCharacteristicKey, value: QuadState,
): AppendixFacts {
  return patchTx(facts, id, (t) => withAssessment(t, { [key]: value }));
}

/** Set the free-text rationale (empty string clears it). */
export function withTxRationale(facts: AppendixFacts, id: string, text: string): AppendixFacts {
  const value = text.trim() === '' ? null : text;
  return patchTx(facts, id, (t) => withAssessment(t, { rationale: value }));
}

/** Set or clear the status override. A null status clears the override and its reason. */
export function withTxStatusOverride(
  facts: AppendixFacts, id: string, status: TxStatus | null, reason: string | null,
): AppendixFacts {
  return patchTx(facts, id, (t) =>
    withAssessment(t, { statusOverride: status, overrideReason: status ? reason : null }),
  );
}

/** Edit a descriptive field (parties, type, instrument). */
export function withTxField(
  facts: AppendixFacts, id: string,
  patch: Partial<Pick<TransactionItem, 'kind' | 'instrument' | 'fromEntityId' | 'toEntityId'>>,
): AppendixFacts {
  return patchTx(facts, id, (t) => ({ ...t, ...patch, source: 'edited' }));
}
