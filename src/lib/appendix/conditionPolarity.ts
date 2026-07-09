import type { Status } from './types';

export type ConditionPolarity = 'risk_if_met' | 'risk_if_not_met' | 'neutral';

/**
 * Per-condition risk polarity: where does the FAVOURABLE (no-risk) outcome sit?
 *
 *   'risk_if_met'     - the condition being met signals risk (a mismatch arises,
 *                       a structured arrangement exists, the secondary rule bites).
 *   'risk_if_not_met' - the condition NOT being met signals risk (no dual-inclusion
 *                       income to absorb a double deduction; an exception that does
 *                       not apply; a mismatch not already neutralised).
 *   'neutral'         - a scope/precondition that is neither favourable nor
 *                       unfavourable on its own (in scope, related party, dual
 *                       residence, carry-forward timing).
 *
 * Keyed by the stable skeleton rowId. DRAFT, pending tax review: the colour an
 * advisor sees is driven by this map, so the polarities below should be checked
 * by a tax specialist before this is treated as authoritative.
 */
export const CONDITION_POLARITY: Record<string, ConditionPolarity> = {
  '1.1': 'neutral',
  '1.2': 'neutral',
  '2.1': 'neutral',
  '2.2': 'risk_if_met',
  '2.3': 'risk_if_not_met',
  '3.1': 'risk_if_met',
  '3.2': 'risk_if_met',
  '3.3': 'risk_if_met',
  '3.4': 'risk_if_met',
  '3.5': 'risk_if_met',
  '3.6': 'risk_if_met',
  '3.7': 'risk_if_met',
  '3.8': 'neutral',
  '3.9': 'risk_if_met',
  '3.10': 'risk_if_met',
  '3.11': 'risk_if_met',
  '4.1': 'risk_if_met',
  '5.1': 'neutral',
  '5.2': 'risk_if_met',
  '5.3': 'risk_if_not_met',
  '5.4': 'neutral',
  '6.1': 'neutral',
  '6.2': 'risk_if_met',
  '6.3': 'risk_if_met',
  '6.4': 'risk_if_met',
  '6.5': 'risk_if_not_met',
  '7.1': 'neutral',
  '7.2': 'neutral',
  '8.1': 'risk_if_met',
  '8.2': 'risk_if_met',
  '8.3': 'risk_if_not_met',
};

export type RiskLevel = 'favourable' | 'unfavourable' | 'insufficient' | 'neutral';

/**
 * The per-row risk level that drives the status colour, separate from the raw
 * met/not-met label. Conditions with no polarity recorded default to risk_if_met
 * (the common case: the condition being met is the risk signal).
 */
export function conditionRiskLevel(status: Status | null, rowId: string): RiskLevel {
  if (status === 'Insufficient information') return 'insufficient';
  if (!status) return 'neutral';
  const polarity = CONDITION_POLARITY[rowId] ?? 'risk_if_met';
  if (polarity === 'neutral') return 'neutral';
  const favourable = polarity === 'risk_if_met' ? status === 'Not triggered' : status === 'Triggered';
  return favourable ? 'favourable' : 'unfavourable';
}

/**
 * The presentation tone for a row: the single signal that drives the icon and the
 * colour on the screen, in the Word memo and in the print/export, so the three can
 * never disagree.
 *   'risk'    - a real risk signal fired (amber, the ATAD2 finding colour).
 *   'caution' - reachable but the facts needed are missing (slate-blue, Insufficient information).
 *   'clear'   - resolved with no risk: a clean mismatch test, or a satisfied
 *               scope/precondition. Neutral grey, routine, never an alarm.
 *   'na'      - does not apply (neutral grey, a touch lighter).
 *
 * Scope/precondition rows (1.1 in scope, 1.2 cross-border, 2.1 related party, ...)
 * are 'neutral' in the polarity map, so they read 'clear' even when met: being in
 * scope or having a related party is the normal baseline, not a problem. Substantive
 * conditions stay status-driven, so only the scope rows lose their amber alarm.
 */
export type RowTone = 'risk' | 'caution' | 'clear' | 'na';

export function rowTone(status: Status | null, rowId: string): RowTone {
  if (status === 'N/A') return 'na';
  if (status === 'Insufficient information') return 'caution';
  if (conditionRiskLevel(status, rowId) === 'neutral') return 'clear';
  return status === 'Triggered' ? 'risk' : 'clear';
}
