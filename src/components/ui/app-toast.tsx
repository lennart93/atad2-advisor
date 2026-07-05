/* App toast (handoff 67): the single on-brand toast for every transient
 * message in the app. Replaces both sonner and the old shadcn use-toast.
 *
 * API (drop-in for the sonner call sites):
 *   toast.success("Word document ready", { description: "...", action: { label: "Open", onClick } })
 *   toast.error("Upload failed", { description: "..." })
 *   toast.info("Draft saved", { description: "..." })
 *   toast.working("Generating memorandum", { description: "..." })  // no auto-dismiss
 *   toast.dismiss(id?)
 *
 * A call with an existing `id` updates that toast in place (working -> success
 * swaps keep their spot in the stack; the dismiss bar restarts).
 */

import * as React from 'react';
import './app-toast.css';

export type ToastKind = 'success' | 'working' | 'error' | 'info';

export type ToastAction = {
  label: string;
  onClick: () => void;
};

export type ToastOptions = {
  /** Reuse an id to update an existing toast in place. */
  id?: string | number;
  description?: React.ReactNode;
  /** Inline underlined action (Open, Try again). Dismisses the toast on click. */
  action?: ToastAction;
  /** Lifetime in ms. Defaults to 5000; working toasts never auto-dismiss. */
  duration?: number;
};

type ToastItem = {
  id: string | number;
  kind: ToastKind;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: ToastAction;
  duration: number;
  /** Bumped on in-place updates so the dismiss bar restarts. */
  epoch: number;
  leaving: boolean;
};

const DEFAULT_DURATION = 5000;
const EXIT_MS = 300;

let items: ToastItem[] = [];
let counter = 0;
let paused = false;
const listeners = new Set<() => void>();

type DismissTimer = { handle: number | null; remaining: number; startedAt: number };
const timers = new Map<string | number, DismissTimer>();

function notify() {
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return items;
}

function isPaused() {
  return paused;
}

function startTimer(id: string | number) {
  const timer = timers.get(id);
  if (!timer || timer.handle !== null) return;
  timer.startedAt = Date.now();
  timer.handle = window.setTimeout(() => dismiss(id), timer.remaining);
}

function scheduleDismiss(id: string | number, duration: number) {
  clearDismiss(id);
  if (!Number.isFinite(duration)) return;
  timers.set(id, { handle: null, remaining: duration, startedAt: 0 });
  if (!paused) startTimer(id);
}

function clearDismiss(id: string | number) {
  const timer = timers.get(id);
  if (timer && timer.handle !== null) window.clearTimeout(timer.handle);
  timers.delete(id);
}

function pauseAll() {
  if (paused) return;
  paused = true;
  timers.forEach((timer) => {
    if (timer.handle !== null) {
      window.clearTimeout(timer.handle);
      timer.remaining = Math.max(0, timer.remaining - (Date.now() - timer.startedAt));
      timer.handle = null;
    }
  });
  notify();
}

function resumeAll() {
  if (!paused) return;
  paused = false;
  timers.forEach((_, id) => startTimer(id));
  notify();
}

function fire(kind: ToastKind, title: React.ReactNode, opts: ToastOptions = {}): string | number {
  const id = opts.id ?? `apptoast-${++counter}`;
  const duration = opts.duration ?? (kind === 'working' ? Infinity : DEFAULT_DURATION);
  const existing = items.find((t) => t.id === id && !t.leaving);
  if (existing) {
    items = items.map((t) =>
      t === existing
        ? { ...t, kind, title, description: opts.description, action: opts.action, duration, epoch: t.epoch + 1 }
        : t,
    );
  } else {
    items = [
      { id, kind, title, description: opts.description, action: opts.action, duration, epoch: 0, leaving: false },
      ...items.filter((t) => t.id !== id),
    ];
  }
  scheduleDismiss(id, duration);
  notify();
  return id;
}

function dismiss(id?: string | number) {
  const targetIds = new Set(
    items.filter((t) => !t.leaving && (id === undefined || t.id === id)).map((t) => t.id),
  );
  if (targetIds.size === 0) return;
  targetIds.forEach((tid) => clearDismiss(tid));
  items = items.map((t) => (targetIds.has(t.id) ? { ...t, leaving: true } : t));
  notify();
  window.setTimeout(() => {
    // Only remove the cards that are still leaving: a toast re-fired with the
    // same id in the meantime is a fresh card and stays.
    items = items.filter((t) => !(targetIds.has(t.id) && t.leaving));
    notify();
  }, EXIT_MS);
}

export const toast = {
  success: (title: React.ReactNode, opts?: ToastOptions) => fire('success', title, opts),
  error: (title: React.ReactNode, opts?: ToastOptions) => fire('error', title, opts),
  info: (title: React.ReactNode, opts?: ToastOptions) => fire('info', title, opts),
  /** Long-running job: terracotta spinner, no auto-dismiss. Swap it out by id when done. */
  working: (title: React.ReactNode, opts?: ToastOptions) => fire('working', title, opts),
  dismiss,
};

const CLOSE_ICON = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
    <path d="M18 6 6 18M6 6l12 12" />
  </svg>
);

const ICONS: Record<ToastKind, React.ReactNode> = {
  success: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  ),
  working: (
    <svg className="apptoast-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
      <path d="M12 3a9 9 0 1 0 9 9" />
      <path d="M12 3a9 9 0 0 1 9 9" opacity=".25" />
    </svg>
  ),
  error: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 8v5" />
      <circle cx="12" cy="16.5" r=".4" fill="currentColor" strokeWidth="1.4" />
      <path d="M10.3 3.9 2.7 17a2 2 0 0 0 1.7 3h15.2a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
    </svg>
  ),
  info: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5" />
      <circle cx="12" cy="7.8" r=".4" fill="currentColor" strokeWidth="1.4" />
    </svg>
  ),
};

function ToastCard({ item }: { item: ToastItem }) {
  return (
    <div
      className="apptoast"
      data-kind={item.kind}
      data-leaving={item.leaving ? '' : undefined}
      role={item.kind === 'error' ? 'alert' : 'status'}
    >
      <span className="apptoast-ic" aria-hidden="true">{ICONS[item.kind]}</span>
      <div className="apptoast-body">
        <div className="apptoast-title">{item.title}</div>
        {(item.description !== undefined || item.action) && (
          <div className="apptoast-msg">
            {item.description}
            {item.action && (
              <>
                {' '}
                <button
                  type="button"
                  className="apptoast-act"
                  onClick={() => {
                    item.action?.onClick();
                    dismiss(item.id);
                  }}
                >
                  {item.action.label}
                </button>
              </>
            )}
          </div>
        )}
      </div>
      <button type="button" className="apptoast-x" aria-label="Dismiss" onClick={() => dismiss(item.id)}>
        {CLOSE_ICON}
      </button>
      <span
        key={item.epoch}
        className="apptoast-prog"
        style={
          Number.isFinite(item.duration)
            ? { animation: `apptoast-shrink ${item.duration}ms linear forwards` }
            : undefined
        }
      />
    </div>
  );
}

export function Toaster() {
  const toasts = React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const stackPaused = React.useSyncExternalStore(subscribe, isPaused, isPaused);
  if (toasts.length === 0) return null;
  return (
    <div
      className="apptoast-stack"
      data-paused={stackPaused ? '' : undefined}
      aria-live="polite"
      aria-label="Notifications"
      onMouseEnter={pauseAll}
      onMouseLeave={resumeAll}
    >
      {toasts.map((t) => (
        <ToastCard key={t.id} item={t} />
      ))}
    </div>
  );
}
