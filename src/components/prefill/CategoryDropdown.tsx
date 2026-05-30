import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DOCUMENT_CATEGORIES, type DocumentCategory } from '@/lib/prefill/types';

interface Props {
  value: DocumentCategory;
  source?: 'filename' | 'ai' | 'user';
  disabled?: boolean;
  onChange: (next: DocumentCategory) => void;
}

export function CategoryDropdown({ value, disabled, onChange }: Props) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as DocumentCategory)} disabled={disabled}>
      <SelectTrigger className="h-7 w-[180px] text-xs">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {DOCUMENT_CATEGORIES.map((c) => (
          <SelectItem key={c.value} value={c.value} className="text-xs">
            {c.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
