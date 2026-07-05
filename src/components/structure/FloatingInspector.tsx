import { X } from 'lucide-react';
import { EntityInspector } from './EntityInspector';
import { EdgeInspector } from './EdgeInspector';
import type { StructureEntity, StructureEdge, StructureGroup } from '@/lib/structure/types';

interface Props {
  selectedEntity: StructureEntity | null;
  selectedEdge: StructureEdge | null;
  onEntityChange: (patch: Partial<StructureEntity>) => void;
  onEntityDelete: () => void;
  onEdgeChange: (patch: Partial<StructureEdge>) => void;
  onEdgeDelete: () => void;
  onClose: () => void;
  fiscalUnities?: StructureGroup[];
  onAddToFiscalUnity?: (groupingId: string) => void;
  onRemoveFromFiscalUnity?: (groupingId: string) => void;
}

export function FloatingInspector({
  selectedEntity,
  selectedEdge,
  onEntityChange,
  onEntityDelete,
  onEdgeChange,
  onEdgeDelete,
  onClose,
  fiscalUnities,
  onAddToFiscalUnity,
  onRemoveFromFiscalUnity,
}: Props) {
  if (!selectedEntity && !selectedEdge) return null;

  const sectionLabel = selectedEntity ? 'Entity' : 'Ownership';

  return (
    <aside
      className="absolute top-4 right-4 z-10 w-[360px] max-h-[calc(100vh-2rem)] overflow-y-auto
                 bg-white/95 backdrop-blur-md
                 border border-ds-hairline border-t-[3px] border-t-brand-terracotta
                 rounded-ds-card
                 shadow-[0_12px_32px_-12px_rgba(0,0,0,0.16),0_2px_8px_-2px_rgba(0,0,0,0.06)]"
      role="dialog"
      aria-label="Inspector"
      data-snapshot-exclude="true"
    >
      <header className="flex items-center justify-between px-4 pt-3 pb-2.5 border-b border-ds-hairline">
        <h2 className="text-[13px] font-normal text-ds-ink-secondary">
          {sectionLabel}
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close inspector"
          className="-mr-1 p-1 rounded-ds-control text-ds-ink-tertiary hover:text-ds-ink hover:bg-ds-fill-muted transition-colors"
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
            fiscalUnities={fiscalUnities}
            onAddToFiscalUnity={onAddToFiscalUnity}
            onRemoveFromFiscalUnity={onRemoveFromFiscalUnity}
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
