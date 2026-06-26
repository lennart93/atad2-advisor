import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Copy, FileText, Trash2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Button, Card, EmptyState, PageHeader, StatusPill } from "@/components/ds";
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
import { resumeUrlForSession } from "@/lib/assessment/resumeUrl";
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

  const copySessionId = async (sessionId: string) => {
    try {
      await navigator.clipboard.writeText(sessionId);
      toast.success("Session id copied");
    } catch {
      // Clipboard unavailable; nothing else to do.
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
      <PageHeader
        title="Assessments"
        subtitle="Run ATAD2 risk assessments for Dutch corporate taxpayers."
        actions={
          <Button onClick={() => navigate("/assessment")}>
            New assessment
          </Button>
        }
      />

      <section className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-[18px] font-medium tracking-tight text-ds-ink">
            Your assessments
          </h2>
          <p className="text-[13px] text-ds-ink-secondary">
            View, resume or delete your assessments.
          </p>
        </div>
        {loading ? (
          <div className="flex flex-col gap-3">
            <Skeleton className="h-[76px] w-full rounded-ds-card" />
            <Skeleton className="h-[76px] w-full rounded-ds-card" />
            <Skeleton className="h-[76px] w-full rounded-ds-card" />
          </div>
        ) : sessions.length === 0 ? (
          <FadeIn>
            <Card>
              <EmptyState
                icon={FileText}
                action={
                  <Button variant="secondary" onClick={() => navigate("/assessment")}>
                    New assessment
                  </Button>
                }
              >
                Start your first ATAD2 assessment to see it here.
              </EmptyState>
            </Card>
          </FadeIn>
        ) : (
          <StaggerChildren stagger={0.04} className="flex flex-col gap-3">
            {sessions.map((session) => {
              const ready = session.completed && Boolean(session.has_memorandum);
              const inProgress = !session.completed;
              const dateLabel = inProgress ? "started" : "completed";
              const ariaLabel = inProgress
                ? `Resume assessment for ${session.taxpayer_name}`
                : `Open report for ${session.taxpayer_name}`;

              return (
                <motion.div key={session.id} variants={staggerItem}>
                  <div className="group relative flex items-center gap-4 rounded-ds-card border border-ds-hairline bg-ds-card p-4 sm:p-5 transition-colors duration-150 hover:bg-ds-fill-muted">
                    <Link
                      to={session.destination_url}
                      className="absolute inset-0 rounded-ds-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ds-accent"
                      aria-label={ariaLabel}
                    />
                    <div className="pointer-events-none relative min-w-0 flex-1">
                      <div className="mb-1.5 flex items-center gap-3">
                        <h3 className="truncate text-[15px] font-medium tracking-tight text-ds-ink">
                          {session.taxpayer_name}
                        </h3>
                        {ready ? (
                          <StatusPill status="complete">Ready</StatusPill>
                        ) : inProgress ? (
                          <StatusPill status="neutral">In progress</StatusPill>
                        ) : (
                          <StatusPill status="neutral">Memo pending</StatusPill>
                        )}
                      </div>
                      <p className="tabular text-[13px] text-ds-ink-secondary">
                        FY{session.fiscal_year} · {dateLabel} {formatDate(session.created_at)}
                      </p>
                    </div>
                    <div className="relative z-10 flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Copy session id"
                        className="text-ds-ink-secondary"
                        onClick={(e) => {
                          e.stopPropagation();
                          copySessionId(session.session_id);
                        }}
                      >
                        <Copy />
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(session.destination_url);
                        }}
                      >
                        <FileText />
                        {inProgress ? "Resume" : "View report"}
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="Delete assessment"
                            className="text-ds-ink-secondary hover:text-ds-red"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Trash2 />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete assessment</AlertDialogTitle>
                            <AlertDialogDescription>
                              Are you sure you want to permanently delete this assessment for {session.taxpayer_name}?
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
    </MotionPage>
  );
};

export default Index;
