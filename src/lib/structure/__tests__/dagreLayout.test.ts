import { describe, it, expect } from 'vitest';
import { autoLayout } from '@/lib/structure/dagreLayout';

describe('dagreLayout.autoLayout', () => {
  it('places parent above child', () => {
    const nodes = [
      { id: 'a', position: { x: 0, y: 0 } },
      { id: 'b', position: { x: 0, y: 0 } },
    ];
    const edges = [{ id: 'e1', source: 'a', target: 'b' }];
    const out = autoLayout(nodes, edges);
    const a = out.find(n => n.id === 'a')!;
    const b = out.find(n => n.id === 'b')!;
    expect(b.position.y).toBeGreaterThan(a.position.y);
  });

  it('separates two children of the same parent horizontally', () => {
    const nodes = [
      { id: 'p', position: { x: 0, y: 0 } },
      { id: 'c1', position: { x: 0, y: 0 } },
      { id: 'c2', position: { x: 0, y: 0 } },
    ];
    const edges = [
      { id: 'e1', source: 'p', target: 'c1' },
      { id: 'e2', source: 'p', target: 'c2' },
    ];
    const out = autoLayout(nodes, edges);
    const c1 = out.find(n => n.id === 'c1')!;
    const c2 = out.find(n => n.id === 'c2')!;
    expect(Math.abs(c1.position.x - c2.position.x)).toBeGreaterThan(50);
    expect(c1.position.y).toBe(c2.position.y); // same rank
  });

  it('skips ownership-only edges from layout when only-ownership flag is on', () => {
    const nodes = [
      { id: 'p', position: { x: 0, y: 0 } },
      { id: 'c', position: { x: 0, y: 0 } },
      { id: 'unrelated', position: { x: 0, y: 0 } },
    ];
    const edges = [{ id: 'e1', source: 'p', target: 'c', kind: 'transaction' as const }];
    const out = autoLayout(nodes, edges, { onlyOwnership: true });
    expect(out).toHaveLength(3);
  });
});
