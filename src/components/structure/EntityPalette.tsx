import { ENTITY_TYPES, type EntityType } from '@/lib/structure/types';

export function EntityPalette({ onAdd }: { onAdd: (t: EntityType) => void }) {
  return (
    <div className="w-48 shrink-0 border-r border-ds-hairline bg-ds-card p-3 flex flex-col gap-2 overflow-y-auto">
      <div className="text-[13px] font-medium text-ds-ink-secondary">
        Add entity
      </div>
      {ENTITY_TYPES.map(t => (
        <button
          key={t.key}
          type="button"
          onClick={() => onAdd(t.key)}
          className="text-left text-[13px] text-ds-ink px-3 py-2 rounded-ds-control border border-ds-hairline hover:bg-ds-fill-muted transition-colors"
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
