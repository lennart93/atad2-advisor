import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Loader2, RefreshCw } from 'lucide-react';
import { toast } from '@/components/ui/sonner';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { AssessmentFooterSlot } from '@/components/assessment/AssessmentFooterSlot';
import { AppendixTable } from '@/components/appendix/AppendixTable';
import {
  loadAppendix, startAppendixGeneration, pollAppendixUntilReady, saveRowEdit, confirmAppendix, saveFacts,
} from '@/lib/appendix/client';
import type { StoredAppendix, AppendixRow, EditableField, AppendixFacts } from '@/lib/appendix/types';
import { useAppendixSkeleton } from '@/lib/appendix/skeletonStore';
import { loadChart } from '@/lib/structure/client';
import { buildRelatedParties, type RelatedPartiesResult } from '@/lib/appendix/relatedParties';
import { useUiBusySignal } from '@/stores/uiBusyStore';
import { FactsPanel } from '@/components/appendix/FactsPanel';
import { buildEntityRegister } from '@/lib/appendix/facts/entityRegister';
import { emptyFacts } from '@/lib/appendix/facts/emptyFacts';

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
  const { user } = useAuth();
  const { data: skeleton } = useAppendixSkeleton();
  const [appendix, setAppendix] = useState<StoredAppendix | null>(null);
  const [phase, setPhase] = useState<Phase>('loading');
  const showSources = true;
  const [confirming, setConfirming] = useState(false);
  const [relatedParties, setRelatedParties] = useState<RelatedPartiesResult | null>(null);
  const [chart, setChart] = useState<{ entities: Parameters<typeof buildEntityRegister>[0]; edges: Parameters<typeof buildEntityRegister>[1]; groupings: Parameters<typeof buildEntityRegister>[2] } | null>(null);
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
          setRelatedParties(buildRelatedParties(c.entities, c.edges));
          setChart({ entities: c.entities, edges: c.edges, groupings: c.groupings });
        }
      })
      .catch(() => { /* the overview is optional */ });
    return () => { cancelled = true; };
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    const ac = new AbortController();

    (async () => {
      try {
        let a = await loadAppendix(sessionId);
        // Re-trigger generation when there is no row yet, a prior run errored,
        // or a 'generating' row has gone stale (its background work never ran).
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

  const handleFactsChange = async (next: AppendixFacts) => {
    if (!appendix) return;
    factsDirty.current = true;
    setAppendix({ ...appendix, facts: next }); // optimistic
    try {
      await saveFacts(appendix.id, next);
    } catch (e) {
      toast.error('Could not save facts', { description: String(e) });
    }
  };

  const factsToShow = useMemo(() => {
    const stored = appendix?.facts;
    if (stored && stored.entities.length) return stored;
    if (chart) return { ...emptyFacts(), entities: buildEntityRegister(chart.entities, chart.edges, chart.groupings) };
    return emptyFacts();
  }, [appendix?.facts, chart]);

  // Once an earlier pass has produced rows or facts, keep showing them while a
  // background refine (folding in the Q&A answers) runs, instead of blocking on
  // a full-screen loader. Only the very first, content-less pass blocks.
  const hasContent = !!appendix && (appendix.rows.length > 0 || appendix.facts !== null);
  const refining = phase === 'generating';

  if (phase === 'loading' || (phase === 'generating' && !hasContent)) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
        <p className="text-muted-foreground">
          Generating the technical appendix. This can take a few minutes.
        </p>
      </div>
    );
  }

  if (phase === 'error' || !appendix) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
        <p className="text-muted-foreground">
          {appendix?.error_message
            ? `Appendix generation failed: ${appendix.error_message}`
            : 'Appendix generation failed.'}
        </p>
        <Button variant="outline" onClick={handleRetry}>Try again</Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button variant="outline" size="sm" className="gap-2" onClick={handleRetry}>
          <RefreshCw className="h-3.5 w-3.5" />
          Regenerate
        </Button>
      </div>

      {page === 'facts' ? (
        <FactsPanel
          facts={factsToShow}
          onChange={appendix?.facts ? handleFactsChange : undefined}
          generated={!!appendix?.facts}
        />
      ) : (
        <AppendixTable rows={appendix.rows} skeleton={skeleton} showSources={showSources} relatedParties={relatedParties} onEdit={handleEdit} onToggleExclude={handleToggleExclude} />
      )}

      <AssessmentFooterSlot
        left={
          <Button
            variant="outline"
            onClick={() =>
              navigate(
                page === 'facts'
                  ? `/assessment-confirmation/${sessionId}`
                  : `/assessment-appendix/${sessionId}`,
              )
            }
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Previous
          </Button>
        }
        right={
          page === 'facts' ? (
            <Button variant="outline" onClick={() => navigate(`/assessment-appendix/${sessionId}/checklist`)}>
              Next
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          ) : (
            <Button variant="outline" onClick={handleConfirm} disabled={confirming || refining}>
              {confirming || refining ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              {refining ? 'Finishing' : 'Confirm appendix'}
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          )
        }
      />
    </div>
  );
}
