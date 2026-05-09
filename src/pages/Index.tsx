import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Clock, FileText, Sparkles, Trash2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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

interface CompletedSession {
  id: string;
  session_id: string;
  taxpayer_name: string;
  fiscal_year: string;
  created_at: string;
  answer_count: number;
  has_memorandum?: boolean;
  memorandum_date?: string;
}

const Index = () => {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  const [sessions, setSessions] = useState<CompletedSession[]>([]);
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

      // Get completed sessions with answer counts and memorandum status
      const { data: sessionsData, error: sessionsError } = await supabase
        .from('atad2_sessions')
        .select(`
          id,
          session_id,
          taxpayer_name,
          fiscal_year,
          created_at
        `)
        .eq('completed', true)
        .eq('user_id', user!.id)
        .order('created_at', { ascending: false });

      if (sessionsError) throw sessionsError;

      // Get answer counts and memorandum status for each session
      const sessionsWithCounts = await Promise.all(
        (sessionsData || []).map(async (session) => {
          const { count } = await supabase
            .from('atad2_answers')
            .select('*', { count: 'exact', head: true })
            .eq('session_id', session.session_id);

          // Check if memorandum exists
          const { data: reportData } = await supabase
            .from('atad2_reports')
            .select('generated_at')
            .eq('session_id', session.session_id)
            .order('generated_at', { ascending: false })
            .limit(1);

          const hasMemorandum = reportData && reportData.length > 0;
          const memorandumDate = hasMemorandum ? reportData[0].generated_at : null;

          return {
            ...session,
            answer_count: count || 0,
            has_memorandum: hasMemorandum,
            memorandum_date: memorandumDate,
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
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (!user) return null;

  return (
    <MotionPage>
      <div className="flex flex-col gap-10">
        {/* Get started */}
        <section className="rounded-lg border border-border bg-background p-5 sm:p-6 flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <span className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Get started</span>
            <h2 className="text-xl sm:text-2xl font-semibold tracking-tight">Start new assessment</h2>
            <p className="text-sm text-muted-foreground">Begin a new ATAD2 risk assessment for a taxpayer.</p>
          </div>
          <Button
            onClick={() => navigate("/assessment")}
            size="lg"
            className="self-start"
          >
            Start assessment
          </Button>
        </section>

        {/* History */}
        <section className="rounded-lg border border-border bg-background p-5 sm:p-6 flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <span className="text-xs uppercase tracking-[0.18em] text-muted-foreground">History</span>
            <h2 className="text-xl sm:text-2xl font-semibold tracking-tight">Completed assessments</h2>
            <p className="text-sm text-muted-foreground">View or delete your previously completed assessments.</p>
          </div>
          {loading ? (
            <div className="flex flex-col gap-3">
              <Skeleton className="h-[88px] w-full rounded-lg" />
              <Skeleton className="h-[88px] w-full rounded-lg" />
              <Skeleton className="h-[88px] w-full rounded-lg" />
            </div>
          ) : sessions.length === 0 ? (
            <FadeIn>
              <div className="flex flex-col items-center justify-center gap-4 rounded-lg border border-dashed border-border py-16 px-6 text-center">
                <Sparkles className="h-12 w-12 text-muted-foreground/40 mx-auto" />
                <div className="flex flex-col gap-1">
                  <h3 className="text-lg font-semibold tracking-tight">
                    No assessments yet
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    Start your first ATAD2 assessment to see it here.
                  </p>
                </div>
              </div>
            </FadeIn>
          ) : (
            <StaggerChildren stagger={0.04} className="flex flex-col gap-3">
              {sessions.map((session) => {
                const ready = Boolean(session.has_memorandum);
                const accentClass = ready
                  ? "border-l-emerald-500/70"
                  : "border-l-amber-500/60";
                const shortId = session.session_id.slice(0, 8);

                return (
                  <motion.div key={session.id} variants={staggerItem}>
                    <div
                      className={`group relative flex items-center gap-4 rounded-lg border border-border border-l-4 ${accentClass} bg-background p-4 sm:p-5 transition-all duration-normal ease-emphasized hover:border-foreground/20 hover:shadow-sm`}
                    >
                      <Link
                        to={`/assessment-report/${session.session_id}`}
                        className="absolute inset-0 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        aria-label={`Open report for ${session.taxpayer_name}`}
                      />
                      <div className="relative flex-1 min-w-0 pointer-events-none">
                        <div className="flex items-center gap-3 mb-1.5">
                          <h3 className="text-base font-medium tracking-tight truncate">
                            {session.taxpayer_name}
                          </h3>
                          {ready ? (
                            <Badge variant="live">Ready</Badge>
                          ) : (
                            <Badge variant="secondary" className="gap-1">
                              <Clock className="h-3 w-3" />
                              In progress
                            </Badge>
                          )}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          <span className="font-mono">FY{session.fiscal_year}</span>
                          <span className="mx-1.5 text-muted-foreground/50">·</span>
                          <span className="font-mono">session {shortId}</span>
                          <span className="mx-1.5 text-muted-foreground/50">·</span>
                          <span>Completed {formatDate(session.created_at)}</span>
                        </div>
                      </div>
                      <div className="relative flex items-center gap-2 z-10">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/assessment-report/${session.session_id}`);
                          }}
                        >
                          <FileText className="h-4 w-4 mr-2" />
                          View report
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <button
                              onClick={(e) => e.stopPropagation()}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                              aria-label="Delete assessment"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
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
      </div>
    </MotionPage>
  );
};

export default Index;
