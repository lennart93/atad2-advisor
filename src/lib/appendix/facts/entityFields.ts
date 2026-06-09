import type { AppendixFacts, FactEntity } from '@/lib/appendix/types';

// Effective field accessors: the advisor's edit wins over the chart/AI base.
// Used everywhere the register is read (panel, matrix, exports) so a single
// source of truth governs what an entity's jurisdiction/type/status really is.

export function effJurisdiction(e: FactEntity): string | null {
  return e.edits?.jurisdiction ?? e.jurisdiction;
}

export function effEntityType(e: FactEntity): string | null {
  return e.edits?.entityType ?? e.entityType;
}

export function effNlTaxStatus(e: FactEntity): string | null {
  return e.edits?.nlTaxStatus ?? e.nlTaxStatus;
}

type EditableField = 'jurisdiction' | 'entityType' | 'nlTaxStatus';

/** Immutably set one advisor override on the entity with the given register id. */
export function withEntityEdit(
  facts: AppendixFacts,
  id: string,
  field: EditableField,
  value: string | null,
): AppendixFacts {
  return {
    ...facts,
    entities: facts.entities.map((e) =>
      e.id === id ? { ...e, edits: { ...e.edits, [field]: value } } : e,
    ),
  };
}
