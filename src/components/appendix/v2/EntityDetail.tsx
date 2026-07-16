import { useState } from 'react';
import { Plus, Trash2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AppendixFacts, ClassificationItem, FactEntity } from '@/lib/appendix/types';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { JurisdictionPicker } from '@/components/structure/JurisdictionPicker';
import {
  effJurisdiction, effNlTaxStatus, effNlQualification, effRelationType, effRelatedPct,
  effRelationReason, effNlReason, effLocalReason, withEntityEdit,
} from '@/lib/appendix/facts/entityFields';
import { nlQualificationLabel, nlTaxStatusLabel, NL_CLASSIFICATION_OPTIONS } from '@/lib/appendix/facts/nlTaxStatus';
import { withLocalQualification, withForeignClassificationState, clearForeignClassification } from '@/lib/appendix/facts/classificationEdit';
import { effRelevanceOverride, setEntityRelated, deleteEntity } from '@/lib/appendix/facts/entitySet';
import {
  effLocalQualification, displayLocalQualification, entityHasQualificationDifference,
  dutchForeignClassification, homeStateDerivedBasis, isForeignHomeStateOpen,
} from '@/lib/appendix/facts/conclusions';
import { roleLabel } from '@/lib/appendix/facts/roleLabel';
import { PanelGroup, ReasoningField } from './panelParts';

const RELATION_TYPES = ['Subsidiary', 'Parent', 'Sister company', 'Associate', 'Branch / PE', 'Other', 'Unrelated'] as const;
const NA = '–';

const SELECT_CLS = 'h-9 w-auto min-w-[176px] gap-3 border-border bg-card px-3 text-[14px] text-foreground shadow-none [&>span]:!flex';
// One rule for every classification select: the accent "attention" treatment fires
// if and only if the value is still "To be determined" (matches the transaction
// panel's open-category styling); a resolved select is always neutral.
const SELECT_ATTENTION = 'border-brand-terracotta bg-brand-terracotta-soft text-brand-terracotta-deep';
// The jurisdiction picker's facts variant ships a permanent terracotta ring (its
// table-cell context); inside the panel it follows the same attention rule as the
// classification selects: neutral once filled, accent only while empty.
const JUR_PICKER_CLS = 'h-9 rounded-md bg-card px-3 text-[14px] ring-0 hover:bg-card';
const jurPickerCls = (filled: boolean) =>
  cn(JUR_PICKER_CLS, filled ? 'border-border' : SELECT_ATTENTION);

function pct(n: number | null): string {
  return n == null ? NA : `${Number.isInteger(n) ? n : n.toFixed(2)}%`;
}

function parsePct(raw: string): number | null | undefined {
  const t = raw.trim();
  if (t === '') return null;
  const n = Number(t.replace(',', '.'));
  return Number.isFinite(n) ? n : undefined;
}

/** The numeric interest editor; commits every committable keystroke so the row's Related % stays live. */
function PctInput({ value, onCommit }: { value: number | null; onCommit: (n: number | null) => void }) {
  const [draft, setDraft] = useState(value == null ? '' : String(value));
  const [seen, setSeen] = useState(value);
  if (value !== seen) {
    setSeen(value);
    if (parsePct(draft) !== value) setDraft(value == null ? '' : String(value));
  }
  return (
    <input
      value={draft}
      inputMode="decimal"
      aria-label="Direct interest percentage"
      onChange={(e) => { setDraft(e.target.value); const n = parsePct(e.target.value); if (n !== undefined) onCommit(n); }}
      className="w-14 rounded-md border border-border bg-card px-2 py-1.5 text-right text-[14px] tabular-nums text-foreground outline-none focus-visible:border-brand-terracotta focus-visible:shadow-[0_0_0_3px_rgba(194,92,60,0.12)]"
    />
  );
}

function ClassSelect({ value, onPick, id }: {
  value: string; id?: string; onPick: (qual: string) => void;
}) {
  return (
    <Select value={value} onValueChange={onPick}>
      <SelectTrigger id={id} aria-label="Classification" className={cn(SELECT_CLS, value === 'undetermined' && SELECT_ATTENTION)}>
        <SelectValue>{nlQualificationLabel(value as never)}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {NL_CLASSIFICATION_OPTIONS.map((o) => <SelectItem key={o.qual} value={o.qual}>{o.label}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

/**
 * The detail-panel body for one register entity (spec §5). The relation line, the
 * NL and home-state classification stacks, the optional foreign classification, and
 * the visibility + relevance controls, all reusing the existing field setters so
 * behaviour and autosave match the old inline editor. Keyed by entity id upstream,
 * so the local "add foreign classification" state resets per entity.
 */
export function EntityDetail({ facts, entity: e, classification: c, onChange }: {
  facts: AppendixFacts;
  entity: FactEntity;
  classification: ClassificationItem | undefined;
  onChange: (next: AppendixFacts) => void;
}) {
  const [foreignOpen, setForeignOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const jur = effJurisdiction(e);
  const status = effNlTaxStatus(e);
  const nlQual = effNlQualification(e);
  const isNl = (jur ?? '').toUpperCase() === 'NL';
  const isTaxpayer = e.role === 'Taxpayer' || !!e.isFiscalUnity;
  const isMember = !!e.memberOfUnityId;
  const foreignCls = isNl ? dutchForeignClassification(e, c) : null;
  const showForeign = isNl && (foreignCls != null || foreignOpen);
  const localQual = displayLocalQualification(e, c);
  const mismatch = entityHasQualificationDifference(e, c);
  const flagged = isForeignHomeStateOpen(e, c);
  const isUnrelated = effRelevanceOverride(e) === 'out';

  const relationEditable = !isTaxpayer && !isMember;
  const relPct = effRelatedPct(e);
  const relationType = isUnrelated
    ? 'Unrelated'
    : effRelationType(e)
      ?? (e.role === 'Parent' ? 'Parent' : e.role === 'Subsidiary' ? 'Subsidiary' : e.relatedVia ? 'Sister company' : 'Other');
  // Picking "Unrelated" demotes the entity out of the related set; any real relation
  // marks it related. The label + percentage stay meaningful either way.
  const setRelation = (v: string) => {
    const withType = withEntityEdit(facts, e.id, 'relationType', v);
    onChange(setEntityRelated(withType, e.id, v !== 'Unrelated'));
  };
  const relationValue = isTaxpayer ? 'The taxpayer' : isMember ? 'Fiscal unity member' : roleLabel(e);
  const relationReason = effRelationReason(e, e.position?.trim() || null);
  const nlReason = effNlReason(e);
  const localDerivedReason = mismatch
    ? `Hybrid difference: ${nlQualificationLabel(nlQual).toLowerCase()} for Dutch purposes, ${nlQualificationLabel(localQual).toLowerCase()}${c?.homeState ? ` in ${c.homeState}` : ' locally'}.`
    : homeStateDerivedBasis(e, c);
  const localReason = effLocalReason(e, localDerivedReason);

  return (
    <div className="space-y-5">
      {/* Relation to the taxpayer */}
      <PanelGroup label="Relation to the taxpayer">
        {relationEditable ? (
          <div className="space-y-2.5">
            <div className="flex flex-wrap items-center gap-2.5">
              <Select value={relationType} onValueChange={setRelation}>
                <SelectTrigger className={cn(SELECT_CLS, 'min-w-[150px]')} aria-label="Relation to the taxpayer"><SelectValue /></SelectTrigger>
                <SelectContent>{RELATION_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select>
              {!isUnrelated && (
                <>
                  <span className="text-ds-ink-tertiary" aria-hidden>·</span>
                  <span className="inline-flex items-center gap-2 text-[14px] text-foreground">
                    <PctInput value={relPct} onCommit={(n) => onChange(withEntityEdit(facts, e.id, 'relatedPct', n))} />
                    <span>% direct interest</span>
                  </span>
                </>
              )}
            </div>
            {/* Short label shown next to the name (defaults to the derived characterisation). */}
            <label className="flex items-center gap-2 text-[12.5px] text-muted-foreground">
              <span className="shrink-0">Label</span>
              <input
                value={e.edits?.roleLabel ?? ''}
                placeholder={roleLabel(e)}
                aria-label="Short label"
                onChange={(ev) => onChange(withEntityEdit(facts, e.id, 'roleLabel', ev.target.value.trim() === '' ? null : ev.target.value))}
                className="h-8 w-[200px] rounded-md border border-border bg-card px-2.5 text-[13px] text-foreground outline-none placeholder:text-muted-foreground/60 focus-visible:border-brand-terracotta focus-visible:shadow-[0_0_0_3px_rgba(194,92,60,0.12)]"
              />
            </label>
          </div>
        ) : (
          <p className="text-[14px] text-foreground">{relationValue}</p>
        )}
        <div className="mt-2">
          <ReasoningField
            value={relationReason}
            placeholder="Why this entity is or is not a related party for this assessment."
            onCommit={(text) => onChange(withEntityEdit(facts, e.id, 'relationReason', text))}
          />
        </div>
      </PanelGroup>

      {/* Jurisdiction. Editable here so a register row flagged for a missing
          jurisdiction can actually be resolved from its panel (the table cell
          itself is read-only display). */}
      <PanelGroup label="Jurisdiction">
        <JurisdictionPicker
          variant="facts"
          value={jur ?? ''}
          onChange={(iso) => onChange(withEntityEdit(facts, e.id, 'jurisdiction', iso || null))}
          placeholder="Jurisdiction"
          className={jurPickerCls(!!jur)}
        />
      </PanelGroup>

      {/* Classification (NL) */}
      <PanelGroup label="Classification (NL)">
        <ClassSelect
          value={nlQual}
          onPick={(v) => { const opt = NL_CLASSIFICATION_OPTIONS.find((o) => o.qual === v); if (opt) onChange(withEntityEdit(facts, e.id, 'nlTaxStatus', opt.statusKey)); }}
        />
        <p className="sr-only">{nlTaxStatusLabel(status)}</p>
        <div className="mt-2">
          <ReasoningField
            value={nlReason}
            placeholder="Why the entity qualifies this way for Dutch tax purposes."
            onCommit={(text) => onChange(withEntityEdit(facts, e.id, 'nlReason', text))}
          />
        </div>
      </PanelGroup>

      {/* Home-state classification (foreign entities) */}
      {!isNl && (
        <PanelGroup label={`Classification${jur ? ` (${jur})` : ''} · home jurisdiction`}>
          <ClassSelect
            id={`v2-home-state-select-${e.id}`}
            value={localQual}
            onPick={(v) => {
              const mapped = v === 'transparent' ? 'transparent' : v === 'non-transparent' ? 'non-transparent' : v === 'irrelevant' ? 'irrelevant' : 'unknown';
              onChange(withLocalQualification(facts, e.id, mapped, jur));
            }}
          />
          <div className="mt-2">
            <ReasoningField
              value={localReason}
              placeholder="How the home jurisdiction views this entity."
              onCommit={(text) => onChange(withEntityEdit(facts, e.id, 'localReason', text))}
            />
          </div>
        </PanelGroup>
      )}

      {/* Foreign classification (Dutch entities, optional) */}
      {isNl && (
        <PanelGroup label="Foreign classification">
          {showForeign ? (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2.5">
                <JurisdictionPicker
                  variant="facts"
                  value={foreignCls?.state ?? ''}
                  onChange={(iso) => onChange(withForeignClassificationState(facts, e.id, iso || null))}
                  placeholder="Country…"
                  className={jurPickerCls(!!foreignCls?.state)}
                />
                <ClassSelect
                  value={foreignCls?.qual ?? 'undetermined'}
                  onPick={(v) => {
                    const mapped = v === 'transparent' ? 'transparent' : v === 'non-transparent' ? 'non-transparent' : v === 'irrelevant' ? 'irrelevant' : 'unknown';
                    onChange(withLocalQualification(facts, e.id, mapped, foreignCls?.state ?? ''));
                  }}
                />
                <button
                  type="button"
                  aria-label="Remove foreign classification"
                  onClick={() => { setForeignOpen(false); onChange(clearForeignClassification(facts, e.id)); }}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              <ReasoningField
                value={localReason}
                placeholder="How this other jurisdiction classifies the entity, and why it matters here."
                onCommit={(text) => onChange(withEntityEdit(facts, e.id, 'localReason', text))}
              />
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setForeignOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-[4px] border border-dashed border-border px-2.5 py-1.5 text-[12.5px] text-muted-foreground transition-colors hover:border-ds-ink-tertiary hover:text-foreground"
            >
              <Plus className="h-3.5 w-3.5" /> Add foreign classification
            </button>
          )}
        </PanelGroup>
      )}

      {/* Visibility + delete */}
      {!isTaxpayer && !isMember && (
        <div className="flex flex-wrap items-center justify-between gap-4 border-t border-border pt-4">
          <div className="flex items-center gap-3">
            <Switch
              checked={!e.hidden}
              onCheckedChange={() => onChange({ ...facts, entities: facts.entities.map((x) => x.id === e.id ? { ...x, hidden: !x.hidden } : x) })}
              aria-label={e.hidden ? 'Hidden from client' : 'Visible to client'}
              className="data-[state=checked]:bg-brand-sage data-[state=unchecked]:bg-[#dcd7cd]"
            />
            <span className="text-[13px] text-foreground">{e.hidden ? 'Hidden from client' : 'Visible to client'}</span>
          </div>
          {/* Delete removes the entity outright (a chart-derived one too), cascading to
              its classification, transactions and acting-together memberships. Two-step
              to avoid an accidental loss; the panel closes as the entity disappears. */}
          {confirmDelete ? (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => onChange(deleteEntity(facts, e.id))}
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
              title="Delete this entity from the assessment"
              className="inline-flex items-center gap-1.5 rounded-[4px] border border-border px-2.5 py-1.5 text-[12.5px] text-muted-foreground transition-colors hover:border-brand-terracotta hover:text-brand-terracotta-deep"
            >
              <Trash2 className="h-3.5 w-3.5" /> Delete entity
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function entityPanelHeading(e: FactEntity) {
  const role = roleLabel(e);
  return { eyebrow: `${e.id}${role !== 'Other' ? ` · ${role}` : ''}`, title: e.name };
}
