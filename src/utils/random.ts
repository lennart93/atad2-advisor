// Seeded random utility for deterministic selection
export function seededIndex(seedStr: string, max: number): number {
  if (max <= 0) return 0;
  
  let h = 2166136261 >>> 0; // FNV-1a hash offset basis
  for (let i = 0; i < seedStr.length; i++) {
    h ^= seedStr.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) % max;
}