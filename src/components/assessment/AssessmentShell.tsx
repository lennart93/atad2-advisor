// src/components/assessment/AssessmentShell.tsx
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Outlet, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { ASSESSMENT_STEPS, stepIndexForPath } from '@/lib/assessment/steps';
import { useAssessmentSessionId } from '@/lib/assessment/useAssessmentSessionId';
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

  // Footer portal target — state-backed so context consumers re-render once
  // the node mounts (one-frame gap on first paint; footer has min-height).
  const [footerEl, setFooterEl] = useState<HTMLElement | null>(null);

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
            <AssessmentStepper current={currentStep} />
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
