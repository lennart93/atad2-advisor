import { Trash2, RotateCcw } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import type { StructureEdge } from '@/lib/structure/types';

interface Props {
  edge: StructureEdge;
  onChange: (patch: Partial<StructureEdge>) => void;
  onDelete: () => void;
}

const FIELD_LABEL = 'block text-[10.5px] font-medium uppercase tracking-[0.06em] text-ds-ink-secondary mb-1.5';
const INPUT_BASE = 'h-9 bg-white/70 border-ds-hairline focus-visible:ring-1 focus-visible:ring-ds-ink-tertiary focus-visible:ring-offset-0';

export function EdgeInspector({ edge, onChange, onDelete }: Props) {
  return (
    <div className="space-y-3.5">
      <div>
        <label htmlFor="pct" className={FIELD_LABEL}>Ownership %</label>
        <Input
          id="pct"
          type="number"
          min={0}
          max={100}
          step={0.01}
          value={edge.ownership_pct ?? ''}
          onChange={(e) => onChange({ ownership_pct: e.target.value === '' ? null : Number(e.target.value) })}
          className={INPUT_BASE}
        />
      </div>

      <label className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-md border border-ds-hairline bg-ds-fill-muted hover:bg-ds-fill-muted transition-colors cursor-pointer">
        <div className="flex flex-col">
          <span className="text-[13px] font-medium text-ds-ink leading-tight">Show % on chart</span>
          <span className="text-[11px] text-ds-ink-secondary leading-tight">Value still feeds the memo</span>
        </div>
        <Switch
          checked={!edge.label_hidden}
          onCheckedChange={(c) => onChange({ label_hidden: !c })}
        />
      </label>

      {(edge.label_dx != null || edge.label_dy != null || edge.label_t != null) && (
        <button
          type="button"
          onClick={() => onChange({ label_dx: null, label_dy: null, label_t: null })}
          className="inline-flex items-center gap-1.5 text-[12px] text-ds-ink-secondary hover:text-ds-ink transition-colors font-medium"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Reset label position
        </button>
      )}

      <div className="pt-1 border-t border-ds-hairline -mx-4 px-4 mt-4">
        <button
          type="button"
          onClick={onDelete}
          className="mt-2 inline-flex items-center gap-1.5 text-[12px] text-ds-red hover:bg-ds-red-bg rounded px-1 py-0.5 transition-colors font-medium"
        >
          <Trash2 className="h-3.5 w-3.5" />
          Delete edge
        </button>
      </div>
    </div>
  );
}
