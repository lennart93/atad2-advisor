import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import type { AppendixFacts, TransactionItem, QuadState } from '@/lib/appendix/types';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { deleteTransaction } from '@/lib/appendix/facts/transactionSet';
import {
  TX_CHARACTERISTICS, effCharacteristic, characteristicReason, withTxCharacteristic, withTxRationale, withTxLineRationale, withTxStatusOverride,
  withTxField, effTxStatus, isTxStatusOverridden, txMemoReason, isOpenState, stateOptions, stateLabel,
  canAcceptPreliminary, acceptPreliminaryAssessment,
  type TxCharacteristicKey,
} from '@/lib/appendix/facts/transactionAssessment';
import { isSelfTransaction } from '@/lib/appendix/facts/transactionSet';
import { shortTransactionType } from '@/lib/appendix/facts/transactionCategory';
import { effJurisdiction } from '@/lib/appendix/facts/entityFields';
import { FlagBanner, PanelGroup, KeyValueRow, ReasoningField, SegmentedControl } from './panelParts';

function nameOf(facts: AppendixFacts, id: string): string {
  return facts.entities.find((e) => e.id === id)?.name ?? id;
}

const charIsOpen = (key: TxCharacteristicKey, v: QuadState): boolean =>
  key === 'crossBorder' ? v === 'tbd' : isOpenState(v);

const STATUS_OPTIONS = [
  { value: null, label: 'Auto', tone: 'neutral' as const },
  { value: 'needs' as const, label: 'Needs assessment', tone: 'needs' as const },
  { value: 'no_risk' as const, label: 'No risk identified', tone: 'no_risk' as const },
];

const CHAR_INFO =
  'Cross-border is context (a precondition); the four mismatch categories are what make a transaction "needs assessment". Any category answered Yes or To be determined keeps the transaction flagged; all cleared yields "No risk identified".';

/** The detail-panel body for one transaction. Reuses the exact assessment logic and
 *  setters from the current inline editor, so behaviour and autosave are identical. */
export function TransactionDetail({ facts, tx, onChange }: {
  facts: AppendixFacts;
  tx: TransactionItem;
  onChange: (next: AppendixFacts) => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const needs = effTxStatus(facts, tx) === 'needs';
  const overridden = isTxStatusOverridden(tx);
  const activeOverride = tx.assessment?.statusOverride ?? null;
  const overrideReason = tx.assessment?.overrideReason ?? '';
  const from = facts.entities.find((e) => e.id === tx.fromEntityId);
  const to = facts.entities.find((e) => e.id === tx.toEntityId);
  const fromJur = from ? effJurisdiction(from) : null;
  const toJur = to ? effJurisdiction(to) : null;

  return (
    <div className="space-y-5">
      {/* Meta */}
      <p className="text-[13px] leading-snug text-muted-foreground">
        {nameOf(facts, tx.fromEntityId)}{fromJur ? ` (${fromJur})` : ''} → {nameOf(facts, tx.toEntityId)}{toJur ? ` (${toJur})` : ''}
        {tx.instrument ? ` · ${tx.instrument}` : ''}
      </p>

      {/* Invalid record: the same entity on both sides. The banner names the data
          issue and the select underneath fixes it in place (the setter refuses to
          store another self-transaction). Assessment only makes sense after the fix. */}
      {isSelfTransaction(tx) && (
        <>
          <FlagBanner>
            Invalid transaction: {nameOf(facts, tx.fromEntityId)} is listed on both sides. Set the correct counterparty below.
          </FlagBanner>
          <PanelGroup label="Correct counterparty">
            <Select onValueChange={(v) => onChange(withTxField(facts, tx.id, { toEntityId: v }))}>
              <SelectTrigger
                aria-label="Correct counterparty"
                className="h-9 w-auto min-w-[220px] gap-3 border-brand-terracotta bg-brand-terracotta-soft px-3 text-[14px] text-brand-terracotta-deep shadow-none [&>span]:!flex"
              >
                <SelectValue placeholder="Choose the receiving entity" />
              </SelectTrigger>
              <SelectContent>
                {facts.entities.filter((e) => e.id !== tx.fromEntityId).map((e) => (
                  <SelectItem key={e.id} value={e.id}>{e.id} · {e.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </PanelGroup>
        </>
      )}

      {needs && !isSelfTransaction(tx) && <FlagBanner>{txMemoReason(facts, tx)}</FlagBanner>}

      {/* Assessment */}
      <PanelGroup label="Assessment" info={CHAR_INFO}>
        {/* The answers below are seeded from the recorded facts, not advisor-set, so
            the flow reads "not yet assessed" even though every line shows a value.
            When every preliminary answer clears its category, one click adopts them
            as the advisor's assessment and the flow moves to "No risk identified". */}
        {canAcceptPreliminary(facts, tx) && (
          <div className="mb-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-[4px] bg-muted/60 px-3 py-2">
            <p className="text-[12px] leading-snug text-muted-foreground">
              These answers are preliminary, derived from the recorded facts. Adjust any of them, or confirm them as the assessment.
            </p>
            <button
              type="button"
              onClick={() => onChange(acceptPreliminaryAssessment(facts, tx.id))}
              className="rounded-[4px] bg-brand-sage-soft px-2.5 py-1.5 text-[12.5px] text-ds-green-text transition-colors hover:brightness-95"
            >
              Confirm assessment
            </button>
          </div>
        )}
        <div>
          {TX_CHARACTERISTICS.map((meta) => {
            const v = effCharacteristic(facts, tx, meta.key);
            const open = charIsOpen(meta.key, v);
            const why = characteristicReason(facts, tx, meta.key);
            return (
              <KeyValueRow
                key={meta.key}
                label={meta.label}
                attention={open}
                sub={
                  <>
                    {why && <p>{why}</p>}
                    {/* Per-line rationale: each answer carries its own documented
                        justification, which flows into the memo reason line. */}
                    <div className={why ? 'mt-1' : undefined}>
                      <ReasoningField
                        dense
                        value={tx.assessment?.lineRationales?.[meta.key] ?? null}
                        placeholder="e.g. Foreign classification not yet confirmed; requested from local advisor."
                        onCommit={(text) => onChange(withTxLineRationale(facts, tx.id, meta.key, text))}
                      />
                    </div>
                  </>
                }
              >
                <Select value={v} onValueChange={(nv) => onChange(withTxCharacteristic(facts, tx.id, meta.key, nv as QuadState))}>
                  <SelectTrigger
                    aria-label={meta.label}
                    className={cn(
                      'h-8 w-auto min-w-[140px] gap-2 border-border bg-card px-2.5 text-[13px] shadow-none [&>span]:!flex',
                      open && 'border-brand-terracotta bg-brand-terracotta-soft text-brand-terracotta-deep',
                    )}
                  >
                    <SelectValue>{stateLabel(v)}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {stateOptions(meta.key).map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </KeyValueRow>
            );
          })}
        </div>
      </PanelGroup>

      {/* Transaction-level rationale: legacy only. Documentation now lives on the
          per-line "Add rationale" under each characteristic; a floating group with
          its own duplicate "Add rationale" read as belonging to nothing. It still
          renders when an earlier dossier stored an overall rationale, so that text
          stays visible and editable (clearing it removes the group for good). */}
      {!!tx.assessment?.rationale?.trim() && (
        <PanelGroup label="Rationale">
          <ReasoningField
            value={tx.assessment.rationale}
            placeholder="e.g. Foreign classification of D.R.C. S.A. not yet confirmed; requested from local advisor."
            onCommit={(text) => onChange(withTxRationale(facts, tx.id, text))}
          />
          <p className="mt-1.5 text-[11.5px] leading-snug text-muted-foreground/70">
            Documented rationale is included in the memo and working paper.
          </p>
        </PanelGroup>
      )}

      {/* Status */}
      <PanelGroup label="Status">
        <SegmentedControl
          options={STATUS_OPTIONS}
          value={activeOverride}
          onChange={(v) => onChange(withTxStatusOverride(facts, tx.id, v, v ? overrideReason : null))}
        />
        {overridden && (
          <input
            value={overrideReason}
            aria-label="Reason for setting the status manually"
            placeholder="Reason for setting the status manually (required)"
            onChange={(e) => onChange(withTxStatusOverride(facts, tx.id, activeOverride!, e.target.value))}
            className={cn(
              'mt-2 h-9 w-full rounded-md border bg-card px-3 text-[13px] text-foreground outline-none placeholder:text-muted-foreground/60',
              overrideReason.trim() ? 'border-border' : 'border-brand-warning/60',
            )}
          />
        )}
      </PanelGroup>

      {/* Delete removes the transaction outright. An AI-identified flow leaves a
          tombstone (removedTxKeys) so a later regeneration does not resurrect it.
          Two-step to avoid an accidental loss; the panel closes as it disappears. */}
      <div className="flex justify-end border-t border-border pt-4">
        {confirmDelete ? (
            <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => onChange(deleteTransaction(facts, tx.id))}
              className="inline-flex items-center gap-1.5 rounded-[4px] border border-brand-terracotta bg-brand-terracotta-soft px-2.5 py-1.5 text-[12.5px] text-brand-terracotta-deep transition-colors hover:brightness-95"
            >
              <Trash2 className="h-3.5 w-3.5" /> Confirm delete
            </button>
            <button
              type="button"
              onClick={() => setConfirmDelete(false)}
              className="rounded-[4px] px-2.5 py-1.5 text-[12.5px] text-muted-foreground transition-colors hover:text-foreground"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            title="Delete this transaction from the assessment"
            className="inline-flex items-center gap-1.5 rounded-[4px] border border-border px-2.5 py-1.5 text-[12.5px] text-muted-foreground transition-colors hover:border-brand-terracotta hover:text-brand-terracotta-deep"
          >
            <Trash2 className="h-3.5 w-3.5" /> Delete transaction
          </button>
        )}
      </div>
    </div>
  );
}

/** The panel eyebrow + title for a selected transaction. */
export function transactionPanelHeading(facts: AppendixFacts, tx: TransactionItem) {
  return {
    eyebrow: `${tx.id} · ${shortTransactionType(tx.kind)}`,
    title: `${nameOf(facts, tx.fromEntityId)} → ${nameOf(facts, tx.toEntityId)}`,
  };
}
