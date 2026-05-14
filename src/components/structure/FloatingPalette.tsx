import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Plus, ArrowRight } from 'lucide-react';
import { AddEntityDialog } from './AddEntityDialog';
import { AddTransactionDialog } from './AddTransactionDialog';
import type { EntityType, StructureEntity, TransactionType, MismatchClassification } from '@/lib/structure/types';

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
  onCreateTransaction: (payload: {
    from_entity_id: string;
    to_entity_id: string;
    transaction_type: TransactionType;
    amount_eur: number | null;
    is_mismatch: boolean;
    mismatch_classification: MismatchClassification | null;
    mismatch_atad2_article: string | null;
  }) => Promise<void>;
}

export function FloatingPalette({ entities, taxpayerId, onCreateEntity, onCreateTransaction }: Props) {
  const [entityOpen, setEntityOpen] = useState(false);
  const [transactionOpen, setTransactionOpen] = useState(false);
  return (
    <>
      <div className="absolute top-6 left-6 z-10 flex gap-2">
        <Button onClick={() => setEntityOpen(true)} size="sm" variant="outline">
          <Plus className="w-4 h-4 mr-1" /> Entity
        </Button>
        <Button onClick={() => setTransactionOpen(true)} size="sm" variant="outline">
          <ArrowRight className="w-4 h-4 mr-1" /> Transaction
        </Button>
      </div>
      <AddEntityDialog
        open={entityOpen}
        onOpenChange={setEntityOpen}
        entities={entities}
        taxpayerId={taxpayerId}
        onCreate={onCreateEntity}
      />
      <AddTransactionDialog
        open={transactionOpen}
        onOpenChange={setTransactionOpen}
        entities={entities}
        taxpayerId={taxpayerId}
        onCreate={onCreateTransaction}
      />
    </>
  );
}
