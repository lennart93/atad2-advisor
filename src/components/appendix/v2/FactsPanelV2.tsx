import { useMemo, type ReactNode } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AppendixFacts, FactEntity, TransactionItem } from '@/lib/appendix/types';
import {
  partADigest, splitTransactions, txNeedsAttention,
  classificationsById, entityNeedsAttention, actingSectionNeedsAttention,
} from '@/lib/appendix/needsAttention';
import { txStatusReason } from '@/lib/appendix/facts/transactionAssessment';
import { shortTransactionType } from '@/lib/appendix/facts/transactionCategory';
import { effJurisdiction } from '@/lib/appendix/facts/entityFields';
import { JurisFlagCode } from './JurisFlagCode';
import { actingTogetherCandidateCount } from '@/lib/appendix/facts/actingCandidates';
import { ManualGroupCard } from '@/components/appendix/ActingTogetherSection';
import { SectionRow } from './SectionRow';
import { RolledUpGroup } from './RolledUpGroup';
import { AppendixRowItem } from './AppendixRowItem';
import { DetailPanel } from './DetailPanel';
import { TransactionDetail, transactionPanelHeading } from './TransactionDetail';
import { AddTransactionForm } from './AddTransactionForm';
import { EntityRegisterSection } from './EntityRegisterSection';
import { EntityDetail, entityPanelHeading } from './EntityDetail';
import { ActingTogetherSectionV2 } from './ActingTogetherSectionV2';
import { useAppendixSelection, useRowListKeyNav, useSectionOpenState } from './hooks';

interface Props {
  facts: AppendixFacts;
  onChange?: (next: AppendixFacts) => void;
  generated?: boolean;
  refining?: boolean;
  sessionId?: string;
}

function withTxExcluded(facts: AppendixFacts, id: string, excluded: boolean): AppendixFacts {
  return { ...facts, transactions: facts.transactions.map((t) => (t.id === id ? { ...t, excludedFromClient: excluded } : t)) };
}
function nameOf(facts: AppendixFacts, id: string): string {
  return facts.entities.find((e) => e.id === id)?.name ?? id;
}
function jurOf(facts: AppendixFacts, id: string): string | null {
  const e = facts.entities.find((x) => x.id === id);
  return e ? effJurisdiction(e) : null;
}
/** "Name 🇳🇱 NL", with the register's Unknown treatment when the jurisdiction is missing. */
function PartyWithJurisdiction({ facts, id }: { facts: AppendixFacts; id: string }) {
  return (
    <>
      {nameOf(facts, id)}
      <JurisFlagCode iso={jurOf(facts, id)} className="mx-1.5 align-[-1px]" />
    </>
  );
}

const REGISTER_INFO =
  'The taxpayer, its related parties and the other group entities the assessment relied on, built from the group structure. Click a row to review or refine its jurisdiction, classification and relationship.';
const ACTING_INFO =
  'For ATAD2, a shareholder is associated from 25%. Separate holders that act together count as one group, so small stakes can cross the line together. Define any groups that act together in the meaning of the law.';
const TX_SECTION_INFO =
  'Intra-group flows tested for ATAD2. A flow with an open risk category needs assessment; the rest are recorded as no risk for completeness.';

/**
 * The appendix-V2 shell for Part A (spec §4-§5). Page digest + a page-level
 * master-detail grid: all three sections (register, acting-together, transactions)
 * as resting-state lists on the left, one sticky detail rail on the right. Selection
 * is resolved by id to an entity, a group or a transaction and rendered in the panel.
 */
export function FactsPanelV2({ facts, onChange, generated, refining, sessionId }: Props) {
  const editable = !!onChange;
  const change = onChange ?? (() => { /* read-only fallback */ });

  const digest = useMemo(() => partADigest(facts), [facts]);
  const { flagged, routine } = useMemo(() => splitTransactions(facts), [facts]);
  const clsById = useMemo(() => classificationsById(facts), [facts]);
  const { selectedId, select, close } = useAppendixSelection();
  const onListKeyDown = useRowListKeyNav();

  const isTaxpayerSide = (e: FactEntity) => e.role === 'Taxpayer' || !!e.memberOfUnityId || !!e.inTaxpayerFiscalUnity;
  const taxpayerCount = facts.entities.filter(isTaxpayerSide).length;
  const relatedCount = facts.entities.filter((e) => !isTaxpayerSide(e) && (e.related || !!e.shareholderOfTaxpayer)).length;
  const entityReview = facts.entities.filter((e) => entityNeedsAttention(e, clsById.get(e.id))).length;
  const txReview = flagged.length;

  const manualGroups = facts.actingTogether.filter((c) => c.origin === 'manual');
  const hints = facts.actingTogether.filter((c) => c.origin !== 'manual');
  const actingReview = hints.length + (manualGroups.length === 0 && actingTogetherCandidateCount(facts.entities) >= 2 ? 1 : 0);

  const sectionState = useSectionOpenState(sessionId, {
    register: entityReview > 0,
    acting: actingSectionNeedsAttention(facts),
    transactions: txReview > 0,
  });

  const selectedTx = facts.transactions.find((t) => t.id === selectedId) ?? null;
  const selectedEntity = !selectedTx ? (facts.entities.find((e) => e.id === selectedId) ?? null) : null;
  const selectedGroup = !selectedTx && !selectedEntity ? (facts.actingTogether.find((c) => c.id === selectedId) ?? null) : null;
  const panelOpen = !!(selectedTx || selectedEntity || selectedGroup);

  const renderTxRow = (t: TransactionItem, routineRow: boolean) => (
    <AppendixRowItem
      key={t.id}
      rowId={t.id}
      domId={`v2-tx-${t.id}`}
      label={
        <span>
          <PartyWithJurisdiction facts={facts} id={t.fromEntityId} />
          {'→ '}
          <PartyWithJurisdiction facts={facts} id={t.toEntityId} />
          {t.manual && <span className="ml-1.5 rounded-sm bg-muted px-1 text-[10px] text-muted-foreground">added</span>}
        </span>
      }
      meta={shortTransactionType(t.kind)}
      reason={txNeedsAttention(facts, t) ? txStatusReason(facts, t) : null}
      selected={selectedId === t.id}
      routine={routineRow}
      onSelect={() => select(t.id)}
      eye={editable ? {
        hidden: !!t.excludedFromClient,
        onToggle: () => change(withTxExcluded(facts, t.id, !t.excludedFromClient)),
        label: t.excludedFromClient ? `Show ${t.id} in the client report` : `Hide ${t.id} from the client report`,
      } : null}
    />
  );

  // Panel content resolved from the current selection.
  let heading: { eyebrow?: ReactNode; title?: ReactNode } = {};
  let panelBody: ReactNode = null;
  let headerRight: ReactNode = undefined;
  if (selectedTx) {
    heading = transactionPanelHeading(facts, selectedTx);
    panelBody = <TransactionDetail facts={facts} tx={selectedTx} onChange={change} />;
    if (editable) {
      headerRight = (
        <button
          type="button"
          aria-label={selectedTx.excludedFromClient ? 'Show in the client report' : 'Hide from the client report'}
          onClick={() => change(withTxExcluded(facts, selectedTx.id, !selectedTx.excludedFromClient))}
          className={cn('mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[4px] transition-colors',
            selectedTx.excludedFromClient ? 'text-muted-foreground hover:bg-muted hover:text-foreground' : 'text-brand-sage-deep hover:bg-brand-sage-soft')}
        >
          {selectedTx.excludedFromClient ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      );
    }
  } else if (selectedEntity) {
    heading = entityPanelHeading(selectedEntity);
    panelBody = <EntityDetail key={selectedEntity.id} facts={facts} entity={selectedEntity} classification={clsById.get(selectedEntity.id)} onChange={change} />;
  } else if (selectedGroup) {
    heading = {
      eyebrow: 'Acting together',
      title: selectedGroup.name?.trim() || selectedGroup.memberEntityIds.map((id) => nameOf(facts, id)).join(' + '),
    };
    panelBody = <ManualGroupCard key={selectedGroup.id} facts={facts} cluster={selectedGroup} editable={editable} onChange={change} bare />;
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="min-w-0 space-y-4">
          {/* Section 1 — The group and the taxpayer. */}
          <SectionRow
            id="v2-section-register"
            index={1}
            title="The group and the taxpayer"
            summary={`${taxpayerCount} taxpayer · ${relatedCount} related`}
            needReview={entityReview}
            info={REGISTER_INFO}
            open={sectionState.isOpen('register')}
            onToggle={() => sectionState.setOpen('register', !sectionState.isOpen('register'))}
          >
            {/* Arrow-key delegation for the focusable rows inside; not interactive itself. */}
            {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions */}
            <div onKeyDown={onListKeyDown}>
              <EntityRegisterSection facts={facts} onChange={onChange} selectedId={selectedId} onSelect={select} />
            </div>
          </SectionRow>

          {/* Section 2 — Acting together. */}
          <SectionRow
            id="v2-section-acting"
            index={2}
            title="Acting together"
            summary={manualGroups.length > 0 ? `${manualGroups.length} ${manualGroups.length === 1 ? 'group' : 'groups'}` : 'no groups'}
            needReview={actingReview}
            info={ACTING_INFO}
            open={sectionState.isOpen('acting')}
            onToggle={() => sectionState.setOpen('acting', !sectionState.isOpen('acting'))}
          >
            {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions -- arrow-key delegation */}
            <div onKeyDown={onListKeyDown}>
              <ActingTogetherSectionV2 facts={facts} onChange={onChange} selectedId={selectedId} onSelect={select} />
            </div>
          </SectionRow>

          {/* Section 3 — Intra-group transactions. */}
          <SectionRow
            id="v2-section-transactions"
            index={3}
            title="Intra-group transactions"
            summary={`${digest.transactions} total`}
            needReview={txReview}
            info={TX_SECTION_INFO}
            open={sectionState.isOpen('transactions')}
            onToggle={() => sectionState.setOpen('transactions', !sectionState.isOpen('transactions'))}
          >
            {facts.transactions.length === 0 ? (
              <p className="text-[13px] text-muted-foreground">
                {generated ? 'No intra-group transactions identified.' : 'Not generated yet.'}
              </p>
            ) : (
              // eslint-disable-next-line jsx-a11y/no-static-element-interactions -- arrow-key delegation
              <div onKeyDown={onListKeyDown}>
                {flagged.map((t) => renderTxRow(t, false))}
                {routine.length > 0 && (
                  <RolledUpGroup summary={`${routine.length} ${routine.length === 1 ? 'transaction' : 'transactions'} · no risk identified`}>
                    {routine.map((t) => renderTxRow(t, true))}
                  </RolledUpGroup>
                )}
              </div>
            )}
            {editable && (
              <div className="mt-4">
                <AddTransactionForm facts={facts} onChange={change} onCreated={select} />
              </div>
            )}
          </SectionRow>
        </div>

        <DetailPanel open={panelOpen} onClose={close} eyebrow={heading.eyebrow} title={heading.title} headerRight={headerRight}>
          {panelBody}
        </DetailPanel>
      </div>
    </div>
  );
}
