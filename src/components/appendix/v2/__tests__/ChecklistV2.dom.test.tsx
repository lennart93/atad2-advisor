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
  it('every section starts open, findings or not', () => {
    render(<ChecklistV2 rows={rows} skeleton={skeleton} onEdit={vi.fn()} onToggleExclude={vi.fn()} sessionId="s1" />);
    // ALL rows are visible directly (no roll-up layer, no collapsed sections):
    // the advisor reads the checklist top to bottom.
    expect(within(condSection('3')).getByText('A deduction without inclusion arises.')).toBeInTheDocument();
    expect(within(condSection('3')).getByText('The mismatch is attributable to the taxpayer.')).toBeInTheDocument();
    expect(within(condSection('1')).getByText('The taxpayer is within scope.')).toBeInTheDocument();
  });

  it('shows no counters above the sections', () => {
    render(<ChecklistV2 rows={rows} skeleton={skeleton} onEdit={vi.fn()} onToggleExclude={vi.fn()} sessionId="s1" />);
    expect(screen.queryByText('3 conditions')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /1 need review/i })).not.toBeInTheDocument();
  });

  it('a flagged row carries Mark reviewed; clicking signs it off', () => {
    const onToggleReviewed = vi.fn();
    render(<ChecklistV2 rows={rows} skeleton={skeleton} onEdit={vi.fn()} onToggleExclude={vi.fn()} onToggleReviewed={onToggleReviewed} sessionId="s1" />);
    // Only the flagged condition (3.1, Triggered) gets the review control.
    const btn = screen.getByRole('button', { name: 'Mark 3.1 reviewed' });
    expect(screen.queryByRole('button', { name: /Mark 3\.2 reviewed/ })).not.toBeInTheDocument();
    fireEvent.click(btn);
    expect(onToggleReviewed).toHaveBeenCalledWith('3.1', true);
  });

  it('a reviewed row shows an undoable Reviewed check and the section reads Complete', () => {
    const onToggleReviewed = vi.fn();
    const reviewedRows = rows.map((r) => (r.rowId === '3.1' ? { ...r, reviewed: true } : r));
    render(<ChecklistV2 rows={reviewedRows} skeleton={skeleton} onEdit={vi.fn()} onToggleExclude={vi.fn()} onToggleReviewed={onToggleReviewed} sessionId="s2" />);
    // No pending review anywhere: the chips read Complete; the section is open by default.
    expect(screen.queryByText(/need review/i)).not.toBeInTheDocument();
    const undo = within(condSection('3')).getByRole('button', { name: 'Undo review for 3.1' });
    fireEvent.click(undo);
    expect(onToggleReviewed).toHaveBeenCalledWith('3.1', false);
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
