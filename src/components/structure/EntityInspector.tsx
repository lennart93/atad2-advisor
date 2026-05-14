import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { ENTITY_TYPES, type StructureEntity } from '@/lib/structure/types';

interface Props {
  entity: StructureEntity;
  onChange: (patch: Partial<StructureEntity>) => void;
  onDelete: () => void;
}

export function EntityInspector({ entity, onChange, onDelete }: Props) {
  return (
    <div className="space-y-3">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
        Entity
      </div>

      <div className="space-y-1">
        <Label htmlFor="name">Name</Label>
        <Input id="name" value={entity.name} onChange={e => onChange({ name: e.target.value })} />
      </div>

      <div className="space-y-1">
        <Label htmlFor="legal_form">Legal form</Label>
        <Input id="legal_form"
          value={entity.legal_form ?? ''}
          onChange={e => onChange({ legal_form: e.target.value || null })} />
      </div>

      <div className="space-y-1">
        <Label htmlFor="jurisdiction">Jurisdiction (ISO)</Label>
        <Input id="jurisdiction" maxLength={3}
          value={entity.jurisdiction_iso}
          onChange={e => onChange({ jurisdiction_iso: e.target.value.toUpperCase() })} />
      </div>

      <div className="space-y-1">
        <Label htmlFor="type">Type (NL classification)</Label>
        <Select value={entity.entity_type}
          onValueChange={v => onChange({ entity_type: v as StructureEntity['entity_type'] })}>
          <SelectTrigger id="type"><SelectValue /></SelectTrigger>
          <SelectContent>
            {ENTITY_TYPES.map(t => (
              <SelectItem key={t.key} value={t.key}>{t.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center gap-2">
        <Checkbox id="is_taxpayer" checked={entity.is_taxpayer}
          onCheckedChange={c => onChange({ is_taxpayer: Boolean(c) })} />
        <Label htmlFor="is_taxpayer" className="cursor-pointer">This is the taxpayer</Label>
      </div>

      <Button variant="destructive" size="sm" onClick={onDelete} className="w-full">
        Delete entity
      </Button>
    </div>
  );
}
