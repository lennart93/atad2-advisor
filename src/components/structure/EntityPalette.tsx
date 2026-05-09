import { ENTITY_TYPES, type EntityType } from '@/lib/structure/types';

export function EntityPalette({ onAdd }: { onAdd: (t: EntityType) => void }) {
  return (
    <div className="w-48 shrink-0 border-r bg-white p-3 flex flex-col gap-2 overflow-y-auto">
      <div className="text-[10px] uppercase tracking-wide text-neutral-500 font-semibold">
        Add entity
      </div>
      {ENTITY_TYPES.map(t => (
        <button
          key={t.key}
          type="button"
          onClick={() => onAdd(t.key)}
          className="text-left text-sm px-3 py-2 rounded border border-neutral-200 hover:bg-neutral-50"
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
