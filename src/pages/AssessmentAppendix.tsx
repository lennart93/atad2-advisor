import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Loader2, AlertTriangle, RefreshCw, Printer } from 'lucide-react';
import { toast } from '@/components/ui/sonner';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { useAuth } from '@/hooks/useAuth';
import { AssessmentFooterSlot } from '@/components/assessment/AssessmentFooterSlot';
import { AppendixTable } from '@/components/appendix/AppendixTable';
import {
  loadAppendix, startAppendixGeneration, pollAppendixUntilReady, saveRowEdit, confirmAppendix, saveFacts,
} from '@/lib/appendix/client';
import type { StoredAppendix, AppendixRow, EditableField, AppendixFacts } from '@/lib/appendix/types';
import { buildAppendixPrintHtml, type PrintMode } from '@/lib/appendix/printAppendix';
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

export default function AssessmentAppendix() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: skeleton } = useAppendixSkeleton();
  const [appendix, setAppendix] = useState<StoredAppendix | null>(null);
  const [phase, setPhase] = useState<Phase>('loading');
  const [showSources, setShowSources] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [relatedParties, setRelatedParties] = useState<RelatedPartiesResult | null>(null);
  const [chart, setChart] = useState<{ entities: Parameters<typeof buildEntityRegister>[0]; edges: Parameters<typeof buildEntityRegister>[1]; groupings: Parameters<typeof buildEntityRegister>[2] } | null>(null);

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
              setAppendix(upd);
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
      navigate(`/assessment-report/${sessionId}`);
    } catch (e) {
      toast.error('Could not confirm appendix', { description: String(e) });
      setConfirming(false);
    }
  };

  const handleFactsChange = async (next: AppendixFacts) => {
    if (!appendix) return;
    setAppendix({ ...appendix, facts: next }); // optimistic
    try {
      await saveFacts(appendix.id, next);
    } catch (e) {
      toast.error('Could not save facts', { description: String(e) });
    }
  };

  const handlePrint = (mode: PrintMode) => {
    if (!appendix) return;
    const html = buildAppendixPrintHtml(appendix.rows, mode, skeleton, appendix.facts);
    const w = window.open('', '_blank');
    if (!w) {
      toast.error('Pop-up blocked', { description: 'Allow pop-ups for this site to print the appendix.' });
      return;
    }
    w.document.write(html);
    w.document.close();
    w.focus();
    w.onafterprint = () => w.close();
    setTimeout(() => w.print(), 250);
  };

  const factsToShow = useMemo(() => {
    const stored = appendix?.facts;
    if (stored && stored.entities.length) return stored;
    if (chart) return { ...emptyFacts(), entities: buildEntityRegister(chart.entities, chart.edges, chart.groupings) };
    return emptyFacts();
  }, [appendix?.facts, chart]);

  if (phase === 'loading' || phase === 'generating') {
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

  const needReview = appendix.rows.filter((r) => r.stale).length;

  return (
    <div className="space-y-4">
      <Card className="border-amber-400/30 bg-amber-50/40 dark:border-amber-500/20 dark:bg-amber-950/20">
        <CardContent className="flex items-start gap-2 py-3 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <p className="text-amber-800 dark:text-amber-200">
            <span className="font-semibold">Draft, pending tax review.</span>{' '}
            Generated from the assessment answers and structure chart. Review each row before confirming. The internal column and the working-copy export are for internal use only.
          </p>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className="text-muted-foreground">
          {appendix.rows.length} rows
          {needReview > 0 && (
            <span className="text-amber-700 dark:text-amber-400"> · {needReview} need review</span>
          )}
        </span>
        <span className="flex-1" />
        <div className="flex items-center gap-2">
          <Switch id="show-sources" checked={showSources} onCheckedChange={setShowSources} />
          <Label htmlFor="show-sources" className="cursor-pointer text-muted-foreground">
            Show sources
          </Label>
        </div>
        <Button variant="outline" size="sm" className="gap-2" onClick={() => handlePrint('dossier')}>
          <Printer className="h-3.5 w-3.5" />
          Export dossier
        </Button>
        <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground" onClick={() => handlePrint('internal')}>
          <Printer className="h-3.5 w-3.5" />
          Working copy
        </Button>
        <Button variant="outline" size="sm" className="gap-2" onClick={handleRetry}>
          <RefreshCw className="h-3.5 w-3.5" />
          Regenerate
        </Button>
      </div>

      <FactsPanel
        facts={factsToShow}
        onChange={appendix?.facts ? handleFactsChange : undefined}
      />

      <AppendixTable rows={appendix.rows} skeleton={skeleton} showSources={showSources} relatedParties={relatedParties} onEdit={handleEdit} onToggleExclude={handleToggleExclude} />

      <AssessmentFooterSlot
        left={
          <Button
            variant="outline"
            onClick={() => navigate(`/assessment/structure/${sessionId}`)}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Previous
          </Button>
        }
        right={
          <Button variant="outline" onClick={handleConfirm} disabled={confirming}>
            {confirming ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : null}
            Confirm appendix
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        }
      />
    </div>
  );
}
