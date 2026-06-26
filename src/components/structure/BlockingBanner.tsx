import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ds';
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
    <div className="absolute inset-0 bg-ds-card flex flex-col items-center justify-center px-8">
      <div className="max-w-2xl w-full bg-ds-amber-bg border border-ds-hairline rounded-ds-card p-5">
        <div className="flex items-center gap-3 mb-4">
          <AlertTriangle className="w-6 h-6 text-ds-amber" />
          <h2 className="text-[18px] font-medium leading-snug text-ds-amber-text">
            Chart cannot render. Fix the issues below first.
          </h2>
        </div>

        {result.missingFields.length > 0 && (
          <section className="mb-4">
            <h3 className="ds-tabular-nums text-[13px] font-medium text-ds-ink mb-2">
              Missing required fields ({result.missingFields.length})
            </h3>
            <ul className="space-y-1">
              {result.missingFields.map((mf) => (
                <li key={mf.entity_id} className="flex items-center justify-between text-[13px] text-ds-ink">
                  <span>
                    <span className="font-medium">{entityName(mf.entity_id)}</span> is missing{' '}
                    {mf.missing.join(' and ')}
                  </span>
                  <Button size="sm" variant="secondary" onClick={() => onOpenEntity(mf.entity_id)}>
                    Open in inspector
                  </Button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {result.cycles.length > 0 && (
          <section>
            <h3 className="ds-tabular-nums text-[13px] font-medium text-ds-ink mb-2">
              Ownership cycles ({result.cycles.length})
            </h3>
            <ul className="space-y-1">
              {result.cycles.map((cycle, i) => (
                <li key={i} className="text-[13px]">
                  <span className="text-ds-ink-secondary">
                    Cycle: {cycle.map(entityName).join(' → ')} → {entityName(cycle[0])}
                  </span>
                  <div className="flex gap-2 mt-1">
                    {cycle.map((id) => (
                      <Button key={id} size="sm" variant="secondary" onClick={() => onOpenEntity(id)}>
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
