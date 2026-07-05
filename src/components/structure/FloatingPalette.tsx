import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import { AddEntityDialog } from './AddEntityDialog';
import type { EntityType, StructureEntity } from '@/lib/structure/types';

interface Props {
  entities: StructureEntity[];
  taxpayerId: string | null;
  onCreateEntity: (payload: {
    entityType: EntityType;
    name: string;
    jurisdiction_iso: string;
    parentId: string;
    ownershipPct: number;
  }) => Promise<void>;
}

export function FloatingPalette({ entities, taxpayerId, onCreateEntity }: Props) {
  const [entityOpen, setEntityOpen] = useState(false);
  return (
    <>
      <div className="absolute top-6 left-6 z-10 flex gap-2" data-snapshot-exclude="true">
        <Button onClick={() => setEntityOpen(true)} size="sm" variant="outline">
          <Plus className="w-4 h-4 mr-1" /> Add entity
        </Button>
      </div>
      <AddEntityDialog
        open={entityOpen}
        onOpenChange={setEntityOpen}
        entities={entities}
        taxpayerId={taxpayerId}
        onCreate={onCreateEntity}
      />
    </>
  );
}
