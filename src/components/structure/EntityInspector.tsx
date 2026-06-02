import { Trash2, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { ENTITY_TYPES, type StructureEntity, type StructureGroup } from '@/lib/structure/types';
import { JurisdictionPicker } from './JurisdictionPicker';

interface Props {
  entity: StructureEntity;
  onChange: (patch: Partial<StructureEntity>) => void;
  onDelete: () => void;
  /** Alle bestaande FE's in de chart, zodat de inspector er een lijst van kan tonen. */
  fiscalUnities?: StructureGroup[];
  /** Voeg deze entity toe aan een bestaande FE (of maak nieuwe). */
  onAddToFiscalUnity?: (groupingId: string) => void;
  /** Haal deze entity weg uit haar huidige FE. */
  onRemoveFromFiscalUnity?: (groupingId: string) => void;
}

const FIELD_LABEL = 'block text-[10.5px] font-semibold uppercase tracking-[0.06em] text-stone-500 mb-1.5';
const INPUT_BASE = 'h-9 bg-white/70 border-stone-200 focus-visible:ring-1 focus-visible:ring-stone-400 focus-visible:ring-offset-0';

export function EntityInspector({
  entity, onChange, onDelete,
  fiscalUnities = [], onAddToFiscalUnity, onRemoveFromFiscalUnity,
}: Props) {
  const fes = fiscalUnities.filter((g) => g.kind === 'fiscal_unity');
  const currentFe = fes.find((g) => g.member_ids.includes(entity.id)) ?? null;
  // FE's waar deze entity NOG niet in zit (kandidaten om aan toe te voegen).
  // Een entity zit per regel in max één FE, dus bij toevoegen aan een andere
  // wordt automatisch gemerged in de parent.
  const candidates = fes.filter((g) => !g.member_ids.includes(entity.id));
  return (
    <div className="space-y-3.5">
      <div>
        <label htmlFor="name" className={FIELD_LABEL}>Name</label>
        <Input
          id="name"
          value={entity.name}
          onChange={(e) => onChange({ name: e.target.value })}
          className={INPUT_BASE}
        />
      </div>

      <div>
        <label htmlFor="legal_form" className={FIELD_LABEL}>Legal form</label>
        <Input
          id="legal_form"
          value={entity.legal_form ?? ''}
          onChange={(e) => onChange({ legal_form: e.target.value || null })}
          className={INPUT_BASE}
          placeholder="B.V., LLC, GmbH…"
        />
      </div>

      <div>
        <label htmlFor="jurisdiction" className={FIELD_LABEL}>Jurisdiction</label>
        <JurisdictionPicker
          id="jurisdiction"
          value={entity.jurisdiction_iso}
          onChange={(iso) => onChange({ jurisdiction_iso: iso })}
        />
      </div>

      <div>
        <label htmlFor="type" className={FIELD_LABEL}>Type (NL classification)</label>
        <Select
          value={entity.entity_type}
          onValueChange={(v) => onChange({ entity_type: v as StructureEntity['entity_type'] })}
        >
          <SelectTrigger id="type" className={INPUT_BASE}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ENTITY_TYPES.map((t) => (
              <SelectItem key={t.key} value={t.key}>{t.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <label className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-md border border-stone-200/80 bg-stone-50/40 hover:bg-stone-50/80 transition-colors cursor-pointer">
        <div className="flex flex-col">
          <span className="text-[13px] font-medium text-stone-800 leading-tight">Taxpayer</span>
          <span className="text-[11px] text-stone-500 leading-tight">Mark as the entity being assessed</span>
        </div>
        <Switch
          checked={entity.is_taxpayer}
          onCheckedChange={(c) => onChange({ is_taxpayer: Boolean(c) })}
        />
      </label>

      {(onAddToFiscalUnity || onRemoveFromFiscalUnity) && (
        <div>
          <label className={FIELD_LABEL}>Fiscal unity</label>
          {currentFe ? (
            <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-md border border-stone-200/80 bg-stone-50/40">
              <span className="text-[12.5px] text-stone-800 truncate">
                {currentFe.label.trim() || 'Untitled fiscal unity'}
              </span>
              {onRemoveFromFiscalUnity && (
                <button
                  type="button"
                  onClick={() => onRemoveFromFiscalUnity(currentFe.id)}
                  aria-label="Remove from fiscal unity"
                  className="p-0.5 rounded text-stone-400 hover:text-red-700 hover:bg-red-50 transition-colors"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          ) : candidates.length > 0 && onAddToFiscalUnity ? (
            <Select onValueChange={(v) => onAddToFiscalUnity(v)}>
              <SelectTrigger className={INPUT_BASE}>
                <SelectValue placeholder="Add to existing fiscal unity…" />
              </SelectTrigger>
              <SelectContent>
                {candidates.map((g) => (
                  <SelectItem key={g.id} value={g.id}>
                    {g.label.trim() || `Fiscal unity (${g.member_ids.length})`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <p className="text-[11.5px] text-stone-500 px-1">
              Not in a fiscal unity. Select 2+ entities in the chart and click "Create fiscal unity".
            </p>
          )}
        </div>
      )}

      <div className="pt-1 border-t border-stone-100/80 -mx-4 px-4 mt-4">
        <button
          type="button"
          onClick={onDelete}
          className="mt-2 inline-flex items-center gap-1.5 text-[12px] text-red-700/90 hover:text-red-800 transition-colors font-medium"
        >
          <Trash2 className="h-3.5 w-3.5" />
          Delete entity
        </button>
      </div>
    </div>
  );
}
