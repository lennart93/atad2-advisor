// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react';
import AppendixPreview from '@/pages/dev/AppendixPreview';
import { emptyFacts } from '@/lib/appendix/facts/emptyFacts';
import type { AppendixFacts, FactEntity, TransactionItem } from '@/lib/appendix/types';

beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: true, media: query, onchange: null,
      addEventListener: () => {}, removeEventListener: () => {},
      addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
    }),
  });
  Element.prototype.scrollIntoView = () => {};
});
afterEach(cleanup);

const ent = (id: string, name: string, jur: string | null, patch: Partial<FactEntity> = {}): FactEntity => ({
  id, chartEntityId: id, name, jurisdiction: jur, entityType: 'corporation',
  role: 'Group entity', ownershipPct: null, related: true, nlTaxStatus: 'resident', ...patch,
});
const tx = (id: string, from: string, to: string, patch: Partial<TransactionItem> = {}): TransactionItem => ({
  id, fromEntityId: from, toEntityId: to, kind: 'financing', instrument: null, note: null,
  articlesTested: [], status: 'proposed', excludedFromClient: false, source: 'ai', ...patch,
});

/** Two NL entities (nothing owed) and one flagged cross-border transaction: exactly
 *  one open review item, resolvable in the panel with plain button clicks. */
const oneOpenItem = (): AppendixFacts => ({
  ...emptyFacts(),
  entities: [
    ent('E1', 'HoldCo B.V.', 'NL', { role: 'Taxpayer' }),
    ent('E2', 'DutchCo B.V.', 'NL'),
    ent('E3', 'USCo Inc.', 'US'), // per-se corporation default: home state resolved
  ],
  transactions: [tx('T1', 'E1', 'E3')],
});

const next = () => screen.getByRole('button', { name: /^Next$/ });
const BLOCK_MSG = /Resolve all items marked 'need review' to continue\./;

describe('Facts page review gate (dev preview harness)', () => {
  it('disables Next and states the reason while items need review', () => {
    render(<AppendixPreview initialFacts={oneOpenItem()} />);
    expect(next()).toBeDisabled();
    expect(screen.getByText(BLOCK_MSG)).toBeInTheDocument();
  });

  it('enables Next in place when the last review item is resolved', () => {
    render(<AppendixPreview initialFacts={oneOpenItem()} />);
    expect(next()).toBeDisabled();
    // Open the flagged transaction and override its status to "No risk identified".
    fireEvent.click(screen.getByText(/HoldCo B\.V\. → USCo Inc\./));
    const panel = screen.getByRole('complementary');
    fireEvent.click(within(panel).getByRole('button', { name: 'No risk identified' }));
    expect(next()).toBeEnabled();
    expect(screen.queryByText(BLOCK_MSG)).not.toBeInTheDocument();
  });

  it('starts enabled when nothing needs review', () => {
    const clean = oneOpenItem();
    render(<AppendixPreview initialFacts={{ ...clean, transactions: [] }} />);
    expect(next()).toBeEnabled();
    expect(screen.queryByText(BLOCK_MSG)).not.toBeInTheDocument();
  });
});
