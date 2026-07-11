import { useEffect, useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import type { StructureGroup } from '@/lib/structure/types';

interface Props {
  grouping: StructureGroup;
  screenX: number;
  screenY: number;
  onRename: (newLabel: string) => void;
  onDelete: () => void;
  onClose: () => void;
}

export function FiscalUnityEditPopover({
  grouping, screenX, screenY, onRename, onDelete, onClose,
}: Props) {
  const [draft, setDraft] = useState(grouping.label);
  const ref = useRef<HTMLDivElement>(null);
  // Captured during the first render, before the input's autofocus moves it,
  // so closing can hand focus back to the chart label that opened us.
  const restoreTo = useRef<Element | null>(document.activeElement);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    window.addEventListener('mousedown', handler);
    return () => {
      window.removeEventListener('mousedown', handler);
      if (restoreTo.current instanceof HTMLElement) {
        restoreTo.current.focus({ preventScroll: true });
      }
    };
  }, [onClose]);

  const save = () => {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== grouping.label) onRename(trimmed);
    onClose();
  };

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label={`Edit fiscal unity ${grouping.label || ''}`.trim()}
      className="fixed z-50 bg-ds-card border border-ds-hairline rounded-md shadow-lg p-3 flex flex-col gap-2"
      style={{ left: screenX, top: screenY + 8, minWidth: 220 }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          onClose();
        }
      }}
    >
      <Input
        // Popover opens on the user's own click; moving focus into it is expected.
        // eslint-disable-next-line jsx-a11y/no-autofocus
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') save();
        }}
      />
      <div className="flex gap-2 justify-between">
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            if (window.confirm(`Delete fiscal unity "${grouping.label}"?`)) {
              onDelete();
              onClose();
            }
          }}
          className="text-ds-red hover:bg-ds-red-bg"
        >
          Delete
        </Button>
        <Button size="sm" onClick={save}>Save</Button>
      </div>
    </div>
  );
}
