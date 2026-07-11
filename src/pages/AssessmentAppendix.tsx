import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, Loader2, RefreshCw } from 'lucide-react';
import { toast } from '@/components/ui/sonner';
import { Button, ProcessChecklist, type ProcessStep } from '@/components/ds';
import { useAuth } from '@/hooks/useAuth';
import { AssessmentFooterSlot } from '@/components/assessment/AssessmentFooterSlot';
import {
  loadAppendix, startAppendixGeneration, pollAppendixUntilReady, saveRowEdit, confirmAppendix, saveFacts, setAppendixSkip, clearAppendixFactsCache,
} from '@/lib/appendix/client';
import type { StoredAppendix, AppendixRow, EditableField, AppendixFacts } from '@/lib/appendix/types';
import { useAppendixSkeleton } from '@/lib/appendix/skeletonStore';
import { loadChart } from '@/lib/structure/client';
import { useUiBusySignal } from '@/stores/uiBusyStore';
import { FactsPanelV2 } from '@/components/appendix/v2/FactsPanelV2';
import { ChecklistV2 } from '@/components/appendix/v2/ChecklistV2';
import { AppendixLoadingCard } from '@/components/appendix/AppendixLoadingCard';
import { buildEntityRegister } from '@/lib/appendix/facts/entityRegister';
import { emptyFacts } from '@/lib/appendix/facts/emptyFacts';
import { actingTogetherCandidateCount } from '@/lib/appendix/facts/actingCandidates';
import { openHomeStateCount } from '@/lib/appendix/facts/conclusions';
import { appendixConfirmReadiness } from '@/lib/appendix/confirmGuard';
import { supabase } from '@/integrations/supabase/client';

type Phase = 'loading' | 'generating' | 'ready' | 'error';

const STALE_GENERATING_MS = 90_000;
function isStaleGenerating(updatedAt: string | null): boolean {
  if (!updatedAt) return true;
  return Date.now() - new Date(updatedAt).getTime() > STALE_GENERATING_MS;
}

// Adopt the server's refreshed appendix, but keep any rows/facts the advisor has
// edited in this session so a background refine never clobbers an in-flight edit
// on screen (the edge function also preserves edited rows server-side).
function mergeServerUpdate(
  prev: StoredAppendix | null,
  upd: StoredAppendix,
  dirtyRowIds: Set<string>,
  factsDirty: boolean,
): StoredAppendix {
  if (!prev) return upd;
  const rows = upd.rows.map((sr) =>
    dirtyRowIds.has(sr.rowId) ? (prev.rows.find((pr) => pr.rowId === sr.rowId) ?? sr) : sr,
  );
  const facts = factsDirty ? prev.facts : upd.facts;
  return { ...upd, rows, facts };
}

export default function AssessmentAppendix({ page = 'facts' }: { page?: 'facts' | 'checklist' }) {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  // Reached via an Appendix "Edit" button on the finalized Overview. The footer
  // then returns straight to the overview instead of walking the flow forward.
  const fromOverview = searchParams.get('from') === 'overview';
  const { user } = useAuth();
  const { data: skeleton } = useAppendixSkeleton();
  const [appendix, setAppendix] = useState<StoredAppendix | null>(null);
  const [phase, setPhase] = useState<Phase>('loading');
  const [confirming, setConfirming] = useState(false);
  const [chart, setChart] = useState<{ entities: Parameters<typeof buildEntityRegister>[0]; edges: Parameters<typeof buildEntityRegister>[1]; groupings: Parameters<typeof buildEntityRegister>[2] } | null>(null);
  // The session's declared taxpayer. Used to anchor the register when extraction
  // flagged no is_taxpayer, so Part A does not fall back to an empty state.
  const [taxpayerName, setTaxpayerName] = useState<string | null>(null);
  // Rows/facts the advisor edited this session, so a background refine poll does
  // not overwrite them on screen.
  const dirtyRowIds = useRef<Set<string>>(new Set());
  const factsDirty = useRef(false);

  // While generating, spin the top-left app logo instead of a local spinner.
  useUiBusySignal(phase === 'loading' || phase === 'generating');

  // Best-effort related-parties overview, built from the structure chart.
  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    loadChart(sessionId)
      .then((c) => {
        if (!cancelled && c) {
          setChart({ entities: c.entities, edges: c.edges, groupings: c.groupings });
        }
      })
      .catch(() => { /* the overview is optional */ });
    supabase
      .from('atad2_sessions')
      .select('taxpayer_name')
      .eq('session_id', sessionId)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) setTaxpayerName((data?.taxpayer_name as string | null) ?? null);
      });
    return () => { cancelled = true; };
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    const ac = new AbortController();

    (async () => {
      try {
        let a = await loadAppendix(sessionId);
        // Re-trigger generation only when there is genuinely no usable result:
        // no row yet, a prior run errored, or a 'generating' row has gone stale
        // (its background work never ran). A ready appendix is left as-is; the
        // appendix is never rebuilt just because it was opened again. An empty
        // acting-together with candidates is re-checked on demand via the
        // "Re-check relationships" button, not automatically on every visit.
        const needsStart =
          !a ||
          a.generation_status === 'error' ||
          (a.generation_status === 'generating' && isStaleGenerating(a.updated_at));
        if (needsStart) {
          await startAppendixGeneration(sessionId);
          a = await loadAppendix(sessionId);
        }
        if (cancelled) return;
        if (a) {
          setAppendix(a);
          setPhase(a.generation_status === 'generating' ? 'generating' : a.generation_status);
        } else {
          setPhase('generating');
        }
        if (!a || a.generation_status === 'generating') {
          await pollAppendixUntilReady(
            sessionId,
            (upd) => {
              if (cancelled) return;
              setAppendix((prev) => mergeServerUpdate(prev, upd, dirtyRowIds.current, factsDirty.current));
              setPhase(upd.generation_status === 'generating' ? 'generating' : upd.generation_status);
            },
            ac.signal,
          );
        }
      } catch (e) {
        if (!cancelled) {
          setPhase('error');
          toast.error('Appendix generation failed', { description: String(e) });
        }
      }
    })();

    return () => {
      cancelled = true;
      ac.abort();
    };
  }, [sessionId]);

  const handleEdit = async (rowId: string, field: EditableField, value: string) => {
    if (!appendix || !user) return;
    const idx = appendix.rows.findIndex((r) => r.rowId === rowId);
    if (idx < 0) return;
    const old = appendix.rows[idx];
    const oldValue = (old[field] as string | null) ?? '';
    if (oldValue === value) return;
    const updated: AppendixRow = {
      ...old,
      [field]: value,
      source: 'edited',
      editedBy: user.id,
      editedAt: new Date().toISOString(),
    };
    dirtyRowIds.current.add(rowId);
    const rows = appendix.rows.map((r, i) => (i === idx ? updated : r));
    setAppendix({ ...appendix, rows }); // optimistic
    try {
      await saveRowEdit(appendix.id, rows, rowId, field, oldValue, value, user.id);
    } catch (e) {
      toast.error('Could not save edit', { description: String(e) });
    }
  };

  const handleToggleExclude = async (rowId: string, excluded: boolean) => {
    if (!appendix || !user) return;
    const idx = appendix.rows.findIndex((r) => r.rowId === rowId);
    if (idx < 0) return;
    const old = appendix.rows[idx];
    // Exclusion is a scope flag, not a content edit, so we do not touch `source`.
    const updated: AppendixRow = { ...old, excludedFromClient: excluded };
    dirtyRowIds.current.add(rowId);
    const rows = appendix.rows.map((r, i) => (i === idx ? updated : r));
    setAppendix({ ...appendix, rows }); // optimistic
    try {
      await saveRowEdit(appendix.id, rows, rowId, 'excludedFromClient', String(!!old.excludedFromClient), String(excluded), user.id);
    } catch (e) {
      toast.error('Could not update exclusion', { description: String(e) });
    }
  };

  const handleRetry = async () => {
    if (!sessionId) return;
    setPhase('generating');
    try {
      await startAppendixGeneration(sessionId);
      await pollAppendixUntilReady(sessionId, (upd) => {
        setAppendix(upd);
        setPhase(upd.generation_status === 'generating' ? 'generating' : upd.generation_status);
      });
    } catch (e) {
      setPhase('error');
      toast.error('Appendix generation failed', { description: String(e) });
    }
  };

  // Advisor-driven "re-ask the model for acting-together". Drops the Part A cache
  // key first so the generation genuinely recomputes rather than reusing the
  // stored empty result, then regenerates and folds the fresh facts in.
  const handleRecheckRelationships = async () => {
    if (!sessionId || !appendix) return;
    setPhase('generating');
    try {
      await clearAppendixFactsCache(appendix.id);
      await startAppendixGeneration(sessionId);
      await pollAppendixUntilReady(sessionId, (upd) => {
        setAppendix((prev) => mergeServerUpdate(prev, upd, dirtyRowIds.current, factsDirty.current));
        setPhase(upd.generation_status === 'generating' ? 'generating' : upd.generation_status);
      });
    } catch (e) {
      setPhase('error');
      toast.error('Could not re-check relationships', { description: String(e) });
    }
  };

  // Advisor-driven "re-run the condition analysis" for Part B. The Part A facts
  // are keyed on structure + documents (not the questionnaire answers), so the
  // edge function reuses them and only re-runs the Part B swarm, folding in the
  // latest questionnaire answers. In-session and server-side row edits are kept.
  const handleRerunChecklist = async () => {
    if (!sessionId || !appendix) return;
    setPhase('generating');
    try {
      await startAppendixGeneration(sessionId);
      await pollAppendixUntilReady(sessionId, (upd) => {
        setAppendix((prev) => mergeServerUpdate(prev, upd, dirtyRowIds.current, factsDirty.current));
        setPhase(upd.generation_status === 'generating' ? 'generating' : upd.generation_status);
      });
    } catch (e) {
      setPhase('error');
      toast.error('Could not re-run the analysis', { description: String(e) });
    }
  };

  const handleConfirm = async () => {
    if (!appendix || !user || !sessionId) return;
    setConfirming(true);
    try {
      await confirmAppendix(appendix.id, user.id);
      navigate(`/assessment/structure/${sessionId}`);
    } catch (e) {
      toast.error('Could not confirm appendix', { description: String(e) });
      setConfirming(false);
    }
  };

  // Facts edits commit per keystroke (the % input and the reasoning fields), so
  // the writes are serialized: one in-flight save at a time, always writing the
  // NEWEST snapshot next. Firing an await per keystroke instead would race, and
  // an out-of-order completion could persist stale text over newer text.
  const pendingFactsSave = useRef<{ id: string; facts: AppendixFacts } | null>(null);
  const factsSaveInFlight = useRef(false);
  const flushFactsSave = async () => {
    if (factsSaveInFlight.current) return;
    factsSaveInFlight.current = true;
    try {
      while (pendingFactsSave.current) {
        const { id, facts } = pendingFactsSave.current;
        pendingFactsSave.current = null;
        try {
          await saveFacts(id, facts);
        } catch (e) {
          toast.error('Could not save facts', { description: String(e) });
        }
      }
    } finally {
      factsSaveInFlight.current = false;
    }
  };

  const handleFactsChange = (next: AppendixFacts) => {
    if (!appendix) return;
    factsDirty.current = true;
    setAppendix({ ...appendix, facts: next }); // optimistic
    pendingFactsSave.current = { id: appendix.id, facts: next };
    void flushFactsSave();
  };

  const factsToShow = useMemo(() => {
    const stored = appendix?.facts;
    if (stored && stored.entities.length) return stored;
    if (chart) return { ...emptyFacts(), entities: buildEntityRegister(chart.entities, chart.edges, chart.groupings, taxpayerName) };
    return emptyFacts();
  }, [appendix?.facts, chart, taxpayerName]);

  // Once an earlier pass has produced rows or facts, keep showing them while a
  // background refine (folding in the Q&A answers) runs, instead of blocking on
  // a full-screen loader. Only the very first, content-less pass blocks.
  const hasContent = !!appendix && (appendix.rows.length > 0 || appendix.facts !== null);
  const refining = phase === 'generating';

  // Every foreign entity owes a home-state classification. The facts step cannot be
  // left until they are all resolved; the register carries the count and a jump chip.
  const openHomeState = page === 'facts' && appendix?.facts && !appendix.facts_skipped
    ? openHomeStateCount(factsToShow) : 0;
  const homeStateBlockTitle = openHomeState > 0
    ? `Set the home-state classification for ${openHomeState} ${openHomeState === 1 ? 'entity' : 'entities'} before continuing.`
    : undefined;

  // Gate confirm: a no-risk appendix (nothing Triggered) may not be confirmed
  // while conditions are still "Insufficient info" (they must be resolved first).
  const confirmGuard = appendixConfirmReadiness(appendix?.rows ?? []);

  // Part A landed with no acting-together group while related shareholders are
  // present. It is left as-is (no automatic rebuild); the advisor can re-ask the
  // model on demand with the button below.
  const actingEmptyWithCandidates =
    page === 'facts' &&
    !!appendix?.facts &&
    (appendix.facts.actingTogether?.length ?? 0) === 0 &&
    actingTogetherCandidateCount(appendix.facts.entities) >= 2;

  if (phase === 'loading' || (phase === 'generating' && !hasContent)) {
    const steps: ProcessStep[] = [
      {
        id: 'register',
        label: 'Load entity register',
        status: appendix || phase === 'generating' ? 'done' : 'current',
      },
      {
        id: 'sections',
        label: 'Draft appendix sections',
        status: phase === 'generating' ? 'current' : 'pending',
      },
    ];
    return <AppendixLoadingCard partLabel={page === 'facts' ? 'Part A' : 'Part B'} steps={steps} />;
  }

  if (phase === 'error' || !appendix) {
    const errorSteps: ProcessStep[] = [
      {
        id: 'register',
        label: 'Load entity register',
        status: appendix ? 'done' : 'error',
      },
      {
        id: 'sections',
        label: 'Draft appendix sections',
        status: appendix ? 'error' : 'pending',
      },
    ];
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
        <h1 className="sr-only">Technical appendix</h1>
        <ProcessChecklist steps={errorSteps} className="min-w-56 text-left" />
        <p role="alert" className="text-[13px] text-ds-ink-secondary">
          {appendix?.error_message
            ? `Appendix generation failed: ${appendix.error_message}`
            : 'Appendix generation failed.'}
        </p>
        <Button variant="secondary" onClick={handleRetry}>Try again</Button>
      </div>
    );
  }

  const skipped = page === 'facts' ? !!appendix.facts_skipped : !!appendix.checklist_skipped;
  const handleToggleSkip = async () => {
    if (!appendix) return;
    const next = !skipped;
    setAppendix({ ...appendix, ...(page === 'facts' ? { facts_skipped: next } : { checklist_skipped: next }) }); // optimistic
    try {
      await setAppendixSkip(appendix.id, page, next);
    } catch (e) {
      toast.error('Could not update skip', { description: String(e) });
    }
  };

  return (
    <div className="space-y-4">
      <h1 className="sr-only">{page === 'facts' ? 'Technical appendix, facts and relationships' : 'Technical appendix, conditions checklist'}</h1>
      {skipped && (
        <p className="rounded-md border border-[hsl(var(--border-subtle))] bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          This page is skipped and will be left out of the report. The content is kept and can be restored with Unskip.
        </p>
      )}

      {actingEmptyWithCandidates && !refining && (
        <div className="flex items-center justify-between gap-3 rounded-md border border-[hsl(var(--border-subtle))] bg-muted/30 px-3 py-2 text-xs text-ds-ink-secondary">
          <span>No acting-together group was found, although related shareholders are present. Re-check if one is expected.</span>
          <Button variant="secondary" size="sm" className="shrink-0" onClick={handleRecheckRelationships}>
            Re-check relationships
          </Button>
        </div>
      )}

      <div className={skipped ? 'opacity-60' : undefined}>
        {page === 'facts' ? (
          <FactsPanelV2
            facts={factsToShow}
            onChange={appendix?.facts ? handleFactsChange : undefined}
            generated={!!appendix?.facts}
            refining={refining}
            sessionId={sessionId}
          />
        ) : (
          // relatedParties is null on purpose: the associated-enterprises panel
          // is gone, the Part A master table already carries that overview.
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs text-ds-ink-secondary">
                Changed a questionnaire answer? Re-run the analysis to fold it in. Your manual edits are kept.
              </span>
              <Button
                variant="secondary"
                size="sm"
                className="shrink-0"
                onClick={handleRerunChecklist}
                disabled={refining}
              >
                {refining ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                {refining ? 'Re-running' : 'Re-run analysis'}
              </Button>
            </div>
            <ChecklistV2 rows={appendix.rows} skeleton={skeleton ?? []} onEdit={handleEdit} onToggleExclude={handleToggleExclude} sessionId={sessionId} />
            {!confirmGuard.canConfirm && confirmGuard.reason && (
              // The confirm block, stated where it can be seen: a disabled
              // button's title tooltip never fires in most browsers.
              <p className="text-[12.5px] text-ds-ink-secondary">{confirmGuard.reason}</p>
            )}
          </div>
        )}
      </div>

      <AssessmentFooterSlot
        left={
          fromOverview ? null : (
            <Button
              variant="ghost"
              onClick={() =>
                navigate(
                  page === 'facts'
                    ? `/assessment-confirmation/${sessionId}`
                    : `/assessment-appendix/${sessionId}`,
                )
              }
            >
              <ArrowLeft className="h-4 w-4" />
              Previous
            </Button>
          )
        }
        right={
          <>
            {/* Skip page sits to the left of the dark primary, which stays
                right-most: the two forward actions are grouped on the right. */}
            <Button variant="secondary" onClick={handleToggleSkip}>
              {skipped ? 'Unskip page' : 'Skip page'}
            </Button>
            {fromOverview ? (
              // Edit-from-overview: edits auto-save and keep the appendix
              // confirmed and in sync, so returning is a plain navigation, no
              // re-confirm. Mirrors the structure chart's return button.
              <Button
                variant="primary"
                onClick={() => {
                  // Edits made here must show on the overview: drop its cached
                  // appendix so the (no longer always-refetching) query refetches.
                  queryClient.invalidateQueries({ queryKey: ['appendix-download', sessionId] });
                  navigate(`/assessment-report/${sessionId}`);
                }}
                disabled={refining || openHomeState > 0}
                title={homeStateBlockTitle}
              >
                {refining ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {refining ? 'Finishing' : 'Done, return to overview'}
                <ArrowRight className="h-4 w-4" />
              </Button>
            ) : page === 'facts' ? (
              <Button
                variant="primary"
                onClick={() => navigate(`/assessment-appendix/${sessionId}/checklist`)}
                disabled={openHomeState > 0}
                title={homeStateBlockTitle}
              >
                Next
                <ArrowRight className="h-4 w-4" />
              </Button>
            ) : (
              <Button
                variant="primary"
                onClick={handleConfirm}
                disabled={confirming || refining || !confirmGuard.canConfirm}
                title={confirmGuard.reason ?? undefined}
              >
                {confirming || refining ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : null}
                {refining ? 'Finishing' : 'Confirm appendix'}
                <ArrowRight className="h-4 w-4" />
              </Button>
            )}
          </>
        }
      />
    </div>
  );
}
