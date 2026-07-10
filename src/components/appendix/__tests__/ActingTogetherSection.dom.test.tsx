// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { ActingTogetherSection } from '@/components/appendix/ActingTogetherSection';
import { emptyFacts } from '@/lib/appendix/facts/emptyFacts';
import type { AppendixFacts, ActingTogetherCluster, FactEntity } from '@/lib/appendix/types';

afterEach(cleanup);

const ent = (id: string, name: string, patch: Partial<FactEntity> = {}): FactEntity => ({
  id, chartEntityId: id, name, jurisdiction: 'NL', entityType: 'corporation',
  role: 'Parent', ownershipPct: null, related: false, nlTaxStatus: null, ...patch,
});

const baseFacts = (extra: Partial<AppendixFacts> = {}): AppendixFacts => ({
  ...emptyFacts(),
  entities: [
    ent('E1', 'HoldCo B.V.', { role: 'Taxpayer' }),
    ent('E2', 'Anna Jansen'),
    ent('E3', 'Bram Jansen'),
  ],
  ...extra,
});

describe('ActingTogetherSection — manual group builder', () => {
  it('builds a family group whose reasoning is pre-filled from the category template', () => {
    const onChange = vi.fn();
    render(<ActingTogetherSection facts={baseFacts()} onChange={onChange} generated />);

    // Open the builder.
    fireEvent.click(screen.getByRole('button', { name: /Add acting-together group/i }));

    // Select the two persons (category defaults to Family, target to the taxpayer).
    fireEvent.click(screen.getByRole('button', { name: /Anna Jansen/i }));
    fireEvent.click(screen.getByRole('button', { name: /Bram Jansen/i }));

    // Create the group.
    fireEvent.click(screen.getByRole('button', { name: /^Add group$/i }));

    expect(onChange).toHaveBeenCalledTimes(1);
    const next = onChange.mock.calls[0][0] as AppendixFacts;
    const group = next.actingTogether[0];
    expect(group.origin).toBe('manual');
    expect(group.basis).toBe('family');
    expect(group.memberEntityIds).toEqual(['E2', 'E3']);
    expect(group.reasoning).toContain('Anna Jansen and Bram Jansen are held within the same family group.');
    expect(group.reasoning).toContain('voting rights and capital of HoldCo B.V.');
  });

  it('only offers parents and direct shareholders as members, never subsidiaries', () => {
    const facts = baseFacts({
      entities: [
        ent('E1', 'HoldCo B.V.', { role: 'Taxpayer' }),
        ent('E2', 'Anna Jansen'),
        ent('E3', 'OpCo B.V.', { role: 'Subsidiary', ownershipPct: 100 }),
        ent('E4', 'Lender Ltd', { role: 'Group entity' }),
        ent('E5', 'Fund L.P.', { role: 'Group entity', shareholderOfTaxpayer: true }),
      ],
    });
    render(<ActingTogetherSection facts={facts} onChange={vi.fn()} generated />);
    fireEvent.click(screen.getByRole('button', { name: /Add acting-together group/i }));

    expect(screen.getByRole('button', { name: /Anna Jansen/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Fund L\.P\./i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /OpCo B\.V\./i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Lender Ltd/i })).not.toBeInTheDocument();
  });

  it('will not create a group with fewer than two members', () => {
    const onChange = vi.fn();
    render(<ActingTogetherSection facts={baseFacts()} onChange={onChange} generated />);
    fireEvent.click(screen.getByRole('button', { name: /Add acting-together group/i }));
    fireEvent.click(screen.getByRole('button', { name: /Anna Jansen/i })); // only one

    const addBtn = screen.getByRole('button', { name: /^Add group$/i }) as HTMLButtonElement;
    expect(addBtn).toBeDisabled();
    fireEvent.click(addBtn);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('renders an existing manual group with its name, members and editable reasoning', () => {
    const cluster: ActingTogetherCluster = {
      id: 'A1', memberEntityIds: ['E2', 'E3'], combinedPct: null, likelihood: 'highly_likely',
      reasoning: 'They act together over HoldCo.', origin: 'manual', basis: 'family',
      name: 'The Jansen family', targetEntityId: 'E1', excludedFromClient: false, source: 'edited',
    };
    const onChange = vi.fn();
    render(<ActingTogetherSection facts={baseFacts({ actingTogether: [cluster] })} onChange={onChange} generated />);

    expect(screen.getByDisplayValue('The Jansen family')).toBeInTheDocument();
    expect(screen.getByLabelText('Acting-together reasoning')).toHaveValue('They act together over HoldCo.');
    // Editing the reasoning routes through onChange.
    fireEvent.change(screen.getByLabelText('Acting-together reasoning'), { target: { value: 'Reworded.' } });
    expect(onChange).toHaveBeenCalled();
    const next = onChange.mock.calls[0][0] as AppendixFacts;
    expect(next.actingTogether[0].reasoning).toBe('Reworded.');
  });

  it('offers an AI suggestion as a non-binding hint that can be adopted', () => {
    const hint: ActingTogetherCluster = {
      id: 'A1', memberEntityIds: ['E2', 'E3'], combinedPct: null, likelihood: 'unclear',
      reasoning: 'Possible co-investors.', excludedFromClient: false, source: 'ai',
    };
    const onChange = vi.fn();
    render(<ActingTogetherSection facts={baseFacts({ actingTogether: [hint] })} onChange={onChange} generated />);

    expect(screen.getByText(/Suggested from the documents/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Use as a group/i }));
    const next = onChange.mock.calls[0][0] as AppendixFacts;
    expect(next.actingTogether[0].origin).toBe('manual');
  });
});
