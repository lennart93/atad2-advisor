import { useRef, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { Button, FooterBarGrid } from '@/components/ds';
import { FactsPanelV2 } from '@/components/appendix/v2/FactsPanelV2';
import { ReviewProgress } from '@/components/appendix/v2/ReviewProgress';
import { emptyFacts } from '@/lib/appendix/facts/emptyFacts';
import { partAReviewProgress, openItemsPhrase } from '@/lib/appendix/needsAttention';
import type { AppendixFacts, FactEntity, TransactionItem } from '@/lib/appendix/types';

// ---------------------------------------------------------------------------
// Dev-only preview of the Part A facts page (/__dev/appendix-preview), mounted
// only when import.meta.env.DEV. It renders the REAL FactsPanelV2 with local
// fixture state, so the page can be exercised and screenshotted without a
// login or production data. Never bundled in production builds.
// ---------------------------------------------------------------------------

const ent = (id: string, name: string, jur: string | null, patch: Partial<FactEntity> = {}): FactEntity => ({
  id, chartEntityId: id, name, jurisdiction: jur, entityType: 'corporation',
  role: 'Group entity', ownershipPct: null, related: true, nlTaxStatus: 'non_transparent', ...patch,
});
const tx = (id: string, from: string, to: string, kind: string, patch: Partial<TransactionItem> = {}): TransactionItem => ({
  id, fromEntityId: from, toEntityId: to, kind, instrument: null, note: null,
  articlesTested: [], status: 'proposed', excludedFromClient: false, source: 'ai', ...patch,
});

function fixtureFacts(): AppendixFacts {
  return {
    ...emptyFacts(),
    entities: [
      ent('E1', 'Duhco Nederland B.V.', 'NL', { role: 'Taxpayer', nlTaxStatus: 'resident' }),
      // Foreign subsidiary without a stored home-state view: owes a classification.
      ent('E2', 'D.R.C. S.A.', 'LU', { role: 'Subsidiary', ownershipPct: 100 }),
      // NL entity whose NL classification is still unknown (task 3).
      ent('E5', "Brouwerij 't IJ B.V.", 'NL', { role: 'Subsidiary', ownershipPct: 100, nlTaxStatus: 'unknown' }),
      // US Inc.: home-state view resolved by the per-se-corporation default.
      ent('E7', 'Duvel USA Inc.', 'US', { ownershipPct: 40 }),
      // Jurisdiction unknown (task 3 / task 6).
      ent('E13', "D'Achouffe Brie", null, { ownershipPct: 30, entityType: null }),
    ],
    transactions: [
      tx('T1', 'E1', 'E2', 'Interest on intercompany loan', { instrument: 'loan agreement' }),
      tx('T2', 'E1', 'E5', 'Management services', { relevant: false, relevanceReason: 'Domestic flow between two Dutch residents.' }),
      tx('T3', 'E2', 'E13', 'Royalty on brewing licence'),
      // The invalid self-transaction from the demo dossier (task 7).
      tx('T9', 'E5', 'E5', 'Cost recharge'),
    ],
  };
}

export default function AppendixPreview({ initialFacts }: { initialFacts?: AppendixFacts } = {}) {
  const [facts, setFacts] = useState<AppendixFacts>(initialFacts ?? fixtureFacts);
  // The same review gate + footer the real facts page uses.
  const progress = partAReviewProgress(facts);
  const nextBlockTitle = openItemsPhrase(progress) ?? undefined;
  const reviewNextRef = useRef<(() => void) | null>(null);

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-[1400px] px-6 py-8 pb-28">
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-lg text-foreground">Technical appendix — facts preview (dev fixture)</h1>
          <Button variant="secondary" size="sm" onClick={() => setFacts(fixtureFacts())}>Reset fixture</Button>
        </div>
        <FactsPanelV2
          facts={facts}
          onChange={setFacts}
          generated
          sessionId="dev-preview"
          registerReviewNext={(fn) => { reviewNextRef.current = fn; }}
        />
      </div>
      <div className="fixed inset-x-0 bottom-0 border-t border-border bg-background px-6 py-3">
        <FooterBarGrid
          right={
            <>
              <ReviewProgress progress={progress} onReviewNext={() => reviewNextRef.current?.()} />
              <span title={progress.open > 0 ? nextBlockTitle : undefined}>
                <Button variant="primary" disabled={progress.open > 0} title={progress.open > 0 ? nextBlockTitle : undefined} onClick={() => { /* preview only */ }}>
                  Next
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </span>
            </>
          }
        />
      </div>
    </div>
  );
}
