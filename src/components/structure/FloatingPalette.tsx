import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ENTITY_TYPES, type EntityType } from '@/lib/structure/types';

export function FloatingPalette({ onAdd }: { onAdd: (t: EntityType) => void }) {
  const [open, setOpen] = useState(false);

  const handlePick = (t: EntityType) => {
    onAdd(t);
    setOpen(false);
  };

  return (
    <div className="absolute top-4 left-4 z-10">
      <Button size="sm" variant="outline" onClick={() => setOpen((v) => !v)}>
        + Entity {open ? '▴' : '▾'}
      </Button>
      {open && (
        <div className="mt-2 w-56 bg-white border border-neutral-200 rounded-lg shadow-lg p-2 flex flex-col gap-1">
          <div className="text-[10px] uppercase tracking-wide text-neutral-500 font-semibold px-2 py-1">
            Add entity
          </div>
          {ENTITY_TYPES.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => handlePick(t.key)}
              className="text-left text-sm px-3 py-2 rounded hover:bg-neutral-50"
            >
              {t.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
