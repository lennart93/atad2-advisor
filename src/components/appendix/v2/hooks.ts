import { useCallback, useEffect, useState } from 'react';

/** Live `matchMedia` boolean. Defaults to true (desktop-first) before mount. */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(query).matches : true,
  );
  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [query]);
  return matches;
}

/** The desktop rail vs. mobile slide-over boundary (spec §4: ~1200px). */
export function useIsWideLayout(): boolean {
  return useMediaQuery('(min-width: 1200px)');
}

/**
 * Section open/closed, persisted per assessment. Only explicit advisor toggles are
 * stored; an untouched section always follows the live `defaults` (flagged → open,
 * verified → collapsed), so the resting state reflects the current data.
 */
export function useSectionOpenState(
  sessionId: string | undefined,
  defaults: Record<string, boolean>,
) {
  const key = `atad2:appendixV2:sec:${sessionId ?? 'unknown'}`;
  const [overrides, setOverrides] = useState<Record<string, boolean>>(() => {
    if (typeof window === 'undefined') return {};
    try {
      const raw = window.localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
    } catch {
      return {};
    }
  });
  const setOpen = useCallback((sec: string, open: boolean) => {
    setOverrides((prev) => {
      const next = { ...prev, [sec]: open };
      try { window.localStorage.setItem(key, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, [key]);
  const isOpen = (sec: string): boolean => overrides[sec] ?? defaults[sec] ?? false;
  return { isOpen, setOpen };
}

/** The single page-level row selection that drives the detail panel. */
export function useAppendixSelection() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const select = useCallback((id: string) => setSelectedId(id), []);
  const close = useCallback(() => setSelectedId(null), []);
  return { selectedId, select, close };
}

/**
 * ↑/↓ move focus between rows in a list (Enter/click opens the panel via the row's
 * own handler). Attach the returned handler to the list container; rows must carry
 * `data-appendix-row` and be focusable.
 */
export function useRowListKeyNav() {
  return useCallback((ev: React.KeyboardEvent<HTMLElement>) => {
    if (ev.key !== 'ArrowDown' && ev.key !== 'ArrowUp') return;
    const container = ev.currentTarget;
    const rows = Array.from(container.querySelectorAll<HTMLElement>('[data-appendix-row]'));
    if (rows.length === 0) return;
    const idx = rows.indexOf(document.activeElement as HTMLElement);
    ev.preventDefault();
    const nextIdx = idx < 0
      ? 0
      : ev.key === 'ArrowDown'
        ? Math.min(idx + 1, rows.length - 1)
        : Math.max(idx - 1, 0);
    rows[nextIdx]?.focus();
  }, []);
}
