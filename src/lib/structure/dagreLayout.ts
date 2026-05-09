import dagre from 'dagre';
import { BOX } from './shapeGeometry';

export interface LayoutNode {
  id: string;
  position: { x: number; y: number };
}

export interface LayoutEdge {
  id: string;
  source: string;
  target: string;
  kind?: 'ownership' | 'transaction';
}

export interface LayoutOptions {
  /** When true, only ownership edges drive the layout. Transactions are ignored. */
  onlyOwnership?: boolean;
  rankdir?: 'TB' | 'LR';
  nodesep?: number;
  ranksep?: number;
}

export function autoLayout<N extends LayoutNode, E extends LayoutEdge>(
  nodes: N[],
  edges: E[],
  options: LayoutOptions = {},
): N[] {
  const { onlyOwnership = true, rankdir = 'TB', nodesep = 80, ranksep = 110 } = options;

  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir, nodesep, ranksep });
  g.setDefaultEdgeLabel(() => ({}));

  nodes.forEach(n => g.setNode(n.id, { width: BOX.width, height: BOX.height }));

  edges
    .filter(e => (onlyOwnership ? e.kind !== 'transaction' : true))
    .forEach(e => g.setEdge(e.source, e.target));

  dagre.layout(g);

  return nodes.map(n => {
    const placed = g.node(n.id);
    return {
      ...n,
      position: {
        x: placed.x - BOX.width / 2,
        y: placed.y - BOX.height / 2,
      },
    } as N;
  });
}
