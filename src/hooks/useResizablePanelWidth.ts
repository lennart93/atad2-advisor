import { useCallback, useEffect, useRef, useState } from "react";

export interface ResizablePanelWidthOptions {
  /** Smallest width in px the panel may shrink to. */
  min: number;
  /** Largest width in px the panel may grow to. */
  max: number;
  /** Width in px used before the user has dragged (and the fallback). */
  defaultWidth: number;
  /**
   * Drag direction. A right-anchored panel ("left") grows as the pointer moves
   * left; a left-anchored panel ("right") grows as it moves right.
   */
  edge?: "left" | "right";
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Validates and clamps a stored string; returns the fallback when unusable. */
export function parseStoredWidth(
  raw: string | null,
  fallback: number,
  min: number,
  max: number,
): number {
  if (raw === null) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? clamp(parsed, min, max) : fallback;
}

/**
 * A pointer-draggable, persisted panel width. Returns the current width plus a
 * set of props to spread onto the drag handle. The width is read from and
 * written to localStorage under `storageKey`, so it survives reloads and later
 * sessions. Bounds are clamped on drag, on load, and on viewport resize, so the
 * panel can never grow past the window.
 */
export function useResizablePanelWidth(
  storageKey: string,
  { min, max, defaultWidth, edge = "left" }: ResizablePanelWidthOptions,
) {
  // Cap the effective max at the viewport so a stored width from a wider screen
  // can't push the panel off-screen. The 80px keeps a sliver of the page (and
  // the overlay backdrop) visible beside the panel rather than letting it fill
  // the whole window. SSR-safe: window may be absent at first.
  const VIEWPORT_MARGIN = 80;
  const viewportMax = useCallback(
    () =>
      typeof window === "undefined"
        ? max
        : Math.min(max, window.innerWidth - VIEWPORT_MARGIN),
    [max],
  );

  const [width, setWidth] = useState<number>(() => {
    if (typeof window === "undefined") return defaultWidth;
    try {
      return parseStoredWidth(
        window.localStorage.getItem(storageKey),
        defaultWidth,
        min,
        viewportMax(),
      );
    } catch {
      return defaultWidth;
    }
  });

  // Latest width without re-binding the document drag listeners every move.
  const widthRef = useRef(width);
  widthRef.current = width;

  const persist = useCallback(
    (value: number) => {
      try {
        window.localStorage.setItem(storageKey, String(Math.round(value)));
      } catch {
        // Storage unavailable: the width still applies for this session.
      }
    },
    [storageKey],
  );

  const apply = useCallback(
    (value: number) => clamp(value, min, viewportMax()),
    [min, viewportMax],
  );

  // Re-clamp if the window shrinks below the current width.
  useEffect(() => {
    const onResize = () => setWidth((w) => apply(w));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [apply]);

  const onPointerDown = useCallback(
    (event: React.PointerEvent) => {
      // Primary button only; leave other interactions to the dialog.
      if (event.button !== 0) return;
      event.preventDefault();
      const startX = event.clientX;
      const startWidth = widthRef.current;

      const onMove = (move: PointerEvent) => {
        const delta =
          edge === "left" ? startX - move.clientX : move.clientX - startX;
        setWidth(apply(startWidth + delta));
      };
      const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        // pointercancel covers a drag the browser aborts (touch/pen cancel,
        // gesture interruption) so the body styles below never get stuck.
        window.removeEventListener("pointercancel", onUp);
        document.body.style.removeProperty("user-select");
        document.body.style.removeProperty("cursor");
        persist(widthRef.current);
      };

      // Suppress text selection and hold the resize cursor through the drag.
      document.body.style.userSelect = "none";
      document.body.style.cursor = "col-resize";
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);
    },
    [apply, edge, persist],
  );

  // Keyboard nudge for accessibility (the WAI-ARIA window-splitter pattern).
  const onKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      const step = event.shiftKey ? 64 : 16;
      let next: number | null = null;
      if (event.key === "ArrowLeft") {
        next = widthRef.current + (edge === "left" ? step : -step);
      } else if (event.key === "ArrowRight") {
        next = widthRef.current + (edge === "left" ? -step : step);
      }
      if (next === null) return;
      event.preventDefault();
      const applied = apply(next);
      setWidth(applied);
      persist(applied);
    },
    [apply, edge, persist],
  );

  return {
    width,
    /** Spread onto the drag-handle element. */
    handleProps: {
      onPointerDown,
      onKeyDown,
      role: "separator" as const,
      "aria-orientation": "vertical" as const,
      "aria-label": "Resize panel",
      "aria-valuemin": min,
      "aria-valuemax": max,
      "aria-valuenow": Math.round(width),
      tabIndex: 0,
    },
  };
}
