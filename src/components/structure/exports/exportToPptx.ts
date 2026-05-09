// src/components/structure/exports/exportToPptx.ts
import PptxGenJS from 'pptxgenjs';
import { fillFor, PALETTE } from '@/lib/structure/palette';
import type { StructureEntity, StructureEdge } from '@/lib/structure/types';

const PX_PER_IN  = 96;
const BOX_W_IN   = 1.4;
const BOX_H_IN   = 0.85;

interface Args {
  entities: StructureEntity[];
  edges: StructureEdge[];
  taxpayerName: string;
}

export async function exportToPptx({ entities, edges, taxpayerName }: Args) {
  const pres = new PptxGenJS();
  pres.layout = 'LAYOUT_WIDE';

  const slide = pres.addSlide();
  slide.background = { color: 'EBE5DC' };

  for (const e of entities) {
    const x = e.position_x / PX_PER_IN;
    const y = e.position_y / PX_PER_IN;
    addEntityShape(slide, pres, e, x, y);
  }

  for (const ed of edges) {
    const from = entities.find(x => x.id === ed.from_entity_id);
    const to   = entities.find(x => x.id === ed.to_entity_id);
    if (!from || !to) continue;
    addEdge(slide, ed, from, to);
  }

  await pres.writeFile({ fileName: `${taxpayerName || 'Taxpayer'} - Structure Chart.pptx` });
}

function addEntityShape(
  slide: PptxGenJS.Slide,
  pres: PptxGenJS,
  e: StructureEntity,
  x: number, y: number,
) {
  const fill = fillFor(e).replace('#', '');
  const text = `${e.name}\n${e.legal_form ?? ''}\n(${e.jurisdiction_iso})`.trim();
  const baseTextOpts = {
    x, y, w: BOX_W_IN, h: BOX_H_IN,
    fontFace: 'Inter',
    fontSize: 9, bold: true, color: 'FFFFFF',
    align: 'center' as const, valign: 'middle' as const,
  };
  const baseShapeOpts: any = {
    x, y, w: BOX_W_IN, h: BOX_H_IN,
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
        x: x + 0.05, y: y + 0.07, w: BOX_W_IN - 0.1, h: BOX_H_IN - 0.14,
        fill: { type: 'none' } as any, line: { color: 'FFFFFF', width: 1.2 },
      } as any);
      slide.addText(text, baseTextOpts);
      break;
    case 'reverse_hybrid': {
      slide.addShape(pres.ShapeType.rect, { ...baseShapeOpts, rectRadius: 0.02 } as any);
      slide.addShape(pres.ShapeType.triangle, {
        x: x + 0.1, y: y + 0.1, w: BOX_W_IN - 0.2, h: BOX_H_IN - 0.2,
        fill: { type: 'none' } as any, line: { color: 'FFFFFF', width: 1.2 },
        flipV: true,
      } as any);
      slide.addText(text, baseTextOpts);
      break;
    }
    case 'hybrid_partnership':
      slide.addShape(pres.ShapeType.rect, { ...baseShapeOpts, rectRadius: 0.02 } as any);
      slide.addShape(pres.ShapeType.triangle, {
        x: x + 0.1, y: y + 0.1, w: BOX_W_IN - 0.2, h: BOX_H_IN - 0.2,
        fill: { type: 'none' } as any, line: { color: 'FFFFFF', width: 1.2 },
      } as any);
      slide.addText(text, baseTextOpts);
      break;
    case 'individual':
      slide.addShape(pres.ShapeType.oval, {
        x: x + BOX_W_IN/2 - 0.12, y, w: 0.24, h: 0.24, fill: { color: '595550' },
      } as any);
      slide.addShape('trapezoid' as any, {
        x: x + 0.2, y: y + 0.25, w: BOX_W_IN - 0.4, h: BOX_H_IN - 0.25,
        fill: { color: '595550' },
      } as any);
      slide.addText(`${e.name}\n(${e.jurisdiction_iso})`, {
        x, y: y + BOX_H_IN + 0.05, w: BOX_W_IN, h: 0.4,
        fontFace: 'Inter', fontSize: 9, color: '1d252b', align: 'center' as const,
      });
      break;
  }
}

function addEdge(slide: PptxGenJS.Slide, e: StructureEdge, from: StructureEntity, to: StructureEntity) {
  const fx = from.position_x / PX_PER_IN + BOX_W_IN/2;
  const fy = from.position_y / PX_PER_IN + BOX_H_IN;
  const tx = to.position_x   / PX_PER_IN + BOX_W_IN/2;
  const ty = to.position_y   / PX_PER_IN;
  const stroke =
    e.kind === 'ownership'
      ? PALETTE.ownershipStroke
      : (e.is_mismatch ? PALETTE.mismatchStroke : PALETTE.normalTransactionStroke);

  slide.addShape('line' as any, {
    x: Math.min(fx, tx), y: Math.min(fy, ty),
    w: Math.abs(tx - fx) || 0.01, h: Math.abs(ty - fy) || 0.01,
    line: {
      color: stroke.replace('#',''),
      width: 1.5,
      endArrowType: e.kind === 'transaction' ? 'triangle' : undefined,
    } as any,
    flipH: tx < fx, flipV: ty < fy,
  } as any);

  if (e.kind === 'ownership' && e.ownership_pct != null) {
    slide.addText(`${e.ownership_pct}%`, {
      x: (fx + tx)/2 - 0.3, y: (fy + ty)/2 - 0.1, w: 0.6, h: 0.2,
      fontFace: 'Inter', fontSize: 9, color: '3a3530', align: 'center' as const,
    });
  }
  if (e.kind === 'transaction') {
    const verb = e.transaction_type ?? 'Transaction';
    const amt  = e.amount_eur != null ? ` EUR ${(e.amount_eur).toLocaleString('en-US')}` : '';
    slide.addText(`${verb}${amt}`, {
      x: (fx + tx)/2 - 0.6, y: (fy + ty)/2 - 0.1, w: 1.2, h: 0.2,
      fontFace: 'Inter', fontSize: 9, bold: true, color: stroke.replace('#',''), align: 'center' as const,
    });
  }
}
