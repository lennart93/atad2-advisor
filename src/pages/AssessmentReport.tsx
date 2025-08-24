
import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/components/ui/sonner";
import { format } from "date-fns";
import { ArrowLeft, FileText, Bot, Loader2 } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { EditableAnswer } from "@/components/EditableAnswer";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import ReactMarkdown from "react-markdown";
import rehypeRaw from "rehype-raw";

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

interface ReportData {
  id: string;
  report_title: string;
  generated_at: string;
  model?: string;
  total_risk?: number;
  answers_count?: number;
  report_md?: string;
}

interface N8nReportResponse {
  session_id: string;
  model: string;
  total_risk: number;
  answers_count: number;
  report_md: string;
  report_json?: any;
  report_title: string;
}

const AssessmentReport = () => {
  const { sessionId } = useParams<{ sessionId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  
  const [sessionData, setSessionData] = useState<SessionData | null>(null);
  const [answers, setAnswers] = useState<AnswerData[]>([]);
  const [loading, setLoading] = useState(true);
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);

  // Query for related reports
  const { data: reports } = useQuery({
    queryKey: ["reports", sessionId],
    queryFn: async () => {
      if (!sessionId || !user) return [];
      
      const { data, error } = await supabase
        .from("atad2_reports")
        .select("id, report_title, generated_at, model, total_risk, answers_count, report_md")
        .eq("session_id", sessionId)
        .order("generated_at", { ascending: false })
        .limit(3);

      if (error) throw error;
      return data as ReportData[];
    },
    enabled: !!sessionId && !!user,
  });

  // Get the most recent report for inline display
  const latestReport = reports?.[0];

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
      toast.error("Error", {
        description: "Failed to load assessment data",
      });
      navigate("/");
    } finally {
      setLoading(false);
    }
  };

  const totalRiskPoints = Math.round((answers.reduce((sum, answer) => sum + answer.risk_points, 0)) * 100) / 100;

  const handleAnswerUpdate = (answerId: string, newAnswer: string, newExplanation: string) => {
    setAnswers(prev => prev.map(answer => 
      answer.id === answerId 
        ? { ...answer, answer: newAnswer, explanation: newExplanation }
        : answer
    ));
  };

  const handleGenerateReport = async () => {
    if (!sessionId || !user) {
      console.log('Missing sessionId or user:', { sessionId, user: !!user });
      return;
    }

    setIsGeneratingReport(true);
    
    try {
      console.log('Starting report generation for session:', sessionId);
      
      // Call n8n webhook - n8n will process and the Edge Function will save the complete report
      const n8nResponse = await fetch('https://lennartwilming.app.n8n.cloud/webhook/atad2/generate-report', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          session_id: sessionId
        })
      });

      console.log('n8n response status:', n8nResponse.status);

      if (!n8nResponse.ok) {
        const errorText = await n8nResponse.text();
        console.error('n8n request failed:', n8nResponse.status, errorText);
        throw new Error(`n8n request failed: ${n8nResponse.status} - ${errorText}`);
      }

      const n8nData = await n8nResponse.json();
      console.log('n8n response data:', n8nData);

      // No need to save to Supabase here - the Edge Function handles the complete insert
      console.log('Report processing completed successfully');

      // Refresh reports query to show the newly created report
      queryClient.invalidateQueries({ queryKey: ["reports", sessionId] });

      toast.success("Success", {
        description: "Report generated and saved successfully",
      });

    } catch (error) {
      console.error('Error generating report:', error);
      toast.error("Error", {
        description: `Failed to generate report: ${error.message}`,
      });
    } finally {
      setIsGeneratingReport(false);
    }
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
              <CardTitle>Assessment report</CardTitle>
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

          {/* Generate Report Button */}
          <Card>
            <CardHeader>
              <CardTitle>Generate report</CardTitle>
              <CardDescription>
                Generate an AI-powered ATAD2 report based on this assessment.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div>
                        <Button 
                          onClick={handleGenerateReport}
                          disabled={isGeneratingReport || !!latestReport}
                          className="w-full sm:w-auto bg-green-600 hover:bg-green-700 text-white disabled:opacity-50"
                        >
                          {isGeneratingReport ? (
                            <>
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              Generating report...
                            </>
                          ) : latestReport ? (
                            "Report generated"
                          ) : (
                            "Generate report"
                          )}
                        </Button>
                      </div>
                    </TooltipTrigger>
                    {latestReport && (
                      <TooltipContent>
                        <p>This report has already been generated</p>
                      </TooltipContent>
                    )}
                  </Tooltip>
                </TooltipProvider>
                {isGeneratingReport && (
                  <p className="text-sm text-muted-foreground">This may take a few minutes</p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Latest Generated Report */}
          {latestReport && (
            <Card>
              <CardHeader>
                <CardTitle>{latestReport.report_title}</CardTitle>
                <CardDescription>
                  Generated: {format(new Date(latestReport.generated_at), 'MMM d, yyyy HH:mm')}
                  {latestReport.model && ` • Model: ${latestReport.model}`}
                  {latestReport.total_risk !== null && ` • Risk: ${latestReport.total_risk} points`}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {latestReport.report_md && (
                  <div className="markdown-body text-justify">
                    <ReactMarkdown
                      rehypePlugins={[rehypeRaw]}
                      components={{
                        u: ({ children }) => (
                          <span className="underline" style={{ textDecorationLine: 'underline', textUnderlineOffset: '3px' }}>{children}</span>
                        ),
                        p: ({ children }) => <p>{children}</p>,
                        h1: ({ children }) => <p className="font-bold">{children}</p>,
                        h2: ({ children }) => <p className="font-bold">{children}</p>,
                        h3: ({ children }) => <h3 className="font-bold">{children}</h3>,
                        h4: ({ children }) => <h4 className="font-bold">{children}</h4>,
                        ul: ({ children }) => <ul>{children}</ul>,
                        li: ({ children }) => <li>{children}</li>,
                        br: () => <br />,
                        sup: ({ children }) => <sup>{children}</sup>,
                        sub: ({ children }) => <sub>{children}</sub>,
                      }}
                    >
                      {latestReport.report_md}
                    </ReactMarkdown>
                  </div>
                )}
              </CardContent>
            </Card>
          )}


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
                    readOnly={!!latestReport}
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
