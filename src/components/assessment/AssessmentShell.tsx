// src/components/assessment/AssessmentShell.tsx
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Outlet, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { ASSESSMENT_STEPS, stepIndexForPath } from '@/lib/assessment/steps';
import { useAssessmentSessionId } from '@/lib/assessment/useAssessmentSessionId';
import { OpenQuestionsButton } from '@/components/openQuestions/OpenQuestionsButton';
import { AssessmentStepper } from './AssessmentStepper';
import { AssessmentShellContext } from './AssessmentShellContext';

export default function AssessmentShell() {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const sessionId = useAssessmentSessionId();
  const hasSession = !!searchParams.get('session');
  const currentStep = stepIndexForPath(location.pathname, { hasSession });
  const stepDef = currentStep >= 0 ? ASSESSMENT_STEPS[currentStep] : null;

  // Edit-from-overview: when a user opens an earlier step from the finalized
  // Overview (e.g. Structure → Edit), keep Overview ticked in the stepper so
  // the user knows it's a round-trip and not a regression. The Overview tile
  // becomes clickable so the user has a second way back besides the footer CTA.
  const fromOverview = searchParams.get('from') === 'overview';
  const overviewIndex = ASSESSMENT_STEPS.findIndex((s) => s.key === 'report');
  const structureIndex = ASSESSMENT_STEPS.findIndex((s) => s.key === 'structure');
  // Structure is reachable from Overview both directions: via the "Edit"
  // button on the chart card (when a chart was saved) AND via the Structure
  // tile in the top stepper. The stepper path matters when the user picked
  // "Continue without structure chart" — no chart card to click, so the
  // stepper is the only way back.
  const onOverview = currentStep === overviewIndex;
  const extraDoneList: number[] = [];
  if (fromOverview && overviewIndex >= 0) extraDoneList.push(overviewIndex);
  if (onOverview && structureIndex >= 0) extraDoneList.push(structureIndex);
  const extraDone = extraDoneList.length > 0 ? extraDoneList : undefined;
  const handleStepClick = useCallback(
    (index: number) => {
      if (!sessionId) return;
      if (fromOverview && index === overviewIndex) {
        navigate(`/assessment-report/${sessionId}`);
        return;
      }
      if (onOverview && index === structureIndex) {
        navigate(`/assessment/structure/${sessionId}?from=overview`);
      }
    },
    [fromOverview, onOverview, overviewIndex, structureIndex, sessionId, navigate],
  );

  // On the finalized Overview, the intake-through-confirmation steps can't be
  // revisited — surface that on hover so users don't try to click them.
  // Structure stays untagged: it's the one earlier step that can be revisited.
  const lockedTooltip = onOverview
    ? "Locked. This step can't be revisited once the assessment is finalized."
    : undefined;
  const lockedIndexes = onOverview ? [0, 1, 2, 3] : undefined;

  // Footer portal target — state-backed so context consumers re-render once
  // the node mounts (one-frame gap on first paint; footer has min-height).
  const [footerEl, setFooterEl] = useState<HTMLElement | null>(null);

  // Reserve vertical space so the floating Feedback button never sits on top
  // of the sticky assessment footer. Cleared on unmount so non-assessment
  // routes get their normal bottom-5 placement back.
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--app-bottom-inset', '60px');
    return () => {
      root.style.removeProperty('--app-bottom-inset');
    };
  }, []);

  // DD3 — move keyboard focus to the new step's content region on route change.
  const bodyRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    bodyRef.current?.focus();
  }, [location.pathname]);

  const { data: session } = useQuery({
    queryKey: ['assessment-shell-session', sessionId],
    enabled: !!sessionId,
    staleTime: 30_000,
    queryFn: async () => {
      const { data } = await supabase
        .from('atad2_sessions')
        .select('session_id, taxpayer_name, status')
        .eq('session_id', sessionId!)
        .maybeSingle();
      return data;
    },
  });

  const openDocuments = useCallback(() => {
    if (sessionId) navigate(`/assessment/upload?session=${sessionId}`);
  }, [navigate, sessionId]);

  const ctxValue = useMemo(
    () => ({
      footerEl,
      meta: {
        sessionId,
        taxpayerName: session?.taxpayer_name ?? null,
        status: (session?.status as string | null) ?? null,
        openDocuments,
      },
    }),
    [footerEl, sessionId, session?.taxpayer_name, session?.status, openDocuments],
  );

  return (
    <AssessmentShellContext.Provider value={ctxValue}>
      {/* DD2 — desktop-primary: min-width so nothing collapses absurdly. */}
      <div className="flex h-[calc(100vh-4rem)] min-w-[1024px] flex-col">
        {/* Sub-header */}
        <div className="shrink-0 border-b border-[hsl(var(--border-subtle))] bg-background">
          <div className="mx-auto max-w-6xl px-4 py-3">
            <div className="flex items-center gap-4">
              <div className="min-w-0 flex-1">
                <AssessmentStepper
                  current={currentStep}
                  extraDone={extraDone}
                  onStepClick={fromOverview || onOverview ? handleStepClick : undefined}
                  lockedTooltip={lockedTooltip}
                  lockedIndexes={lockedIndexes}
                />
              </div>
              {sessionId && <OpenQuestionsButton sessionId={sessionId} />}
            </div>
          </div>
        </div>

        {/* Body — D10 height budget. Mount-only fade-in keyed on pathname:
            NO AnimatePresence/exit — wrapping <Outlet/> in AnimatePresence
            double-renders the route component during a transition (both the
            exiting and entering motion.div resolve <Outlet/> to the new
            route). A keyed motion.div re-runs initial→animate on every route
            change without ever mounting two instances.
            DD3 — ref + tabIndex=-1: focus target on route change. */}
        <div
          ref={bodyRef}
          tabIndex={-1}
          className={cn(
            'min-h-0 flex-1 outline-none',
            stepDef?.fullBleed ? 'flex' : 'overflow-y-auto',
          )}
        >
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, ease: [0.2, 0, 0, 1] }}
            className={cn(
              stepDef?.fullBleed
                ? 'flex-1'
                : cn('mx-auto px-4 py-6', stepDef?.wide ? 'max-w-7xl' : 'max-w-6xl'),
            )}
          >
            <Outlet />
          </motion.div>
        </div>

        {/* Footer portal target — always rendered so the portal has a home */}
        <div
          ref={setFooterEl}
          className="min-h-[60px] shrink-0 border-t border-[hsl(var(--border-subtle))] bg-background/80 backdrop-blur-md"
        />
      </div>
    </AssessmentShellContext.Provider>
  );
}
