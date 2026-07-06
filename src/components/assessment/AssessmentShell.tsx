// src/components/assessment/AssessmentShell.tsx
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Outlet, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { ASSESSMENT_STEPS, stepIndexForPath, stepUrlForKey } from '@/lib/assessment/steps';
import { writeLastStep, readMaxStep, writeMaxStep } from '@/lib/assessment/lastStep';
import { useAssessmentSessionId } from '@/lib/assessment/useAssessmentSessionId';
import { OpenQuestionsButton } from '@/components/openQuestions/OpenQuestionsButton';
import { FooterBar, Stepper } from '@/components/ds';
import { DossierTag } from './DossierTag';
import { AssessmentShellContext } from './AssessmentShellContext';

const STEP_LABELS = ASSESSMENT_STEPS.map((s) => s.label);

export default function AssessmentShell() {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const sessionId = useAssessmentSessionId();
  const hasSession = !!searchParams.get('session');
  const currentStep = stepIndexForPath(location.pathname, { hasSession });
  const stepDef = currentStep >= 0 ? ASSESSMENT_STEPS[currentStep] : null;

  // Edit-from-overview: when a user opens an earlier step from the Overview
  // (e.g. Structure → Edit), keep Overview ticked in the stepper so the user
  // knows it's a round-trip and not a regression. The Overview tile becomes
  // clickable so the user has a second way back besides the footer CTA.
  const fromOverview = searchParams.get('from') === 'overview';
  const overviewIndex = ASSESSMENT_STEPS.findIndex((s) => s.key === 'report');
  const structureIndex = ASSESSMENT_STEPS.findIndex((s) => s.key === 'structure');
  const questionsIndex = ASSESSMENT_STEPS.findIndex((s) => s.key === 'questions');
  const onOverview = currentStep === overviewIndex;

  // A generated memorandum finalizes the assessment. Until one exists, the whole
  // timeline stays open: any completed step can be reopened straight from the
  // stepper, so the advisor can always walk back before generating. Once the
  // memo is generated, changing inputs would silently desync it, so the
  // finalized Overview locks every step except Structure (still editable via its
  // round-trip). Defaulting to "open" while the count loads is the safe choice.
  const { data: reportCount } = useQuery({
    queryKey: ['assessment-shell-report-exists', sessionId],
    enabled: !!sessionId,
    staleTime: 30_000,
    queryFn: async () => {
      const { count } = await supabase
        .from('atad2_reports')
        .select('id', { count: 'exact', head: true })
        .eq('session_id', sessionId!)
        .is('archived_at', null);
      return count ?? 0;
    },
  });
  const finalized = (reportCount ?? 0) > 0;

  // The furthest step this session ever reached (grows only). Lets the user jump
  // forward again to a step they already visited after walking back, not just
  // backward. Kept in state so the stepper re-renders as it grows.
  const [maxReached, setMaxReached] = useState(-1);
  useEffect(() => {
    if (!sessionId) {
      setMaxReached(-1);
      return;
    }
    const stored = readMaxStep(sessionId) ?? -1;
    const next = currentStep >= 0 ? Math.max(stored, currentStep) : stored;
    if (next > stored) writeMaxStep(sessionId, next);
    setMaxReached(next);
  }, [sessionId, currentStep]);

  // Overview stays ticked while editing a step opened from it (round-trip), and
  // Structure is ticked while sitting on the finalized Overview. While the
  // timeline is open, every already-visited step ahead of the current one reads
  // as done too (a green check), so a step you walked back from still looks
  // reachable.
  const extraDoneList: number[] = [];
  if (fromOverview && overviewIndex >= 0) extraDoneList.push(overviewIndex);
  if (onOverview && structureIndex >= 0) extraDoneList.push(structureIndex);
  if (!finalized) {
    for (let i = currentStep + 1; i <= maxReached; i++) extraDoneList.push(i);
  }
  const extraDone = extraDoneList.length > 0 ? extraDoneList : undefined;

  // Which stepper tiles accept a click.
  const clickableIndexes = useMemo(() => {
    if (!sessionId) return undefined;
    const set = new Set<number>();
    if (!finalized) {
      // Open timeline: every already-visited step with a per-session route is a
      // shortcut, in either direction (back to redo, or forward again to a step
      // you walked back from). Intake has no such route (it is the pre-session
      // form), so stepUrlForKey returns null and it stays inert.
      const upper = Math.max(maxReached, currentStep);
      for (let i = 0; i <= upper; i++) {
        if (i === currentStep) continue;
        if (stepUrlForKey(ASSESSMENT_STEPS[i].key, sessionId)) set.add(i);
      }
      if (fromOverview && overviewIndex >= 0) set.add(overviewIndex);
    } else {
      // Finalized: only the two established round-trips stay reachable.
      if (fromOverview && overviewIndex >= 0) set.add(overviewIndex);
      if (onOverview && structureIndex >= 0) set.add(structureIndex);
    }
    return set.size > 0 ? [...set] : undefined;
  }, [finalized, currentStep, maxReached, fromOverview, onOverview, overviewIndex, structureIndex, sessionId]);

  const handleStepClick = useCallback(
    (index: number) => {
      if (!sessionId) return;
      if (index === overviewIndex) {
        navigate(`/assessment-report/${sessionId}`);
        return;
      }
      // Finalized Structure edits keep the round-trip marker so the step shows
      // its "back to overview" affordance.
      if (finalized && index === structureIndex) {
        navigate(`/assessment/structure/${sessionId}?from=overview`);
        return;
      }
      const url = stepUrlForKey(ASSESSMENT_STEPS[index].key, sessionId);
      if (url) navigate(url);
    },
    [finalized, overviewIndex, structureIndex, sessionId, navigate],
  );

  // On the finalized Overview, every step except Structure and Overview itself
  // can't be revisited — surface that on hover so users don't try to click them.
  // Derived from the steps registry so newly inserted steps are locked
  // automatically without updating this list by hand.
  const lockedTooltip = finalized && onOverview
    ? "Locked. This step can't be revisited once the assessment is finalized."
    : undefined;
  const lockedIndexes = finalized && onOverview
    ? ASSESSMENT_STEPS.reduce<number[]>((acc, _, idx) => {
        if (idx !== structureIndex && idx !== overviewIndex) acc.push(idx);
        return acc;
      }, [])
    : undefined;

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

  // Remember the step this session is on so a later resume from the dashboard
  // returns straight here. Fires on every step change (forward and back); the
  // shell wraps every assessment route, so this is the one place it is needed.
  useEffect(() => {
    if (sessionId && stepDef) writeLastStep(sessionId, stepDef.key);
  }, [sessionId, stepDef]);

  const { data: session } = useQuery({
    queryKey: ['assessment-shell-session', sessionId],
    enabled: !!sessionId,
    staleTime: 30_000,
    queryFn: async () => {
      const { data } = await supabase
        .from('atad2_sessions')
        .select(
          'session_id, taxpayer_name, status, fiscal_year, period_start_date, period_end_date, created_at, preliminary_outcome, override_outcome, outcome_overridden, completed',
        )
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
        {/* Sub-header: the dossier anchor sits beside the stepper on one row.
            The stepper stays centered and at full width (hairline connectors,
            design-reference 10-stepper-bar) in a flex-1 wrapper; the dossier
            yields (truncates its name) before the stepper ever compresses. */}
        <div className="shrink-0 border-b border-ds-hairline bg-ds-card">
          <div className="mx-auto max-w-6xl px-4 py-3">
            <div className="flex items-center gap-4">
              {sessionId && (
                <DossierTag
                  sessionId={sessionId}
                  taxpayerName={session?.taxpayer_name ?? null}
                  fiscalYear={session?.fiscal_year ?? null}
                  periodStart={session?.period_start_date ?? null}
                  periodEnd={session?.period_end_date ?? null}
                  startedAt={session?.created_at ?? null}
                  preliminaryOutcome={session?.preliminary_outcome ?? null}
                  overrideOutcome={session?.override_outcome ?? null}
                  outcomeOverridden={!!session?.outcome_overridden}
                  completed={!!session?.completed}
                />
              )}
              {/* Reserves the stepper's full width (no min-w-0), so the dossier
                  is what shrinks when the row gets tight, never the stepper. */}
              <div className="flex flex-1 items-center justify-center">
                <Stepper
                  className="shrink-0"
                  steps={STEP_LABELS}
                  current={currentStep}
                  extraDone={extraDone}
                  clickableIndexes={clickableIndexes}
                  onStepClick={clickableIndexes ? handleStepClick : undefined}
                  lockedTooltip={lockedTooltip}
                  lockedIndexes={lockedIndexes}
                />
              </div>
              {/* The open-questions chip only earns its place while the
                  questions are still being worked: up to and including the
                  Questions step. Once the flow moves past Questions
                  (Confirmation onward), a leftover count is noise, so the chip
                  drops. Documents is hidden even earlier: that page IS the
                  open-points worklist, so a header count would duplicate it. */}
              {sessionId &&
                currentStep >= 0 &&
                currentStep <= questionsIndex &&
                stepDef?.key !== 'documents' && (
                  <OpenQuestionsButton
                    sessionId={sessionId}
                    onQuestionsStep={stepDef?.key === 'questions'}
                  />
                )}
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
                : stepDef?.card
                  ? // Form-like steps (Intake, Documents) share one centered
                    // narrow column; the white terracotta-topped card lives in
                    // the step itself (WizardCard).
                    'mx-auto max-w-3xl px-6 py-12'
                  : cn('mx-auto px-4 py-6', stepDef?.wide ? 'max-w-7xl' : 'max-w-6xl'),
            )}
          >
            <Outlet />
          </motion.div>
        </div>

        {/* Footer portal target — always rendered so the portal has a home.
            FooterBar owns the chrome (hairline top border, card surface);
            sticky=false because this shell already pins it via flex layout. */}
        <FooterBar sticky={false} className="min-h-[60px] shrink-0">
          <div ref={setFooterEl} />
        </FooterBar>
      </div>
    </AssessmentShellContext.Provider>
  );
}
