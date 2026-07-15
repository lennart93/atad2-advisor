// Poortwachter van de Facts-pagina: feiten worden pas getoond wanneer de
// opgeslagen bijlage-run de HUIDIGE effectieve antwoorden weerspiegelt.
// Grandfathering: een al bevestigde bijlage (bestaande dossiers, of van vóór
// de fingerprint-kolom) wordt altijd getoond; de gate geldt vóór bevestiging.

export interface FactsGateInput {
  appendix: {
    generation_status: string;
    review_status: string;
    answers_fingerprint: string | null;
    /** isStaleGenerating al toegepast door de aanroeper. */
    generatingIsFresh: boolean;
  } | null;
  currentFingerprint: string;
  chartStatus: string | null;      // null = deze sessie heeft geen chart
  chartFingerprint: string | null;
}

export type FactsGateDecision =
  | { kind: 'show' }
  | { kind: 'wait'; action: 'none' | 'start-refine' | 'start-appendix' };

export function decideFactsGate(i: FactsGateInput): FactsGateDecision {
  const a = i.appendix;
  if (a?.review_status === 'confirmed') return { kind: 'show' };
  if (a && a.generation_status === 'ready' && a.answers_fingerprint === i.currentFingerprint) {
    return { kind: 'show' };
  }
  if (a?.generation_status === 'generating' && a.generatingIsFresh) {
    return { kind: 'wait', action: 'none' };
  }
  const hasChart = i.chartStatus !== null;
  if (hasChart && i.chartFingerprint !== i.currentFingerprint) {
    if (i.chartStatus?.startsWith('extracting')) return { kind: 'wait', action: 'none' };
    return { kind: 'wait', action: 'start-refine' };
  }
  return { kind: 'wait', action: 'start-appendix' };
}
