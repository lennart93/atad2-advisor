// De hele app is opgeschaald via html { zoom: var(--app-scale) } (index.css).
// Browsers tellen die zoom mee in getBoundingClientRect en in muis-clientX/Y,
// maar NIET in offsetWidth/offsetHeight of in React Flow's interne
// coordinaten. Overal waar scherm-px naar chart-px omgerekend worden moet er
// dus behalve door de React Flow-zoom ook door deze factor gedeeld worden,
// anders schuiven metingen en sleepbewegingen 15% op (zelfde ziekte als de
// Radix-popper-drift, zie index.css).

export function getAppScale(): number {
  if (typeof document === 'undefined' || typeof window === 'undefined') return 1;
  const raw = window.getComputedStyle(document.documentElement).zoom;
  const z = Number.parseFloat(String(raw ?? ''));
  return Number.isFinite(z) && z > 0 ? z : 1;
}
