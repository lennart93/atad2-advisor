# Fiscale eenheid UI — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gebruiker kan in de structure-chart editor een fiscale eenheid handmatig aanmaken (multi-select → toolbar-knop → naam-dialog), hernoemen en verwijderen (klik op het label van de gestippelde rechthoek). De gestippelde overlay-rendering bestaat al.

**Architecture:** Selectiestatus uitbreiden van één item naar een uitgebreidere shape met een `nodes` variant. CRUD-functies toevoegen in de client. Nieuwe knop in de bestaande `FloatingToolbar`. Twee nieuwe component-bestanden voor de dialog en de edit-popover. Bestaande `FiscalUnityOverlay` klikbaar maken.

**Tech Stack:** React + TypeScript + Vite + Tailwind + shadcn/ui + React Flow (`@xyflow/react`) + Supabase JS client + Vitest.

**Spec:** [docs/superpowers/specs/2026-05-25-fiscal-unity-ui-design.md](../specs/2026-05-25-fiscal-unity-ui-design.md)

---

## File overview

| Bestand | Nieuw / wijzigen | Verantwoordelijk voor |
|---|---|---|
| `src/lib/structure/client.ts` | wijzigen | CRUD: `createGrouping`, `updateGrouping`, `deleteGrouping` |
| `src/lib/structure/__tests__/groupings-client.test.ts` | nieuw | Unit tests voor de CRUD-functies (gemockt Supabase) |
| `src/components/structure/StructureChart.tsx` | wijzigen | Multi-node selectie doorgeven via React Flow's `onSelectionChange`-callback |
| `src/components/structure/StructureChartStep.tsx` | wijzigen | Selectie-state uitgebreid, groupings-CRUD wire-up, dialog open/dicht |
| `src/components/structure/FloatingToolbar.tsx` | wijzigen | Nieuwe "Maak fiscale eenheid"-knop (verschijnt bij 2+ geselecteerde nodes) |
| `src/components/structure/AddFiscalUnityDialog.tsx` | nieuw | Modal met label-veld en Opslaan/Annuleren |
| `src/components/structure/overlays/FiscalUnityOverlay.tsx` | wijzigen | Label-rect klikbaar, `onLabelClick` callback met groep en positie |
| `src/components/structure/overlays/FiscalUnityEditPopover.tsx` | nieuw | Inline-rename + verwijder-knop |

---

## Task 1: Client-side CRUD-functies (TDD)

We voegen `createGrouping`, `updateGrouping`, `deleteGrouping` toe aan `client.ts`. Eerst tests schrijven, dan code.

**Files:**
- Create: `src/lib/structure/__tests__/groupings-client.test.ts`
- Modify: `src/lib/structure/client.ts`

- [ ] **Step 1: Tests schrijven**

`src/lib/structure/__tests__/groupings-client.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { supabaseMock, fromMock } = vi.hoisted(() => {
  const select = vi.fn();
  const insert = vi.fn(() => ({ select: vi.fn(() => ({ single: vi.fn(() => Promise.resolve({ data: { id: 'g1', chart_id: 'c1', kind: 'fiscal_unity', label: 'F.E.', member_ids: ['a', 'b'], created_at: '' }, error: null })) })) }));
  const update = vi.fn(() => ({ eq: vi.fn(() => ({ select: vi.fn(() => ({ single: vi.fn(() => Promise.resolve({ data: { id: 'g1', chart_id: 'c1', kind: 'fiscal_unity', label: 'New', member_ids: ['a', 'b'], created_at: '' }, error: null })) })) })) }));
  const del = vi.fn(() => ({ eq: vi.fn(() => Promise.resolve({ error: null })) }));
  const fromMock = vi.fn(() => ({ select, insert, update, delete: del }));
  return { supabaseMock: { from: fromMock }, fromMock };
});

vi.mock('@/integrations/supabase/client', () => ({ supabase: supabaseMock }));

import { createGrouping, updateGrouping, deleteGrouping } from '@/lib/structure/client';

describe('groupings CRUD', () => {
  beforeEach(() => { fromMock.mockClear(); });

  it('createGrouping insert in de juiste tabel met de juiste payload', async () => {
    const result = await createGrouping({
      chart_id: 'c1',
      kind: 'fiscal_unity',
      label: 'F.E.',
      member_ids: ['a', 'b'],
    });
    expect(fromMock).toHaveBeenCalledWith('atad2_structure_groupings');
    expect(result.id).toBe('g1');
    expect(result.label).toBe('F.E.');
  });

  it('updateGrouping patcht label zonder kind of member_ids', async () => {
    const result = await updateGrouping('g1', { label: 'New' });
    expect(fromMock).toHaveBeenCalledWith('atad2_structure_groupings');
    expect(result.label).toBe('New');
  });

  it('deleteGrouping wist op id', async () => {
    await deleteGrouping('g1');
    expect(fromMock).toHaveBeenCalledWith('atad2_structure_groupings');
  });
});
```

- [ ] **Step 2: Test laten falen**

```bash
npx vitest run src/lib/structure/__tests__/groupings-client.test.ts
```

Verwacht: alle 3 tests falen met `createGrouping is not a function` of equivalent.

- [ ] **Step 3: CRUD-functies toevoegen aan `client.ts`**

Voeg vlak na `listGroupings` (rond regel 44) toe:

```typescript
export async function createGrouping(input: {
  chart_id: string;
  kind: string;
  label: string;
  member_ids: string[];
}): Promise<StructureGroup> {
  const { data, error } = await supabase
    .from('atad2_structure_groupings')
    .insert(input)
    .select('*')
    .single();
  if (error) throw error;
  return data as StructureGroup;
}

export async function updateGrouping(
  id: string,
  patch: Partial<Pick<StructureGroup, 'label' | 'member_ids'>>,
): Promise<StructureGroup> {
  const { data, error } = await supabase
    .from('atad2_structure_groupings')
    .update(patch)
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  return data as StructureGroup;
}

export async function deleteGrouping(id: string): Promise<void> {
  const { error } = await supabase
    .from('atad2_structure_groupings')
    .delete()
    .eq('id', id);
  if (error) throw error;
}
```

- [ ] **Step 4: Test groen zien**

```bash
npx vitest run src/lib/structure/__tests__/groupings-client.test.ts
```

Verwacht: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/structure/client.ts src/lib/structure/__tests__/groupings-client.test.ts
git commit -m "feat(structure): createGrouping/updateGrouping/deleteGrouping in client"
```

---

## Task 2: Selectie-type uitbreiden

De selectie-state in `StructureChartStep` is nu `{ kind: 'node'|'edge'; id: string } | null`. We voegen `{ kind: 'nodes'; ids: string[] }` toe. `FloatingInspector` blijft alleen openen op single-select.

**Files:**
- Modify: `src/components/structure/StructureChart.tsx` (regels 38, 182–186)
- Modify: `src/components/structure/StructureChartStep.tsx` (regel 101 — de `selection`-state)

- [ ] **Step 1: Type uitbreiden in `StructureChart.tsx`**

Vervang regel 38:

```typescript
  onSelectionChange: (s: { kind: 'node' | 'edge'; id: string } | null) => void;
```

Door:

```typescript
  onSelectionChange: (
    s:
      | { kind: 'node'; id: string }
      | { kind: 'edge'; id: string }
      | { kind: 'nodes'; ids: string[] }
      | null,
  ) => void;
```

- [ ] **Step 2: React Flow multi-select callback aansluiten**

Importeer bovenaan `StructureChart.tsx` (bij de andere React Flow imports):

```typescript
import { useOnSelectionChange } from '@xyflow/react';
```

Voeg, in de `StructureChartInner` functie body (vóór de return), toe:

```typescript
  useOnSelectionChange({
    onChange: ({ nodes: selNodes }) => {
      if (selNodes.length >= 2) {
        props.onSelectionChange({ kind: 'nodes', ids: selNodes.map((n) => n.id) });
      }
    },
  });
```

Wijzig de `onNodeClick`-handler (regel 182) van:

```typescript
        onNodeClick={(_, n) => {
          props.onSelectionChange({ kind: 'node', id: n.id });
        }}
```

Naar:

```typescript
        onNodeClick={(event, n) => {
          // Shift-click laat React Flow's eigen multi-select alles afhandelen via useOnSelectionChange.
          // Bij gewone klik: single-select, dat overschrijft de multi-state.
          if (!event.shiftKey) {
            props.onSelectionChange({ kind: 'node', id: n.id });
          }
        }}
```

- [ ] **Step 3: Selectie-state uitbreiden in `StructureChartStep.tsx`**

Vervang regel 101:

```typescript
  const [selection, setSelection] = useState<{ kind: 'node' | 'edge'; id: string } | null>(null);
```

Door:

```typescript
  type Selection =
    | { kind: 'node'; id: string }
    | { kind: 'edge'; id: string }
    | { kind: 'nodes'; ids: string[] }
    | null;
  const [selection, setSelection] = useState<Selection>(null);
```

- [ ] **Step 4: TypeScript check**

```bash
npx tsc --noEmit
```

Verwacht: geen nieuwe errors in `StructureChart.tsx` / `StructureChartStep.tsx`. Pre-existing errors elders mogen blijven staan.

- [ ] **Step 5: Commit**

```bash
git add src/components/structure/StructureChart.tsx src/components/structure/StructureChartStep.tsx
git commit -m "feat(structure): multi-node selection support"
```

---

## Task 3: Dialog voor nieuwe fiscale eenheid

Nieuwe modal-component. Gebruikt het bestaande `Dialog` van shadcn/ui (zelfde patroon als `AddEntityDialog`).

**Files:**
- Create: `src/components/structure/AddFiscalUnityDialog.tsx`

- [ ] **Step 1: Kijken hoe `AddEntityDialog` is opgebouwd**

```bash
head -40 src/components/structure/AddEntityDialog.tsx
```

Verwacht: patroon met `Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle`, etc. en een props-shape met `open`, `onOpenChange`, en submit-callback.

- [ ] **Step 2: Dialog-component schrijven**

`src/components/structure/AddFiscalUnityDialog.tsx`:

```typescript
import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  memberCount: number;
  onConfirm: (label: string) => void;
}

export function AddFiscalUnityDialog({ open, onOpenChange, memberCount, onConfirm }: Props) {
  const [label, setLabel] = useState('');

  useEffect(() => {
    if (open) setLabel('');
  }, [open]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onConfirm(label.trim() || 'Fiscale eenheid');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Maak fiscale eenheid</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {memberCount} entiteiten worden gegroepeerd.
          </p>
          <div className="space-y-2">
            <Label htmlFor="fu-label">Naam</Label>
            <Input
              id="fu-label"
              autoFocus
              placeholder="Fiscale eenheid"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Annuleren
            </Button>
            <Button type="submit">Opslaan</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 3: TypeScript check**

```bash
npx tsc --noEmit
```

Verwacht: geen errors uit `AddFiscalUnityDialog.tsx`.

- [ ] **Step 4: Commit**

```bash
git add src/components/structure/AddFiscalUnityDialog.tsx
git commit -m "feat(structure): AddFiscalUnityDialog component"
```

---

## Task 4: "Maak fiscale eenheid"-knop in `FloatingToolbar`

Knop verschijnt alleen als 2+ entities geselecteerd zijn. Daarvoor breidt de toolbar zijn props uit.

**Files:**
- Modify: `src/components/structure/FloatingToolbar.tsx`

- [ ] **Step 1: Props uitbreiden + knop toevoegen**

Vervang het volledige bestand:

```typescript
import { Button } from '@/components/ui/button';

interface Props {
  isExtracting: boolean;
  onExportPptx: () => void;
  busy?: boolean;
  expandedClusterCount: number;
  onCollapseAll: () => void;
  orphanCount: number;
  orphansVisible: boolean;
  onToggleOrphans: () => void;
  onAutoArrange: () => void;
  selectedEntityIds: string[];
  onCreateFiscalUnity: () => void;
}

export function FloatingToolbar({
  isExtracting,
  onExportPptx,
  busy,
  expandedClusterCount,
  onCollapseAll,
  orphanCount,
  orphansVisible,
  onToggleOrphans,
  onAutoArrange,
  selectedEntityIds,
  onCreateFiscalUnity,
}: Props) {
  const canCreateFiscalUnity = selectedEntityIds.length >= 2;
  return (
    <div
      className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 bg-card border border-[hsl(var(--border-subtle))] rounded-lg shadow-lg px-3 py-2 flex items-center gap-3 text-sm"
      data-snapshot-exclude="true"
    >
      {expandedClusterCount > 0 && (
        <button
          type="button"
          onClick={onCollapseAll}
          className="text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded hover:bg-accent whitespace-nowrap"
        >
          {expandedClusterCount} expanded · Collapse
        </button>
      )}
      {orphanCount > 0 && (
        <button
          type="button"
          onClick={onToggleOrphans}
          className="text-xs text-red-700 dark:text-red-400 hover:text-red-900 dark:hover:text-red-300 px-2 py-1 rounded hover:bg-red-500/10 whitespace-nowrap"
        >
          {orphanCount} disconnected · {orphansVisible ? 'Hide' : 'Show'}
        </button>
      )}
      {canCreateFiscalUnity && (
        <Button size="sm" variant="outline" onClick={onCreateFiscalUnity} disabled={busy || isExtracting}>
          Maak fiscale eenheid ({selectedEntityIds.length})
        </Button>
      )}
      <Button size="sm" variant="outline" onClick={onExportPptx} disabled={busy || isExtracting}>
        Export PPTX
      </Button>
      <Button size="sm" variant="outline" onClick={onAutoArrange} disabled={busy || isExtracting}>
        Auto-arrange
      </Button>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/structure/FloatingToolbar.tsx
git commit -m "feat(structure): Maak fiscale eenheid button in FloatingToolbar"
```

---

## Task 5: Wire-up in `StructureChartStep` — dialog openen, opslaan

**Files:**
- Modify: `src/components/structure/StructureChartStep.tsx`

- [ ] **Step 1: Imports + state toevoegen**

Voeg bij de andere imports (vlak na regel 29) toe:

```typescript
import { AddFiscalUnityDialog } from './AddFiscalUnityDialog';
import { createGrouping } from '@/lib/structure/client';
```

In de component body, vlak na de bestaande `useState`-declaraties van `selection`:

```typescript
  const [fiscalUnityDialogOpen, setFiscalUnityDialogOpen] = useState(false);
```

- [ ] **Step 2: Toolbar-props doorgeven**

Zoek het `<FloatingToolbar` JSX-blok (rond regel 748). Voeg de twee nieuwe props toe:

```typescript
              <FloatingToolbar
                isExtracting={typeof status === 'string' && status.startsWith('extracting:')}
                onExportPptx={() => {
                  exportToPptx({
                    entities: visibleEntities,
                    edges: visibleEdges,
                    groupings,
                    taxpayerName: visibleEntities.find((e) => e.is_taxpayer)?.name ?? '',
                  });
                }}
                busy={busy}
                expandedClusterCount={expandedClusters.size}
                onCollapseAll={handleCollapseAll}
                orphanCount={tierResult?.orphans.length ?? 0}
                orphansVisible={showOrphans}
                onToggleOrphans={() => setShowOrphans((v) => !v)}
                onAutoArrange={runLayout}
                selectedEntityIds={selection?.kind === 'nodes' ? selection.ids : []}
                onCreateFiscalUnity={() => setFiscalUnityDialogOpen(true)}
              />
```

- [ ] **Step 3: Dialog mounten + create-handler**

Plaats vlak vóór de afsluitende `</main>` (of waar de andere overlays staan), als kind van het bestaande container-div:

```typescript
        <AddFiscalUnityDialog
          open={fiscalUnityDialogOpen}
          onOpenChange={setFiscalUnityDialogOpen}
          memberCount={selection?.kind === 'nodes' ? selection.ids.length : 0}
          onConfirm={async (label) => {
            if (!chart || selection?.kind !== 'nodes') return;
            const created = await createGrouping({
              chart_id: chart.id,
              kind: 'fiscal_unity',
              label,
              member_ids: selection.ids,
            });
            setGroupings((prev) => [...prev, created]);
            setFiscalUnityDialogOpen(false);
            setSelection(null);
          }}
        />
```

- [ ] **Step 4: TypeScript check**

```bash
npx tsc --noEmit
```

Verwacht: geen errors uit `StructureChartStep.tsx`.

- [ ] **Step 5: Handmatige test**

```bash
npm run dev
```

Open een chart, shift-klik 2+ entiteiten. De knop "Maak fiscale eenheid (N)" verschijnt in de toolbar. Klik. Dialog opent. Vul label in. Klik Opslaan. Gestippelde rechthoek verschijnt om de geselecteerde entiteiten.

- [ ] **Step 6: Commit**

```bash
git add src/components/structure/StructureChartStep.tsx
git commit -m "feat(structure): wire fiscal unity create flow"
```

---

## Task 6: Klikbaar label op de overlay + edit-popover

We breiden `FiscalUnityOverlay` uit met een `onLabelClick` callback en bouwen `FiscalUnityEditPopover`.

**Files:**
- Modify: `src/components/structure/overlays/FiscalUnityOverlay.tsx`
- Create: `src/components/structure/overlays/FiscalUnityEditPopover.tsx`

- [ ] **Step 1: `FiscalUnityOverlay` klikbaar maken**

Vervang het volledige bestand:

```typescript
import { useStore, type ReactFlowState } from '@xyflow/react';
import type { StructureGroup } from '@/lib/structure/types';

interface Props {
  groupings: StructureGroup[];
  onLabelClick?: (groupId: string, screenX: number, screenY: number) => void;
}

const PADDING = 16;
const LABEL_HEIGHT = 18;

export function FiscalUnityOverlay({ groupings, onLabelClick }: Props) {
  const nodeLookup = useStore((s: ReactFlowState) => s.nodeLookup);
  const transform = useStore((s: ReactFlowState) => s.transform);

  if (groupings.length === 0) return null;
  const [tx, ty, scale] = transform;

  return (
    <svg
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 4,
      }}
    >
      <g transform={`translate(${tx}, ${ty}) scale(${scale})`}>
        {groupings.map((g) => {
          const memberPositions = g.member_ids
            .map((id) => nodeLookup.get(id))
            .filter((n): n is NonNullable<ReturnType<typeof nodeLookup.get>> => Boolean(n));
          if (memberPositions.length === 0) return null;

          let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
          for (const node of memberPositions) {
            const x = node.position.x;
            const y = node.position.y;
            const w = node.measured?.width ?? 130;
            const h = node.measured?.height ?? 80;
            if (x < minX) minX = x;
            if (y < minY) minY = y;
            if (x + w > maxX) maxX = x + w;
            if (y + h > maxY) maxY = y + h;
          }

          const x = minX - PADDING;
          const y = minY - PADDING;
          const w = maxX - minX + PADDING * 2;
          const h = maxY - minY + PADDING * 2;

          const stroke = g.kind === 'fiscal_unity' ? '#555' : '#999';
          const dasharray = g.kind === 'fiscal_unity' ? '4 4' : '8 4';
          const labelText = g.label || (g.kind === 'fiscal_unity' ? 'Dutch CIT fiscal unity' : 'Consolidation group');
          const labelWidth = Math.max(140, labelText.length * 7);

          return (
            <g key={g.id}>
              <rect x={x} y={y} width={w} height={h}
                fill="none" stroke={stroke} strokeWidth={1.5}
                strokeDasharray={dasharray} rx={4} />
              <rect
                x={x + 8} y={y - LABEL_HEIGHT / 2}
                width={labelWidth} height={LABEL_HEIGHT}
                fill="#fff" stroke={stroke} strokeWidth={0.5} rx={2}
                style={{ pointerEvents: onLabelClick ? 'auto' : 'none', cursor: onLabelClick ? 'pointer' : 'default' }}
                onClick={(e) => {
                  if (!onLabelClick) return;
                  e.stopPropagation();
                  onLabelClick(g.id, e.clientX, e.clientY);
                }}
              />
              <text
                x={x + 14} y={y + 4}
                fontFamily="Inter, system-ui, sans-serif" fontSize={11} fontWeight={500}
                fill="#333"
                style={{ pointerEvents: 'none' }}
              >
                {labelText}
              </text>
            </g>
          );
        })}
      </g>
    </svg>
  );
}
```

- [ ] **Step 2: `FiscalUnityEditPopover` schrijven**

`src/components/structure/overlays/FiscalUnityEditPopover.tsx`:

```typescript
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

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    window.addEventListener('mousedown', handler);
    return () => window.removeEventListener('mousedown', handler);
  }, [onClose]);

  const save = () => {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== grouping.label) onRename(trimmed);
    onClose();
  };

  return (
    <div
      ref={ref}
      className="fixed z-50 bg-card border border-[hsl(var(--border-subtle))] rounded-md shadow-lg p-3 flex flex-col gap-2"
      style={{ left: screenX, top: screenY + 8, minWidth: 220 }}
    >
      <Input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') save();
          if (e.key === 'Escape') onClose();
        }}
      />
      <div className="flex gap-2 justify-between">
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            if (window.confirm(`Verwijder fiscale eenheid "${grouping.label}"?`)) {
              onDelete();
              onClose();
            }
          }}
          className="text-red-700 hover:text-red-900"
        >
          Verwijder
        </Button>
        <Button size="sm" onClick={save}>Opslaan</Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Wire-up in `StructureChartStep`**

In `StructureChartStep.tsx`, voeg imports toe:

```typescript
import { FiscalUnityEditPopover } from './overlays/FiscalUnityEditPopover';
import { updateGrouping, deleteGrouping } from '@/lib/structure/client';
```

State voor de popover (vlak naast `fiscalUnityDialogOpen`):

```typescript
  const [editingGrouping, setEditingGrouping] = useState<{
    grouping: StructureGroup;
    screenX: number;
    screenY: number;
  } | null>(null);
```

`FiscalUnityOverlay` zit nu INSIDE `StructureChart` (regel 191) — we moeten daar de `onLabelClick` prop doorgeven. Pas `StructureChart.tsx` aan: voeg een prop toe.

In `StructureChart.tsx` regel 38 (na de bestaande props):

```typescript
  onGroupingLabelClick?: (groupId: string, screenX: number, screenY: number) => void;
```

En geef hem door aan `<FiscalUnityOverlay ... />` (regel 191):

```typescript
        <FiscalUnityOverlay groupings={props.groupings} onLabelClick={props.onGroupingLabelClick} />
```

In `StructureChartStep.tsx`, op het `<StructureChart`-element (rond regel 708):

```typescript
                onGroupingLabelClick={(groupId, screenX, screenY) => {
                  const g = groupings.find((x) => x.id === groupId);
                  if (g) setEditingGrouping({ grouping: g, screenX, screenY });
                }}
```

En render de popover (vlak naast de dialog):

```typescript
        {editingGrouping && (
          <FiscalUnityEditPopover
            grouping={editingGrouping.grouping}
            screenX={editingGrouping.screenX}
            screenY={editingGrouping.screenY}
            onRename={async (newLabel) => {
              const updated = await updateGrouping(editingGrouping.grouping.id, { label: newLabel });
              setGroupings((prev) => prev.map((g) => (g.id === updated.id ? updated : g)));
            }}
            onDelete={async () => {
              await deleteGrouping(editingGrouping.grouping.id);
              setGroupings((prev) => prev.filter((g) => g.id !== editingGrouping.grouping.id));
            }}
            onClose={() => setEditingGrouping(null)}
          />
        )}
```

- [ ] **Step 4: TypeScript check + tests draaien**

```bash
npx tsc --noEmit
npx vitest run
```

Verwacht: geen nieuwe errors, alle bestaande tests groen.

- [ ] **Step 5: Handmatige test**

Open een chart waar al een fiscale eenheid op staat. Klik op het label van de gestippelde rechthoek. Popover opent. Hernoem → Enter → label wijzigt. Klik nogmaals → Verwijder → bevestig → rechthoek verdwijnt.

- [ ] **Step 6: Commit**

```bash
git add src/components/structure/overlays/FiscalUnityOverlay.tsx \
        src/components/structure/overlays/FiscalUnityEditPopover.tsx \
        src/components/structure/StructureChart.tsx \
        src/components/structure/StructureChartStep.tsx
git commit -m "feat(structure): edit/delete popover for fiscal unity label"
```

---

## Task 7: End-to-end handmatige verificatie

Doorloop het volledige scenario in de browser. Geen geautomatiseerde test — UI-flow met side-effects.

**Files:** (geen)

- [ ] **Step 1: Dev server starten**

```bash
npm run dev
```

- [ ] **Step 2: Volledige cyclus testen**

In een chart met ≥3 entiteiten:

1. Shift-klik 3 entiteiten. Knop "Maak fiscale eenheid (3)" verschijnt.
2. Klik de knop. Dialog opent.
3. Typ "Holding F.E." en klik Opslaan. Gestippelde rechthoek + label "Holding F.E." verschijnt.
4. Klik op het label. Popover opent.
5. Wijzig naam in "MyCo F.E." en druk Enter. Label update.
6. Klik label opnieuw. Klik Verwijder. Bevestig. Rechthoek verdwijnt.
7. Selecteer slechts 1 entity. Knop "Maak fiscale eenheid" is NIET zichtbaar.

- [ ] **Step 3: Verifieer DB-staat (optioneel, voor zekerheid)**

In Supabase Studio (http://135.225.104.142:3000) → SQL Editor:

```sql
SELECT id, kind, label, member_ids
FROM atad2_structure_groupings
ORDER BY created_at DESC LIMIT 5;
```

Verwacht: rij gemaakt tijdens stap 3, update gezien tijdens stap 5, verwijderd na stap 6.

---

## Self-Review

**1. Spec coverage:**

| Spec-onderdeel | Task |
|---|---|
| Multi-select via shift-klik | Task 2 step 2 (`useOnSelectionChange`) |
| Selectie-shape uitgebreid met `nodes`-variant | Task 2 step 3 |
| `FloatingInspector` dicht bij multi-select | Komt automatisch: bestaande inspector checkt `kind === 'node'` of `'edge'`. Geen extra task nodig. |
| "Maak fiscale eenheid"-knop bij 2+ geselecteerd | Task 4 |
| `AddFiscalUnityDialog` met label-veld | Task 3 |
| `createGrouping` opslaan + state-update | Task 5 step 3 |
| Klik op label opent popover | Task 6 step 1 + step 3 |
| Hernoemen via popover | Task 6 step 2 + step 3 |
| Verwijderen via popover met bevestiging | Task 6 step 2 (window.confirm) |
| Unit tests voor CRUD | Task 1 |
| Handmatige test van volledige flow | Task 7 |

**2. Placeholder scan:** Geen TBD/TODO. Alle code-blokken compleet. Geen "similar to Task N"-verwijzingen — code is overal volledig herhaald.

**3. Type consistency:**
- `Selection`-type: `{ kind: 'nodes'; ids: string[] }` in alle Tasks consistent (Tasks 2, 5).
- `createGrouping` signature: `(input: { chart_id, kind, label, member_ids })` consistent in Task 1 (definitie) en Task 5 (gebruik).
- `updateGrouping(id, patch)` signature consistent in Task 1 en Task 6.
- `deleteGrouping(id)` signature consistent in Task 1 en Task 6.
- `FiscalUnityOverlay.onLabelClick(groupId, screenX, screenY)` consistent in Task 6 (definitie in step 1, gebruik in step 3).
- `FiscalUnityEditPopover` props `(grouping, screenX, screenY, onRename, onDelete, onClose)` consistent in Task 6 step 2 (definitie) en step 3 (gebruik).

Geen issues. Klaar.
