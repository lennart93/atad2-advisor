// The short role descriptor shown next to a group entity's name, shared by the
// on-screen register (FactsPanel) and the Word memo (memoAppendices) so both
// read the same. Below-25% group entities used to all say "Other group company";
// instead characterise them from the data with a small, VERY SHORT controlled
// vocabulary (one or two words). DRAFT heuristics, pending tax review.

import type { FactEntity } from '../types';
import { effEntityType, effRelationType } from './entityFields';

/**
 * A short functional label for a group entity, inferred from its name and type.
 * Every branch returns at most two words; the fallback is "Group company" rather
 * than the old, longer "Other group company".
 */
export function characteriseGroupEntity(e: FactEntity): string {
  const n = (e.name ?? '').toLowerCase();
  const t = (effEntityType(e) ?? '').toLowerCase();
  if (/stichting|foundation/.test(n) || t === 'foundation') return 'Foundation';
  if (/\bholding\b|houdster/.test(n)) return 'Holding';
  if (/management|beheer/.test(n)) return 'Management';
  if (/\bbank\b|financ|krediet|credit|lending|\blender\b|\bloan\b/.test(n)) return 'Lender';
  if (/gemeente|provincie|ministerie|ministry|municipal|\bpublic\b|overheid|\bstate\b/.test(n) || t === 'public') {
    return 'Public body';
  }
  if (/fonds|participat|investment|\binvest\b|capital|venture|equity|\bpartners\b/.test(n) || t === 'fund') {
    return 'Fund';
  }
  if ((e.ownershipPct ?? e.relatedViaPct ?? 0) > 0) return 'Co-investor';
  return 'Group company';
}

/**
 * The full role descriptor: an advisor override wins; a subsidiary states whether
 * the holding is direct; a group entity reads as its shareholder role or the short
 * characterisation above; everything else keeps its plain role.
 */
export function roleLabel(e: FactEntity): string {
  const label = e.edits?.roleLabel?.trim();
  if (label) return label;
  const edited = effRelationType(e);
  if (edited && edited !== 'Unrelated') return edited;
  if (e.role === 'Subsidiary' && e.directLink != null) {
    return e.directLink ? 'Subsidiary (direct)' : 'Subsidiary (indirect)';
  }
  if (e.role === 'Group entity') return e.shareholderOfTaxpayer ? 'Shareholder' : characteriseGroupEntity(e);
  return e.role;
}
