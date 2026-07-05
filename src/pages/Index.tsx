import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight, Trash2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ds";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/components/ui/sonner";
import { FadeIn, MotionPage, StaggerChildren, staggerItem } from "@/components/motion";
import { formatDate } from "@/utils/formatDate";
import { formatFiscalYears } from "@/utils/formatFiscalYears";
import { resumeUrlForSession } from "@/lib/assessment/resumeUrl";
import { taxpayerDisplayName } from "@/lib/taxpayer";
import { readLastStep } from "@/lib/assessment/lastStep";
import { stepUrlForKey } from "@/lib/assessment/steps";
import { groupSessionFacts } from "@/lib/dashboard/sessionFacts";

/** Steps that only exist once the Questions step is finished (completed=true). */
const POST_QUESTIONS_STEPS = new Set([
  "confirmation",
  "appendix",
  "structure",
  "report",
]);

/**
 * The remembered last step for a session as a route, or null when nothing
 * usable is stored. Resolved synchronously from localStorage so resume lands on
 * the exact last step the user left from, for any step, with no intermediate
 * page; the data-derived fallback covers a brand-new session, a different
 * browser, or a stale value.
 *
 * A stored step that is ahead of where the session actually is (a post-questions
 * step on a session that is no longer marked completed, e.g. after an admin
 * revert or cleared answers) is treated as stale and ignored, so resume never
 * drops the user onto a step the session state can't support.
 */
function resumeUrlFromLastStep(
  sessionId: string,
  completed: boolean,
): string | null {
  const key = readLastStep(sessionId);
  if (!key) return null;
  if (!completed && POST_QUESTIONS_STEPS.has(key)) return null;
  return stepUrlForKey(key, sessionId);
}

interface SessionListItem {
  id: string;
  session_id: string;
  taxpayer_name: string;
  fiscal_year: string;
  created_at: string;
  completed: boolean;
  outcome_confirmed: boolean;
  answer_count: number;
  has_memorandum?: boolean;
  memorandum_date?: string;
  destination_url: string;
}

// Shared 5-column ledger grid: No. · Client · Period · Status · Actions
const LEDGER_COLS =
  // Fixed last column (not `auto`) so the 1fr client column resolves identically
  // in the header grid and every row grid — that is what makes columns line up.
  "sm:grid sm:grid-cols-[52px_minmax(0,1fr)_180px_150px_200px] sm:items-center sm:gap-4";
const EYEBROW = "text-[11px] font-normal uppercase tracking-[0.16em] text-ds-ink-secondary";

const Index = () => {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  const [sessions, setSessions] = useState<SessionListItem[]>([]);
  const [loading, setLoading] = useState(true);


  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/auth");
    }
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (user) {
      loadCompletedSessions();
    }
  }, [user]);

  const loadCompletedSessions = async () => {
    try {
      setLoading(true);

      // All sessions (both in-progress and completed) for this user.
      const { data: sessionsData, error: sessionsError } = await supabase
        .from('atad2_sessions')
        .select(`
          id,
          session_id,
          taxpayer_name,
          fiscal_year,
          created_at,
          completed,
          outcome_confirmed
        `)
        .eq('user_id', user!.id)
        .order('created_at', { ascending: false });

      if (sessionsError) throw sessionsError;

      const ids = (sessionsData || []).map((s) => s.session_id);

      const [answersRes, reportsRes] = ids.length
        ? await Promise.all([
            supabase
              .from('atad2_answers')
              .select('session_id')
              .in('session_id', ids),
            supabase
              .from('atad2_reports')
              .select('session_id, generated_at')
              .in('session_id', ids)
              .is('archived_at', null),
          ])
        : [
            { data: [], error: null },
            { data: [], error: null },
          ];

      if (answersRes.error) throw answersRes.error;
      if (reportsRes.error) throw reportsRes.error;

      const facts = groupSessionFacts(ids, answersRes.data || [], reportsRes.data || []);

      const sessionsWithCounts = await Promise.all(
        (sessionsData || []).map(async (session) => {
          const sessionFacts = facts.get(session.session_id)!;

          // Where this card should take the user when clicked: the exact step
          // they left from (stored), for any step. Falls back to the report for
          // a finished session, or the data-derived step for an in-progress one
          // (brand-new session, another browser, or a stale stored value).
          const destination =
            resumeUrlFromLastStep(session.session_id, session.completed) ??
            (session.completed
              ? `/assessment-report/${session.session_id}`
              : await resumeUrlForSession({
                  session_id: session.session_id,
                  completed: session.completed,
                  outcome_confirmed: session.outcome_confirmed,
                }));

          return {
            ...session,
            completed: Boolean(session.completed),
            outcome_confirmed: Boolean(session.outcome_confirmed),
            answer_count: sessionFacts.answerCount,
            has_memorandum: sessionFacts.hasMemorandum,
            memorandum_date: sessionFacts.memorandumDate,
            destination_url: destination,
          };
        })
      );

      setSessions(sessionsWithCounts);
    } catch (error) {
      console.error('Error loading sessions:', error);
      toast.error("Error", {
        description: "Failed to load assessment sessions",
      });
    } finally {
      setLoading(false);
    }
  };

  const deleteSession = async (sessionId: string, sessionUuid: string) => {
    console.log('DELETE ATTEMPT:', { sessionId, sessionUuid });

    try {
      // First check if the session exists
      const { data: existingSession, error: checkError } = await supabase
        .from('atad2_sessions')
        .select('session_id, id, user_id')
        .eq('session_id', sessionId)
        .single();

      console.log('EXISTING SESSION:', existingSession, 'CHECK ERROR:', checkError);

      // Delete the session by session_id - answers will be automatically deleted via CASCADE
      const { data: deleteData, error } = await supabase
        .from('atad2_sessions')
        .delete()
        .eq('session_id', sessionId)
        .select(); // Return deleted rows for debugging

      console.log('DELETE RESULT:', { deleteData, error });

      if (error) throw error;

      // Remove from UI state immediately (no need to reload)
      setSessions(prev => {
        const newSessions = prev.filter(session => session.session_id !== sessionId);
        console.log('UI STATE UPDATE:', {
          before: prev.length,
          after: newSessions.length,
          removedSessionId: sessionId
        });
        return newSessions;
      });

      toast.success("Assessment deleted", {
        description: "The assessment has been permanently deleted.",
      });
    } catch (error) {
      console.error('Error deleting session:', error);
      toast.error("Error", {
        description: "Failed to delete assessment session",
      });
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-[13px] text-ds-ink-secondary">Loading...</p>
      </div>
    );
  }

  if (!user) return null;

  return (
    <MotionPage>
      <div className="flex flex-col gap-14">
        {/* Title block */}
        <header className="flex flex-col gap-8 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-5xl font-normal leading-[0.98] tracking-[-0.03em] text-ds-ink sm:text-6xl">
              Assessments
            </h1>
            <p className="mt-5 max-w-md text-[15px] text-ds-ink-secondary">
              Run structured ATAD2 risk assessments and generate review-ready memoranda.
            </p>
          </div>
          <Button onClick={() => navigate("/assessment")} className="self-start gap-2 sm:self-end">
            New assessment
            <ArrowRight className="h-4 w-4 text-brand-terracotta" />
          </Button>
        </header>

        {/* History ledger */}
        <section className="flex flex-col">
          {/* Ledger header (desktop only) */}
          <div className={`${LEDGER_COLS} hidden border-b border-ds-ink px-1 pb-3`}>
            <span className={EYEBROW}>No.</span>
            <span className={EYEBROW}>Client</span>
            <span className={EYEBROW}>Period</span>
            <span className={EYEBROW}>Status</span>
            <span />
          </div>

          {loading ? (
            <div className="flex flex-col">
              {[0, 1, 2].map((i) => (
                <div key={i} className="border-b border-ds-hairline px-1 py-6">
                  <Skeleton className="h-7 w-full rounded-none" />
                </div>
              ))}
            </div>
          ) : sessions.length === 0 ? (
            <FadeIn>
              <div className="flex flex-col items-center justify-center gap-3 border-y border-ds-hairline px-6 py-20 text-center">
                <h3 className="text-[17px] font-normal tracking-tight text-ds-ink">No assessments yet</h3>
                <p className="text-[13px] text-ds-ink-secondary">
                  Start your first ATAD2 assessment to see it here.
                </p>
              </div>
            </FadeIn>
          ) : (
            <StaggerChildren stagger={0.04} className="flex flex-col">
              {sessions.map((session, i) => {
                const ready = session.completed && Boolean(session.has_memorandum);
                const inProgress = !session.completed;
                const no = String(i + 1).padStart(2, "0");
                // An assessment can name several entities (stored newline-joined);
                // show them as one readable line. Single-entity is unchanged.
                const taxpayerLabel = taxpayerDisplayName(session.taxpayer_name);
                const dateLabel = inProgress ? "Started" : "Completed";
                const actionLabel = inProgress ? "Resume" : "View report";
                const ariaLabel = inProgress
                  ? `Resume assessment for ${taxpayerLabel}`
                  : `Open report for ${taxpayerLabel}`;
                const statusLabel = ready ? "Ready" : inProgress ? "In progress" : "Memo pending";
                const dotClass = ready
                  ? "bg-brand-sage"
                  : inProgress
                    ? "bg-brand-terracotta"
                    : "bg-ds-ink-tertiary";

                return (
                  <motion.div key={session.id} variants={staggerItem}>
                    <div
                      className={`group relative flex flex-col gap-3 border-b border-ds-hairline px-1 py-6 transition-colors duration-150 hover:bg-ds-fill-muted ${LEDGER_COLS} sm:gap-4`}
                    >
                      <Link
                        to={session.destination_url}
                        className="absolute inset-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ds-accent"
                        aria-label={ariaLabel}
                      />

                      {/* No. */}
                      <span className="pointer-events-none relative hidden text-[13px] tabular-nums text-ds-ink-tertiary sm:block">
                        {no}
                      </span>

                      {/* Client */}
                      <h3 className="pointer-events-none relative truncate text-[19px] font-normal tracking-tight text-ds-ink sm:text-[22px]">
                        {taxpayerLabel}
                      </h3>

                      {/* Period */}
                      <div className="pointer-events-none relative flex flex-col gap-0.5">
                        <span className="text-[13px] tabular-nums text-ds-ink">FY{formatFiscalYears(session.fiscal_year)}</span>
                        <span className="text-[12px] text-ds-ink-secondary">
                          {dateLabel} {formatDate(session.created_at)}
                        </span>
                      </div>

                      {/* Status */}
                      <div className="pointer-events-none relative flex items-center gap-2.5">
                        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dotClass}`} />
                        <span className="text-[13px] text-ds-ink-secondary">{statusLabel}</span>
                      </div>

                      {/* Actions */}
                      <div className="relative z-10 flex items-center justify-start gap-4 sm:justify-end">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(session.destination_url);
                          }}
                          className="inline-flex items-center gap-2 text-[13px] text-ds-ink transition-colors hover:text-brand-terracotta focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ds-accent"
                        >
                          {actionLabel}
                          <ArrowRight className="h-3.5 w-3.5" />
                        </button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <button
                              onClick={(e) => e.stopPropagation()}
                              aria-label="Delete assessment"
                              className="inline-flex h-8 w-8 items-center justify-center rounded-sm text-ds-ink-tertiary transition-colors hover:bg-ds-red-bg hover:text-ds-red focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ds-accent"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete assessment</AlertDialogTitle>
                              <AlertDialogDescription>
                                Are you sure you want to permanently delete this assessment for {taxpayerLabel}?
                                This will delete all answers and cannot be undone.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => deleteSession(session.session_id, session.id)}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              >
                                Delete permanently
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </StaggerChildren>
          )}
        </section>
      </div>
    </MotionPage>
  );
};

export default Index;
