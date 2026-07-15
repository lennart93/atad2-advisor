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

describe('Facts page review gate (dev preview harness)', () => {
  it('disables Next, shows quiet progress and names the open items in the tooltip', () => {
    render(<AppendixPreview initialFacts={oneOpenItem()} />);
    expect(next()).toBeDisabled();
    // 3 entities + 1 transaction + the acting section = 5 items; 1 transaction open.
    expect(screen.getByText('4 of 5 reviewed')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Review progress' })).toBeInTheDocument();
    expect(next()).toHaveAttribute('title', '1 transaction still needs review');
    expect(screen.getByRole('button', { name: 'Review next' })).toBeInTheDocument();
  });

  it('Review next opens the first unresolved item in the panel', () => {
    render(<AppendixPreview initialFacts={oneOpenItem()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Review next' }));
    const panel = screen.getByRole('complementary');
    // The flagged transaction T1 is selected and its assessment opens.
    expect(within(panel).getByText(/T1 ·/)).toBeInTheDocument();
  });

  it('enables Next in place when the last review item is resolved', () => {
    render(<AppendixPreview initialFacts={oneOpenItem()} />);
    expect(next()).toBeDisabled();
    // Open the flagged transaction and override its status to "No risk identified".
    // (The table row itself is the interactive element, keyed by its dom id.)
    const row = document.getElementById('v2-tx-T1');
    if (!row) throw new Error('T1 row not found');
    fireEvent.click(row);
    const panel = screen.getByRole('complementary');
    fireEvent.click(within(panel).getByRole('button', { name: 'No risk identified' }));
    expect(next()).toBeEnabled();
    // Fully reviewed: the progress cluster retires.
    expect(screen.queryByText(/of 5 reviewed/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Review next' })).not.toBeInTheDocument();
  });

  it('starts enabled when nothing needs review', () => {
    const clean = oneOpenItem();
    render(<AppendixPreview initialFacts={{ ...clean, transactions: [] }} />);
    expect(next()).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Review next' })).not.toBeInTheDocument();
  });
});
