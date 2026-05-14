import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { ValidatorResult } from '@/lib/structure/validator';
import type { StructureEntity } from '@/lib/structure/types';

interface Props {
  result: ValidatorResult;
  entities: StructureEntity[];
  onOpenEntity: (id: string) => void;
}

export function BlockingBanner({ result, entities, onOpenEntity }: Props) {
  const entityName = (id: string) => entities.find((e) => e.id === id)?.name ?? id;
  return (
    <div className="absolute inset-0 bg-white flex flex-col items-center justify-center px-8">
      <div className="max-w-2xl w-full bg-red-50 border border-red-300 rounded-lg p-6">
        <div className="flex items-center gap-3 mb-4">
          <AlertTriangle className="w-6 h-6 text-red-700" />
          <h2 className="text-lg font-semibold text-red-900">
            Chart cannot render — fix the issues below first
          </h2>
        </div>

        {result.missingFields.length > 0 && (
          <section className="mb-4">
            <h3 className="text-sm font-semibold text-neutral-800 mb-2">
              Missing required fields ({result.missingFields.length})
            </h3>
            <ul className="space-y-1">
              {result.missingFields.map((mf) => (
                <li key={mf.entity_id} className="flex items-center justify-between text-sm">
                  <span>
                    <strong>{entityName(mf.entity_id)}</strong> — missing{' '}
                    {mf.missing.join(' and ')}
                  </span>
                  <Button size="sm" variant="outline" onClick={() => onOpenEntity(mf.entity_id)}>
                    Open in inspector
                  </Button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {result.cycles.length > 0 && (
          <section>
            <h3 className="text-sm font-semibold text-neutral-800 mb-2">
              Ownership cycles ({result.cycles.length})
            </h3>
            <ul className="space-y-1">
              {result.cycles.map((cycle, i) => (
                <li key={i} className="text-sm">
                  <span className="text-neutral-700">
                    Cycle: {cycle.map(entityName).join(' → ')} → {entityName(cycle[0])}
                  </span>
                  <div className="flex gap-2 mt-1">
                    {cycle.map((id) => (
                      <Button key={id} size="sm" variant="outline" onClick={() => onOpenEntity(id)}>
                        Open {entityName(id)}
                      </Button>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}
