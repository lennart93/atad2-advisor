
import React, { useEffect, useState, useRef, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useCleanupDocuments } from "@/hooks/usePrefill";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/components/ui/sonner";
import { format } from "date-fns";
import { ArrowLeft, FileText, Bot, Loader2, AlertTriangle, Info, CheckCircle, Pencil, X, Check } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { EditableAnswer } from "@/components/EditableAnswer";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import ReactMarkdown from "react-markdown";
import rehypeRaw from "rehype-raw";
import WaitingMessage from "@/components/WaitingMessage";
import DownloadMemoButton from "@/components/DownloadMemoButton";
import MemoFeedbackEditor from "@/components/MemoFeedbackEditor";
import MemoDiffViewer from "@/components/MemoDiffViewer";
import MissingExplanationsPopover from "@/components/MissingExplanationsPopover";
import { buildDocumentsBlock } from "@/lib/prefill/buildDocumentsBlock";
import { AssessmentFooterSlot } from "@/components/assessment/AssessmentFooterSlot";
import { loadChartSnapshot } from "@/lib/structure/client";
interface SessionData {
  session_id: string;
  taxpayer_name: string;
  fiscal_year: string;
  created_at: string;
  is_custom_period: boolean;
  period_start_date: string | null;
  period_end_date: string | null;
  // Confirmation fields
  preliminary_outcome: string | null;
  outcome_confirmed: boolean;
  outcome_overridden: boolean;
  override_reason: string | null;
  override_outcome: string | null;
  additional_context: string | null;
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
  const cleanupDocs = useCleanupDocuments(sessionId ?? null);

  const [sessionData, setSessionData] = useState<SessionData | null>(null);
  const [answers, setAnswers] = useState<AnswerData[]>([]);
  const [loading, setLoading] = useState(true);
  const [isFeedbackMode, setIsFeedbackMode] = useState(false);
  const [isDiffMode, setIsDiffMode] = useState(false);
  const [currentMemoMarkdown, setCurrentMemoMarkdown] = useState<string | null>(null);
  const [originalMemoBeforeFeedback, setOriginalMemoBeforeFeedback] = useState<string | null>(null);
  const [revisedMemoFromFeedback, setRevisedMemoFromFeedback] = useState<string | null>(null);
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const [hasAcceptedChanges, setHasAcceptedChanges] = useState(false);
  const [isApplyingFeedback, setIsApplyingFeedback] = useState(false);
  
  // Editable reasoning and context state
  const [isEditingReasoning, setIsEditingReasoning] = useState(false);
  const [isEditingContext, setIsEditingContext] = useState(false);
  const [editedReasoning, setEditedReasoning] = useState('');
  const [editedContext, setEditedContext] = useState('');
  const [isSavingReasoning, setIsSavingReasoning] = useState(false);
  const [isSavingContext, setIsSavingContext] = useState(false);
  
  // Missing explanations validation state
  const [showMissingExplanationsPopover, setShowMissingExplanationsPopover] = useState(false);
  const [highlightedQuestionIds, setHighlightedQuestionIds] = useState<string[]>([]);
  const questionRefs = useRef<Record<string, HTMLDivElement | null>>({});

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

  // Query for the finalized structure-chart snapshot
  const { data: chartSnapshot } = useQuery({
    queryKey: ['report-chart-snapshot', sessionId],
    enabled: !!sessionId,
    staleTime: 60_000,
    queryFn: () => loadChartSnapshot(sessionId!),
  });

  // Get the most recent report for inline display
  const latestReport = reports?.[0];

  // Sync currentMemoMarkdown with latestReport when it changes
  useEffect(() => {
    if (latestReport?.report_md && !currentMemoMarkdown) {
      setCurrentMemoMarkdown(latestReport.report_md);
    }
  }, [latestReport?.report_md]);

  // Get the memo to display (either updated via feedback or from latestReport).
  // Strip the leading 3 boilerplate lines (header + Taxpayer + Financial year)
  // so we don't render them twice — the page-level card already shows that info.
  const rawMemo = currentMemoMarkdown || latestReport?.report_md;
  const displayMemo = (() => {
    if (!rawMemo) return rawMemo;
    return rawMemo
      .replace(/^\s*\*\*ATAD2 assessment memorandum\*\*\s*/m, '')
      .replace(/^\s*Taxpayer:\s.*$/m, '')
      .replace(/^\s*Financial year:\s.*$/m, '')
      .replace(/^\s*\n+/, '')
      .trimStart();
  })();

  useEffect(() => {
    if (!user) {
      navigate("/auth");
      return;
    }
    
    if (sessionId) {
      loadSessionData();
    }
  }, [user, sessionId]);

  const handleFeedbackSubmitted = (newMemoMarkdown: string) => {
    // Store both original and revised for diff view
    setOriginalMemoBeforeFeedback(displayMemo || null);
    setRevisedMemoFromFeedback(newMemoMarkdown);
    setIsFeedbackMode(false);
    setIsDiffMode(true);
  };

  const handleAcceptChanges = () => {
    if (revisedMemoFromFeedback) {
      setCurrentMemoMarkdown(revisedMemoFromFeedback);
    }
    setIsDiffMode(false);
    setOriginalMemoBeforeFeedback(null);
    setRevisedMemoFromFeedback(null);
    setHasAcceptedChanges(true);
    // Invalidate reports query to refresh data
    queryClient.invalidateQueries({ queryKey: ["reports", sessionId] });
  };

  const handleRejectChanges = () => {
    // Keep the original memo, discard the revised version
    setIsDiffMode(false);
    setOriginalMemoBeforeFeedback(null);
    setRevisedMemoFromFeedback(null);
  };

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
      
      // Check if outcome has been confirmed - if not, redirect to confirmation
      if (!session.outcome_confirmed) {
        navigate(`/assessment-confirmation/${sessionId}`);
        return;
      }

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

  // Determine the final outcome - use override if applicable
  const getFinalOutcome = () => {
    if (sessionData?.outcome_overridden && sessionData?.override_outcome) {
      // Map stored outcome string to display text
      const outcomeMap: Record<string, { text: string; icon: JSX.Element; color: string; description: string }> = {
        'risk_identified': {
          text: "ATAD2 risk identified",
          icon: <AlertTriangle className="h-4 w-4 text-red-600" />,
          color: "text-red-600",
          description: "This outcome was manually selected based on your expert assessment."
        },
        'insufficient_information': {
          text: "Insufficient information",
          icon: <Info className="h-4 w-4 text-orange-600" />,
          color: "text-orange-600",
          description: "This outcome was manually selected based on your expert assessment."
        },
        'low_risk': {
          text: "Low ATAD2 risk",
          icon: <CheckCircle className="h-4 w-4 text-green-600" />,
          color: "text-green-600",
          description: "This outcome was manually selected based on your expert assessment."
        }
      };
      return outcomeMap[sessionData.override_outcome] || getRiskOutcome(totalRiskPoints);
    }
    return getRiskOutcome(totalRiskPoints);
  };

  const getRiskOutcome = (points: number) => {
    if (points >= 1.0) {
      return {
        text: "ATAD2 risk identified",
        icon: <AlertTriangle className="h-4 w-4 text-red-600" />,
        color: "text-red-600",
        description: "You can generate a memorandum highlighting potential ATAD2 risk areas for further review."
      };
    } else if (points >= 0.2) {
      return {
        text: "Insufficient information",
        icon: <Info className="h-4 w-4 text-orange-600" />,
        color: "text-orange-600",
        description: "You can generate a memorandum outlining which information is missing to complete a full ATAD2 analysis."
      };
    } else {
      return {
        text: "Low",
        icon: <CheckCircle className="h-4 w-4 text-green-600" />,
        color: "text-green-600",
        description: "You can generate a memorandum confirming that no ATAD2 risks were identified based on the provided information."
      };
    }
  };

  const riskOutcome = getFinalOutcome();

  // Calculate answers missing explanations
  const answersWithoutExplanation = answers.filter(answer => {
    const explanation = answer.explanation?.trim();
    return answer.answer && (!explanation || explanation === "No explanation provided");
  });
  const missingExplanationCount = answersWithoutExplanation.length;
  const missingExplanationQuestionIds = answersWithoutExplanation.map(a => a.question_id);

  const handleAnswerUpdate = (answerId: string, newAnswer: string, newExplanation: string, newRiskPoints: number) => {
    setAnswers(prev => prev.map(answer => 
      answer.id === answerId 
        ? { ...answer, answer: newAnswer, explanation: newExplanation, risk_points: newRiskPoints }
        : answer
    ));
  };

  // Save reasoning handler
  const handleSaveReasoning = async () => {
    if (!sessionId || editedReasoning.trim().length < 100) return;
    
    setIsSavingReasoning(true);
    try {
      const { error } = await supabase
        .from('atad2_sessions')
        .update({ override_reason: editedReasoning.trim() })
        .eq('session_id', sessionId);

      if (error) throw error;

      setSessionData(prev => prev ? { ...prev, override_reason: editedReasoning.trim() } : null);
      setIsEditingReasoning(false);
      toast.success("Reasoning updated");
    } catch (error) {
      console.error('Error updating reasoning:', error);
      toast.error("Failed to update reasoning");
    } finally {
      setIsSavingReasoning(false);
    }
  };

  // Save additional context handler
  const handleSaveContext = async () => {
    if (!sessionId) return;
    
    setIsSavingContext(true);
    try {
      const { error } = await supabase
        .from('atad2_sessions')
        .update({ additional_context: editedContext.trim() || null })
        .eq('session_id', sessionId);

      if (error) throw error;

      setSessionData(prev => prev ? { ...prev, additional_context: editedContext.trim() || null } : null);
      setIsEditingContext(false);
      toast.success("Additions updated");
    } catch (error) {
      console.error('Error updating context:', error);
      toast.error("Failed to update additions");
    } finally {
      setIsSavingContext(false);
    }
  };

  // Handle Generate button click - check for missing explanations
  const handleGenerateButtonClick = () => {
    if (missingExplanationCount > 0) {
      setShowMissingExplanationsPopover(true);
    } else {
      handleGenerateReport();
    }
  };

  // Scroll to first question without explanation and highlight them
  const handleReviewQuestions = useCallback(() => {
    setHighlightedQuestionIds(missingExplanationQuestionIds);
    
    // Scroll to first missing explanation
    if (missingExplanationQuestionIds.length > 0) {
      const firstQuestionId = missingExplanationQuestionIds[0];
      const element = questionRefs.current[firstQuestionId];
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
    
    // Remove highlights after 8 seconds
    setTimeout(() => {
      setHighlightedQuestionIds([]);
    }, 8000);
  }, [missingExplanationQuestionIds]);

  // Clear highlights when generating anyway
  const handleGenerateAnyway = () => {
    setHighlightedQuestionIds([]);
    handleGenerateReport();
  };

  const handleGenerateReport = async () => {
    if (!sessionId || !user) {
      console.log('Missing sessionId or user:', { sessionId, user: !!user });
      return;
    }

    setIsGeneratingReport(true);
    
    try {
      console.log('Starting report generation for session:', sessionId);

      // Build the background documents block BEFORE the n8n call so we can pass
      // it through. Cleanup is deferred to the success branch — if the n8n call
      // fails the user can retry without re-uploading.
      let documentsBlock = "";
      try {
        documentsBlock = await buildDocumentsBlock(sessionId);
      } catch (e) {
        console.warn('[generate-report] buildDocumentsBlock failed, continuing without docs', e);
      }
      console.log('[generate-report] documents_block bytes:', documentsBlock.length);

      // Call n8n webhook - n8n will process and the Edge Function will save the complete report
      // Using AbortController with 10 minute timeout to allow for long-running AI processing
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10 * 60 * 1000); // 10 minutes

      const { data: { session: authSession } } = await supabase.auth.getSession();

      const n8nResponse = await fetch(`${import.meta.env.VITE_N8N_WEBHOOK_BASE}/atad2/generate-report`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          session_id: sessionId,
          auth_token: authSession?.access_token,
          additional_context: sessionData?.additional_context || null,
          outcome_overridden: sessionData?.outcome_overridden || false,
          override_reason: sessionData?.override_reason || null,
          override_outcome: sessionData?.override_outcome || null,
          preliminary_outcome: sessionData?.preliminary_outcome || null,
          documents_block: documentsBlock,
        }),
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);

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

      // Now that the memo has been saved, drop the source documents.
      const cleanupResult = await cleanupDocs.mutateAsync().catch(() => null);
      if (cleanupResult?.deleted_count && cleanupResult.deleted_count > 0) {
        toast.success("Source documents deleted", { description: "The memorandum is saved." });
      }

      // Refresh reports query to show the newly created report
      queryClient.invalidateQueries({ queryKey: ["reports", sessionId] });

      {
        const subjectName =
          (sessionData as unknown as { entity_name?: string | null })?.entity_name ||
          sessionData?.taxpayer_name ||
          "this session";
        toast.success("Memorandum generated", {
          description: `Memo for ${subjectName} is ready to download.`,
        });
      }

    } catch (error: any) {
      console.error('Error generating report:', error);
      
      // Check if it's a timeout/abort error
      if (error.name === 'AbortError') {
        toast.error("Request timed out", {
          description: "The memorandum generation is taking longer than expected. Please wait a moment and refresh the page to check if it completed.",
        });
      } else if (error.message?.includes('Failed to fetch') || error.message?.includes('NetworkError')) {
        // Network error - might still be processing
        toast.error("Connection issue", {
          description: "Lost connection during generation. The memo may still be processing. Refresh in a minute to check.",
        });
      } else {
        toast.error("Error", {
          description: `Failed to generate memorandum: ${error.message}`,
        });
      }
    } finally {
      setIsGeneratingReport(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <p className="text-xl text-muted-foreground">Loading assessment report...</p>
      </div>
    );
  }

  if (!sessionData) {
    return (
      <div className="flex items-center justify-center py-24">
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
    <div>

        {/* Memorandum header strip */}
        <div className="mb-6 rounded-lg border border-border bg-card px-6 py-5 shadow-sm">
          <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">MEMORANDUM</p>
          <h1 className="mt-1 text-2xl sm:text-3xl font-semibold tracking-tight">
            {sessionData.taxpayer_name}
          </h1>
          <p className="mt-2 font-mono text-xs text-muted-foreground">
            <span>{sessionData.session_id}</span>
            <span className="mx-2">·</span>
            <span>FY {sessionData.fiscal_year}</span>
          </p>
        </div>

        <div className="space-y-6">
          {/* Session Summary */}
          <Card>
            <CardHeader>
              <CardTitle>Assessment report</CardTitle>
              <CardDescription>
                ATAD2 risk assessment results
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <h3 className="font-semibold mb-2">Session details:</h3>
                  <div className="space-y-1 text-sm">
                    <p><span className="font-medium">Taxpayer:</span> <span className="font-mono text-sm">{sessionData.taxpayer_name}</span></p>
                    <p><span className="font-medium">Tax year:</span> <span className="font-mono text-sm">{sessionData.fiscal_year}</span></p>
                    <p><span className="font-medium">Completed:</span> <span className="font-mono text-sm">{format(new Date(sessionData.created_at), 'MMM d, yyyy HH:mm')}</span></p>
                    {sessionData.is_custom_period && sessionData.period_start_date && sessionData.period_end_date && (
                      <p><span className="font-medium">Period:</span> <span className="font-mono text-sm">{format(new Date(sessionData.period_start_date), 'MMM d, yyyy')} - {format(new Date(sessionData.period_end_date), 'MMM d, yyyy')}</span></p>
                    )}
                  </div>
                </div>
                <div>
                  <h3 className="font-semibold mb-2">Risk assessment outcome:</h3>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      {riskOutcome.icon}
                      <span className={`font-medium ${riskOutcome.color}`}>
                        {riskOutcome.text}
                      </span>
                      {sessionData.outcome_overridden && (
                        <span className="text-xs bg-muted px-2 py-0.5 rounded text-muted-foreground">
                          Adjusted
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {riskOutcome.description}
                    </p>
                  </div>
                </div>
              </div>

              {/* Reasoning and additions - full width grid below the main content */}
              {(sessionData.outcome_overridden && sessionData.override_reason) || sessionData.additional_context ? (
                <div className={`grid gap-3 ${
                  sessionData.outcome_overridden && sessionData.override_reason && sessionData.additional_context 
                    ? 'grid-cols-1 md:grid-cols-2' 
                    : 'grid-cols-1'
                }`}>
                  {sessionData.outcome_overridden && sessionData.override_reason && (
                    <div className="p-3 bg-muted/50 rounded-lg overflow-hidden">
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-xs font-medium text-muted-foreground">Your reasoning:</p>
                        {!isEditingReasoning && (
                          latestReport || isGeneratingReport ? (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button variant="ghost" size="sm" disabled className="h-6 w-6 p-0 opacity-50">
                                    <Pencil className="h-3 w-3" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>{isGeneratingReport ? "Memorandum is being generated" : "Memorandum already generated. Content can no longer be changed."}</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          ) : (
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              onClick={() => {
                                setEditedReasoning(sessionData.override_reason || '');
                                setIsEditingReasoning(true);
                              }} 
                              className="h-6 w-6 p-0"
                            >
                              <Pencil className="h-3 w-3" />
                            </Button>
                          )
                        )}
                      </div>
                      {isEditingReasoning ? (
                        <div className="space-y-2">
                          <Textarea 
                            value={editedReasoning} 
                            onChange={(e) => setEditedReasoning(e.target.value)}
                            className="min-h-[80px] text-sm"
                          />
                          {editedReasoning.trim().length < 100 && (
                            <p className="text-xs text-muted-foreground">
                              {100 - editedReasoning.trim().length} more characters needed
                            </p>
                          )}
                          <div className="flex gap-2">
                            <Button 
                              size="sm" 
                              onClick={handleSaveReasoning} 
                              disabled={editedReasoning.trim().length < 100 || isSavingReasoning}
                              className="h-7"
                            >
                              {isSavingReasoning ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3 mr-1" />}
                              Save
                            </Button>
                            <Button 
                              variant="outline" 
                              size="sm" 
                              onClick={() => setIsEditingReasoning(false)}
                              className="h-7"
                            >
                              <X className="h-3 w-3 mr-1" />
                              Cancel
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <p className="text-sm break-words">{sessionData.override_reason}</p>
                      )}
                    </div>
                  )}
                  {sessionData.additional_context && (
                    <div className="p-3 bg-muted/50 rounded-lg overflow-hidden">
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-xs font-medium text-muted-foreground">Your additions:</p>
                        {!isEditingContext && (
                          latestReport || isGeneratingReport ? (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button variant="ghost" size="sm" disabled className="h-6 w-6 p-0 opacity-50">
                                    <Pencil className="h-3 w-3" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>{isGeneratingReport ? "Memorandum is being generated" : "Memorandum already generated. Content can no longer be changed."}</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          ) : (
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              onClick={() => {
                                setEditedContext(sessionData.additional_context || '');
                                setIsEditingContext(true);
                              }} 
                              className="h-6 w-6 p-0"
                            >
                              <Pencil className="h-3 w-3" />
                            </Button>
                          )
                        )}
                      </div>
                      {isEditingContext ? (
                        <div className="space-y-2">
                          <Textarea 
                            value={editedContext} 
                            onChange={(e) => setEditedContext(e.target.value)}
                            className="min-h-[80px] text-sm"
                          />
                          <div className="flex gap-2">
                            <Button 
                              size="sm" 
                              onClick={handleSaveContext} 
                              disabled={isSavingContext}
                              className="h-7"
                            >
                              {isSavingContext ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3 mr-1" />}
                              Save
                            </Button>
                            <Button 
                              variant="outline" 
                              size="sm" 
                              onClick={() => setIsEditingContext(false)}
                              className="h-7"
                            >
                              <X className="h-3 w-3 mr-1" />
                              Cancel
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <p className="text-sm break-words">{sessionData.additional_context}</p>
                      )}
                    </div>
                  )}
                </div>
              ) : null}
            </CardContent>
          </Card>

          {/* Structure chart snapshot */}
          {chartSnapshot?.snapshot_png ? (
            <Card>
              <CardHeader>
                <CardTitle>Structure chart</CardTitle>
                <CardDescription>
                  Captured when the structure was finalized — included in the memorandum.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="rounded-lg border border-[hsl(var(--border-subtle))] bg-muted/30 p-4">
                  <img
                    src={chartSnapshot.snapshot_png}
                    alt="Structure chart for this assessment"
                    className="mx-auto max-h-[480px] w-auto"
                  />
                </div>
              </CardContent>
            </Card>
          ) : chartSnapshot?.finalized_at ? (
            <Card>
              <CardHeader>
                <CardTitle>Structure chart</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Structure chart snapshot unavailable for this assessment.
                </p>
              </CardContent>
            </Card>
          ) : null}

          {/* Generate Report Button */}
          <Card>
            <CardHeader>
              <CardTitle>Generate memorandum</CardTitle>
              <CardDescription>
                Generate an AI-powered ATAD2 memorandum based on this assessment
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex items-center gap-3 flex-wrap">
                  {latestReport ? (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div>
                            <Button
                              size="lg"
                              disabled
                              className="disabled:opacity-50 transition-all duration-fast"
                            >
                              Memorandum generated
                            </Button>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>This memorandum has already been generated</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  ) : (
                    <MissingExplanationsPopover
                      missingCount={missingExplanationCount}
                      isOpen={showMissingExplanationsPopover}
                      onOpenChange={setShowMissingExplanationsPopover}
                      onGenerateAnyway={handleGenerateAnyway}
                      onReviewQuestions={handleReviewQuestions}
                      onTriggerClick={handleGenerateAnyway}
                    >
                      <Button
                        size="lg"
                        onClick={handleGenerateButtonClick}
                        disabled={isGeneratingReport}
                        className="disabled:opacity-50 transition-all duration-fast"
                      >
                        {isGeneratingReport ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Generating memorandum…
                          </>
                        ) : (
                          "Generate memorandum"
                        )}
                      </Button>
                    </MissingExplanationsPopover>
                  )}

                  {/* Hairline divider between primary action and secondary group */}
                  <div className="h-6 w-px bg-border" aria-hidden="true" />

                  <DownloadMemoButton
                    sessionId={sessionId!}
                    memoMarkdown={displayMemo}
                    enabled={!!latestReport}
                    disabled={isApplyingFeedback}
                  />
                </div>
                {isGeneratingReport && (
                  <WaitingMessage />
                )}
              </div>
            </CardContent>
          </Card>

          {/* Latest Generated Report */}
          {latestReport && (
            <Card>
              <CardHeader className="flex flex-row items-start justify-between space-y-0">
                <div className="space-y-1.5">
                  <CardTitle>{latestReport.report_title}</CardTitle>
                </div>
                {!isFeedbackMode && !isDiffMode && displayMemo && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="shrink-0">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setIsFeedbackMode(true)}
                          disabled={hasAcceptedChanges}
                          className={`transition-all duration-fast ${hasAcceptedChanges ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                          <Pencil className="h-4 w-4 mr-2" />
                          Improve memo
                        </Button>
                      </span>
                    </TooltipTrigger>
                    {hasAcceptedChanges && (
                      <TooltipContent>
                        <p>You have already accepted the improved memo. Further edits are not available.</p>
                      </TooltipContent>
                    )}
                  </Tooltip>
                )}
              </CardHeader>
              <CardContent>
                {isDiffMode && originalMemoBeforeFeedback && revisedMemoFromFeedback ? (
                  <MemoDiffViewer
                    originalMemo={originalMemoBeforeFeedback}
                    revisedMemo={revisedMemoFromFeedback}
                    onAccept={handleAcceptChanges}
                    onReject={handleRejectChanges}
                  />
                ) : isFeedbackMode && displayMemo && sessionData ? (
                  <MemoFeedbackEditor
                    memoMarkdown={displayMemo}
                    sessionId={sessionId!}
                    taxpayerName={sessionData.taxpayer_name}
                    fiscalYear={sessionData.fiscal_year}
                    onFeedbackSubmitted={handleFeedbackSubmitted}
                    onCancel={() => setIsFeedbackMode(false)}
                    onSubmittingChange={setIsApplyingFeedback}
                  />
                ) : displayMemo ? (
                  <div className="markdown-body prose prose-base dark:prose-invert max-w-3xl text-left prose-headings:tracking-tight prose-headings:font-semibold prose-h1:text-2xl prose-h2:text-xl prose-h3:text-lg">
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
                      {displayMemo}
                    </ReactMarkdown>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          )}


          {/* Answers Detail */}
          <Card>
            <CardHeader>
              <CardTitle>Question responses</CardTitle>
              <CardDescription>
                {isGeneratingReport || latestReport 
                  ? "Responses are locked and can no longer be edited because a memorandum has been (or is being) generated"
                  : "Click the edit button next to any answer to make changes"
                }
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                {answers.map((answer) => {
                  const isHighlighted = highlightedQuestionIds.includes(answer.question_id);
                  const isMissingExplanation = missingExplanationQuestionIds.includes(answer.question_id);
                  
                  return (
                    <div
                      key={answer.id}
                      ref={(el) => { questionRefs.current[answer.question_id] = el; }}
                      className={`transition-all duration-500 rounded-lg ${
                        isHighlighted 
                          ? 'border-l-4 border-amber-400 bg-amber-50/50 pl-4 -ml-4' 
                          : ''
                      }`}
                    >
                      <EditableAnswer
                        answerId={answer.id}
                        questionId={answer.question_id}
                        questionText={answer.question_text}
                        currentAnswer={answer.answer}
                        currentExplanation={answer.explanation}
                        riskPoints={answer.risk_points}
                        readOnly={!!latestReport || isGeneratingReport}
                        sessionId={sessionId!}
                        onUpdate={(newAnswer, newExplanation, newRiskPoints) => 
                          handleAnswerUpdate(answer.id, newAnswer, newExplanation, newRiskPoints)
                        }
                        showMissingExplanationHint={isMissingExplanation && isHighlighted}
                      />
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>

        <AssessmentFooterSlot
          left={
            <Button variant="outline" onClick={() => navigate('/')} className="transition-all duration-fast">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to dashboard
            </Button>
          }
        />
    </div>
  );
};

export default AssessmentReport;
