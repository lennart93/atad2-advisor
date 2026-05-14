import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ENTITY_TYPES, type EntityType, type StructureEntity } from '@/lib/structure/types';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entities: StructureEntity[];
  taxpayerId: string | null;
  onCreate: (payload: {
    entityType: EntityType;
    name: string;
    jurisdiction_iso: string;
    parentId: string;
    ownershipPct: number;
  }) => Promise<void>;
}

export function AddEntityDialog({ open, onOpenChange, entities, taxpayerId, onCreate }: Props) {
  const defaultParentId = taxpayerId ?? entities[0]?.id ?? '';

  const [entityType, setEntityType] = useState<EntityType>('corporation');
  const [parentId, setParentId] = useState(defaultParentId);
  const [ownershipPct, setOwnershipPct] = useState(100);
  const [name, setName] = useState('New entity');
  const [jurisdiction, setJurisdiction] = useState('NL');
  const [busy, setBusy] = useState(false);

  // Reset form each time the dialog opens
  useEffect(() => {
    if (open) {
      setEntityType('corporation');
      setParentId(taxpayerId ?? entities[0]?.id ?? '');
      setOwnershipPct(100);
      setName('New entity');
      setJurisdiction('NL');
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSubmit = async () => {
    if (!parentId) return;
    setBusy(true);
    try {
      await onCreate({ entityType, name, jurisdiction_iso: jurisdiction, parentId, ownershipPct });
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add entity</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label htmlFor="entity-type">Type</Label>
            <Select value={entityType} onValueChange={(v) => setEntityType(v as EntityType)}>
              <SelectTrigger id="entity-type"><SelectValue /></SelectTrigger>
              <SelectContent>
                {ENTITY_TYPES.map((t) => (
                  <SelectItem key={t.key} value={t.key}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="entity-name">Name</Label>
            <Input id="entity-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="entity-jurisdiction">Jurisdiction (ISO)</Label>
            <Input
              id="entity-jurisdiction"
              value={jurisdiction}
              onChange={(e) => setJurisdiction(e.target.value.toUpperCase())}
              maxLength={3}
            />
          </div>
          <div>
            <Label htmlFor="entity-parent">Parent</Label>
            <Select value={parentId} onValueChange={setParentId}>
              <SelectTrigger id="entity-parent"><SelectValue /></SelectTrigger>
              <SelectContent>
                {entities.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.name}{e.is_taxpayer ? ' (taxpayer)' : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="entity-pct">Ownership %</Label>
            <Input
              id="entity-pct"
              type="number"
              min={0}
              max={100}
              step={0.01}
              value={ownershipPct}
              onChange={(e) => setOwnershipPct(Number(e.target.value))}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={busy || !parentId || !name.trim()}>
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
