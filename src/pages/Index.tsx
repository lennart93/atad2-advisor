import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/components/ui/sonner";
import { SessionRow } from "@/components/SessionRow";

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
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/70 mb-1">
            Get started
          </div>
          <CardTitle>Start new assessment</CardTitle>
          <CardDescription>
            Begin a new ATAD2 risk assessment for a taxpayer
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={() => navigate("/assessment")} size="lg">
            Start assessment
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/70 mb-1">
            History
          </div>
          <CardTitle>Completed assessments</CardTitle>
          <CardDescription className="text-sm">
            View or delete your previously completed assessments
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
            </div>
          ) : sessions.length === 0 ? (
            <p className="text-muted-foreground text-sm">No completed assessments yet</p>
          ) : (
            <div className="space-y-4">
              {sessions.map((session) => (
                <SessionRow
                  key={session.id}
                  sessionId={session.session_id}
                  taxpayerName={session.taxpayer_name}
                  fiscalYear={session.fiscal_year}
                  completedAt={session.created_at}
                  hasMemorandum={Boolean(session.has_memorandum)}
                  memorandumDate={session.memorandum_date}
                  onDelete={() => deleteSession(session.session_id, session.id)}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default Index;
