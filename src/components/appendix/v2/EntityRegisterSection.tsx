import { Fragment, useState } from 'react';
import { ChevronDown, ChevronUp, Eye, EyeOff, Plus, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AppendixFacts, FactEntity } from '@/lib/appendix/types';
import { CountryFlag } from '@/components/CountryFlag';
import { JurisdictionPicker } from '@/components/structure/JurisdictionPicker';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { effJurisdiction, effNlQualification } from '@/lib/appendix/facts/entityFields';
import { nlQualificationLabel, NL_CLASSIFICATION_OPTIONS, type NlQualification } from '@/lib/appendix/facts/nlTaxStatus';
import { entityHasQualificationDifference, isForeignHomeStateOpen } from '@/lib/appendix/facts/conclusions';
import { effRelevanceOverride, addManualEntity } from '@/lib/appendix/facts/entitySet';
import { actingInClientReport } from '@/lib/appendix/facts/actingAnnex';
import { roleLabel } from '@/lib/appendix/facts/roleLabel';

const NA = '–';
const GROUP_LABEL = 'text-[12px] font-medium uppercase tracking-[0.13em] text-muted-foreground';
const GROUP_META = 'text-[12px] text-muted-foreground/60';

function pct(n: number | null): string {
  return n == null ? NA : `${Number.isInteger(n) ? n : n.toFixed(2)}%`;
}

function JurisFlagCode({ iso }: { iso: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <CountryFlag iso={iso} className="!h-[13px] !w-[18px] shadow-[0_0_0_1px_rgba(20,18,12,0.08)]" />
      <span className="text-[13.5px] uppercase tracking-[0.02em] tabular-nums text-foreground">{iso}</span>
    </span>
  );
}

/**
 * Part A section 1 (spec §5): the register table stays (it reads well as a list),
 * but rows no longer expand inline — clicking a row opens the entity in the detail
 * panel. All cells are read-only display; the only inline controls are the client
 * eye and, for a foreign entity that still owes a home-state view, a terracotta
 * prompt that opens the panel straight on that field. "Add entity" is a collapsed
 * form that creates the entity and selects it for editing.
 */
export function EntityRegisterSection({ facts, onChange, selectedId, onSelect }: {
  facts: AppendixFacts;
  onChange?: (next: AppendixFacts) => void;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const editable = !!onChange;
  const [showAll, setShowAll] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newJur, setNewJur] = useState('');
  const [newQual, setNewQual] = useState<NlQualification>('undetermined');
  const resetAdd = () => { setNewName(''); setNewJur(''); setNewQual('undetermined'); setAddOpen(false); };

  const clsById = new Map(facts.classifications.map((c) => [c.entityId, c]));
  const likelyMemberIds = new Set(
    facts.actingTogether.filter(actingInClientReport).flatMap((a) => a.memberEntityIds),
  );
  const hasMismatch = (e: FactEntity) => entityHasQualificationDifference(e, clsById.get(e.id));
  const needsHomeState = (e: FactEntity) => isForeignHomeStateOpen(e, clsById.get(e.id));
  const isTaxpayerSide = (e: FactEntity) => e.role === 'Taxpayer' || !!e.memberOfUnityId || !!e.inTaxpayerFiscalUnity;
  const isRelevantRow = (e: FactEntity): boolean => {
    const ov = effRelevanceOverride(e);
    if (ov === 'out') return false;
    if (ov === 'in') return true;
    return e.related || !!e.shareholderOfTaxpayer || likelyMemberIds.has(e.id) || hasMismatch(e) || needsHomeState(e);
  };

  const taxpayerEnts = facts.entities.filter(isTaxpayerSide);
  const others = facts.entities.filter((e) => !isTaxpayerSide(e));
  const basePctOf = (e: FactEntity) => e.ownershipPct ?? e.relatedViaPct ?? null;
  const relevantEnts = others.filter(isRelevantRow).sort((a, b) => (basePctOf(b) ?? -1) - (basePctOf(a) ?? -1));
  const restEnts = others.filter((e) => !isRelevantRow(e));

  const toggleHidden = (id: string) =>
    onChange?.({ ...facts, entities: facts.entities.map((e) => e.id === id ? { ...e, hidden: !e.hidden } : e) });

  const openHomeState = (id: string) => {
    onSelect(id);
    requestAnimationFrame(() => document.getElementById(`v2-home-state-select-${id}`)?.focus());
  };

  const COLS = 6;
  const groupLabelRow = (label: string, meta?: string) => (
    <tr>
      <td colSpan={COLS} className="pt-4 pb-1.5">
        <span className={GROUP_LABEL}>{label}</span>
        {meta && <span className={cn(GROUP_META, 'ml-2.5')}>{meta}</span>}
      </td>
    </tr>
  );

  const renderRow = (e: FactEntity) => {
    const isMember = !!e.memberOfUnityId;
    const jur = effJurisdiction(e);
    const nlQual = effNlQualification(e);
    const isNl = (jur ?? '').toUpperCase() === 'NL';
    const flagged = needsHomeState(e);
    const localMismatch = hasMismatch(e);
    const relPct = e.role === 'Taxpayer' ? null : (e.ownershipPct ?? e.relatedViaPct ?? null);
    const selected = selectedId === e.id;
    return (
      <tr
        key={e.id}
        data-appendix-row
        role="button"
        tabIndex={0}
        aria-pressed={selected}
        id={`v2-entity-${e.id}`}
        onClick={() => onSelect(e.id)}
        onKeyDown={(ev) => { if (ev.currentTarget === ev.target && (ev.key === 'Enter' || ev.key === ' ')) { ev.preventDefault(); onSelect(e.id); } }}
        className={cn(
          'group cursor-pointer border-b border-border align-middle transition-colors hover:bg-accent focus:bg-accent focus:outline-none',
          selected && 'bg-brand-terracotta-soft/25',
          e.hidden && 'opacity-40',
        )}
      >
        <td className={cn('py-2.5 pr-2 font-mono text-ds-ink-secondary', selected ? 'border-l-2 border-l-brand-terracotta pl-2.5' : 'border-l-2 border-l-transparent pl-3')}>{e.id}</td>
        <td className="pr-2 text-foreground">
          {isMember && <span className="mr-1 text-muted-foreground">↳</span>}
          <span className={cn(isMember && 'text-muted-foreground')}>{e.name}</span>
          {e.manual && <span className="ml-1.5 rounded-sm bg-muted px-1 text-[10px] text-muted-foreground">added</span>}
          {roleLabel(e) !== 'Other' && (
            <span className="ml-1.5 text-[9.5px] uppercase tracking-wide text-muted-foreground/60">{roleLabel(e)}</span>
          )}
        </td>
        <td className="py-0.5 pr-2">
          {jur ? <JurisFlagCode iso={jur} /> : <span className="text-muted-foreground">{NA}</span>}
        </td>
        <td className="pr-2">
          {nlQual === 'undetermined'
            ? <span className="text-[10.5px] text-muted-foreground/40">{NA}</span>
            : <span className="text-foreground">{nlQualificationLabel(nlQual)}</span>}
          {!isNl && (flagged ? (
            <button
              type="button"
              onClick={(ev) => { ev.stopPropagation(); openHomeState(e.id); }}
              className="mt-[3px] flex items-center gap-[7px] text-[12.5px] font-medium text-brand-terracotta transition-colors hover:text-brand-terracotta-deep"
            >
              <span className="h-[5px] w-[5px] rounded-full bg-brand-terracotta" aria-hidden />
              Set {jur ?? 'home-state'} classification
            </button>
          ) : localMismatch ? (
            <span className="mt-[3px] block text-[12.5px] text-brand-warning-deep">hybrid difference</span>
          ) : null)}
        </td>
        <td className={cn('py-2.5 pl-2 text-right tabular-nums', e.related ? 'text-foreground' : 'text-muted-foreground')}>
          {e.role === 'Taxpayer' ? NA : isMember ? '' : (relPct != null ? pct(relPct) : NA)}
        </td>
        <td className="px-2 text-center" onClick={(ev) => ev.stopPropagation()}>
          {e.role === 'Taxpayer' ? (
            <span className="inline-flex h-6 w-6 items-center justify-center text-muted-foreground/50" aria-hidden><Eye className="h-4 w-4" /></span>
          ) : (
            <button
              type="button"
              aria-label={e.hidden ? `Show ${e.name} in the client report` : `Hide ${e.name} from the client report`}
              disabled={!editable || isMember}
              onClick={(ev) => { ev.stopPropagation(); toggleHidden(e.id); }}
              className={cn('inline-flex h-6 w-6 items-center justify-center rounded-[3px] transition-colors',
                e.hidden ? 'text-muted-foreground hover:bg-muted hover:text-foreground' : 'text-brand-sage-deep hover:bg-brand-sage-soft')}
            >
              {e.hidden ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          )}
        </td>
      </tr>
    );
  };

  const thLabel = 'pr-2 text-[10px] font-medium uppercase tracking-wide';

  return (
    <div>
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-foreground text-left text-muted-foreground">
            <th className={cn(thLabel, 'py-2 w-8 pl-3')}>#</th>
            <th className={thLabel}>Entity</th>
            <th className={cn(thLabel, 'w-[100px]')}>Juris.</th>
            <th className={cn(thLabel, 'w-[170px]')}>Classification (NL)</th>
            <th className="w-[90px] pl-2 text-right text-[10px] font-medium uppercase tracking-wide">Related %</th>
            <th className="w-[64px] text-center text-[10px] font-medium uppercase tracking-wide">Client</th>
          </tr>
        </thead>
        {taxpayerEnts.length > 0 && (
          <tbody>
            {groupLabelRow('The taxpayer', taxpayerEnts.length > 1 ? `${taxpayerEnts.length} entities` : undefined)}
            {taxpayerEnts.map(renderRow)}
          </tbody>
        )}
        {relevantEnts.length > 0 && (
          <tbody>
            {groupLabelRow('Related', `${relevantEnts.length} ${relevantEnts.length === 1 ? 'entity' : 'entities'}`)}
            {relevantEnts.map(renderRow)}
          </tbody>
        )}
        {restEnts.length > 0 && (
          <tbody>
            <tr className="border-b border-border">
              <td colSpan={COLS} className="py-2.5 pl-3">
                <button type="button" onClick={() => setShowAll((v) => !v)} aria-expanded={showAll} className="flex items-center gap-2.5 text-left">
                  <span className={GROUP_LABEL}>Other</span>
                  <span className={GROUP_META}>{restEnts.length} {restEnts.length === 1 ? 'entity' : 'entities'} · below 25%, no qualification difference</span>
                  {showAll ? <ChevronUp className="h-3 w-3 text-muted-foreground/70" /> : <ChevronDown className="h-3 w-3 text-muted-foreground/70" />}
                </button>
              </td>
            </tr>
            {showAll && restEnts.map(renderRow)}
          </tbody>
        )}
      </table>

      {editable && (
        <div className="mt-4">
          {!addOpen ? (
            <button type="button" onClick={() => setAddOpen(true)} className="inline-flex items-center gap-1.5 rounded-[4px] border border-border px-3 py-1.5 text-[12.5px] text-muted-foreground transition-colors hover:border-ds-ink-tertiary hover:text-foreground">
              <Plus className="h-3.5 w-3.5" /> Add entity
            </button>
          ) : (
            <div className="rounded-md border border-border bg-[#fbfaf7] p-4">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-medium uppercase tracking-[0.13em] text-muted-foreground">Add entity</p>
                <button type="button" onClick={resetAdd} aria-label="Close" className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2.5">
                <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Entity name" aria-label="New entity name" className="h-9 w-[220px] rounded-md border border-border bg-card px-3 text-[14px] text-foreground outline-none placeholder:text-muted-foreground/60" />
                <JurisdictionPicker variant="facts" value={newJur} onChange={setNewJur} placeholder="Jurisdiction" />
                <Select value={newQual} onValueChange={(v) => setNewQual(v as NlQualification)}>
                  <SelectTrigger className="h-9 w-auto min-w-[176px] gap-3 border-border bg-card px-3 text-[14px] [&>span]:!flex" aria-label="Classification"><SelectValue /></SelectTrigger>
                  <SelectContent>{NL_CLASSIFICATION_OPTIONS.map((o) => <SelectItem key={o.qual} value={o.qual}>{o.label}</SelectItem>)}</SelectContent>
                </Select>
                <button
                  type="button"
                  disabled={!newName.trim()}
                  onClick={() => {
                    const statusKey = NL_CLASSIFICATION_OPTIONS.find((o) => o.qual === newQual)?.statusKey;
                    const nlTaxStatus = newQual === 'undetermined' ? null : statusKey ?? null;
                    const { facts: next, id } = addManualEntity(facts, { name: newName, jurisdiction: newJur || null, nlTaxStatus });
                    onChange!(next);
                    resetAdd();
                    onSelect(id);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-[4px] bg-foreground px-3 py-2 text-[13px] font-medium text-white transition-colors hover:bg-foreground/90 disabled:opacity-40"
                >
                  <Plus className="h-3.5 w-3.5" /> Add
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
