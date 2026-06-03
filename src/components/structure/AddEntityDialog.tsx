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
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { ENTITY_TYPES, type EntityType, type StructureEntity } from '@/lib/structure/types';
import { JurisdictionPicker } from './JurisdictionPicker';

export type AddEntityDirection = 'above' | 'below';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entities: StructureEntity[];
  taxpayerId: string | null;
  onCreate: (payload: {
    entityType: EntityType;
    name: string;
    jurisdiction_iso: string;
    /** The existing entity the new one attaches to. */
    relatedId: string;
    /** 'below' = new entity is a child of relatedId (existing behavior).
     *  'above' = new entity is a parent of relatedId (becomes its owner). */
    direction: AddEntityDirection;
    ownershipPct: number;
  }) => Promise<void>;
}

export function AddEntityDialog({ open, onOpenChange, entities, taxpayerId, onCreate }: Props) {
  const defaultRelatedId = taxpayerId ?? entities[0]?.id ?? '';

  const [entityType, setEntityType] = useState<EntityType>('corporation');
  const [direction, setDirection] = useState<AddEntityDirection>('below');
  const [relatedId, setRelatedId] = useState(defaultRelatedId);
  const [ownershipPct, setOwnershipPct] = useState(100);
  const [name, setName] = useState('New entity');
  const [jurisdiction, setJurisdiction] = useState('NL');
  const [busy, setBusy] = useState(false);

  // Reset form each time the dialog opens
  useEffect(() => {
    if (open) {
      setEntityType('corporation');
      setDirection('below');
      setRelatedId(taxpayerId ?? entities[0]?.id ?? '');
      setOwnershipPct(100);
      setName('New entity');
      setJurisdiction('NL');
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSubmit = async () => {
    if (!relatedId) return;
    setBusy(true);
    try {
      await onCreate({
        entityType,
        name,
        jurisdiction_iso: jurisdiction,
        relatedId,
        direction,
        ownershipPct,
      });
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  };

  const relatedLabel =
    direction === 'below' ? 'Place new entity below' : 'Place new entity above';

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
            <Label htmlFor="entity-jurisdiction">Jurisdiction</Label>
            <JurisdictionPicker
              id="entity-jurisdiction"
              value={jurisdiction}
              onChange={setJurisdiction}
            />
          </div>
          <div>
            <ToggleGroup
              type="single"
              value={direction}
              onValueChange={(v) => v && setDirection(v as AddEntityDirection)}
              className="grid grid-cols-2"
            >
              <ToggleGroupItem value="below" aria-label="Below: new entity is a subsidiary">
                Below (subsidiary)
              </ToggleGroupItem>
              <ToggleGroupItem value="above" aria-label="Above: new entity is a shareholder">
                Above (shareholder)
              </ToggleGroupItem>
            </ToggleGroup>
          </div>
          <div>
            <Label htmlFor="entity-related">{relatedLabel}</Label>
            <Select value={relatedId} onValueChange={setRelatedId}>
              <SelectTrigger id="entity-related"><SelectValue /></SelectTrigger>
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
          <Button onClick={handleSubmit} disabled={busy || !relatedId || !name.trim()}>
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
