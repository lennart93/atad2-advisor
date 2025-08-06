
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { Trash2, Eye } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";

interface CompletedSession {
  id: string;
  session_id: string;
  taxpayer_name: string;
  fiscal_year: string;
  created_at: string;
  answer_count: number;
}

const Index = () => {
  const { user, loading, signOut } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [completedSessions, setCompletedSessions] = useState<CompletedSession[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(true);

  useEffect(() => {
    if (!loading && !user) {
      navigate("/auth");
    }
  }, [user, loading, navigate]);

  useEffect(() => {
    if (user) {
      loadCompletedSessions();
    }
  }, [user]);

  const loadCompletedSessions = async () => {
    if (!user) return;
    
    setLoadingSessions(true);
    try {
      // Get completed sessions with answer counts
      const { data: sessions, error: sessionsError } = await supabase
        .from('atad2_sessions')
        .select('id, session_id, taxpayer_name, fiscal_year, created_at')
        .eq('user_id', user.id)
        .eq('completed', true)
        .order('created_at', { ascending: false });

      if (sessionsError) throw sessionsError;

      // Get answer counts for each session
      const sessionsWithCounts = await Promise.all(
        (sessions || []).map(async (session) => {
          const { count, error: countError } = await supabase
            .from('atad2_answers')
            .select('*', { count: 'exact', head: true })
            .eq('session_id', session.session_id);

          if (countError) {
            console.error('Error counting answers:', countError);
            return { ...session, answer_count: 0 };
          }

          return { ...session, answer_count: count || 0 };
        })
      );

      setCompletedSessions(sessionsWithCounts);
    } catch (error) {
      console.error('Error loading completed sessions:', error);
      toast({
        title: "Error",
        description: "Failed to load completed assessments",
        variant: "destructive",
      });
    } finally {
      setLoadingSessions(false);
    }
  };

  const deleteSession = async (sessionId: string) => {
    try {
      // Delete answers first (due to foreign key constraint)
      const { error: answersError } = await supabase
        .from('atad2_answers')
        .delete()
        .eq('session_id', sessionId);

      if (answersError) throw answersError;

      // Delete session
      const { error: sessionError } = await supabase
        .from('atad2_sessions')
        .delete()
        .eq('session_id', sessionId);

      if (sessionError) throw sessionError;

      toast({
        title: "Assessment deleted",
        description: "The assessment has been deleted successfully.",
      });

      // Reload sessions
      loadCompletedSessions();
    } catch (error) {
      console.error('Error deleting session:', error);
      toast({
        title: "Error",
        description: "Failed to delete assessment",
        variant: "destructive",
      });
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <p className="text-xl text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return null; // Will redirect to auth
  }

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-4xl font-bold">ATAD2 risk assessment</h1>
            <p className="text-xl text-muted-foreground mt-2">
              Welcome, {user.email}
            </p>
          </div>
          <Button variant="outline" onClick={signOut}>
            Sign out
          </Button>
        </div>
        
        <div className="grid gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Start new assessment</CardTitle>
              <CardDescription>
                Answer the questions to determine your ATAD2 risk score
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button size="lg" onClick={() => navigate("/assessment")}>
                Start assessment
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Completed assessments</CardTitle>
              <CardDescription>
                View or delete your previously completed assessments
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loadingSessions ? (
                <p className="text-muted-foreground">Loading assessments...</p>
              ) : completedSessions.length === 0 ? (
                <p className="text-muted-foreground">No completed assessments yet.</p>
              ) : (
                <div className="space-y-4">
                  {completedSessions.map((session) => (
                    <div key={session.id} className="flex items-center justify-between p-4 border rounded-lg">
                      <div className="flex-1">
                        <h3 className="font-semibold">{session.taxpayer_name}</h3>
                        <div className="text-sm text-muted-foreground mt-1">
                          <p>Tax Year: {session.fiscal_year}</p>
                          <p>Completed: {format(new Date(session.created_at), 'MMM d, yyyy')}</p>
                          <p>Questions answered: {session.answer_count}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => navigate(`/assessment-report/${session.session_id}`)}
                        >
                          <Eye className="h-4 w-4 mr-2" />
                          View report
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="outline"
                              size="sm"
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Delete
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                              <AlertDialogDescription>
                                This action cannot be undone. This will permanently delete the assessment for "{session.taxpayer_name}" and all associated answers.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={() => deleteSession(session.session_id)}>
                                Delete
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
