import { useState, useEffect, useLayoutEffect, useCallback, useMemo, memo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useContextPanel } from "@/hooks/useContextPanel";
import { usePanelController } from "@/hooks/usePanelController";
import { useHardenedContextLoader } from "@/hooks/useHardenedContextLoader";
import { useAssessmentStore } from "@/stores/assessmentStore";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/sonner";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { InfoIcon, ArrowLeft, HelpCircle } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { AssessmentSidebar } from "@/components/AssessmentSidebar";
import { Textarea } from "@/components/ui/textarea";
import { ContextSkeleton, ContextEmptyState, ContextErrorState } from "@/components/ContextPanelStates";
import { ContextPanelFallback } from "@/components/ContextPanelFallback";
import { seededIndex } from "@/utils/random";

interface Question {
  id: string;
  question_id: string;
  question: string;
  answer_option: string;
  risk_points: number;
  next_question_id: string | null;
  difficult_term: string | null;
  term_explanation: string | null;
  question_title: string | null;
  requires_explanation?: boolean;
}

interface SessionInfo {
  taxpayer_name: string;
  tax_year: string;
  tax_year_not_equals_calendar: boolean;
  period_start_date?: string;
  period_end_date?: string;
}

interface QuestionTextProps {
  question: string;
  difficultTerm: string | null;
  termExplanation: string | null;
  exampleText: string | null;
}

const QuestionText = ({ question, difficultTerm, termExplanation, exampleText }: QuestionTextProps) => {
  const [showExample, setShowExample] = useState(false);

  const renderQuestionWithTerms = () => {
    if (!difficultTerm || !termExplanation || difficultTerm.toLowerCase().startsWith('example')) {
      return question;
    }

    // Find the difficult term in the question text (case insensitive)
    const termRegex = new RegExp(`\\b${difficultTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
    const parts = question.split(termRegex);
    const matches = question.match(termRegex);

    if (!matches || parts.length === 1) {
      return question;
    }

    return (
      <>
        {parts.map((part, index) => (
          <span key={index}>
            {part}
            {index < matches.length && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="font-semibold text-blue-800 hover:bg-blue-50 rounded-sm px-1 cursor-pointer transition-colors duration-200">
                      {matches[index]}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-sm p-3 bg-white border shadow-md rounded">
                    <div className="flex items-start gap-2">
                      <span className="text-lg">💡</span>
                      <div>
                        <span className="font-semibold text-slate-800 block mb-1">
                          {difficultTerm}
                        </span>
                        <p className="text-sm leading-relaxed text-slate-700">
                          {termExplanation}
                        </p>
                      </div>
                    </div>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </span>
        ))}
      </>
    );
  };

  return (
    <>
      {renderQuestionWithTerms()}
      {exampleText && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => setShowExample(!showExample)}
                className="ml-2 text-blue-700 text-base cursor-pointer hover:bg-blue-50 rounded-sm px-1 transition-colors duration-200"
                type="button"
              >
                📘
              </button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Click to view example</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
      
      {showExample && exampleText && (
        <div className="w-full bg-amber-50 border-l-4 border-yellow-400 rounded-md p-4 mt-4">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-start gap-2 flex-1">
              <span className="text-lg">📘</span>
              <div className="flex-1">
                <span className="font-semibold text-amber-800 block mb-2">Example</span>
                <p className="text-sm leading-relaxed text-amber-700">
                  {exampleText}
                </p>
              </div>
            </div>
            <button
              onClick={() => setShowExample(false)}
              className="text-amber-600 hover:text-amber-800 text-sm font-medium transition"
              type="button"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </>
  );
};

const Assessment = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  
  // Helper function to check if auto-advance is allowed
  function canAutoAdvance(selectedOption?: { requires_explanation?: boolean }) {
    return selectedOption?.requires_explanation !== true;
  }
  
  const [sessionInfo, setSessionInfo] = useState<SessionInfo>({
    taxpayer_name: "",
    tax_year: "",
    tax_year_not_equals_calendar: false
  });
  const [sessionStarted, setSessionStarted] = useState(false);
  const [sessionId, setSessionId] = useState<string>("");
  const [currentQuestion, setCurrentQuestion] = useState<Question | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [selectedAnswer, setSelectedAnswer] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [questionHistory, setQuestionHistory] = useState<{question: Question, answer: string}[]>([]);
  const [questionFlow, setQuestionFlow] = useState<{question: Question, answer: string}[]>([]); 
  const [navigationIndex, setNavigationIndex] = useState<number>(-1); 
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [showFlowChangeDialog, setShowFlowChangeDialog] = useState(false);
  const [pendingAnswerChange, setPendingAnswerChange] = useState<{answer: string, newNextQuestionId: string | null} | null>(null);
  const [autoAdvance, setAutoAdvance] = useState(true);
  const [pendingQuestion, setPendingQuestion] = useState<Question | null>(null);
  
  // Friendly explanation reminder state
  const [explanationReminderShown, setExplanationReminderShown] = useState(false);
  const [showExplanationShake, setShowExplanationShake] = useState(false);
  const [reminderMessage, setReminderMessage] = useState("");
  
  // Friendly reminder messages for empty explanations
  const friendlyReminders = [
    "Some further context would be really helpful",
    "Don't leave me empty, just a few words?",
    "Please don't forget about me",
    "Even a little context makes my answers smarter!",
    "Your thoughts here would make this much clearer",
    "A tiny bit of context would help a lot",
    "Don't be shy, even one line is enough"
  ];
  
  // Get current selected option for DB-based requiresExplanation
  const selectedQuestionOption = useMemo(() => {
    if (!currentQuestion || !selectedAnswer) return null;
    return questions.find(q => 
      q.question_id === currentQuestion.question_id && 
      q.answer_option === selectedAnswer
    );
  }, [currentQuestion, selectedAnswer, questions]);
  
  // NEW derived (exact zo):
  const answerOptionText = selectedQuestionOption?.answer_option ?? null;        // 'Yes' | 'No' | 'Unknown'
  const dbRequiresExplanation = selectedQuestionOption?.requires_explanation === true; // boolean uit DB

  // TEMP debug (laat rustig staan):
  console.debug('[answer:selected]', {
    qid: currentQuestion?.question_id,
    answerOptionText,
    requiresExplanation: dbRequiresExplanation,
  });

  // New Panel Controller - single source of truth for context panel
  const qId = currentQuestion?.question_id ?? "";
  const { 
    shouldRender: shouldShowContextPanel, 
    paneKey, 
    value: contextValue, 
    selectedAnswerId, 
    requiresExplanation,
    contextPrompt,
    contextStatus,
    contextPrompts
  } = usePanelController(sessionId, qId, answerOptionText, dbRequiresExplanation);

  // Hardened context loader
  const { loadContextQuestions: hardenedLoadContext } = useHardenedContextLoader();

  // Legacy context panel hook for backward compatibility (saving/loading logic)
  const {
    savingStatus,
    updateExplanation,
    updateAnswer,
    loadContextQuestions,
    clearContext,
    cancelAutosave,
  } = useContextPanel({
    sessionId,
    questionId: currentQuestion?.question_id || '',
    selectedAnswer: selectedAnswer as 'Yes' | 'No' | 'Unknown' | '',
    answerOptionText,
    requiresExplanation: dbRequiresExplanation,
  });

  // Connect store cancelAutosave to the hook's cancel function  
  const store = useAssessmentStore();
  const { clearExplanationForNewQuestion } = store;
  if (!store.cancelAutosave && cancelAutosave) {
    store.cancelAutosave = cancelAutosave;
  }

  // Context logic is now handled entirely by useContextPanel hook - no direct store calls needed
  // Store-based lookup for selected option (eliminates race conditions)
  const getSelectedOption = useCallback((questionId: string) => {
    const questionState = store.getQuestionState(sessionId, questionId);
    const selectedAnswer = questionState?.answer;
    
    if (!selectedAnswer) return null;
    
    // Find the option that matches the selected answer
    const option = questions.find(q => 
      q.question_id === questionId && 
      q.answer_option === selectedAnswer
    );
    
    return option ? {
      id: `${questionId}-${selectedAnswer}`,
      answer_option: selectedAnswer,
      requiresExplanation: option.requires_explanation
    } : null;
  }, [questions, sessionId, store]);

  // Function to restore existing answer when navigating to a question
  const restoreExistingAnswer = useCallback(async (questionId: string) => {
    if (!sessionId) {
      console.log(`🔄 No sessionId available - returning empty answer for Q${questionId}`);
      return "";
    }
    
    // First check store (with session validation) - check all possible answers
    const possibleAnswers: ('Yes' | 'No' | 'Unknown')[] = ['Yes', 'No', 'Unknown'];
    for (const answer of possibleAnswers) {
      const questionState = store.getQuestionState(sessionId, questionId, answer);
      if (questionState?.answer === answer) {
        console.log(`🔄 Restored answer from store for Q${questionId}: ${questionState.answer} (Session: ${sessionId})`);
        return questionState.answer;
      }
    }
    
    // If not in store, check database (with strict session validation)
    try {
      const { data: existingAnswer } = await supabase
        .from('atad2_answers')
        .select('answer, session_id')
        .eq('session_id', sessionId)
        .eq('question_id', questionId)
        .maybeSingle();
      
      if (existingAnswer?.answer && existingAnswer.session_id === sessionId) {
        console.log(`🔄 Restored answer from database for Q${questionId}: ${existingAnswer.answer} (Session: ${sessionId})`);
        // Update store with database value
        store.updateAnswer(sessionId, questionId, existingAnswer.answer as 'Yes' | 'No' | 'Unknown');
        return existingAnswer.answer;
      } else if (existingAnswer) {
        console.warn(`🚫 Session mismatch - ignoring answer for Q${questionId} (Expected: ${sessionId}, Got: ${existingAnswer.session_id})`);
      }
    } catch (error) {
      console.error('Error restoring existing answer:', error);
    }
    
    console.log(`🔄 No existing answer found for Q${questionId} in Session: ${sessionId}`);
    return "";
  }, [sessionId, store]);

  useEffect(() => {
    if (!user) {
      navigate("/auth");
    }
  }, [user, navigate]);

  useEffect(() => {
    loadQuestions();
  }, []);

  // Context state is now managed by useContextPanel hook

  const loadQuestions = async () => {
    try {
      const { data, error } = await supabase
        .from('atad2_questions')
        .select('*')
        .order('question_id');
      
      if (error) throw error;
      setQuestions(data || []);
    } catch (error) {
      console.error('Error loading questions:', error);
      toast.error("Error", {
        description: "Failed to load questions",
      });
    }
  };

  const startSession = async () => {
    if (!sessionInfo.taxpayer_name || !sessionInfo.tax_year) {
      toast.error("Missing information", {
        description: "Please fill in all required fields",
      });
      return;
    }

    if (sessionInfo.tax_year_not_equals_calendar && (!sessionInfo.period_start_date || !sessionInfo.period_end_date)) {
      toast.error("Missing information", {
        description: "Please provide start and end dates for the tax period",
      });
      return;
    }

    if (sessionInfo.tax_year_not_equals_calendar && sessionInfo.period_start_date && sessionInfo.period_end_date) {
      if (new Date(sessionInfo.period_end_date) < new Date(sessionInfo.period_start_date)) {
        toast.error("Invalid date range", {
          description: "End date cannot be before start date",
        });
        return;
      }
    }

    setLoading(true);
    try {
      const newSessionId = crypto.randomUUID();
      
      const startDate = sessionInfo.tax_year_not_equals_calendar 
        ? sessionInfo.period_start_date 
        : `${sessionInfo.tax_year}-01-01`;
      
      const endDate = sessionInfo.tax_year_not_equals_calendar 
        ? sessionInfo.period_end_date 
        : `${sessionInfo.tax_year}-12-31`;

      const { error } = await supabase
        .from('atad2_sessions')
        .insert({
          session_id: newSessionId,
          user_id: user?.id || null,
          taxpayer_name: sessionInfo.taxpayer_name,
          fiscal_year: sessionInfo.tax_year,
          is_custom_period: sessionInfo.tax_year_not_equals_calendar,
          period_start_date: startDate,
          period_end_date: endDate,
          status: 'in_progress',
          completed: false
        });

      if (error) throw error;

      // Clear ALL sessions from store before starting a new session
      store.clearAllSessions();
      console.log('🧹 Cleared all sessions from store before starting new session');

      setSessionId(newSessionId);
      setSessionStarted(true);
      
      // Reset UI state for new session
      setSelectedAnswer("");
      setQuestionFlow([]);
      setNavigationIndex(-1);
      
      // Load first question
      const firstQuestion = questions.find(q => q.question_id === "1" && q.answer_option === "Yes");
      if (firstQuestion) {
        setCurrentQuestion(firstQuestion);
        setPendingQuestion(firstQuestion); // Set as pending initially
      }
    } catch (error) {
      console.error('Error starting session:', error);
      toast.error("Error", {
        description: "Failed to start assessment",
      });
    } finally {
      setLoading(false);
    }
  };

  const finishAssessment = async () => {
    if (!sessionId) return;

    setLoading(true);
    try {
      const { error } = await supabase
        .from('atad2_sessions')
        .update({ completed: true, status: 'completed' })
        .eq('session_id', sessionId);

      if (error) throw error;

      toast.success("Assessment complete", {
        description: "Your risk assessment has been completed successfully.",
      });
      navigate("/");
    } catch (error) {
      console.error('Error completing assessment:', error);
      toast.error("Error", {
        description: "Failed to complete assessment",
      });
    } finally {
      setLoading(false);
    }
  };

  const submitAnswer = async () => {
    if (!currentQuestion || !selectedAnswer || !sessionId) return;

    // Get current explanation from store for this specific question
    const currentQuestionState = store.getQuestionState(sessionId, currentQuestion.question_id);
    const currentExplanation = currentQuestionState?.explanation || '';
    
    // Cancel any pending autosave operations before submit
    if (clearContext) {
      // This will handle cleanup of any pending operations
    }

    // Check if context/explanation is required for this answer - use DB value
    const selectedOption = questions.find(q => 
      q.question_id === currentQuestion.question_id && 
      q.answer_option === selectedAnswer
    );
    const requiresExplanation = !!selectedOption?.requires_explanation;
    
    // Validate explanation if required
    if (requiresExplanation && !currentExplanation.trim()) {
      toast.error("Context Required", {
        description: "Please provide context for this answer before submitting.",
      });
      return;
    }

    // Build payload with proper explanation handling
    const payload = {
      session_id: sessionId,
      question_id: currentQuestion.question_id,
      question_text: currentQuestion.question,
      answer: selectedAnswer,
      explanation: requiresExplanation ? currentExplanation : '', // Always string, never null
      risk_points: 0, // Will be updated below
      difficult_term: null,
      term_explanation: null,
      answered_at: new Date().toISOString()
    };

    // Find the selected question option for additional data
    const selectedQuestionOption = questions.find(
      q => q.question_id === currentQuestion.question_id && q.answer_option === selectedAnswer
    );

    if (!selectedQuestionOption) {
      toast.error("Error", {
        description: "Selected answer configuration not found.",
      });
      return;
    }

    // Update payload with question option data
    payload.risk_points = selectedQuestionOption.risk_points;
    payload.difficult_term = selectedQuestionOption.difficult_term;
    payload.term_explanation = selectedQuestionOption.term_explanation;

    // Debug logging for payload inspection
    console.log("🔎 SUBMIT payload", {
      session_id: payload.session_id,
      question_id: payload.question_id,
      answer: payload.answer,
      explanation: payload.explanation,
      requiresExplanation,
      explanation_length: payload.explanation.length
    });

    setLoading(true);
    try {
      // Use upsert to handle both insert and update with composite key
      const { data, error } = await supabase
        .from('atad2_answers')
        .upsert([payload], { 
          onConflict: 'session_id,question_id',
          ignoreDuplicates: false 
        })
        .select()
        .single();

      if (error) {
        console.error("❌ Submit failed", { payload, error });
        throw error;
      }

      console.log("✅ Submit successful", data);

      // Update or add current question and answer to both history and flow
      const questionEntry = { question: currentQuestion, answer: selectedAnswer };
      
      setQuestionHistory(prev => {
        const existingIndex = prev.findIndex(entry => entry.question.question_id === currentQuestion.question_id);
        if (existingIndex !== -1) {
          const updated = [...prev];
          updated[existingIndex] = questionEntry;
          return updated;
        } else {
          return [...prev, questionEntry];
        }
      });
      
      setQuestionFlow(prev => {
        const existingIndex = prev.findIndex(entry => entry.question.question_id === currentQuestion.question_id);
        if (existingIndex !== -1) {
          const updated = [...prev];
          updated[existingIndex] = questionEntry;
          return updated;
        } else {
          return [...prev, questionEntry];
        }
      });
      
      setNavigationIndex(-1);
      setAnswers(prev => ({ ...prev, [currentQuestion.question_id]: selectedAnswer }));

      // Move to next question or finish if this is the end
      const nextQuestionId = selectedQuestionOption.next_question_id;
      
      console.log(`Current question: ${currentQuestion.question_id}, Selected answer: ${selectedAnswer}, Next question ID: ${nextQuestionId}`);
      
      if (nextQuestionId && nextQuestionId !== "end") {
        const nextQuestion = questions.find(q => q.question_id === nextQuestionId && q.answer_option === "Yes");
        if (nextQuestion) {
          setIsTransitioning(true);
          setTimeout(async () => {
            console.log(`🚀 Navigating from Q${currentQuestion.question_id} to Q${nextQuestion.question_id}`);
            setCurrentQuestion(nextQuestion);
            setPendingQuestion(nextQuestion); // Update pending question
            
            // Restore existing answer if any
            const existingAnswer = await restoreExistingAnswer(nextQuestion.question_id);
            setSelectedAnswer(existingAnswer);
            
            setIsTransitioning(false);
          }, 300);
        }
      } else {
        // This is the end of the flow - clear pending and keep selected answer
        setPendingQuestion(null);
        console.log("End of flow reached - staying on current question");
        setSelectedAnswer(selectedAnswer); // Keep the selected answer so finish button shows
      }
    } catch (error: any) {
      console.error('❌ Submit failed with error:', error);
      
      // Show specific backend error instead of generic message
      const errorMessage = error?.message || 
                          error?.details || 
                          error?.hint ||
                          "Failed to submit answer";
      
      toast.error("Submit Failed", {
        description: errorMessage,
      });
    } finally {
      setLoading(false);
    }
  };

  const goToPreviousQuestion = async () => {
    if (questionFlow.length === 0) return;
    
    let targetIndex: number;
    
    if (navigationIndex === -1) {
      targetIndex = questionFlow.length - 1;
    } else if (navigationIndex > 0) {
      targetIndex = navigationIndex - 1;
    } else {
      return;
    }
    
    const targetEntry = questionFlow[targetIndex];
    
    // Clear explanation UI for new question navigation
    if (sessionId && targetEntry.question.question_id) {
      clearExplanationForNewQuestion(sessionId, targetEntry.question.question_id);
    }
    
    setCurrentQuestion(targetEntry.question);
    setSelectedAnswer(targetEntry.answer);
    setNavigationIndex(targetIndex);
    
    // Update answer in store for persistence
    updateAnswer(targetEntry.answer as 'Yes' | 'No' | 'Unknown');
    
    // Context check will happen automatically in handleAnswerSelect when user changes answer
    // No need to load context here - just navigate
  };

  const goToNextQuestion = async () => {
    if (navigationIndex === -1 || navigationIndex >= questionFlow.length - 1) return;
    
    const targetIndex = navigationIndex + 1;
    const targetEntry = questionFlow[targetIndex];
    
    // Clear explanation UI for new question navigation
    if (sessionId && targetEntry.question.question_id) {
      clearExplanationForNewQuestion(sessionId, targetEntry.question.question_id);
    }
    
    setCurrentQuestion(targetEntry.question);
    setSelectedAnswer(targetEntry.answer);
    setNavigationIndex(targetIndex);
    
    // Update answer in store for persistence
    updateAnswer(targetEntry.answer as 'Yes' | 'No' | 'Unknown');
    
    // Context check will happen automatically in handleAnswerSelect when user changes answer
    // No need to load context here - just navigate
  };

  const continueToNextUnanswered = async () => {
    if (questionFlow.length === 0) return;
    
    const lastAnsweredEntry = questionFlow[questionFlow.length - 1];
    const lastAnsweredQuestionOption = questions.find(
      q => q.question_id === lastAnsweredEntry.question.question_id && 
           q.answer_option === lastAnsweredEntry.answer
    );
    
    if (lastAnsweredQuestionOption?.next_question_id && lastAnsweredQuestionOption.next_question_id !== "end") {
      const nextQuestion = questions.find(q => q.question_id === lastAnsweredQuestionOption.next_question_id && q.answer_option === "Yes");
      if (nextQuestion) {
        // Clear explanation UI for new question navigation
        if (sessionId && nextQuestion.question_id) {
          clearExplanationForNewQuestion(sessionId, nextQuestion.question_id);
        }
        
        setCurrentQuestion(nextQuestion);
        setPendingQuestion(nextQuestion); // Update pending question
        
        // Restore existing answer if any
        const existingAnswer = await restoreExistingAnswer(nextQuestion.question_id);
        setSelectedAnswer(existingAnswer);
        
        setNavigationIndex(-1);
      }
    } else {
      toast.success("Assessment complete", {
        description: "Your risk assessment has been completed successfully.",
      });
      navigate("/");
    }
  };

  const goToSpecificQuestion = async (questionIndex: number) => {
    if (questionIndex >= questionFlow.length) return;
    
    const targetEntry = questionFlow[questionIndex];
    setCurrentQuestion(targetEntry.question);
    setSelectedAnswer(targetEntry.answer);
    setNavigationIndex(questionIndex);
    
    // Update answer in store for persistence
    updateAnswer(targetEntry.answer as 'Yes' | 'No' | 'Unknown');
    
    // Context check will happen automatically in handleAnswerSelect when user changes answer
    // No need to load context here - just navigate
    // DON'T change pendingQuestion when navigating - it should stay the same
  };

  const goToPendingQuestion = async () => {
    if (!pendingQuestion) return;
    
    setCurrentQuestion(pendingQuestion);
    
    // Restore existing answer if any
    const existingAnswer = await restoreExistingAnswer(pendingQuestion.question_id);
    setSelectedAnswer(existingAnswer);
    
    setNavigationIndex(-1); // Set to -1 to indicate we're on the active question
  };

  const handleAnswerSelect = async (answer: string) => {
    if (loading || isTransitioning) return;
    
    if (!currentQuestion || !sessionId) return;
    
    const questionId = currentQuestion.question_id;
    
    // Always update the selected answer first
    setSelectedAnswer(answer);
    
    // Reset reminder state when changing answers
    setExplanationReminderShown(false);
    setReminderMessage("");
    
    // Update answer in store immediately for consistent state
    updateAnswer(answer as 'Yes' | 'No' | 'Unknown');
    
    // Get the selected option to check if explanation is required
    const selectedOption = questions.find(q => 
      q.question_id === questionId && 
      q.answer_option === answer
    );
    const requiresExplanation = !!selectedOption?.requires_explanation;
    
    console.debug('[answer]', { 
      qid: questionId, 
      answerId: `${questionId}-${answer}`, 
      requiresExplanation: selectedOption?.requires_explanation 
    });
    
    // If answer doesn't require explanation, auto-advance immediately
    if (!requiresExplanation) {
      console.log(`🚫 Answer ${answer} for Q${questionId} does not require explanation - auto-advancing`);
      store.setQuestionState(sessionId, questionId, answer, {
        shouldShowContext: false,
        contextPrompt: '',
      });
      
      // Auto-advance to next question if not in navigation mode
      if (navigationIndex === -1) {
        console.log(`⏩ Auto-advancing immediately after ${answer} selection (no context required)`);
        setTimeout(async () => {
          await submitAnswerDirectly(answer);
        }, 100);
      }
      return;
    }
    
    // Then check if new answer requires context
    console.log(`🔍 Checking if answer ${answer} requires context for Q${questionId}`);
    const contextPrompt = await loadContextQuestions(answer);
    
    console.log(`📋 Context loading result:`, {
      contextPrompt: contextPrompt ? 'Found' : 'Not found',
      length: contextPrompt ? contextPrompt.length : 0,
      questionId,
      answer
    });
    
    // Check store state after loading context
    const storeState = store.getQuestionState(sessionId, questionId);
    console.log(`🏪 Store state after context load:`, {
      shouldShowContext: storeState?.shouldShowContext,
      contextPrompt: storeState?.contextPrompt ? 'Has prompt' : 'No prompt',
      answer: storeState?.answer
    });
    
    // Bij terugnavigatie: check context voor HUIDIGE vraag, niet volgende
    if (navigationIndex !== -1) {
      console.log(`🔄 Navigation mode: context check complete for Q${currentQuestion.question_id}`);
      
      // Als er context is, direct stoppen - geen flow change check
      if (contextPrompt) {
        console.log(`🛑 Context found for Q${currentQuestion.question_id}, stopping here - no auto-advance`);
        return;
      }
      
      // Alleen als er GEEN context is, dan flow change check
      const newSelectedOption = questions.find(
        q => q.question_id === currentQuestion.question_id && q.answer_option === answer
      );
      
      const currentAnswerEntry = questionFlow.find(entry => entry.question.question_id === currentQuestion.question_id);
      const oldSelectedOption = questions.find(
        q => q.question_id === currentQuestion.question_id && q.answer_option === currentAnswerEntry?.answer
      );
      
      if (newSelectedOption && oldSelectedOption && 
          newSelectedOption.next_question_id !== oldSelectedOption.next_question_id) {
        
        setPendingAnswerChange({
          answer,
          newNextQuestionId: newSelectedOption.next_question_id
        });
        setShowFlowChangeDialog(true);
        return;
      }
      
      // Bij terugnavigatie stoppen we hier - geen auto-advance
      console.log(`🔄 Navigation mode: no context, no flow change - staying on Q${currentQuestion.question_id}`);
      return;
    }
    
    setLoading(true);

    try {
      // Normal flow - context already checked above
      console.log(`➡️ Normal flow: context check already completed for Q${currentQuestion.question_id} with answer ${answer}`);
      
      if (contextPrompt) {
        // Context required - stop here and show context panel
        console.log(`🛑 Context required for Q${currentQuestion.question_id}, stopping for user input`);
        setLoading(false);
        return;
      }

      // Only auto-advance when not navigating and auto-advance is enabled and no explanation required
      if (autoAdvance && !requiresExplanation) {
        console.log(`⏩ Auto-advancing to next question after ${answer} selection`);
        setTimeout(async () => {
          await submitAnswerDirectly(answer);
        }, 300);
      } else if (requiresExplanation) {
        console.debug('[nav] blocked: requires explanation; stay on question for context');
        setLoading(false);
      } else {
        setLoading(false);
      }
    } catch (e) {
      console.error('Error during answer selection:', e);
      setLoading(false);
    }
  };

  const handleContinueWithReminder = async () => {
    // Check if explanation field is empty and we haven't shown reminder yet
    if (shouldShowContextPanel && (!contextValue || contextValue.trim() === '') && !explanationReminderShown) {
      // First time clicking Continue with empty explanation - show friendly reminder
      const randomReminder = friendlyReminders[Math.floor(Math.random() * friendlyReminders.length)];
      setReminderMessage(randomReminder);
      setExplanationReminderShown(true);
      
      // Trigger shake animation
      setShowExplanationShake(true);
      setTimeout(() => setShowExplanationShake(false), 600);
      
      return; // Don't proceed to next question
    }
    
    // Second time clicking or explanation has content - proceed normally
    console.debug('[nav] context panel: allowing continue with answered question');
    await submitAnswerDirectly(selectedAnswer, true);
    
    // Reset reminder state for next question
    setExplanationReminderShown(false);
    setReminderMessage("");
  };

  const submitAnswerDirectly = async (answer: string, bypassAutoAdvanceCheck = false) => {
    if (!currentQuestion || !sessionId) {
      console.log("❌ Cannot submit: missing currentQuestion or sessionId", { currentQuestion: !!currentQuestion, sessionId });
      return;
    }

    console.log("🚀 Starting submitAnswerDirectly", { 
      questionId: currentQuestion.question_id,
      answer,
      sessionId
    });

    setLoading(true);

    try {
      const selectedQuestionOption = questions.find(
        q => q.question_id === currentQuestion.question_id && q.answer_option === answer
      );

      if (!selectedQuestionOption) {
        console.log("❌ Answer option not found", { 
          questionId: currentQuestion.question_id, 
          answer,
          availableOptions: questions.filter(q => q.question_id === currentQuestion.question_id).map(q => q.answer_option)
        });
        throw new Error("Selected answer not found");
      }

      console.log(`✅ Found question option:`, {
        questionId: currentQuestion.question_id,
        answer,
        nextQuestionId: selectedQuestionOption.next_question_id,
        requiresExplanation: selectedQuestionOption.requires_explanation
      });

      // Add required logging for answer selection
      console.debug('[answer:selected]', {
        qid: currentQuestion.question_id,
        answerOption: selectedQuestionOption.answer_option,
        requiresExplanation: !!selectedQuestionOption.requires_explanation
      });

      // Get explanation from store with strict answer binding
      const qaKey = `${sessionId}:${currentQuestion.question_id}:${answer}`;
      const storeExplanation = store.getQuestionState(sessionId, currentQuestion.question_id, answer)?.explanation || '';
      
      console.debug('[explanation:retrieval]', {
        questionId: currentQuestion.question_id,
        answer: answer,
        qaKey: qaKey,
        storeExplanation: storeExplanation,
        storeExplanationLength: storeExplanation.length,
        requiresExplanation: selectedQuestionOption.requires_explanation
      });

      // For questions that require explanation but store is empty, check database
      let finalExplanation = storeExplanation;
      if (!storeExplanation && selectedQuestionOption.requires_explanation) {
        console.debug('[explanation:fallback] Store empty for required explanation, checking database...');
        const { data: dbAnswer } = await supabase
          .from('atad2_answers')
          .select('explanation')
          .eq('session_id', sessionId)
          .eq('question_id', currentQuestion.question_id)
          .maybeSingle();
        
        if (dbAnswer?.explanation) {
          finalExplanation = dbAnswer.explanation;
          console.debug('[explanation:fallback] Found in database:', finalExplanation.substring(0, 100));
        } else {
          console.debug('[explanation:fallback] No explanation in database either');
        }
      }

      // Save answer to database
      const { data: existingAnswer } = await supabase
        .from('atad2_answers')
        .select('id')
        .eq('session_id', sessionId)
        .eq('question_id', currentQuestion.question_id)
        .single();

      if (existingAnswer) {
        const { error } = await supabase
          .from('atad2_answers')
          .update({
            question_text: currentQuestion.question,
            answer: answer,
            explanation: finalExplanation,
            risk_points: selectedQuestionOption.risk_points,
            difficult_term: selectedQuestionOption.difficult_term,
            term_explanation: selectedQuestionOption.term_explanation,
            answered_at: new Date().toISOString()
          })
          .eq('id', existingAnswer.id);

        if (error) throw error;
        console.log("✅ Updated existing answer in database with explanation:", finalExplanation.substring(0, 50));
      } else {
        const { error } = await supabase
          .from('atad2_answers')
          .insert({
            session_id: sessionId,
            question_id: currentQuestion.question_id,
            question_text: currentQuestion.question,
            answer: answer,
            explanation: finalExplanation,
            risk_points: selectedQuestionOption.risk_points,
            difficult_term: selectedQuestionOption.difficult_term,
            term_explanation: selectedQuestionOption.term_explanation
          });

        if (error) throw error;
        console.log("✅ Inserted new answer in database with explanation:", finalExplanation.substring(0, 50));
      }

      // Update store with answer
      store.updateAnswer(sessionId, currentQuestion.question_id, answer as 'Yes' | 'No' | 'Unknown');
      
      // Update question flow
      const questionEntry = { question: currentQuestion, answer };
      
      setQuestionHistory(prev => {
        const existingIndex = prev.findIndex(entry => entry.question.question_id === currentQuestion.question_id);
        if (existingIndex !== -1) {
          const updated = [...prev];
          updated[existingIndex] = questionEntry;
          return updated;
        } else {
          return [...prev, questionEntry];
        }
      });
      
      setQuestionFlow(prev => {
        const existingIndex = prev.findIndex(entry => entry.question.question_id === currentQuestion.question_id);
        if (existingIndex !== -1) {
          const updated = [...prev];
          updated[existingIndex] = questionEntry;
          return updated;
        } else {
          return [...prev, questionEntry];
        }
      });
      
      setNavigationIndex(-1);
      setAnswers(prev => ({ ...prev, [currentQuestion.question_id]: answer }));

      const nextQuestionId = selectedQuestionOption.next_question_id;
      
      console.log(`🔍 Next question logic:`, {
        nextQuestionId,
        isEnd: nextQuestionId === "end",
        hasNext: !!nextQuestionId && nextQuestionId !== "end"
      });
      
      if (nextQuestionId && nextQuestionId !== "end") {
        const nextQuestion = questions.find(q => q.question_id === nextQuestionId && q.answer_option === "Yes");
        console.log(`🔍 Looking for next question:`, {
          nextQuestionId,
          found: !!nextQuestion,
          nextQuestionTitle: nextQuestion?.question
        });
        
        if (nextQuestion) {
          // Check if auto-advance is allowed for the current question (unless bypassed)
          if (!bypassAutoAdvanceCheck) {
            const currentQuestionOption = questions.find(q => 
              q.question_id === currentQuestion?.question_id && 
              q.answer_option === answer
            );
            
            if (!canAutoAdvance(currentQuestionOption)) {
              console.debug('[nav] blocked: requires explanation; stay on question for context');
              setLoading(false);
              return;
            }
          }
          
          console.log("➡️ Moving to next question:", nextQuestion.question_id);
          
          // Clear explanation UI for new question navigation
          if (sessionId && nextQuestion.question_id) {
            clearExplanationForNewQuestion(sessionId, nextQuestion.question_id);
          }
          
          setIsTransitioning(true);
          setTimeout(async () => {
            setCurrentQuestion(nextQuestion);
            setPendingQuestion(nextQuestion);
            
            // Restore existing answer if any
            const existingAnswer = await restoreExistingAnswer(nextQuestion.question_id);
            setSelectedAnswer(existingAnswer);
            
            setIsTransitioning(false);
          }, 300);
        } else {
          console.log("❌ Next question not found in database");
        }
      } else {
        console.log("🏁 End of assessment reached");
        setPendingQuestion(null);
        setSelectedAnswer(answer);
      }
    } catch (error) {
      console.error('❌ Error submitting answer:', error);
      toast.error("Error", {
        description: "Failed to submit answer",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleFlowChangeConfirm = async () => {
    if (!pendingAnswerChange || !currentQuestion) return;
    
    setShowFlowChangeDialog(false);
    setLoading(true);

    try {
      const currentQuestionIndex = questionFlow.findIndex(entry => entry.question.question_id === currentQuestion.question_id);
      const subsequentQuestions = questionFlow.slice(currentQuestionIndex + 1);
      
      for (const entry of subsequentQuestions) {
        await supabase
          .from('atad2_answers')
          .delete()
          .eq('session_id', sessionId)
          .eq('question_id', entry.question.question_id);
      }

      setQuestionFlow(prev => {
        const currentIndex = prev.findIndex(entry => entry.question.question_id === currentQuestion.question_id);
        return prev.slice(0, currentIndex + 1);
      });

      setAnswers(prev => {
        const newAnswers = { ...prev };
        subsequentQuestions.forEach(entry => {
          delete newAnswers[entry.question.question_id];
        });
        return newAnswers;
      });

      setSelectedAnswer(pendingAnswerChange.answer);
      
      setTimeout(async () => {
        // Check if auto-advance is allowed before submitting
        const currentQuestionOption = questions.find(q => 
          q.question_id === currentQuestion?.question_id && 
          q.answer_option === pendingAnswerChange.answer
        );
        
        if (canAutoAdvance(currentQuestionOption)) {
          await submitAnswerDirectly(pendingAnswerChange.answer);
        } else {
          console.debug('[nav] blocked: requires explanation; stay on question for context');
          setLoading(false);
        }
        setPendingAnswerChange(null);
      }, 300);

    } catch (error) {
      console.error('Error handling flow change:', error);
      toast.error("Error", {
        description: "Failed to update assessment flow",
      });
      setLoading(false);
      setPendingAnswerChange(null);
    }
  };

  const handleFlowChangeCancel = () => {
    setShowFlowChangeDialog(false);
    setPendingAnswerChange(null);
  };

  // Check if we're at the end of the flow
  const isAtEndOfFlow = () => {
    console.log("=== isAtEndOfFlow CHECK ===");
    console.log("currentQuestion:", currentQuestion?.question_id);
    console.log("selectedAnswer:", selectedAnswer);
    
    if (!currentQuestion || !selectedAnswer) {
      console.log("isAtEndOfFlow: FALSE - missing data");
      return false;
    }
    
    // Find the selected question option
    const selectedQuestionOption = questions.find(
      q => q.question_id === currentQuestion.question_id && q.answer_option === selectedAnswer
    );
    
    console.log("selectedQuestionOption:", selectedQuestionOption);
    console.log("next_question_id:", selectedQuestionOption?.next_question_id);
    
    // Return true if there's no next question ID (null, undefined, or "end")
    const isAtEnd = selectedQuestionOption && (!selectedQuestionOption.next_question_id || selectedQuestionOption.next_question_id === "end");
    console.log("isAtEndOfFlow RESULT:", isAtEnd);
    console.log("=== END isAtEndOfFlow CHECK ===");
    return isAtEnd;
  };

  // Check if we should show the finish button - only when actually at the final question in flow
  const shouldShowFinishButton = useMemo(() => {
    console.log("=== shouldShowFinishButton CHECK ===");
    console.log("navigationIndex:", navigationIndex);
    console.log("selectedAnswer:", selectedAnswer);
    console.log("questionFlow.length:", questionFlow.length);
    
    // Only show finish button when:
    // 1. We're navigating (navigationIndex !== -1) AND at the last question in flow
    // 2. OR we're at a new question (navigationIndex === -1) AND the current answer leads to end AND we have answered questions
    const isAtLastQuestionInFlow = navigationIndex !== -1 && navigationIndex === questionFlow.length - 1;
    const isNewQuestionThatEndsFlow = navigationIndex === -1 && questionFlow.length > 0 && selectedAnswer && isAtEndOfFlow();
    
    const shouldShow = selectedAnswer && (isAtLastQuestionInFlow || isNewQuestionThatEndsFlow);
    console.log("isAtLastQuestionInFlow:", isAtLastQuestionInFlow);
    console.log("isNewQuestionThatEndsFlow:", isNewQuestionThatEndsFlow);
    console.log("shouldShowFinishButton RESULT:", shouldShow);
    console.log("=== END shouldShowFinishButton CHECK ===");
    return shouldShow;
  }, [navigationIndex, selectedAnswer, currentQuestion, questions, questionFlow.length]);

  // User auth is handled by useEffect redirect on lines 263-267

  if (!sessionStarted) {
    return (
      <div className="min-h-screen bg-background p-4">
        <div className="max-w-2xl mx-auto">
          <div className="mb-8">
            <Button variant="outline" onClick={() => navigate("/")}>
              ← Back to dashboard
            </Button>
          </div>
          
          <Card>
            <CardHeader>
              <CardTitle>Start risk assessment</CardTitle>
              <CardDescription>
                Please provide some basic information to begin your ATAD2 risk assessment
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-center">
                  <Label htmlFor="taxpayer_name">Taxpayer name</Label>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="text-red-500 text-sm ml-1 cursor-default">*</span>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>This field is required</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <Input
                  id="taxpayer_name"
                  value={sessionInfo.taxpayer_name}
                  onChange={(e) => setSessionInfo({...sessionInfo, taxpayer_name: e.target.value})}
                  placeholder="Enter taxpayer name"
                  required
                />
              </div>
              
              <div className="space-y-2">
                <div className="flex items-center">
                  <Label htmlFor="tax_year">Tax year</Label>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="text-red-500 text-sm ml-1 cursor-default">*</span>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>This field is required</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <Select 
                  value={sessionInfo.tax_year} 
                  onValueChange={(value) => setSessionInfo({...sessionInfo, tax_year: value})}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select tax year" />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 6 }, (_, i) => {
                      const year = 2025 - i;
                      return (
                        <SelectItem key={year} value={year.toString()}>
                          {year}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>

              <div className="border border-border rounded-lg p-4 space-y-4">
                <TooltipProvider>
                  <div className="flex items-center space-x-2">
                    <Checkbox 
                      id="tax-year-different"
                      checked={sessionInfo.tax_year_not_equals_calendar}
                      onCheckedChange={(checked) => setSessionInfo({
                        ...sessionInfo, 
                        tax_year_not_equals_calendar: !!checked,
                        period_start_date: checked ? sessionInfo.period_start_date : undefined,
                        period_end_date: checked ? sessionInfo.period_end_date : undefined
                      })}
                    />
                    <Label htmlFor="tax-year-different" className="cursor-pointer">
                      The tax year does not equal the calendar year
                    </Label>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <InfoIcon className="h-4 w-4 text-muted-foreground cursor-default ml-1" />
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="max-w-xs">
                          Only fill in a start and end date if the tax year deviates from the calendar year.
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                </TooltipProvider>

                {sessionInfo.tax_year_not_equals_calendar && (
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <div className="flex items-center">
                        <Label htmlFor="period_start">Start date</Label>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="text-red-500 text-sm ml-1 cursor-default">*</span>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>This field is required</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                      <Input
                        id="period_start"
                        type="date"
                        value={sessionInfo.period_start_date || ""}
                        onChange={(e) => setSessionInfo({...sessionInfo, period_start_date: e.target.value})}
                        required
                      />
                    </div>
                    
                    <div className="space-y-2">
                      <div className="flex items-center">
                        <Label htmlFor="period_end">End date</Label>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="text-red-500 text-sm ml-1 cursor-default">*</span>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>This field is required</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                      <Input
                        id="period_end"
                        type="date"
                        value={sessionInfo.period_end_date || ""}
                        onChange={(e) => setSessionInfo({...sessionInfo, period_end_date: e.target.value})}
                        required
                      />
                    </div>
                  </div>
                )}
              </div>
              
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button disabled={loading} className="w-full">
                    {loading ? "Starting assessment..." : "Start assessment"}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Before you start</AlertDialogTitle>
                    <AlertDialogDescription>
                      You are about to use a tool powered by AI. Please be considerate about the information you provide. While the tool works best with as much context as possible, make sure not to share any commercially sensitive or confidential client information.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={startSession}>
                      I understand
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (!currentQuestion) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p>Loading question...</p>
      </div>
    );
  }

  // Get unique answer options for current question and sort them (Yes first, No second, Unknown third)
  const currentQuestionOptions = questions
    .filter(q => q.question_id === currentQuestion.question_id)
    .sort((a, b) => {
      const aLower = a.answer_option.toLowerCase();
      const bLower = b.answer_option.toLowerCase();
      
      if (aLower === 'yes') return -1;
      if (bLower === 'yes') return 1;
      if (aLower === 'no') return -1;
      if (bLower === 'no') return 1;
      if (aLower === 'unknown') return -1;
      if (bLower === 'unknown') return 1;
      return 0;
    });

  const questionWithTerms = currentQuestionOptions.find(q => q.difficult_term && q.term_explanation) || currentQuestion;
  
  const exampleOption = currentQuestionOptions.find(q => 
    q.difficult_term && q.difficult_term.toLowerCase().startsWith('example')
  );
  const exampleText = exampleOption ? exampleOption.term_explanation : null;
  
  const isViewingAnsweredQuestion = navigationIndex !== -1;

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <Button variant="outline" onClick={() => navigate("/")}>
            ← Back to dashboard
          </Button>
        </div>
        
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <div className="lg:col-span-1">
            <AssessmentSidebar 
              answers={answers}
              questionHistory={questionFlow.map(entry => ({
                question: {
                  question_id: entry.question.question_id,
                  question_title: entry.question.question_title,
                  risk_points: entry.question.risk_points
                },
                answer: entry.answer
              }))}
              currentQuestion={currentQuestion ? {
                question_id: currentQuestion.question_id,
                question_title: currentQuestion.question_title,
                risk_points: currentQuestion.risk_points
              } : null}
              pendingQuestion={pendingQuestion ? {
                question_id: pendingQuestion.question_id,
                question_title: pendingQuestion.question_title,
                risk_points: pendingQuestion.risk_points
              } : null}
              onQuestionClick={goToSpecificQuestion}
              onPendingQuestionClick={goToPendingQuestion}
            />
          </div>
          
          <div className="lg:col-span-3">
            <Card className="border-0 shadow-lg">
              <CardContent className="p-6">
                <div className="max-w-[640px] mx-auto">
                  <div className="text-sm text-muted-foreground uppercase tracking-wide mb-1">
                    Question {currentQuestion.question_id}
                  </div>
                  {currentQuestion.question_title && (
                    <h2 className="text-lg md:text-xl font-semibold text-gray-800 mb-4">
                      {currentQuestion.question_title}
                    </h2>
                  )}
                  <div className="mb-6">
                    <p className="text-lg leading-relaxed text-left">
                      <QuestionText 
                        question={currentQuestion.question}
                        difficultTerm={questionWithTerms.difficult_term}
                        termExplanation={questionWithTerms.term_explanation}
                        exampleText={exampleText}
                      />
                    </p>
                  </div>
                  
                   {/* Answer options */}
                   <div className="space-y-3 mb-8">
                     {currentQuestionOptions.map((option, index) => {
                       const isSelected = selectedAnswer === option.answer_option;
                       const answerType = option.answer_option.toLowerCase();
                       
                       // Get styling based on answer type
                       const getAnswerStyle = () => {
                         switch (answerType) {
                           case 'yes':
                             return { 
                               emoji: '✅', 
                               selectedBg: 'border-green-500 bg-green-50 shadow-md ring-2 ring-green-500/20',
                               hoverBg: 'hover:border-green-400 hover:bg-green-50/50'
                             };
                           case 'no':
                             return { 
                               emoji: '❌', 
                               selectedBg: 'border-red-500 bg-red-50 shadow-md ring-2 ring-red-500/20',
                               hoverBg: 'hover:border-red-400 hover:bg-red-50/50'
                             };
                            case 'unknown':
                              return { 
                                emoji: 'icon', 
                                selectedBg: 'border-blue-600 bg-blue-50 shadow-md ring-2 ring-blue-600/20',
                                hoverBg: 'hover:border-blue-500 hover:bg-blue-50/50'
                              };
                            default:
                              return { 
                                emoji: 'icon', 
                                selectedBg: 'border-blue-600 bg-blue-50 shadow-md ring-2 ring-blue-600/20',
                                hoverBg: 'hover:border-blue-500 hover:bg-blue-50/50'
                              };
                         }
                       };
                       
                       const { emoji, selectedBg, hoverBg } = getAnswerStyle();
                       
                       return (
                         <button
                           key={index}
                           type="button"
                           onClick={() => handleAnswerSelect(option.answer_option)}
                           disabled={loading || isTransitioning}
                           className={`
                             w-full p-4 rounded-lg border-2 transition-all duration-200 text-left
                             ${isSelected 
                               ? selectedBg
                               : `border-border ${hoverBg}`
                             }
                             ${loading || isTransitioning ? 'opacity-50 cursor-not-allowed' : ''}
                             focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary
                           `}
                         >
                            <div className="flex items-center gap-3">
                              {answerType === 'unknown' ? (
                                <HelpCircle className="w-5 h-5 text-blue-600" />
                              ) : (
                                <span className="text-xl">{emoji}</span>
                              )}
                               <span className={`text-base font-medium ${
                                 answerType === 'unknown' ? 'text-gray-700' : ''
                               }`}>
                                 {option.answer_option}
                               </span>
                               {/* Show "Previously answered" only for original submitted answers, not modified ones */}
                               {isSelected && isViewingAnsweredQuestion && (() => {
                                 const originalAnswer = questionFlow.find(entry => 
                                   entry.question.question_id === currentQuestion?.question_id
                                 )?.answer;
                                 const isOriginalAnswer = selectedAnswer === originalAnswer;
                                 return isOriginalAnswer && (
                                   <span className="ml-auto text-sm text-muted-foreground font-medium">
                                     Previously answered
                                   </span>
                                 );
                               })()}
                             </div>
                           </button>
                         );
                       })}
                    </div>

                      {/* Context section - NEW hardened state machine */}
                      {/* RENDER GUARD: only show context panel when answer selected and requires explanation */}
                      {sessionStarted && currentQuestion && qId && selectedAnswer && selectedQuestionOption?.requires_explanation && (
                        <div 
                          key={paneKey}
                          className="bg-gray-50 rounded-lg px-4 py-3 mb-8"
                        >
                          {contextStatus === 'loading' && <ContextSkeleton />}
                          
                          {contextStatus === 'ready' && (
                            <>
                              <div className="flex items-center mb-3">
                                <div className="flex items-center text-sm text-gray-700">
                                  <span className="text-lg mr-2">💡</span>
                                  <span>Explanation</span>
                                </div>
                              </div>
                              
                              <Textarea
                                key={`explanation-${sessionId}-${qId}-${selectedAnswerId}`}
                                value={contextValue}
                                onChange={(e) => {
                                  updateExplanation(e.target.value);
                                  // Clear reminder when user starts typing
                                  if (reminderMessage) {
                                    setReminderMessage("");
                                    setExplanationReminderShown(false);
                                  }
                                }}
                                placeholder={
                                  contextPrompts.length > 0 
                                    ? (contextPrompts.length === 1 
                                        ? contextPrompts[0] 
                                        : contextPrompts[seededIndex(`${sessionId}::${currentQuestion?.id}`, contextPrompts.length)]
                                      )
                                    : "Provide context for your answer..."
                                }
                                className={`min-h-[120px] resize-none border-gray-200 bg-white mt-3 ${showExplanationShake ? 'explanation-shake' : ''}`}
                              />
                              {/* Friendly reminder message */}
                              {reminderMessage && (
                                <div className="mt-2 text-sm text-primary/80 italic animate-fade-in">
                                  {reminderMessage}
                                </div>
                              )}
                            </>
                          )}

                          {contextStatus === 'none' && (
                            <ContextEmptyState text="No context questions available for this answer." />
                          )}

                          {contextStatus === 'error' && (
                            <ContextErrorState 
                              text="Couldn't load context questions. Please try again."
                              onRetry={() => hardenedLoadContext(sessionId, qId, selectedAnswer)}
                            />
                          )}
                        </div>
                      )}

                      {/* Fallback Context Panel - Feature flagged */}
                      <ContextPanelFallback
                        sessionId={sessionId}
                        questionId={currentQuestion?.question_id || ''}
                        selectedAnswer={selectedAnswer}
                        requiresExplanation={dbRequiresExplanation}
                      />

                  {/* Navigation buttons */}
                  <div className="flex items-center gap-3">
                    <Button 
                      onClick={goToPreviousQuestion}
                      disabled={questionFlow.length === 0 || (navigationIndex !== -1 && navigationIndex === 0) || loading || isTransitioning}
                      variant="outline"
                      className="px-6 py-3 rounded-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      ← Previous
                    </Button>
                    
                    {/* Show Next button only when auto-advance is disabled and navigating */}
                    {!autoAdvance && navigationIndex !== -1 && navigationIndex < questionFlow.length - 1 && (
                      <Button 
                        onClick={goToNextQuestion}
                        disabled={loading || isTransitioning}
                        variant="outline"
                        className="px-6 py-3 rounded-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Next →
                      </Button>
                    )}
                    
                    {/* Show Continue button when at last answered question and auto-advance is disabled */}
                    {!autoAdvance && navigationIndex === questionFlow.length - 1 && (
                      <Button 
                        onClick={continueToNextUnanswered}
                        disabled={loading || isTransitioning}
                        variant="outline"
                        className="px-6 py-3 rounded-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Next →
                      </Button>
                    )}

                     {/* Show Finish Assessment button when at end of flow */}
                     {shouldShowFinishButton && (
                       <Button 
                         onClick={finishAssessment}
                         disabled={loading || isTransitioning}
                         className="px-6 py-3 rounded-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                       >
                         {loading ? "Finishing..." : "Finish assessment"}
                       </Button>
                     )}

                        {/* Show Submit/Continue button when context panel is visible and we have an answer, but NOT when it's the last question */}
                        {shouldShowContextPanel && selectedAnswer && !shouldShowFinishButton && (
                           <Button 
                              onClick={handleContinueWithReminder}
                              disabled={loading || isTransitioning}
                              className="px-6 py-3 rounded-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              Continue
                           </Button>
                        )}

                        {/* Show Submit button for answers that don't require context panel and don't auto-advance */}
                        {!shouldShowContextPanel && selectedAnswer && !shouldShowFinishButton && navigationIndex === -1 && (() => {
                          const selectedQuestionOption = questions.find(q => 
                            q.question_id === currentQuestion?.question_id && 
                            q.answer_option === selectedAnswer
                          );
                          
                          // Don't show button if auto-advance would happen (no explanation required)
                          if (canAutoAdvance(selectedQuestionOption)) {
                            return null;
                          }
                          
                          return (
                            <Button 
                              onClick={async () => {
                                console.debug('[nav] manual submit: user clicked button for non-auto-advance answer');
                                await submitAnswerDirectly(selectedAnswer);
                              }}
                              disabled={loading || isTransitioning}
                              className="px-6 py-3 rounded-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              Next →
                            </Button>
                          );
                        })()}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      <AlertDialog open={showFlowChangeDialog} onOpenChange={setShowFlowChangeDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm change of answer</AlertDialogTitle>
            <AlertDialogDescription>
              Changing this answer will affect the questions that follow. Some of your answers will be removed because the flow continues differently from here.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleFlowChangeCancel}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleFlowChangeConfirm}>Confirm and continue</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Assessment;
