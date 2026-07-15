import type {
  AppendixFacts, AppendixRow, ClassificationItem, FactEntity,
  ActingTogetherCluster, TransactionItem, Status,
} from './types';
import { effJurisdiction } from './facts/entityFields';
import { isForeignHomeStateOpen } from './facts/conclusions';
import { transactionNeedsAssessment } from './facts/transactionAssessment';
import { isSelfTransaction } from './facts/transactionSet';
import { actingTogetherCandidateCount } from './facts/actingCandidates';
import { actingInClientReport } from './facts/actingAnnex';
import { controlTypeFor, appendixMootRowIds } from './controlType';
import { rowTone } from './conditionPolarity';

/**
 * The single "needsAttention" model the V2 appendix reads for hierarchy: one
 * derived flag per row type. Items that need the reviewer's judgment stay visible;
 * everything else is routine and rolls up. Every predicate wraps an existing
 * helper, so the split matches exactly what the current UI already computes, it is
 * just gathered in one place (spec §3).
 */

// ---------------------------------------------------------------------------
// Transactions
// ---------------------------------------------------------------------------

/**
 * A transaction needs attention when its assessment lands it in "Needs assessment"
 * (a risk category open, or an advisor override), or when the record itself is
 * invalid (the same entity on both sides): a data issue stays visible until the
 * counterparty is corrected, it never rolls up as routine.
 */
export function txNeedsAttention(facts: AppendixFacts, t: TransactionItem): boolean {
  return isSelfTransaction(t) || transactionNeedsAssessment(facts, t);
}

export interface TransactionSplit {
  flagged: TransactionItem[];
  routine: TransactionItem[];
}

export function splitTransactions(facts: AppendixFacts): TransactionSplit {
  return {
    flagged: facts.transactions.filter((t) => txNeedsAttention(facts, t)),
    routine: facts.transactions.filter((t) => !txNeedsAttention(facts, t)),
  };
}

// ---------------------------------------------------------------------------
// Entities
// ---------------------------------------------------------------------------

/**
 * An entity needs attention when a required field is still owed: a missing
 * jurisdiction, or an open home-state classification (foreign entity with no
 * stored/defaulted view). Mirrors the inline "Set home-state classification"
 * prompt + the step's home-state gate (conclusions.ts).
 */
export function entityNeedsAttention(
  e: FactEntity,
  cls: ClassificationItem | undefined,
): boolean {
  if (e.role === 'Taxpayer' || e.memberOfUnityId) return false;
  if (e.edits?.relevanceOverride === 'out') return false;
  if (!effJurisdiction(e)) return true;
  return isForeignHomeStateOpen(e, cls);
}

/** classifications keyed by entity id, for the per-entity predicate. */
export function classificationsById(facts: AppendixFacts): Map<string, ClassificationItem> {
  return new Map(facts.classifications.map((c) => [c.entityId, c]));
}

// ---------------------------------------------------------------------------
// Acting-together groups
// ---------------------------------------------------------------------------

/**
 * A grouping needs attention when it is a non-binding AI suggestion the advisor
 * has not yet adopted or dismissed. A built (manual) group is settled.
 */
export function groupNeedsAttention(a: ActingTogetherCluster): boolean {
  return a.origin !== 'manual';
}

/**
 * The whole acting-together section needs attention when there is a suggestion to
 * act on, or when related shareholders are present but no group has been built.
 */
export function actingSectionNeedsAttention(facts: AppendixFacts): boolean {
  const hasHint = facts.actingTogether.some(groupNeedsAttention);
  const hasManual = facts.actingTogether.some((a) => a.origin === 'manual');
  const candidates = actingTogetherCandidateCount(facts.entities) >= 2;
  return hasHint || (!hasManual && candidates);
}

/** The groups that surface in the client report (the digest's "N groups"). */
export function clientGroupCount(facts: AppendixFacts): number {
  return facts.actingTogether.filter(actingInClientReport).length;
}

// ---------------------------------------------------------------------------
// Conditions (Part B)
// ---------------------------------------------------------------------------

/**
 * A condition needs attention when the model returned no grounded answer
 * (ungrounded), or it is a substantive tested condition whose outcome is a fired
 * risk or a missing fact. Gates, clean tests and N/A rows are routine. This is the
 * exact rule the current AppendixTable uses to auto-expand findings, plus ungrounded.
 */
export function conditionNeedsAttention(
  row: AppendixRow,
  mootSet: ReadonlySet<string>,
): boolean {
  if (row.ungrounded) return true;
  if (controlTypeFor(row, mootSet) !== 'status') return false;
  const tone = rowTone(row.status, row.rowId);
  return tone === 'risk' || tone === 'caution';
}

// ---------------------------------------------------------------------------
// Digests
// ---------------------------------------------------------------------------

export interface PartADigest {
  entities: number;
  groups: number;
  transactions: number;
  /** Total flagged rows across the three sections. */
  needReview: number;
}

export function partADigest(facts: AppendixFacts): PartADigest {
  const cls = classificationsById(facts);
  const entitiesFlagged = facts.entities.filter((e) => entityNeedsAttention(e, cls.get(e.id))).length;
  const groupsFlagged = actingSectionNeedsAttention(facts) ? 1 : 0;
  const txFlagged = facts.transactions.filter((t) => txNeedsAttention(facts, t)).length;
  return {
    entities: facts.entities.length,
    groups: clientGroupCount(facts),
    transactions: facts.transactions.length,
    needReview: entitiesFlagged + groupsFlagged + txFlagged,
  };
}

export interface PartBDigest {
  conditions: number;
  needReview: number;
}

export function partBDigest(rows: AppendixRow[]): PartBDigest {
  const mootSet = appendixMootRowIds(rows.map((r) => ({ rowId: r.rowId, status: r.status })));
  return {
    conditions: rows.length,
    needReview: rows.filter((r) => conditionNeedsAttention(r, mootSet)).length,
  };
}

/** The worst status inside a set of condition rows, for a Part B section header. */
export function sectionWorstStatus(rows: AppendixRow[], mootSet: ReadonlySet<string>): Status | null {
  let worst: Status | null = null;
  const rank = (s: Status | null): number =>
    s === 'Triggered' ? 3 : s === 'Insufficient information' ? 2 : s === 'Not triggered' ? 1 : 0;
  for (const r of rows) {
    if (r.ungrounded) return 'Insufficient information';
    if (controlTypeFor(r, mootSet) !== 'status') continue;
    if (rank(r.status) > rank(worst)) worst = r.status;
  }
  return worst;
}
