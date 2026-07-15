// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react';
import { FactsPanelV2 } from '@/components/appendix/v2/FactsPanelV2';
import { emptyFacts } from '@/lib/appendix/facts/emptyFacts';
import type { AppendixFacts, FactEntity, TransactionItem, ActingTogetherCluster } from '@/lib/appendix/types';

beforeAll(() => {
  // The DetailPanel reads matchMedia to pick the desktop rail vs. the mobile sheet.
  // Force the wide layout so the panel renders inline (no portal) for assertions.
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: true, media: query, onchange: null,
      addEventListener: () => {}, removeEventListener: () => {},
      addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
    }),
  });
  // jsdom lacks scrollIntoView.
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

const facts = (): AppendixFacts => ({
  ...emptyFacts(),
  entities: [
    ent('E1', 'HoldCo B.V.', 'NL', { role: 'Taxpayer' }),
    ent('E2', 'USCo Inc.', 'US'),
    ent('E3', 'DutchCo B.V.', 'NL'),
    // A foreign entity with an unknown legal form still owes a home-state view, so
    // it is flagged and the register section opens by default.
    ent('E4', 'BrazilCo Ltda', 'BR', { entityType: null }),
  ],
  transactions: [
    tx('T1', 'E1', 'E2'), // cross-border -> needs assessment (flagged)
    tx('T2', 'E1', 'E3'), // domestic -> no risk (routine, rolled up)
  ],
});

const group = (id: string, patch: Partial<ActingTogetherCluster> = {}): ActingTogetherCluster => ({
  id, memberEntityIds: ['E2', 'E3'], combinedPct: null, likelihood: 'likely', reasoning: 'They cooperate.',
  excludedFromClient: false, source: 'ai', ...patch,
});

/** The section-3 subtree, so assertions ignore the other sections. */
function section(): HTMLElement {
  const el = document.getElementById('v2-section-transactions');
  if (!el) throw new Error('transactions section not found');
  return el;
}
function registerSection(): HTMLElement {
  const el = document.getElementById('v2-section-register');
  if (!el) throw new Error('register section not found');
  return el;
}
function actingSection(): HTMLElement {
  const el = document.getElementById('v2-section-acting');
  if (!el) throw new Error('acting section not found');
  return el;
}
const rows = () => Array.from(section().querySelectorAll<HTMLElement>('[data-appendix-row]'));

describe('FactsPanelV2 — resting state + master-detail (section 3)', () => {
  it('rests with the flagged row visible, routine rows rolled up, and no panel/form controls', () => {
    render(<FactsPanelV2 facts={facts()} onChange={vi.fn()} generated sessionId="s1" />);
    // Only the flagged transaction is a row at rest; the no-risk one is rolled up.
    expect(rows()).toHaveLength(1);
    expect(within(section()).getByText(/USCo Inc\./)).toBeInTheDocument();
    expect(within(section()).queryByText(/DutchCo B\.V\./)).not.toBeInTheDocument();
    // No detail panel content yet (no Assessment group, no form controls in-section).
    expect(screen.queryByText('Assessment')).not.toBeInTheDocument();
    expect(within(section()).queryByRole('combobox')).not.toBeInTheDocument();
  });

  it('expands the no-risk group on its toggle row', () => {
    render(<FactsPanelV2 facts={facts()} onChange={vi.fn()} generated sessionId="s1" />);
    expect(rows()).toHaveLength(1);
    fireEvent.click(within(section()).getByRole('button', { name: /No risk identified/i }));
    expect(rows()).toHaveLength(2);
    expect(within(section()).getByText(/DutchCo B\.V\./)).toBeInTheDocument();
  });

  it('opens the panel on row click and swaps content without losing the panel', () => {
    render(<FactsPanelV2 facts={facts()} onChange={vi.fn()} generated sessionId="s1" />);
    fireEvent.click(rows()[0]); // T1
    expect(screen.getByText('Assessment')).toBeInTheDocument();
    expect(screen.getByText(/T1 ·/)).toBeInTheDocument();
    // Reveal + select the routine row; the panel swaps in place.
    fireEvent.click(within(section()).getByRole('button', { name: /No risk identified/i }));
    fireEvent.click(rows()[1]); // T2
    expect(screen.getByText(/T2 ·/)).toBeInTheDocument();
    expect(screen.getAllByText('Assessment')).toHaveLength(1);
  });

  it('closes the panel on Escape and clears selection', () => {
    render(<FactsPanelV2 facts={facts()} onChange={vi.fn()} generated sessionId="s1" />);
    fireEvent.click(rows()[0]);
    expect(screen.getByText('Assessment')).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByText('Assessment')).not.toBeInTheDocument();
  });

  it('opens the panel via Enter on a focused row', () => {
    render(<FactsPanelV2 facts={facts()} onChange={vi.fn()} generated sessionId="s1" />);
    const row = rows()[0];
    row.focus();
    fireEvent.keyDown(row, { key: 'Enter' });
    expect(screen.getByText('Assessment')).toBeInTheDocument();
  });

  it('the row eye toggles client visibility through the autosave path', () => {
    const onChange = vi.fn();
    render(<FactsPanelV2 facts={facts()} onChange={onChange} generated sessionId="s1" />);
    fireEvent.click(within(section()).getByRole('button', { name: /Hide T1 from the client report/i }));
    expect(onChange).toHaveBeenCalledTimes(1);
    const next = onChange.mock.calls[0][0] as AppendixFacts;
    expect(next.transactions.find((t) => t.id === 'T1')?.excludedFromClient).toBe(true);
  });

  it('reveals the add-transaction form from the collapsed affordance, also when the list is empty', () => {
    render(<FactsPanelV2 facts={facts()} onChange={vi.fn()} generated sessionId="s1" />);
    fireEvent.click(within(section()).getByRole('button', { name: /Add transaction/i }));
    expect(within(section()).getByLabelText('From entity')).toBeInTheDocument();
    expect(within(section()).getByLabelText('To entity')).toBeInTheDocument();
    expect(within(section()).getByLabelText('Transaction type')).toBeInTheDocument();
    cleanup();
    // Empty list: the section rests collapsed (nothing flagged); opened, it still
    // offers the form next to the empty-state line.
    render(<FactsPanelV2 facts={{ ...facts(), transactions: [] }} onChange={vi.fn()} generated sessionId="s1" />);
    fireEvent.click(within(section()).getAllByRole('button', { name: /Intra-group transactions/i })[0]);
    expect(within(section()).getByText('No intra-group transactions identified.')).toBeInTheDocument();
    expect(within(section()).getByRole('button', { name: /Add transaction/i })).toBeInTheDocument();
  });

  it('hides the add-transaction affordance when read-only', () => {
    render(<FactsPanelV2 facts={facts()} generated sessionId="s1" />);
    expect(within(section()).queryByRole('button', { name: /Add transaction/i })).not.toBeInTheDocument();
  });

  it('deletes a hand-added transaction in two steps from its panel', () => {
    const onChange = vi.fn();
    const withManual: AppendixFacts = {
      ...facts(),
      transactions: [...facts().transactions, tx('T3', 'E2', 'E1', { manual: true, source: 'edited' })],
    };
    render(<FactsPanelV2 facts={withManual} onChange={onChange} generated sessionId="s1" />);
    // The hand-added flow is flagged (cross-border, needs assessment) so it is a resting row.
    fireEvent.click(within(section()).getByText(/added/));
    const panel = screen.getByRole('complementary');
    fireEvent.click(within(panel).getByRole('button', { name: /^Delete transaction$/i }));
    fireEvent.click(within(panel).getByRole('button', { name: /Confirm delete/i }));
    const next = onChange.mock.calls.at(-1)![0] as AppendixFacts;
    expect(next.transactions.some((t) => t.id === 'T3')).toBe(false);
    expect(next.transactions).toHaveLength(2);
  });

  it('surfaces a self-transaction as a data issue and fixes it from the panel', () => {
    const onChange = vi.fn();
    const broken: AppendixFacts = {
      ...facts(),
      transactions: [...facts().transactions, tx('T9', 'E3', 'E3')],
    };
    render(<FactsPanelV2 facts={broken} onChange={onChange} generated sessionId="s1" />);
    // The invalid row is flagged (never rolled up) with the short error label.
    expect(within(section()).getByText(/invalid: same entity/)).toBeInTheDocument();
    // Its panel names the issue and offers the counterparty fix.
    fireEvent.click(within(section()).getByText(/invalid: same entity/));
    const panel = screen.getByRole('complementary');
    expect(within(panel).getByText(/listed on both sides/)).toBeInTheDocument();
    expect(within(panel).getByRole('combobox', { name: 'Correct counterparty' })).toBeInTheDocument();
  });

  it('offers no delete on an AI-identified transaction', () => {
    render(<FactsPanelV2 facts={facts()} onChange={vi.fn()} generated sessionId="s1" />);
    fireEvent.click(rows()[0]); // T1, source 'ai'
    const panel = screen.getByRole('complementary');
    expect(within(panel).queryByRole('button', { name: /Delete transaction/i })).not.toBeInTheDocument();
  });
});

describe('FactsPanelV2 — entity register (section 1)', () => {
  it('rests read-only: the register table has no form controls', () => {
    render(<FactsPanelV2 facts={facts()} onChange={vi.fn()} generated sessionId="s1" />);
    expect(within(registerSection()).getByText('USCo Inc.')).toBeInTheDocument();
    expect(within(registerSection()).queryByRole('combobox')).not.toBeInTheDocument();
    expect(within(registerSection()).queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('opens the entity detail panel on row click', () => {
    render(<FactsPanelV2 facts={facts()} onChange={vi.fn()} generated sessionId="s1" />);
    fireEvent.click(within(registerSection()).getByText('USCo Inc.'));
    // Scope to the panel (the register also has a "Classification (NL)" column header).
    const panel = screen.getByRole('complementary');
    expect(within(panel).getByText('Classification (NL)')).toBeInTheDocument();
    expect(within(panel).getByText(/Classification \(US\)/)).toBeInTheDocument(); // foreign home-state block
  });

  it('the home-state prompt selects the entity and opens its panel', () => {
    render(<FactsPanelV2 facts={facts()} onChange={vi.fn()} generated sessionId="s1" />);
    // getByText targets the leaf prompt button (the row's own name also contains this text).
    fireEvent.click(within(registerSection()).getByText('Set BR classification'));
    expect(within(screen.getByRole('complementary')).getByText('Classification (NL)')).toBeInTheDocument();
  });

  it('edits the short role label', () => {
    const onChange = vi.fn();
    render(<FactsPanelV2 facts={facts()} onChange={onChange} generated sessionId="s1" />);
    fireEvent.click(within(registerSection()).getByText('USCo Inc.'));
    const panel = screen.getByRole('complementary');
    fireEvent.change(within(panel).getByLabelText('Short label'), { target: { value: 'Customer' } });
    const next = onChange.mock.calls.at(-1)![0] as AppendixFacts;
    expect(next.entities.find((e) => e.id === 'E2')?.edits?.roleLabel).toBe('Customer');
  });

  it('deletes an entity in two steps and records its chart id', () => {
    const onChange = vi.fn();
    render(<FactsPanelV2 facts={facts()} onChange={onChange} generated sessionId="s1" />);
    fireEvent.click(within(registerSection()).getByText('USCo Inc.'));
    const panel = screen.getByRole('complementary');
    fireEvent.click(within(panel).getByRole('button', { name: /^Delete entity$/i }));
    fireEvent.click(within(panel).getByRole('button', { name: /Confirm delete/i }));
    const next = onChange.mock.calls.at(-1)![0] as AppendixFacts;
    expect(next.entities.some((e) => e.id === 'E2')).toBe(false);
    expect(next.removedChartEntityIds).toContain('E2');
  });
});

describe('FactsPanelV2 — acting together (section 2)', () => {
  // A manual group plus a document suggestion; the suggestion makes the section open.
  const actingFacts = (): AppendixFacts => ({
    ...facts(),
    actingTogether: [
      group('A1', { origin: 'manual', name: 'The Holders', basis: 'family', targetEntityId: 'E1' }),
      group('A2', { origin: 'ai', memberEntityIds: ['E2', 'E4'], reasoning: 'They co-invest via the fund.' }),
    ],
  });

  it('renders each group as a row and opens its editor in the panel', () => {
    render(<FactsPanelV2 facts={actingFacts()} onChange={vi.fn()} generated sessionId="s1" />);
    fireEvent.click(within(actingSection()).getByText('The Holders'));
    const panel = screen.getByRole('complementary');
    expect(within(panel).getByText('Acts together over')).toBeInTheDocument();
    expect(within(panel).getByText(/Reasoning/)).toBeInTheDocument();
  });

  it('rolls up document suggestions until Show', () => {
    render(<FactsPanelV2 facts={actingFacts()} onChange={vi.fn()} generated sessionId="s1" />);
    expect(within(actingSection()).getByText(/1 suggestion from documents/i)).toBeInTheDocument();
    expect(within(actingSection()).queryByRole('button', { name: /Use as a group/i })).not.toBeInTheDocument();
    fireEvent.click(within(actingSection()).getByRole('button', { name: /^Show$/i }));
    expect(within(actingSection()).getByRole('button', { name: /Use as a group/i })).toBeInTheDocument();
  });

  it('opens the group builder from the collapsed affordance', () => {
    render(<FactsPanelV2 facts={actingFacts()} onChange={vi.fn()} generated sessionId="s1" />);
    fireEvent.click(within(actingSection()).getByRole('button', { name: /Add acting-together group/i }));
    expect(screen.getByText('New acting-together group')).toBeInTheDocument();
  });
});
