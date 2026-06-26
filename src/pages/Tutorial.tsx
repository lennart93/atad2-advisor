import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, ArrowRight, Check, X } from "lucide-react";
import { AnimatedLogo } from "@/components/AnimatedLogo";
import { cn } from "@/lib/utils";
import { CHAPTERS } from "@/components/tutorial/chapters";
import type { Chapter } from "@/components/tutorial/types";

const STORAGE_KEY = "atad2.tutorial.lastIndex";

const Tutorial = () => {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();

  const chapters = useMemo<Chapter[]>(() => CHAPTERS, []);

  // ──────────────────────────────────────────────────────────────────
  // Index — derived from ?c=<id>&s=<step>; falls back to localStorage.
  // ──────────────────────────────────────────────────────────────────
  const initial = useMemo(() => {
    const cid = params.get("c");
    const sid = parseInt(params.get("s") || "0", 10);
    const idx = chapters.findIndex((c) => c.id === cid);
    if (idx >= 0) return { chapter: idx, step: Math.min(Math.max(sid, 0), chapters[idx].steps.length - 1) };
    const saved = typeof window !== "undefined" ? window.localStorage.getItem(STORAGE_KEY) : null;
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        const i = chapters.findIndex((c) => c.id === parsed.chapter);
        if (i >= 0) return { chapter: i, step: Math.min(Math.max(parsed.step || 0, 0), chapters[i].steps.length - 1) };
      } catch {
        /* ignore */
      }
    }
    return { chapter: 0, step: 0 };
  }, [chapters, params]);

  const [chapterIdx, setChapterIdx] = useState(initial.chapter);
  const [stepIdx, setStepIdx] = useState(initial.step);

  const chapter = chapters[chapterIdx];
  const step = chapter.steps[stepIdx];

  // Persist + reflect in URL whenever we move.
  useEffect(() => {
    setParams({ c: chapter.id, s: String(stepIdx) }, { replace: true });
    if (typeof window !== "undefined") {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ chapter: chapter.id, step: stepIdx }),
      );
    }
  }, [chapter.id, stepIdx, setParams]);

  // ──────────────────────────────────────────────────────────────────
  // Flat step index for progress + navigation.
  // ──────────────────────────────────────────────────────────────────
  const flat = useMemo(() => {
    const result: { chapter: number; step: number }[] = [];
    chapters.forEach((c, ci) => c.steps.forEach((_, si) => result.push({ chapter: ci, step: si })));
    return result;
  }, [chapters]);

  const flatPos = flat.findIndex((f) => f.chapter === chapterIdx && f.step === stepIdx);
  const flatTotal = flat.length;

  const goTo = useCallback(
    (ci: number, si: number) => {
      const c = chapters[ci];
      if (!c) return;
      setChapterIdx(ci);
      setStepIdx(Math.min(Math.max(si, 0), c.steps.length - 1));
    },
    [chapters],
  );

  const next = useCallback(() => {
    const i = Math.min(flatPos + 1, flatTotal - 1);
    goTo(flat[i].chapter, flat[i].step);
  }, [flat, flatPos, flatTotal, goTo]);

  const prev = useCallback(() => {
    const i = Math.max(flatPos - 1, 0);
    goTo(flat[i].chapter, flat[i].step);
  }, [flat, flatPos, goTo]);

  const close = useCallback(() => {
    navigate("/");
  }, [navigate]);

  // ──────────────────────────────────────────────────────────────────
  // Keyboard shortcuts.
  // ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || (e.key === " " && !e.shiftKey)) {
        e.preventDefault();
        next();
      } else if (e.key === "ArrowLeft" || (e.key === " " && e.shiftKey)) {
        e.preventDefault();
        prev();
      } else if (e.key === "Escape") {
        e.preventDefault();
        close();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [next, prev, close]);

  // Scroll the active sidebar item into view.
  const activeChapterRef = useRef<HTMLAnchorElement | null>(null);
  useEffect(() => {
    activeChapterRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [chapterIdx]);

  return (
    <div className="min-h-screen bg-background">
      {/* ─── Header ─── */}
      <header className="sticky top-0 z-30 border-b border-[hsl(var(--border-subtle))] bg-background/85 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-4 px-4">
          <Link to="/" className="flex items-center gap-2.5">
            <AnimatedLogo size={26} interactive={false} />
            <div className="leading-tight">
              <div className="text-[12.5px] font-semibold tracking-tight">ATAD2 Advisor</div>
              <div className="text-[10.5px] text-muted-foreground">A guided tour</div>
            </div>
          </Link>

          <div className="ml-4 hidden flex-1 items-center gap-3 md:flex">
            <ProgressBar pos={flatPos + 1} total={flatTotal} />
            <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
              {flatPos + 1} / {flatTotal}
            </span>
          </div>

          <div className="flex items-center gap-1">
            <span className="hidden text-[10.5px] text-muted-foreground sm:inline">
              <kbd className="rounded border border-[hsl(var(--border-subtle))] px-1 py-px font-mono text-[10px]">←</kbd>
              <kbd className="ml-0.5 rounded border border-[hsl(var(--border-subtle))] px-1 py-px font-mono text-[10px]">→</kbd>
              <span className="mx-2">to navigate</span>
              <kbd className="rounded border border-[hsl(var(--border-subtle))] px-1 py-px font-mono text-[10px]">Esc</kbd>
              <span className="ml-2">to exit</span>
            </span>
            <button
              onClick={close}
              className="ml-1 inline-flex h-8 items-center gap-1.5 rounded-md border border-[hsl(var(--border-default))] bg-background px-2.5 text-[11.5px] font-medium text-foreground transition-colors hover:bg-muted"
            >
              <X className="h-3.5 w-3.5" />
              Exit tour
            </button>
          </div>
        </div>
      </header>

      {/* ─── Main grid: chapter index | content ─── */}
      <main className="mx-auto grid max-w-7xl grid-cols-1 gap-6 px-4 py-6 lg:grid-cols-[240px_1fr]">
        <aside className="hidden lg:block">
          <div className="sticky top-20">
            <div className="px-2 text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              Chapters
            </div>
            <nav className="mt-2 flex flex-col gap-0.5">
              {chapters.map((c, i) => {
                const done = i < chapterIdx;
                const active = i === chapterIdx;
                return (
                  <a
                    key={c.id}
                    ref={active ? activeChapterRef : undefined}
                    onClick={(e) => {
                      e.preventDefault();
                      goTo(i, 0);
                    }}
                    href={`#${c.id}`}
                    className={cn(
                      "group relative flex items-start gap-2.5 rounded-md px-2.5 py-2 text-[12px] transition-colors",
                      active
                        ? "bg-foreground/[0.04] ring-1 ring-[hsl(var(--border-default))]"
                        : "hover:bg-muted/60",
                    )}
                  >
                    <span
                      className={cn(
                        "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-mono tabular-nums",
                        active
                          ? "bg-foreground text-background"
                          : done
                          ? "bg-ds-green text-ds-card"
                          : "border border-[hsl(var(--border-default))] text-muted-foreground",
                      )}
                    >
                      {done ? <Check className="h-3 w-3" /> : i + 1}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span
                        className={cn(
                          "block truncate font-medium tracking-tight",
                          active ? "text-foreground" : "text-foreground/80",
                        )}
                      >
                        {c.title}
                      </span>
                      {c.teaser && (
                        <span className="mt-0.5 block truncate text-[10.5px] text-muted-foreground">
                          {c.teaser}
                        </span>
                      )}
                    </span>
                  </a>
                );
              })}
            </nav>
          </div>
        </aside>

        {/* Content column */}
        <div className="min-w-0">
          <AnimatePresence mode="wait">
            <motion.article
              key={`${chapter.id}-${stepIdx}`}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.32, ease: [0.2, 0, 0, 1] }}
            >
              {/* Chapter heading */}
              <div className="mb-5 flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                    Chapter {chapterIdx + 1} of {chapters.length}
                  </span>
                  {chapter.steps.length > 1 && (
                    <span className="text-[10px] font-mono text-muted-foreground/70">
                      · step {stepIdx + 1} of {chapter.steps.length}
                    </span>
                  )}
                </div>
                <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{chapter.title}</h1>
                {chapter.intro && stepIdx === 0 && (
                  <p className="mt-1 max-w-2xl text-[13.5px] leading-relaxed text-muted-foreground">
                    {chapter.intro}
                  </p>
                )}
              </div>

              {/* Visual */}
              <div className="mb-5">{step.visual}</div>

              {/* Step caption */}
              <section className="grid grid-cols-1 gap-x-8 gap-y-4 lg:grid-cols-[1fr_280px]">
                <div>
                  {step.heading && (
                    <h2 className="text-lg font-semibold tracking-tight">{step.heading}</h2>
                  )}
                  <div className="mt-1 max-w-2xl space-y-2 text-[13.5px] leading-relaxed text-foreground">
                    {(Array.isArray(step.caption) ? step.caption : [step.caption]).map((p, i) => (
                      <p key={i}>{p}</p>
                    ))}
                  </div>
                </div>
                {step.bullets && step.bullets.length > 0 && (
                  <div className="rounded-lg border border-[hsl(var(--border-subtle))] bg-muted/20 p-4">
                    <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                      Good to know
                    </div>
                    <ul className="mt-2 space-y-1.5 text-[12.5px] leading-snug">
                      {step.bullets.map((b, i) => (
                        <li key={i} className="flex gap-2">
                          <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-foreground/60" />
                          <span>{b}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </section>
            </motion.article>
          </AnimatePresence>

          {/* Pager */}
          <div className="mt-8 flex items-center justify-between gap-4 border-t border-[hsl(var(--border-subtle))] pt-5">
            <button
              onClick={prev}
              disabled={flatPos === 0}
              className="inline-flex h-9 items-center gap-1.5 rounded-md border border-[hsl(var(--border-default))] bg-background px-3 text-[12.5px] font-medium transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Previous
            </button>

            <Dots positions={flat} active={flatPos} chapters={chapters} onJump={goTo} />

            {flatPos < flatTotal - 1 ? (
              <button
                onClick={next}
                className="inline-flex h-9 items-center gap-1.5 rounded-md bg-foreground px-3 text-[12.5px] font-medium text-background shadow-btn-primary transition-transform hover:translate-y-[-1px]"
              >
                Next
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            ) : (
              <button
                onClick={close}
                className="inline-flex h-9 items-center gap-1.5 rounded-md bg-foreground px-3 text-[12.5px] font-medium text-background shadow-btn-primary transition-transform hover:translate-y-[-1px]"
              >
                <Check className="h-3.5 w-3.5" />
                Finish tour
              </button>
            )}
          </div>
        </div>
      </main>
    </div>
  );
};

// ────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────

function ProgressBar({ pos, total }: { pos: number; total: number }) {
  const pct = Math.round((pos / total) * 100);
  return (
    <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
      <motion.div
        className="absolute inset-y-0 left-0 rounded-full bg-foreground"
        initial={false}
        animate={{ width: `${pct}%` }}
        transition={{ duration: 0.5, ease: [0.2, 0, 0, 1] }}
      />
    </div>
  );
}

function Dots({
  positions,
  active,
  chapters,
  onJump,
}: {
  positions: { chapter: number; step: number }[];
  active: number;
  chapters: Chapter[];
  onJump: (ci: number, si: number) => void;
}) {
  return (
    <div className="flex items-center gap-1">
      {positions.map((p, i) => {
        const c = chapters[p.chapter];
        const isActive = i === active;
        return (
          <button
            key={`${p.chapter}-${p.step}`}
            onClick={() => onJump(p.chapter, p.step)}
            title={`${c.title}${c.steps.length > 1 ? ` · step ${p.step + 1}` : ""}`}
            aria-label={`Jump to ${c.title}, step ${p.step + 1}`}
            className={cn(
              "h-1.5 rounded-full transition-all",
              isActive
                ? "w-6 bg-foreground"
                : i < active
                ? "w-1.5 bg-foreground/40 hover:bg-foreground/60"
                : "w-1.5 bg-muted-foreground/25 hover:bg-muted-foreground/45",
            )}
          />
        );
      })}
    </div>
  );
}

export default Tutorial;
