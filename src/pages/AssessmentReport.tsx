
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { ArrowLeft } from "lucide-react";
import { EditableAnswer } from "@/components/EditableAnswer";

interface SessionData {
  session_id: string;
  taxpayer_name: string;
  fiscal_year: string;
  created_at: string;
  is_custom_period: boolean;
  period_start_date: string | null;
  period_end_date: string | null;
}

interface AnswerData {
  id: string;
  question_id: string;
  question_text: string;
  answer: string;
  explanation: string;
  risk_points: number;
  answered_at: string;
}

const AssessmentReport = () => {
  const { sessionId } = useParams<{ sessionId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [sessionData, setSessionData] = useState<SessionData | null>(null);
  const [answers, setAnswers] = useState<AnswerData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      navigate("/auth");
      return;
    }
    
    if (sessionId) {
      loadSessionData();
    }
  }, [user, sessionId]);

  const loadSessionData = async () => {
    if (!sessionId || !user) return;

    setLoading(true);
    try {
      // Load session data
      const { data: session, error: sessionError } = await supabase
        .from('atad2_sessions')
        .select('*')
        .eq('session_id', sessionId)
        .eq('user_id', user.id)
        .single();

      if (sessionError) throw sessionError;
      setSessionData(session);

      // Load answers
      const { data: answersData, error: answersError } = await supabase
        .from('atad2_answers')
        .select('id, question_id, question_text, answer, explanation, risk_points, answered_at')
        .eq('session_id', sessionId)
        .order('answered_at');

      if (answersError) throw answersError;
      setAnswers(answersData || []);

    } catch (error) {
      console.error('Error loading session data:', error);
      toast({
        title: "Error",
        description: "Failed to load assessment data",
        variant: "destructive",
      });
      navigate("/");
    } finally {
      setLoading(false);
    }
  };

  const totalRiskPoints = answers.reduce((sum, answer) => sum + answer.risk_points, 0);

  const handleAnswerUpdate = (answerId: string, newAnswer: string, newExplanation: string) => {
    setAnswers(prev => prev.map(answer => 
      answer.id === answerId 
        ? { ...answer, answer: newAnswer, explanation: newExplanation }
        : answer
    ));
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-xl text-muted-foreground">Loading assessment report...</p>
      </div>
    );
  }

  if (!sessionData) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <p className="text-xl text-muted-foreground">Assessment not found</p>
          <Button onClick={() => navigate("/")} className="mt-4">
            Return to dashboard
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <Button variant="outline" onClick={() => navigate("/")}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to dashboard
          </Button>
        </div>

        <div className="space-y-6">
          {/* Session Summary */}
          <Card>
            <CardHeader>
              <CardTitle>Assessment Report</CardTitle>
              <CardDescription>
                ATAD2 Risk Assessment Results
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <h3 className="font-semibold mb-2">Session Details</h3>
                  <div className="space-y-1 text-sm">
                    <p><span className="font-medium">Taxpayer:</span> {sessionData.taxpayer_name}</p>
                    <p><span className="font-medium">Fiscal Year:</span> {sessionData.fiscal_year}</p>
                    <p><span className="font-medium">Completed:</span> {format(new Date(sessionData.created_at), 'MMM d, yyyy HH:mm')}</p>
                    {sessionData.is_custom_period && sessionData.period_start_date && sessionData.period_end_date && (
                      <p><span className="font-medium">Period:</span> {format(new Date(sessionData.period_start_date), 'MMM d, yyyy')} - {format(new Date(sessionData.period_end_date), 'MMM d, yyyy')}</p>
                    )}
                  </div>
                </div>
                <div>
                  <h3 className="font-semibold mb-2">Assessment Summary</h3>
                  <div className="space-y-1 text-sm">
                    <p><span className="font-medium">Questions answered:</span> {answers.length}</p>
                    <p><span className="font-medium">Total risk points:</span> {totalRiskPoints}</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Answers Detail */}
          <Card>
            <CardHeader>
              <CardTitle>Question Responses</CardTitle>
              <CardDescription>
                Click the edit button next to any answer to make changes
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                {answers.map((answer) => (
                  <EditableAnswer
                    key={answer.id}
                    answerId={answer.id}
                    questionText={answer.question_text}
                    currentAnswer={answer.answer}
                    currentExplanation={answer.explanation}
                    riskPoints={answer.risk_points}
                    onUpdate={(newAnswer, newExplanation) => 
                      handleAnswerUpdate(answer.id, newAnswer, newExplanation)
                    }
                  />
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default AssessmentReport;
