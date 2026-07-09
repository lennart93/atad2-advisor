// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react';
import { ChecklistV2 } from '@/components/appendix/v2/ChecklistV2';
import type { AppendixRow, SkeletonRow, Status } from '@/lib/appendix/types';

beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (q: string) => ({ matches: true, media: q, onchange: null, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false }),
  });
  Element.prototype.scrollIntoView = () => {};
});
afterEach(cleanup);

const sk = (rowId: string, sectionId: string, sectionTitle: string, conditionTested: string): SkeletonRow => ({
  rowId, sectionId, sectionTitle, legalBasis: `Article ${rowId} Vpb`, conditionTested,
  effect: null, kind: 'operative', allowedStates: ['Not triggered', 'Triggered', 'Insufficient information', 'N/A'],
  drivenByQuestionIds: [], relatedView: 'none',
});
const row = (rowId: string, status: Status | null, patch: Partial<AppendixRow> = {}): AppendixRow => ({
  rowId, aiStatus: status, aiReasoning: null, aiProvenance: null, status,
  reasoning: `Reasoning for ${rowId}.`, provenance: null, excludedFromClient: false, source: 'ai',
  stale: false, staleReason: null, editedBy: null, editedAt: null, ...patch,
});

const skeleton: SkeletonRow[] = [
  sk('1.1', '1', 'Scope', 'The taxpayer is within scope.'),
  sk('3.1', '3', 'Primary rule', 'A deduction without inclusion arises.'),
  sk('3.2', '3', 'Primary rule', 'The mismatch is attributable to the taxpayer.'),
];
const rows: AppendixRow[] = [
  row('1.1', 'Triggered'),          // gate -> routine (not a finding)
  row('3.1', 'Triggered'),          // status, risk -> flagged
  row('3.2', 'Not triggered'),      // status, clear -> routine
];

function condSection(id: string): HTMLElement {
  const el = document.getElementById(`v2-section-cond-${id}`);
  if (!el) throw new Error(`section ${id} not found`);
  return el;
}

describe('ChecklistV2 — Part B resting state + panel', () => {
  it('opens the section with a finding and collapses the verified one', () => {
    render(<ChecklistV2 rows={rows} skeleton={skeleton} onEdit={vi.fn()} onToggleExclude={vi.fn()} sessionId="s1" />);
    // Section 3 (has a triggered finding) is open; its flagged row is visible.
    expect(within(condSection('3')).getByText('A deduction without inclusion arises.')).toBeInTheDocument();
    // The clean 3.2 row is rolled up (hidden until Show).
    expect(within(condSection('3')).queryByText('The mismatch is attributable to the taxpayer.')).not.toBeInTheDocument();
    // Section 1 (only a gate, no finding) starts collapsed: its body is not rendered.
    expect(within(condSection('1')).queryByText('The taxpayer is within scope.')).not.toBeInTheDocument();
  });

  it('digest counts conditions and findings', () => {
    render(<ChecklistV2 rows={rows} skeleton={skeleton} onEdit={vi.fn()} onToggleExclude={vi.fn()} sessionId="s1" />);
    expect(screen.getByText('3 conditions')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /1 need review/i })).toBeInTheDocument();
  });

  it('opens the reasoning/source/visibility panel on row click', () => {
    render(<ChecklistV2 rows={rows} skeleton={skeleton} onEdit={vi.fn()} onToggleExclude={vi.fn()} sessionId="s1" />);
    fireEvent.click(within(condSection('3')).getByText('A deduction without inclusion arises.'));
    const panel = screen.getByRole('complementary');
    expect(within(panel).getByText('Reasoning for 3.1.')).toBeInTheDocument();
    expect(within(panel).getByRole('button', { name: /Source/i })).toBeInTheDocument();
    expect(within(panel).getByRole('button', { name: /Edit reasoning/i })).toBeInTheDocument();
  });

  it('the panel visibility toggle calls onToggleExclude', () => {
    const onToggleExclude = vi.fn();
    render(<ChecklistV2 rows={rows} skeleton={skeleton} onEdit={vi.fn()} onToggleExclude={onToggleExclude} sessionId="s1" />);
    fireEvent.click(within(condSection('3')).getByText('A deduction without inclusion arises.'));
    const panel = screen.getByRole('complementary');
    fireEvent.click(within(panel).getByRole('switch'));
    expect(onToggleExclude).toHaveBeenCalledWith('3.1', true);
  });

  it('Escape closes the panel', () => {
    render(<ChecklistV2 rows={rows} skeleton={skeleton} onEdit={vi.fn()} onToggleExclude={vi.fn()} sessionId="s1" />);
    fireEvent.click(within(condSection('3')).getByText('A deduction without inclusion arises.'));
    expect(screen.getByRole('complementary').textContent).toContain('Reasoning for 3.1.');
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.getByRole('complementary').textContent).not.toContain('Reasoning for 3.1.');
  });
});
