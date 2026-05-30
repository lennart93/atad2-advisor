// src/components/structure/exports/exportToPptx.ts
import PptxGenJS from 'pptxgenjs';
import { fillFor, formatLegalForm, PALETTE } from '@/lib/structure/palette';
import type { StructureEntity, StructureEdge, StructureGroup } from '@/lib/structure/types';

const PX_PER_IN  = 96;
const BOX_W_IN   = 1.7;
const BOX_H_IN   = 0.85;

const MARGIN_IN = 0.3;
const SLIDE_W_IN = 13.333;
const SLIDE_H_IN = 7.5;

interface Fit {
  scale: number;
  offsetX: number;
  offsetY: number;
}

function computeFit(entities: StructureEntity[]): Fit {
  if (entities.length === 0) return { scale: 1, offsetX: MARGIN_IN, offsetY: MARGIN_IN };
  const xs = entities.map((e) => e.position_x);
  const ys = entities.map((e) => e.position_y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const maxX = Math.max(...xs);
  const maxY = Math.max(...ys);
  const spanX = (maxX - minX) / PX_PER_IN + BOX_W_IN;
  const spanY = (maxY - minY) / PX_PER_IN + BOX_H_IN;
  const availW = SLIDE_W_IN - 2 * MARGIN_IN;
  const availH = SLIDE_H_IN - 2 * MARGIN_IN;
  const scale = Math.min(1, availW / spanX, availH / spanY);
  const offsetX = MARGIN_IN - (minX / PX_PER_IN) * scale;
  const offsetY = MARGIN_IN - (minY / PX_PER_IN) * scale;
  return { scale, offsetX, offsetY };
}

interface EntityRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

function projectXY(e: StructureEntity, fit: Fit): EntityRect {
  return {
    x: (e.position_x / PX_PER_IN) * fit.scale + fit.offsetX,
    y: (e.position_y / PX_PER_IN) * fit.scale + fit.offsetY,
    w: BOX_W_IN * fit.scale,
    h: BOX_H_IN * fit.scale,
  };
}

function buildEntityLabel(e: StructureEntity): string {
  const lines: string[] = [e.name];
  const lf = formatLegalForm(e.legal_form).trim();
  // Normaliseer beide kanten (geen punten, geen spaties) voor de duplicate-check,
  // anders telt "S4 Energy B.V." vs "BV" als ongelijk en eindigt "BV" als tweede regel.
  const nameNorm = e.name.toLowerCase().replace(/[.\s]/g, '');
  const lfNorm = lf.toLowerCase().replace(/[.\s]/g, '');
  if (lf && lfNorm && !nameNorm.includes(lfNorm)) {
    lines.push(lf);
  }
  lines.push(`(${e.jurisdiction_iso})`);
  return lines.join('\n');
}

interface Args {
  entities: StructureEntity[];
  edges: StructureEdge[];
  groupings?: StructureGroup[];
  taxpayerName: string;
}

export async function exportToPptx({ entities, edges, groupings = [], taxpayerName }: Args) {
  const pres = new PptxGenJS();
  pres.layout = 'LAYOUT_WIDE';

  const slide = pres.addSlide();
  slide.background = { color: 'EBE5DC' };

  const fit = computeFit(entities);
  const ownershipEdges = edges.filter((e) => e.kind === 'ownership');

  // Entities
  for (const e of entities) {
    addEntityShape(slide, pres, e, fit);
  }

  // Ownership: shared bus per parent
  const ownershipByParent = new Map<string, StructureEntity[]>();
  for (const e of ownershipEdges) {
    const child = entities.find((x) => x.id === e.to_entity_id);
    if (!child) continue;
    const list = ownershipByParent.get(e.from_entity_id) ?? [];
    list.push(child);
    ownershipByParent.set(e.from_entity_id, list);
  }
  for (const [parentId, kids] of ownershipByParent) {
    const parent = entities.find((x) => x.id === parentId);
    if (!parent) continue;
    addOwnershipBus(slide, parent, kids, ownershipEdges, fit);
  }

  // Grouping overlays: dashed rectangles drawn on top of all other shapes
  for (const g of groupings) {
    addGroupingOverlay(slide, g, entities, fit);
  }

  await pres.writeFile({ fileName: `${taxpayerName || 'Taxpayer'} - Structure Chart.pptx` });
}

function addEntityShape(
  slide: PptxGenJS.Slide,
  pres: PptxGenJS,
  e: StructureEntity,
  fit: Fit,
) {
  const { x, y, w, h } = projectXY(e, fit);
  const fill = fillFor(e).replace('#', '');
  const text = buildEntityLabel(e);
  const fontSize = Math.max(7, 9 * fit.scale);
  const baseTextOpts = {
    x, y, w, h,
    fontFace: 'Inter',
    fontSize, bold: true, color: 'FFFFFF',
    align: 'center' as const, valign: 'middle' as const,
    autoFit: true,
  };
  const baseShapeOpts: any = {
    x, y, w, h,
    fill: { color: fill },
    line: { color: '404040', width: 0.5 },
  };

  switch (e.entity_type) {
    case 'corporation':
      slide.addShape(pres.ShapeType.rect, { ...baseShapeOpts, rectRadius: 0.02 } as any);
      slide.addText(text, baseTextOpts);
      break;
    case 'partnership':
      slide.addShape(pres.ShapeType.triangle, baseShapeOpts);
      slide.addText(text, baseTextOpts);
      break;
    case 'trust_or_non_entity':
      slide.addShape(pres.ShapeType.ellipse, baseShapeOpts);
      slide.addText(text, baseTextOpts);
      break;
    case 'dh_entity':
      slide.addShape(pres.ShapeType.rect, { ...baseShapeOpts, rectRadius: 0.02 } as any);
      slide.addShape(pres.ShapeType.ellipse, {
        x: x + 0.05 * fit.scale, y: y + 0.07 * fit.scale,
        w: w - 0.1 * fit.scale, h: h - 0.14 * fit.scale,
        fill: { type: 'none' } as any, line: { color: 'FFFFFF', width: 1.2 },
      } as any);
      slide.addText(text, baseTextOpts);
      break;
    case 'reverse_hybrid': {
      slide.addShape(pres.ShapeType.rect, { ...baseShapeOpts, rectRadius: 0.02 } as any);
      slide.addShape(pres.ShapeType.triangle, {
        x: x + 0.1 * fit.scale, y: y + 0.1 * fit.scale,
        w: w - 0.2 * fit.scale, h: h - 0.2 * fit.scale,
        fill: { type: 'none' } as any, line: { color: 'FFFFFF', width: 1.2 },
        flipV: true,
      } as any);
      slide.addText(text, baseTextOpts);
      break;
    }
    case 'hybrid_partnership':
      slide.addShape(pres.ShapeType.rect, { ...baseShapeOpts, rectRadius: 0.02 } as any);
      slide.addShape(pres.ShapeType.triangle, {
        x: x + 0.1 * fit.scale, y: y + 0.1 * fit.scale,
        w: w - 0.2 * fit.scale, h: h - 0.2 * fit.scale,
        fill: { type: 'none' } as any, line: { color: 'FFFFFF', width: 1.2 },
      } as any);
      slide.addText(text, baseTextOpts);
      break;
    case 'individual':
      slide.addShape(pres.ShapeType.oval, {
        x: x + w / 2 - 0.12 * fit.scale, y,
        w: 0.24 * fit.scale, h: 0.24 * fit.scale,
        fill: { color: '595550' },
      } as any);
      slide.addShape('trapezoid' as any, {
        x: x + 0.2 * fit.scale, y: y + 0.25 * fit.scale,
        w: w - 0.4 * fit.scale, h: h - 0.25 * fit.scale,
        fill: { color: '595550' },
      } as any);
      slide.addText(`${e.name}\n(${e.jurisdiction_iso})`, {
        x, y: y + h + 0.05 * fit.scale, w, h: 0.4 * fit.scale,
        fontFace: 'Inter', fontSize, color: '1d252b', align: 'center' as const,
      });
      break;
  }
}

function addOwnershipBus(
  slide: PptxGenJS.Slide,
  parent: StructureEntity,
  childEntities: StructureEntity[],
  ownershipEdges: StructureEdge[],
  fit: Fit,
) {
  if (childEntities.length === 0) return;

  const parentPos = projectXY(parent, fit);
  const childPositions = childEntities.map((c) => projectXY(c, fit));
  const parentBottomX = parentPos.x + parentPos.w / 2;
  const parentBottomY = parentPos.y + parentPos.h;

  const childTopY = Math.min(...childPositions.map((c) => c.y));
  const busY = (parentBottomY + childTopY) / 2;

  const lineColor = PALETTE.ownershipStroke.replace('#', '');

  // 1. Vertical drop from parent to bus — w=0 voor kaarsrechte verticale lijn
  slide.addShape('line' as PptxGenJS.ShapeType, {
    x: parentBottomX,
    y: parentBottomY,
    w: 0,
    h: busY - parentBottomY,
    line: { color: lineColor, width: 1.5 },
  } as never);

  if (childEntities.length > 1) {
    const minChildX = Math.min(...childPositions.map((c) => c.x + c.w / 2));
    const maxChildX = Math.max(...childPositions.map((c) => c.x + c.w / 2));
    // Horizontale bus — h=0 voor kaarsrechte horizontale lijn
    slide.addShape('line' as PptxGenJS.ShapeType, {
      x: minChildX,
      y: busY,
      w: maxChildX - minChildX,
      h: 0,
      line: { color: lineColor, width: 1.5 },
    } as never);
  }

  for (let i = 0; i < childEntities.length; i++) {
    const c = childPositions[i];
    const child = childEntities[i];
    const childTopX = c.x + c.w / 2;

    // Verticale drop naar kind — w=0 voor kaarsrechte verticale lijn
    slide.addShape('line' as PptxGenJS.ShapeType, {
      x: childTopX,
      y: busY,
      w: 0,
      h: c.y - busY,
      line: { color: lineColor, width: 1.5 },
    } as never);

    const edge = ownershipEdges.find(
      (e) => e.from_entity_id === parent.id && e.to_entity_id === child.id,
    );
    if (edge?.ownership_pct != null) {
      // Parchment-vakje achter het percentage, zelfde palette als in de app.
      const labelText = `${edge.ownership_pct}%`;
      // Brede min + ruime char-width zodat "62.7%" / "100%" niet wrappen.
      const labelW = Math.max(0.55, labelText.length * 0.11);
      const labelH = 0.26;
      const labelX = childTopX - labelW / 2;
      const labelY = (busY + c.y) / 2 - labelH / 2;
      slide.addShape('rect' as PptxGenJS.ShapeType, {
        x: labelX,
        y: labelY,
        w: labelW,
        h: labelH,
        fill: { color: 'EBE5DC' },
        line: { color: 'C9C0B2', width: 0.5 },
        rectRadius: 0.03,
      } as never);
      slide.addText(labelText, {
        x: labelX,
        y: labelY,
        w: labelW,
        h: labelH,
        fontFace: 'Inter',
        fontSize: Math.max(8, 9 * fit.scale),
        bold: true,
        color: '3a3530',
        align: 'center' as const,
        valign: 'middle' as const,
        wrap: false,
      } as never);
    }
  }
}

function addGroupingOverlay(
  slide: PptxGenJS.Slide,
  g: StructureGroup,
  entities: StructureEntity[],
  fit: Fit,
) {
  const members = entities.filter((e) => g.member_ids.includes(e.id));
  if (members.length === 0) return;

  const rects = members.map((e) => projectXY(e, fit));
  const minX = Math.min(...rects.map((r) => r.x));
  const minY = Math.min(...rects.map((r) => r.y));
  const maxX = Math.max(...rects.map((r) => r.x + r.w));
  const maxY = Math.max(...rects.map((r) => r.y + r.h));

  const padding = 0.15;
  const x = minX - padding;
  const y = minY - padding;
  const w = maxX - minX + padding * 2;
  const h = maxY - minY + padding * 2;

  const strokeColor = g.kind === 'fiscal_unity' ? '555555' : '999999';
  const dashType: 'dash' | 'dashDot' = g.kind === 'fiscal_unity' ? 'dash' : 'dashDot';

  slide.addShape('rect' as PptxGenJS.ShapeType, {
    x, y, w, h,
    line: { color: strokeColor, width: 1.5, dashType },
    fill: { type: 'none' as never },
    rectRadius: 0.04,
  } as never);

  slide.addText(
    g.label || (g.kind === 'fiscal_unity' ? 'Dutch CIT fiscal unity' : 'Consolidation group'),
    {
      x: x + 0.1, y: y - 0.1, w: 1.6, h: 0.2,
      fontFace: 'Inter', fontSize: Math.max(7, 9 * fit.scale),
      color: strokeColor, align: 'left' as const,
      fill: { color: 'FFFFFF' },
    },
  );
}

