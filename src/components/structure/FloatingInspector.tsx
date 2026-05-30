import { X } from 'lucide-react';
import { EntityInspector } from './EntityInspector';
import { EdgeInspector } from './EdgeInspector';
import type { StructureEntity, StructureEdge } from '@/lib/structure/types';

interface Props {
  selectedEntity: StructureEntity | null;
  selectedEdge: StructureEdge | null;
  onEntityChange: (patch: Partial<StructureEntity>) => void;
  onEntityDelete: () => void;
  onEdgeChange: (patch: Partial<StructureEdge>) => void;
  onEdgeDelete: () => void;
  onClose: () => void;
}

export function FloatingInspector({
  selectedEntity,
  selectedEdge,
  onEntityChange,
  onEntityDelete,
  onEdgeChange,
  onEdgeDelete,
  onClose,
}: Props) {
  if (!selectedEntity && !selectedEdge) return null;

  const sectionLabel = selectedEntity ? 'Entity' : 'Ownership';

  return (
    <aside
      className="absolute top-4 right-4 z-10 w-[320px] max-h-[calc(100vh-2rem)] overflow-y-auto
                 bg-white/95 backdrop-blur-md
                 border border-stone-200/80
                 rounded-xl
                 shadow-[0_12px_32px_-12px_rgba(40,30,20,0.18),0_2px_8px_-2px_rgba(40,30,20,0.06)]
                 ring-1 ring-stone-100/40"
      role="dialog"
      aria-label="Inspector"
      data-snapshot-exclude="true"
    >
      <header className="flex items-center justify-between px-4 pt-3 pb-2.5 border-b border-stone-100/80">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-stone-500">
          {sectionLabel}
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close inspector"
          className="-mr-1 p-1 rounded-md text-stone-400 hover:text-stone-700 hover:bg-stone-100/60 transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </header>
      <div className="px-4 py-3.5">
        {selectedEntity && (
          <EntityInspector
            entity={selectedEntity}
            onChange={onEntityChange}
            onDelete={onEntityDelete}
          />
        )}
        {selectedEdge && (
          <EdgeInspector
            edge={selectedEdge}
            onChange={onEdgeChange}
            onDelete={onEdgeDelete}
          />
        )}
      </div>
    </aside>
  );
}
