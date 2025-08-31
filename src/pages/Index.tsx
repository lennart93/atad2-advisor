
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/components/ui/sonner";
import { Trash2, FileText, FileBarChart } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
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

interface CompletedSession {
  id: string;
  session_id: string;
  taxpayer_name: string;
  fiscal_year: string;
  created_at: string;
  answer_count: number;
}

interface RecentReport {
  id: string;
  session_id: string;
  report_title: string;
  generated_at: string;
  taxpayer_name: string;
  model?: string;
}

const Index = () => {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  
  const [sessions, setSessions] = useState<CompletedSession[]>([]);
  const [loading, setLoading] = useState(true);

  // Query for recent reports
  const { data: recentReports } = useQuery({
    queryKey: ["recentReports"],
    queryFn: async () => {
      if (!user) return [];
      
      const { data, error } = await supabase
        .from("atad2_reports")
        .select(`
          id,
          session_id,
          report_title,
          generated_at,
          model
        `)
        .eq("user_id", user.id)
        .order("generated_at", { ascending: false })
        .limit(3);

      if (error) throw error;
      
      // Get taxpayer names for each report
      const reportsWithTaxpayer = await Promise.all(
        (data || []).map(async (report) => {
          const { data: session } = await supabase
            .from("atad2_sessions")
            .select("taxpayer_name")
            .eq("session_id", report.session_id)
            .single();
          
          return {
            ...report,
            taxpayer_name: session?.taxpayer_name || "Unknown"
          };
        })
      );
      
      return reportsWithTaxpayer as RecentReport[];
    },
    enabled: !!user,
  });


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
      
      // Get completed sessions with answer counts
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
        .order('created_at', { ascending: false });

      if (sessionsError) throw sessionsError;

      // Get answer counts for each session
      const sessionsWithCounts = await Promise.all(
        (sessionsData || []).map(async (session) => {
          const { count } = await supabase
            .from('atad2_answers')
            .select('*', { count: 'exact', head: true })
            .eq('session_id', session.session_id);

          return {
            ...session,
            answer_count: count || 0
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
        <p>Loading...</p>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-4xl mx-auto">
        
        <div className="grid gap-6">
          <Card>
            <CardHeader>
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
              <CardTitle>Completed assessments</CardTitle>
              <CardDescription className="text-sm">
                View or delete your previously completed assessments
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <p className="text-muted-foreground">Loading assessments...</p>
              ) : sessions.length === 0 ? (
                <p className="text-muted-foreground text-sm">No completed assessments yet.</p>
              ) : (
                <div className="space-y-4">
                  {sessions.map((session) => (
                    <div key={session.id} className="flex items-center justify-between p-4 border rounded-lg">
                      <div className="flex-1">
                        <h3 className="font-medium">{session.taxpayer_name}</h3>
                        <div className="text-sm text-muted-foreground space-y-1">
                          <p>Tax year: {session.fiscal_year}</p>
                          <p>Questions answered: {session.answer_count}</p>
                          <p>Completed: {new Date(session.created_at).toLocaleDateString()}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => navigate(`/assessment-report/${session.session_id}`)}
                        >
                          <FileText className="h-4 w-4 mr-2" />
                          View report
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <button className="text-red-600 hover:text-red-800 text-sm flex items-center gap-1 transition-colors duration-200">
                              <Trash2 className="h-4 w-4" />
                              Delete
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
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default Index;
