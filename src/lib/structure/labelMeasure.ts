import type { StructureEntity } from './types';

export const NODE_WIDTH = 160;
export const NODE_HEIGHT = 100;
const NODE_TEXT_WIDTH = NODE_WIDTH - 16 * 2; // 128px usable width inside 16px padding each side
const MAX_LINES = 3;
const ELLIPSIS = '…';

const cache = new Map<string, string[]>();
let ctx: CanvasRenderingContext2D | null = null;
const FONT_SPEC = 'bold 13px Inter, system-ui, sans-serif';

function getCtx(): CanvasRenderingContext2D | null {
  if (ctx) return ctx;
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  ctx = canvas.getContext('2d');
  if (ctx) ctx.font = FONT_SPEC;
  return ctx;
}

export function measureWidth(text: string): number {
  const c = getCtx();
  if (!c) {
    // SSR / jsdom fallback — ~7px per char at 13px bold
    return text.length * 7;
  }
  return c.measureText(text).width;
}

function fits(text: string): boolean {
  return measureWidth(text) <= NODE_TEXT_WIDTH;
}

function hardBreak(token: string): string[] {
  const result: string[] = [];
  let cur = '';
  for (const ch of token) {
    const candidate = cur + ch;
    if (fits(candidate)) {
      cur = candidate;
    } else {
      if (cur) result.push(cur);
      cur = ch;
    }
  }
  if (cur) result.push(cur);
  return result;
}

function truncateWithEllipsis(text: string): string {
  let cur = text;
  while (cur.length > 0 && !fits(cur + ELLIPSIS)) {
    cur = cur.slice(0, -1);
  }
  return cur + ELLIPSIS;
}

function wrapName(name: string): string[] {
  // Empty / whitespace-only name → return the raw input so the caller can
  // decide how to render it (the EntityNode fallback uses [data.name]).
  if (!name.trim()) return [name];

  const tokens = name.trim().split(/\s+/);
  const lines: string[] = [];
  let current = '';

  for (const tok of tokens) {
    if (!fits(tok)) {
      // Token alone doesn't fit — flush current, hard-break the token.
      if (current) {
        lines.push(current);
        current = '';
      }
      const broken = hardBreak(tok);
      for (let i = 0; i < broken.length; i++) {
        if (i === broken.length - 1) {
          current = broken[i];
        } else {
          lines.push(broken[i]);
        }
      }
      continue;
    }
    const candidate = current ? current + ' ' + tok : tok;
    if (fits(candidate)) {
      current = candidate;
    } else {
      lines.push(current);
      current = tok;
    }
  }
  if (current) lines.push(current);

  // Enforce MAX_LINES with ellipsis on the last visible line.
  if (lines.length > MAX_LINES) {
    const visible = lines.slice(0, MAX_LINES);
    // Re-pack the remaining onto the last visible line and truncate.
    const remainder = lines.slice(MAX_LINES).join(' ');
    const lastWithRemainder = visible[MAX_LINES - 1] + ' ' + remainder;
    visible[MAX_LINES - 1] = truncateWithEllipsis(lastWithRemainder);
    return visible;
  }

  return lines;
}

function cacheKey(e: StructureEntity): string {
  return `${e.id}|${e.name}|${e.legal_form ?? ''}|${e.jurisdiction_iso ?? ''}`;
}

export function wrapLabels(entities: StructureEntity[]): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const e of entities) {
    const key = cacheKey(e);
    let lines = cache.get(key);
    if (!lines) {
      lines = wrapName(e.name);
      cache.set(key, lines);
    }
    out.set(e.id, lines);
  }
  return out;
}

export function _resetCacheForTests(): void {
  cache.clear();
  ctx = null;
}
