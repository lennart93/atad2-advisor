import { Button } from '@/components/ui/button';
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

  return (
    <aside
      className="absolute top-4 right-4 z-10 w-72 max-h-[calc(100vh-8rem)] overflow-y-auto bg-white border border-neutral-200 rounded-lg shadow-lg p-3"
      role="dialog"
      aria-label="Inspector"
    >
      <div className="flex justify-end -mt-1 -mr-1 mb-2">
        <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close inspector">
          ✕
        </Button>
      </div>
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
    </aside>
  );
}
