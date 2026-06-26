import { type RefObject, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

/**
 * Transient coachmark that points at the "Open questions" button and reminds
 * the user that the still-open questions can be answered from here. It is a
 * one-line near-black popover (active-step styling), not a modal: no backdrop,
 * it never blocks the page, and it dismisses on the first sign of activity.
 *
 * Lives inside OpenQuestionsButton so it shares the button ref, the live count
 * and the register's open state. The button only renders while something is
 * actively open (badge count > 0), so a zero count never reaches this hint.
 *
 * Flip SHOW_OPEN_QUESTIONS_HINT_ONCE to false to show the hint on every entry
 * to the questionnaire instead of once per assessment. When true (default), a
 * dismissed flag is persisted in sessionStorage keyed by session id so the
 * hint stays gone for the rest of that assessment.
 */
export const SHOW_OPEN_QUESTIONS_HINT_ONCE = true;

const ENTRANCE_DELAY_MS = 400; // let the page settle before the hint slides in
const AUTO_DISMISS_MS = 5000;
const SETTLE_MS = 1500; // ignore "soft" dismissals (a scroll) for this long after opening
const EXIT_MS = 160; // fade-out before unmount
const VIEWPORT_MARGIN = 8; // keep this far from the viewport edges
const ANCHOR_GAP = 10; // space below the button, leaving room for the caret
const CARET_INSET = 16; // keep the caret clear of the rounded corners
const CARET_HALF = 5; // half the caret square, to centre it on a point

function storageKey(sessionId: string) {
  return `atad2.openQuestionsHintDismissed:${sessionId}`;
}

function readDismissed(sessionId: string) {
  if (!SHOW_OPEN_QUESTIONS_HINT_ONCE) return false;
  try {
    return window.sessionStorage.getItem(storageKey(sessionId)) === "1";
  } catch {
    return false; // sessionStorage unavailable (private mode): treat as not dismissed.
  }
}

function writeDismissed(sessionId: string) {
  if (!SHOW_OPEN_QUESTIONS_HINT_ONCE) return;
  try {
    window.sessionStorage.setItem(storageKey(sessionId), "1");
  } catch {
    // Quota / private mode: accept the in-memory dismissal only.
  }
}

interface Position {
  top: number;
  left: number;
  caretLeft: number;
}

export interface OpenQuestionsHintProps {
  /** The "Open questions" button this hint points at. */
  anchorRef: RefObject<HTMLButtonElement>;
  /** Live open-questions count; drives the pluralised copy. */
  count: number;
  /** Scopes the persisted dismissed flag to this assessment. */
  sessionId: string;
  /** Only eligible to appear on the questionnaire (questions) step. */
  active: boolean;
  /** The register is open: never compete with it, dismiss instead. */
  panelOpen: boolean;
  /** Opens the register; the same action as clicking the button. */
  onActivate: () => void;
}

export function OpenQuestionsHint({
  anchorRef,
  count,
  sessionId,
  active,
  panelOpen,
  onActivate,
}: OpenQuestionsHintProps) {
  const [dismissed, setDismissed] = useState(() => readDismissed(sessionId));
  const [open, setOpen] = useState(false);
  const [entered, setEntered] = useState(false);
  const [pos, setPos] = useState<Position | null>(null);
  // The count frozen at the moment the hint appeared. The visible label reads
  // this (not the live count) so the announcement is stable and is not
  // re-announced if the count shifts while the hint is up.
  const [shownCount, setShownCount] = useState(count);

  const popRef = useRef<HTMLDivElement>(null);
  const shownThisMountRef = useRef(false);
  const closingRef = useRef(false);
  const exitTimeoutRef = useRef<number | null>(null);
  // Soft dismissals (a scroll) only count once the page has settled, so a
  // layout-shift scroll on the first frame can't dismiss the hint instantly.
  const armedRef = useRef(false);

  // Keep the latest onActivate without re-subscribing the listeners below
  // (the parent re-renders whenever the live count changes).
  const onActivateRef = useRef(onActivate);
  useEffect(() => {
    onActivateRef.current = onActivate;
  }, [onActivate]);

  const computePosition = useCallback(() => {
    const anchor = anchorRef.current;
    const pop = popRef.current;
    if (!anchor || !pop) return;
    const rect = anchor.getBoundingClientRect();
    const width = pop.offsetWidth;
    const top = rect.bottom + ANCHOR_GAP;
    // Right-align to the button, then clamp inside the viewport so it never
    // runs off-screen on narrow widths.
    let left = rect.right - width;
    const maxLeft = window.innerWidth - width - VIEWPORT_MARGIN;
    left = Math.max(VIEWPORT_MARGIN, Math.min(left, maxLeft));
    // Keep the caret under the centre of the button even after a left shift.
    const caretCentre = rect.left + rect.width / 2 - left;
    const caretLeft = Math.max(CARET_INSET, Math.min(caretCentre, width - CARET_INSET));
    setPos({ top, left, caretLeft });
  }, [anchorRef]);

  // Persist the dismissal and start the fade-out. Safe to call before the hint
  // has shown (e.g. the panel opened first): it just records the dismissal.
  const close = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    if (SHOW_OPEN_QUESTIONS_HINT_ONCE) {
      writeDismissed(sessionId);
      setDismissed(true);
    }
    setEntered(false);
    if (exitTimeoutRef.current !== null) window.clearTimeout(exitTimeoutRef.current);
    exitTimeoutRef.current = window.setTimeout(() => {
      exitTimeoutRef.current = null;
      setOpen(false);
    }, EXIT_MS);
  }, [sessionId]);

  // Cancel a pending fade-out if the component unmounts (e.g. the count hit 0
  // and the button dropped the chip) so no timer outlives the component.
  useEffect(
    () => () => {
      if (exitTimeoutRef.current !== null) window.clearTimeout(exitTimeoutRef.current);
    },
    [],
  );

  // Schedule the entrance once the hint is eligible.
  useEffect(() => {
    const eligible =
      active && count > 0 && !panelOpen && !(SHOW_OPEN_QUESTIONS_HINT_ONCE && dismissed);
    if (!eligible) return;
    if (SHOW_OPEN_QUESTIONS_HINT_ONCE && shownThisMountRef.current) return;
    const t = window.setTimeout(() => {
      closingRef.current = false;
      shownThisMountRef.current = true;
      setShownCount(count);
      setOpen(true);
    }, ENTRANCE_DELAY_MS);
    return () => window.clearTimeout(t);
  }, [active, count, panelOpen, dismissed]);

  // Opening the register always wins: dismiss the hint.
  useEffect(() => {
    if (panelOpen) close();
  }, [panelOpen, close]);

  // Deliberately NOT dismissing when the live count changes. The badge count is
  // composed from several queries plus a realtime channel, so it keeps settling
  // for the first moment on the questions step; dismissing on the first change
  // is what made the coachmark flash instead of lingering for a few seconds.
  // A genuine "user answered a question" is a page click, which the
  // document-click listener below already dismisses on. The label stays frozen
  // at shownCount, so a late settle just leaves the count it opened with.

  // Position before paint, then trigger the entrance transition one frame later
  // so the first painted frame is correctly placed and invisible (no flash).
  useLayoutEffect(() => {
    if (!open) return;
    computePosition();
    const raf = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(raf);
  }, [open, computePosition]);

  // Auto-dismiss after a few seconds.
  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(close, AUTO_DISMISS_MS);
    return () => window.clearTimeout(t);
  }, [open, close]);

  // Arm the scroll dismissal only after a short settle window. The questions
  // step can emit a layout-shift scroll just as the hint appears (content and
  // the progress list resolving); without this it would dismiss on the first
  // frame. Hard dismissals (a page click, Escape, opening the register) stay
  // immediate, so only the "you scrolled away" signal waits for the page.
  useEffect(() => {
    armedRef.current = false;
    if (!open) return;
    const t = window.setTimeout(() => {
      armedRef.current = true;
    }, SETTLE_MS);
    return () => window.clearTimeout(t);
  }, [open]);

  // Dismiss on any outward interaction; reposition on resize. Capture phase so
  // a scroll inside the questionnaire's own overflow container (scroll events
  // do not bubble) and clicks anywhere on the page are both caught.
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      // A click on the hint itself opens the register (a shortcut) and dismisses;
      // a click anywhere else just dismisses. Handled here rather than via a React
      // onClick so it does not depend on event propagation out of the body portal.
      if (popRef.current?.contains(e.target as Node)) {
        onActivateRef.current();
      }
      close();
    };
    const onScroll = () => {
      if (armedRef.current) close();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    const onResize = () => computePosition();
    document.addEventListener("click", onDocClick, true);
    window.addEventListener("scroll", onScroll, { capture: true, passive: true });
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", onResize);
    return () => {
      document.removeEventListener("click", onDocClick, true);
      window.removeEventListener("scroll", onScroll, { capture: true });
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", onResize);
    };
  }, [open, close, computePosition]);

  if (!open) return null;

  const label =
    shownCount === 1
      ? "1 question still open. You can answer it here."
      : `${shownCount} questions still open. You can answer them here.`;

  return createPortal(
    <div
      ref={popRef}
      role="status"
      aria-live="polite"
      style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999 }}
      className={cn(
        "fixed z-50 cursor-pointer select-none whitespace-nowrap rounded-ds-control bg-ds-accent px-3.5 py-2.5",
        "text-[13px] leading-snug text-ds-card",
        "shadow-[0_2px_4px_rgb(0_0_0/0.08),0_16px_34px_-16px_rgb(0_0_0/0.35)]",
        "transition-[opacity,transform] duration-150 ease-out",
        "motion-reduce:transition-[opacity] motion-reduce:duration-150",
        entered
          ? "translate-y-0 opacity-100"
          : "-translate-y-1 opacity-0 motion-reduce:translate-y-0",
      )}
    >
      {/* Caret pointing up at the button; same near-black fill as the popover. */}
      <span
        aria-hidden
        className="absolute -top-[5px] h-2.5 w-2.5 rotate-45 rounded-[2px] bg-ds-accent"
        style={{ left: pos ? pos.caretLeft - CARET_HALF : 0 }}
      />
      {label}
    </div>,
    document.body,
  );
}
