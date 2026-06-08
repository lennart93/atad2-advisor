import { useEffect, useRef, useState } from 'react';
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
  loadAppendix, startAppendixGeneration, pollAppendixUntilReady, saveRowEdit, confirmAppendix,
} from '@/lib/appendix/client';
import type { StoredAppendix, AppendixRow } from '@/lib/appendix/types';
import { buildAppendixPrintHtml } from '@/lib/appendix/printAppendix';

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
  const [appendix, setAppendix] = useState<StoredAppendix | null>(null);
  const [phase, setPhase] = useState<Phase>('loading');
  const [showRefs, setShowRefs] = useState(true);
  const [confirming, setConfirming] = useState(false);

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

  const handleEdit = async (rowId: string, field: 'decision' | 'reasoning', value: string) => {
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

  const handlePrint = () => {
    if (!appendix) return;
    const html = buildAppendixPrintHtml(appendix.rows, showRefs);
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

  if (phase === 'loading' || phase === 'generating') {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <p className="text-muted-foreground">
          Generating the technical appendix. This runs in the background and can take a minute.
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
            Legal points (related-party threshold, post-FKR article numbers) are not yet signed off. This banner also appears on the export.
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
          <Switch id="show-refs" checked={showRefs} onCheckedChange={setShowRefs} />
          <Label htmlFor="show-refs" className="cursor-pointer text-muted-foreground">
            Show references (internal)
          </Label>
        </div>
        <Button variant="outline" size="sm" className="gap-2" onClick={handlePrint}>
          <Printer className="h-3.5 w-3.5" />
          Print
        </Button>
        <Button variant="outline" size="sm" className="gap-2" onClick={handleRetry}>
          <RefreshCw className="h-3.5 w-3.5" />
          Regenerate
        </Button>
      </div>

      <AppendixTable rows={appendix.rows} showReferences={showRefs} onEdit={handleEdit} />

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
