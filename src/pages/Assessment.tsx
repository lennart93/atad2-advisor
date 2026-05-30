import { useState, useEffect, useLayoutEffect, useCallback, useMemo, memo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useUserPreference } from "@/hooks/useUserPreference";
import { OptionToggle } from "@/components/prefill/OptionToggle";
import { useAuth } from "@/hooks/useAuth";
import { useContextPanel } from "@/hooks/useContextPanel";
import { usePanelController } from "@/hooks/usePanelController";
import { useHardenedContextLoader } from "@/hooks/useHardenedContextLoader";
import { useAssessmentStore } from "@/stores/assessmentStore";
import { useAssessmentProgress } from "@/stores/assessmentProgressStore";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/sonner";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { InfoIcon, HelpCircle, CalendarIcon } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { format, parse, isValid } from "date-fns";
import { cn } from "@/lib/utils";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AssessmentSidebar } from "@/components/AssessmentSidebar";
import { QuestionExplanationInline } from "@/components/QuestionExplanationInline";
import { Textarea } from "@/components/ui/textarea";
import { ContextSkeleton, ContextEmptyState, ContextErrorState } from "@/components/ContextPanelStates";
import { ContextPanelFallback } from "@/components/ContextPanelFallback";
import { SuggestionCard } from "@/components/prefill/SuggestionCard";
import { useQuestionPrefill, usePrefillJob, useSessionDocuments } from "@/hooks/usePrefill";
import { seededIndex } from "@/utils/random";
import { motion } from "framer-motion";
import { startExtraction } from "@/lib/structure/extraction";
import { AssessmentFooterSlot } from "@/components/assessment/AssessmentFooterSlot";
import { useAssessmentSessionId } from "@/lib/assessment/useAssessmentSessionId";

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
  question_explanation: string | null;
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
                  <TooltipContent className="max-w-sm p-3 bg-popover text-popover-foreground border shadow-md rounded">
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
  const userPref = useUserPreference();

  // Helper function to check if auto-advance is allowed.
  // Blocks auto-advance whenever (a) the answer requires explanation OR
  // (b) the user picked the AI's confidently-suggested answer (>=40%) — in
  // case (b) the user must see the rationale and click Continue manually.
  // When the user picks a non-suggested answer, the rationale doesn't apply
  // and we auto-advance like any other vanilla answer (no flashing button).
  function canAutoAdvance(selectedOption?: { requires_explanation?: boolean }) {
    if (selectedOption?.requires_explanation === true) return false;
    if (
      currentPrefill?.suggested_answer &&
      (currentPrefill.confidence_pct ?? 0) >= 40 &&
      selectedAnswer &&
      selectedAnswer.toLowerCase() === currentPrefill.suggested_answer
    ) {
      return false;
    }
    return true;
  }
  
  const resumeSessionId = useAssessmentSessionId();

  const [sessionInfo, setSessionInfo] = useState<SessionInfo>({
    taxpayer_name: "",
    tax_year: "",
    tax_year_not_equals_calendar: false,
  });
  const [dontShowBeforeYouStartAgain, setDontShowBeforeYouStartAgain] = useState(false);
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
  const [showStartWarningDialog, setShowStartWarningDialog] = useState(false);
  const [confirmations, setConfirmations] = useState({
    advisory: false,
    highLevel: false,
    factDriven: false,
  });
  const [pendingAnswerChange, setPendingAnswerChange] = useState<{answer: string, newNextQuestionId: string | null} | null>(null);
  const [autoAdvance, setAutoAdvance] = useState(true);
  const [pendingQuestion, setPendingQuestion] = useState<Question | null>(null);
  
  // Friendly explanation reminder state
  const [explanationReminderShown, setExplanationReminderShown] = useState(false);
  const [showExplanationShake, setShowExplanationShake] = useState(false);
  // True for ~350ms after Continue is clicked: textarea gets a green "locked"
  // border so the user sees the explanation was accepted before navigating.
  const [committingExplanation, setCommittingExplanation] = useState(false);
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
  // Pre-fetch the per-question prefill here so usePanelController can also
  // gate the textarea visibility on a suggestion existing (not only on the
  // static `requires_explanation` field).
  const { data: currentPrefillForGate } = useQuestionPrefill(sessionId || null, qId || null);
  const { data: sessionDocuments } = useSessionDocuments(sessionId || null);
  const docsCount = sessionDocuments?.length ?? 0;
  const {
    shouldRender: shouldShowContextPanel,
    paneKey,
    value: contextValue,
    selectedAnswerId,
    requiresExplanation,
    contextPrompt,
    contextStatus,
    contextPrompts
  } = usePanelController(sessionId, qId, answerOptionText, dbRequiresExplanation, !!currentPrefillForGate);

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

  // Reuse the prefill we already fetched above for the panel controller.
  const currentPrefill = currentPrefillForGate;
  const { data: prefillJob } = usePrefillJob(sessionId || null);
  // Background pipeline: never block Next on AI progress. Suggestions
  // arrive via Realtime when ready; user can answer at their own pace.
  const isWaitingForPrefill = false;
  void prefillJob; // referenced via job-status banner only

  // Auto-select the AI's suggested answer the first time it lands for a
  // given question — only if the user hasn't already picked something. The
  // ref tracks per-question to avoid re-triggering after a manual change.
  const autoSelectedRef = useRef<Set<string>>(new Set());

  // Reset the per-session memo when the session changes so a remount (or a
  // resume into a different session) starts with a clean slate.
  useEffect(() => {
    autoSelectedRef.current = new Set();
  }, [sessionId]);

  useEffect(() => {
    if (!currentQuestion || !currentPrefill) return;
    // Defensive identity check: react-query list-style fetches (.find on
    // useAllPrefills) can briefly hand back the previous question's prefill
    // during navigation. Don't fire unless the prefill belongs to THIS question.
    if (currentPrefill.question_id !== currentQuestion.question_id) return;
    if (autoSelectedRef.current.has(currentQuestion.question_id)) return;
    if (!currentPrefill.suggested_answer) return;
    if ((currentPrefill.confidence_pct ?? 0) < 40) return;
    if (selectedAnswer) {
      // The user (or a stale carry-over from prior question) already has an
      // answer set. Don't override — but warn if it doesn't match the AI
      // suggestion so we can capture the case in browser logs.
      if (selectedAnswer.toLowerCase() !== currentPrefill.suggested_answer) {
        console.warn('[autoSelect] selectedAnswer mismatch with prefill suggestion', {
          questionId: currentQuestion.question_id,
          selectedAnswer,
          suggestedAnswer: currentPrefill.suggested_answer,
          confidence: currentPrefill.confidence_pct,
        });
      }
      return;
    }
    autoSelectedRef.current.add(currentQuestion.question_id);
    const option = currentPrefill.suggested_answer.charAt(0).toUpperCase() + currentPrefill.suggested_answer.slice(1);
    void handleAnswerSelect(option);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentQuestion?.question_id, currentPrefill?.id, selectedAnswer]);

  // Resume path: /assessment?session=<id> returns here from /assessment/upload,
  // browser back from /assessment/structure/<id>, or any direct deep-link.
  // Load the existing session, replay its stored answers through the question
  // tree to rebuild questionFlow, then drop the user on the next unanswered
  // question (or the final question with its answer pre-selected, so the
  // Finish button is available).
  useEffect(() => {
    if (!resumeSessionId || sessionStarted || questions.length === 0 || !user) return;

    let cancelled = false;
    (async () => {
      try {
        const { data: session, error: sessErr } = await supabase
          .from("atad2_sessions")
          .select("session_id, user_id, taxpayer_name, fiscal_year, is_custom_period, period_start_date, period_end_date")
          .eq("session_id", resumeSessionId)
          .maybeSingle();
        if (sessErr || !session || session.user_id !== user.id) return;
        if (cancelled) return;

        setSessionInfo({
          taxpayer_name: session.taxpayer_name ?? "",
          tax_year: session.fiscal_year ?? "",
          tax_year_not_equals_calendar: session.is_custom_period ?? false,
          period_start_date: session.period_start_date ?? undefined,
          period_end_date: session.period_end_date ?? undefined,
        } as SessionInfo);

        // Load all answers persisted for this session.
        const { data: dbAnswers } = await supabase
          .from("atad2_answers")
          .select("question_id, answer")
          .eq("session_id", session.session_id);
        if (cancelled) return;

        const answerMap: Record<string, string> = {};
        for (const a of dbAnswers ?? []) {
          if (a.question_id && a.answer) answerMap[a.question_id] = a.answer;
        }

        // Replay the tree from Q1, following each answer's next_question_id.
        const rebuiltFlow: { question: Question; answer: string }[] = [];
        let cursorQId: string | null | undefined = "1";
        let nextPending: Question | null = null;
        let lastAnsweredQ: Question | null = null;
        let lastAnswer = "";
        while (cursorQId && cursorQId !== "end") {
          const ans = answerMap[cursorQId];
          if (!ans) {
            nextPending =
              questions.find((q) => q.question_id === cursorQId && q.answer_option === "Yes") ?? null;
            break;
          }
          const qOpt = questions.find(
            (q) => q.question_id === cursorQId && q.answer_option === ans,
          );
          if (!qOpt) break;
          rebuiltFlow.push({ question: qOpt, answer: ans });
          lastAnsweredQ = qOpt;
          lastAnswer = ans;
          cursorQId = qOpt.next_question_id;
        }

        store.clearAllSessions();
        setSessionId(session.session_id);
        setSessionStarted(true);
        setAnswers(answerMap);
        setQuestionFlow(rebuiltFlow);
        setNavigationIndex(-1);

        if (nextPending) {
          setCurrentQuestion(nextPending);
          setPendingQuestion(nextPending);
          setSelectedAnswer("");
        } else if (lastAnsweredQ) {
          // All questions answered through to "end" — land on the last one
          // with its answer restored so the Finish button is visible.
          setCurrentQuestion(lastAnsweredQ);
          setPendingQuestion(null);
          setSelectedAnswer(lastAnswer);
        } else {
          const firstQuestion = questions.find(
            (q) => q.question_id === "1" && q.answer_option === "Yes",
          );
          if (firstQuestion) {
            setCurrentQuestion(firstQuestion);
            setPendingQuestion(firstQuestion);
          }
          setSelectedAnswer("");
        }
      } catch (e) {
        console.error("Resume session failed", e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [resumeSessionId, sessionStarted, questions.length, user, store]);

  // Publish a subtle progress signal to the app header while answering questions.
  // expectedTotal = answered so far + forecast walking the next_question_id chain
  // from the current question, biased by the selected answer where known.
  const setProgress = useAssessmentProgress((s) => s.setProgress);
  const clearProgress = useAssessmentProgress((s) => s.clearProgress);
  useEffect(() => {
    if (!sessionStarted || !currentQuestion || questions.length === 0) {
      clearProgress();
      return;
    }
    const alreadyCounted = new Set(questionFlow.map((e) => e.question.question_id));
    let forwardCount = 0;
    let cursorQId: string | null | undefined = currentQuestion.question_id;
    let cursorAnswer: string | undefined = selectedAnswer || undefined;
    const visited = new Set<string>();
    while (cursorQId && cursorQId !== "end" && !visited.has(cursorQId)) {
      visited.add(cursorQId);
      if (!alreadyCounted.has(cursorQId)) forwardCount++;
      const branches = questions.filter((q) => q.question_id === cursorQId);
      if (branches.length === 0) break;
      const chosen =
        branches.find((b) => b.answer_option === cursorAnswer) ?? branches[0];
      cursorQId = chosen.next_question_id;
      cursorAnswer = undefined;
    }
    const answered = questionFlow.length;
    setProgress({ answered, expectedTotal: answered + forwardCount });
  }, [
    sessionStarted,
    currentQuestion,
    selectedAnswer,
    questionFlow,
    questions,
    setProgress,
    clearProgress,
  ]);
  useEffect(() => () => clearProgress(), [clearProgress]);

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

  const validateAndShowWarning = () => {
    if (!sessionInfo.taxpayer_name || !sessionInfo.tax_year) {
      toast.error("Missing information", {
        description: "Please fill in all required fields",
      });
      return;
    }

    if (sessionInfo.tax_year_not_equals_calendar && (!sessionInfo.period_start_date || !sessionInfo.period_end_date)) {
      toast.error("Missing information", {
        description: "Please fill in start and end dates for non-calendar tax year",
      });
      return;
    }

    // If the user previously opted "Don't show again" → skip modal and start directly.
    if (userPref.dismissed) {
      startSession();
      return;
    }
    setShowStartWarningDialog(true);
  };

  const startSession = async () => {
    // Validation already done in validateAndShowWarning, proceed with session creation
    setShowStartWarningDialog(false);

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

      // Session created — go straight to the inline Documents step.
      navigate(`/assessment/upload?session=${newSessionId}`);
      return;
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
    console.log("🏁 finishAssessment called", {
      sessionId: !!sessionId,
      currentQuestion: !!currentQuestion,
      selectedAnswer,
      shouldShowContextPanel,
      dbRequiresExplanation,
      contextValue,
      contextValueTrimmed: contextValue?.trim(),
      explanationReminderShown
    });

    if (!sessionId || !currentQuestion || !selectedAnswer) {
      console.log("❌ finishAssessment early return: missing required data");
      return;
    }

    // Reminder only fires when the question ACTUALLY requires explanation,
    // not on prefill-only panels (shouldShowContextPanel is also true when a
    // prefill suggestion exists, which was making Finish require two clicks
    // on questions that don't need a toelichting).
    if (dbRequiresExplanation && (!contextValue || contextValue.trim() === '') && !explanationReminderShown) {
      console.log("🔔 finishAssessment: showing reminder");
      // First time clicking Finish with empty explanation - show friendly reminder
      const randomReminder = friendlyReminders[Math.floor(Math.random() * friendlyReminders.length)];
      setReminderMessage(randomReminder);
      setExplanationReminderShown(true);
      
      // Trigger shake animation
      setShowExplanationShake(true);
      setTimeout(() => setShowExplanationShake(false), 600);
      
      
      
      return; // Don't proceed to finish
    }

    console.log("✅ finishAssessment: proceeding to save and finish");

    // Second time clicking or explanation has content - proceed normally
    setLoading(true);
    try {
      // First ensure the current answer is saved (upsert)
      const selectedQuestionOption = questions.find(
        q => q.question_id === currentQuestion.question_id && q.answer_option === selectedAnswer
      );

      if (!selectedQuestionOption) {
        throw new Error("Selected answer not found");
      }

      // Get explanation from store with strict answer binding
      const storeExplanation = store.getQuestionState(sessionId, currentQuestion.question_id, selectedAnswer)?.explanation || '';
      
      // For questions that require explanation but store is empty, check database
      let finalExplanation = storeExplanation;
      if (!storeExplanation && selectedQuestionOption.requires_explanation) {
        const { data: dbAnswer } = await supabase
          .from('atad2_answers')
          .select('explanation')
          .eq('session_id', sessionId)
          .eq('question_id', currentQuestion.question_id)
          .maybeSingle();
        
        if (dbAnswer?.explanation) {
          finalExplanation = dbAnswer.explanation;
        }
      }

      // Always upsert the current answer (insert if no record, update otherwise)
      const { data: existingAnswer } = await supabase
        .from('atad2_answers')
        .select('id')
        .eq('session_id', sessionId)
        .eq('question_id', currentQuestion.question_id)
        .maybeSingle();

      if (existingAnswer) {
        const { error } = await supabase
          .from('atad2_answers')
          .update({
            question_text: currentQuestion.question,
            answer: selectedAnswer,
            explanation: finalExplanation,
            risk_points: selectedQuestionOption.risk_points,
            difficult_term: selectedQuestionOption.difficult_term,
            term_explanation: selectedQuestionOption.term_explanation,
            answered_at: new Date().toISOString()
          })
          .eq('id', existingAnswer.id);

        if (error) throw error;
        console.log("✅ Updated existing answer for finish:", finalExplanation.substring(0, 50));
      } else {
        const { error } = await supabase
          .from('atad2_answers')
          .insert({
            session_id: sessionId,
            question_id: currentQuestion.question_id,
            question_text: currentQuestion.question,
            answer: selectedAnswer,
            explanation: finalExplanation,
            risk_points: selectedQuestionOption.risk_points,
            difficult_term: selectedQuestionOption.difficult_term,
            term_explanation: selectedQuestionOption.term_explanation
          });

        if (error) throw error;
        console.log("✅ Inserted new answer for finish:", finalExplanation.substring(0, 50));
      }

      // Update store with answer
      store.updateAnswer(sessionId, currentQuestion.question_id, selectedAnswer as 'Yes' | 'No' | 'Unknown');
      
      // Update local state
      setAnswers(prev => ({ ...prev, [currentQuestion.question_id]: selectedAnswer }));

      // Calculate preliminary outcome based on total risk points
      const { data: allAnswers } = await supabase
        .from('atad2_answers')
        .select('risk_points')
        .eq('session_id', sessionId);
      
      const totalRiskPoints = (allAnswers || []).reduce((sum, a) => sum + (a.risk_points || 0), 0);
      
      // Determine preliminary outcome using same logic as AssessmentReport
      let preliminaryOutcome: 'risk_identified' | 'insufficient_information' | 'low_risk';
      if (totalRiskPoints >= 1.0) {
        preliminaryOutcome = 'risk_identified';
      } else if (totalRiskPoints >= 0.2) {
        preliminaryOutcome = 'insufficient_information';
      } else {
        preliminaryOutcome = 'low_risk';
      }

      // Now update the session with preliminary outcome (not confirmed yet)
      const { error } = await supabase
        .from('atad2_sessions')
        .update({
          completed: true,
          status: 'completed',
          preliminary_outcome: preliminaryOutcome,
          outcome_confirmed: false,
          final_score: totalRiskPoints,
        })
        .eq('session_id', sessionId);

      if (error) throw error;

      // Reset reminder state
      setExplanationReminderShown(false);
      setReminderMessage("");

      toast.success("Assessment complete", {
        description: "Please confirm your preliminary assessment outcome.",
      });

      // Pre-fetch Phase B of the structure-chart extraction (refine pass over
      // Q&A) so the user doesn't wait on Step 5. Phase A runs at the
      // Documents → Questions transition via maybePrewarmPhaseA. 409 here is
      // expected when Phase A is still in flight — the backend self-chain will
      // fire Phase B on A's completion.
      startExtraction(sessionId, 'refine').catch((err) => {
        if ((err as { status?: number })?.status === 409) return;
        console.warn('[Assessment] Phase B pre-fetch failed; Step 5 will retry', err);
      });

      // Per-question suggestions are reviewed on the assessment report page,
      // where each answer can be edited inline. Skip the standalone review
      // step entirely. Confirmation gates the structure step — the user
      // confirms the preliminary outcome BEFORE drawing the chart.
      navigate(`/assessment-confirmation/${sessionId}`);
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
            // Clear the prior question's answer BEFORE rendering the new question.
            // Without this, the intermediate render (new currentQuestion + stale
            // selectedAnswer) makes shouldShowFinishButton briefly true, flashing
            // the Finish button when arriving on the last question.
            setSelectedAnswer("");
            setCurrentQuestion(nextQuestion);
            setPendingQuestion(nextQuestion); // Update pending question

            // Restore existing answer if any
            const existingAnswer = await restoreExistingAnswer(nextQuestion.question_id);
            if (existingAnswer) setSelectedAnswer(existingAnswer);

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
    
    // Check for flow changes during back-navigation BEFORE updating anything
    if (navigationIndex !== -1) {
      const newSelectedOption = questions.find(
        q => q.question_id === questionId && q.answer_option === answer
      );
      
      const currentAnswerEntry = questionFlow.find(entry => entry.question.question_id === currentQuestion.question_id);
      const oldSelectedOption = questions.find(
        q => q.question_id === currentQuestion.question_id && q.answer_option === currentAnswerEntry?.answer
      );
      
      if (newSelectedOption && oldSelectedOption && 
          newSelectedOption.next_question_id !== oldSelectedOption.next_question_id) {
        
        // Don't update anything yet - show dialog first
        setPendingAnswerChange({
          answer,
          newNextQuestionId: newSelectedOption.next_question_id
        });
        setShowFlowChangeDialog(true);
        return;
      }
    }
    
    // Only update the selected answer if no flow change dialog is needed
    setSelectedAnswer(answer);
    
    // Reset reminder state when changing answers
    setExplanationReminderShown(false);
    setReminderMessage("");
    
    // Update answer in store for consistent state
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
       
       // Bij terugnavigatie stoppen we hier - geen auto-advance (flow change already handled above)
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
    // Reminder fires only when the answer ACTUALLY requires explanation, not on
    // prefill-only panels where no textarea is rendered (iter 4 wired hasPrefill
    // into shouldShowContextPanel for the Continue-button visibility, but the
    // textarea outer gate still keys on requires_explanation).
    if (selectedQuestionOption?.requires_explanation === true
        && (!contextValue || contextValue.trim() === '')
        && !explanationReminderShown) {
      // First time clicking Continue with empty explanation - show friendly reminder
      const randomReminder = friendlyReminders[Math.floor(Math.random() * friendlyReminders.length)];
      setReminderMessage(randomReminder);
      setExplanationReminderShown(true);
      
      // Trigger shake animation
      setShowExplanationShake(true);
      setTimeout(() => setShowExplanationShake(false), 600);
      
      return; // Don't proceed to next question
    }
    
    // Second time clicking or explanation has content - proceed normally.
    // Briefly lock the textarea (green border) so the user sees the
    // explanation was accepted before we navigate.
    console.debug('[nav] context panel: allowing continue with answered question');
    setCommittingExplanation(true);
    await new Promise((r) => setTimeout(r, 350));
    await submitAnswerDirectly(selectedAnswer, true);
    setCommittingExplanation(false);

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
            // Clear the prior answer BEFORE the new question renders, otherwise
            // the intermediate render (new currentQuestion + stale selectedAnswer)
            // briefly flashes the Finish button on the last question.
            setSelectedAnswer("");
            setCurrentQuestion(nextQuestion);
            setPendingQuestion(nextQuestion);

            // Restore existing answer if any
            const existingAnswer = await restoreExistingAnswer(nextQuestion.question_id);
            if (existingAnswer) setSelectedAnswer(existingAnswer);

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

      // Reset navigation index to -1 to indicate we're back on the active question
      setNavigationIndex(-1);

      setAnswers(prev => {
        const newAnswers = { ...prev };
        subsequentQuestions.forEach(entry => {
          delete newAnswers[entry.question.question_id];
        });
        return newAnswers;
      });

      setSelectedAnswer(pendingAnswerChange.answer);
      // Update answer in store now that it's confirmed
      updateAnswer(pendingAnswerChange.answer as 'Yes' | 'No' | 'Unknown');
      
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
    
    // NEVER show finish button during back-navigation (navigationIndex !== -1)
    // Only show when we're at a NEW question (navigationIndex === -1) AND it truly ends the flow
    if (navigationIndex !== -1) {
      console.log("Back-navigation mode: never show finish button");
      console.log("shouldShowFinishButton RESULT: false");
      console.log("=== END shouldShowFinishButton CHECK ===");
      return false;
    }
    
    // Only show finish button when we're at a new question AND it leads to end
    const isNewQuestionThatEndsFlow = questionFlow.length > 0 && selectedAnswer && isAtEndOfFlow();
    
    const shouldShow = isNewQuestionThatEndsFlow;
    console.log("isNewQuestionThatEndsFlow:", isNewQuestionThatEndsFlow);
    console.log("shouldShowFinishButton RESULT:", shouldShow);
    console.log("=== END shouldShowFinishButton CHECK ===");
    return shouldShow;
  }, [navigationIndex, selectedAnswer, currentQuestion, questions, questionFlow.length]);

  // User auth is handled by useEffect redirect on lines 263-267

  // When ?session=<id> is in the URL, the resume effect needs a tick to load
  // the session before sessionStarted flips to true. Suppress the start form
  // during that window so the user doesn't see the taxpayer-name page flash
  // between the upload page and the question flow.
  if (!sessionStarted && resumeSessionId) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading session…</p>
      </div>
    );
  }

  if (!sessionStarted) {
    return (
      <>
        <div className="max-w-2xl mx-auto">
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
                        const year = new Date().getFullYear() - i;
                        return (
                          <SelectItem key={year} value={year.toString()}>
                            {year}
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>

                <OptionToggle
                  id="tax-year-different"
                  label="The tax year does not equal the calendar year"
                  description="Only fill in a start and end date if the tax year deviates from the calendar year."
                  checked={sessionInfo.tax_year_not_equals_calendar}
                  onCheckedChange={(checked) => setSessionInfo({
                    ...sessionInfo,
                    tax_year_not_equals_calendar: checked,
                    period_start_date: checked ? sessionInfo.period_start_date : undefined,
                    period_end_date: checked ? sessionInfo.period_end_date : undefined,
                  })}
                >
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
                        <div className="flex gap-2">
                          <Input
                            id="period_start"
                            placeholder="dd/mm/yyyy"
                            defaultValue={
                              sessionInfo.period_start_date
                                ? format(parse(sessionInfo.period_start_date, "yyyy-MM-dd", new Date()), "dd/MM/yyyy")
                                : ""
                            }
                            key={`period_start-${sessionInfo.period_start_date ?? "empty"}`}
                            onBlur={(e) => {
                              const raw = e.target.value.trim();
                              if (raw === "") {
                                setSessionInfo((s) => ({ ...s, period_start_date: undefined }));
                                return;
                              }
                              const parsed = parse(raw, "dd/MM/yyyy", new Date());
                              if (isValid(parsed)) {
                                setSessionInfo((s) => ({ ...s, period_start_date: format(parsed, "yyyy-MM-dd") }));
                                e.target.value = format(parsed, "dd/MM/yyyy");
                              }
                            }}
                            className="flex-1"
                          />
                          <Popover>
                            <PopoverTrigger asChild>
                              <Button type="button" variant="outline" size="icon" aria-label="Pick a date">
                                <CalendarIcon className="h-4 w-4" />
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="start">
                              <Calendar
                                mode="single"
                                weekStartsOn={1}
                                selected={
                                  sessionInfo.period_start_date
                                    ? (() => {
                                        const d = parse(sessionInfo.period_start_date, "yyyy-MM-dd", new Date());
                                        return isValid(d) ? d : undefined;
                                      })()
                                    : undefined
                                }
                                onSelect={(date) =>
                                  setSessionInfo({
                                    ...sessionInfo,
                                    period_start_date: date ? format(date, "yyyy-MM-dd") : undefined,
                                  })
                                }
                                initialFocus
                              />
                            </PopoverContent>
                          </Popover>
                        </div>
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
                        <div className="flex gap-2">
                          <Input
                            id="period_end"
                            placeholder="dd/mm/yyyy"
                            defaultValue={
                              sessionInfo.period_end_date
                                ? format(parse(sessionInfo.period_end_date, "yyyy-MM-dd", new Date()), "dd/MM/yyyy")
                                : ""
                            }
                            key={`period_end-${sessionInfo.period_end_date ?? "empty"}`}
                            onBlur={(e) => {
                              const raw = e.target.value.trim();
                              if (raw === "") {
                                setSessionInfo((s) => ({ ...s, period_end_date: undefined }));
                                return;
                              }
                              const parsed = parse(raw, "dd/MM/yyyy", new Date());
                              if (isValid(parsed)) {
                                setSessionInfo((s) => ({ ...s, period_end_date: format(parsed, "yyyy-MM-dd") }));
                                e.target.value = format(parsed, "dd/MM/yyyy");
                              }
                            }}
                            className="flex-1"
                          />
                          <Popover>
                            <PopoverTrigger asChild>
                              <Button type="button" variant="outline" size="icon" aria-label="Pick a date">
                                <CalendarIcon className="h-4 w-4" />
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="start">
                              <Calendar
                                mode="single"
                                weekStartsOn={1}
                                selected={
                                  sessionInfo.period_end_date
                                    ? (() => {
                                        const d = parse(sessionInfo.period_end_date, "yyyy-MM-dd", new Date());
                                        return isValid(d) ? d : undefined;
                                      })()
                                    : undefined
                                }
                                onSelect={(date) =>
                                  setSessionInfo({
                                    ...sessionInfo,
                                    period_end_date: date ? format(date, "yyyy-MM-dd") : undefined,
                                  })
                                }
                                initialFocus
                              />
                            </PopoverContent>
                          </Popover>
                        </div>
                      </div>
                    </div>
                </OptionToggle>

                <Button
                  disabled={loading}
                  className="w-full"
                  onClick={validateAndShowWarning}
                >
                  {loading ? "Starting assessment..." : "Start assessment"}
                </Button>
              </CardContent>
            </Card>
        </div>

        {/* Warning dialog that shows AFTER validation */}
        <Dialog open={showStartWarningDialog} onOpenChange={(open) => {
          setShowStartWarningDialog(open);
          if (!open) {
            setConfirmations({ advisory: false, highLevel: false, factDriven: false });
          }
        }}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Before you start</DialogTitle>
              <DialogDescription>
                Please confirm the following before proceeding with the ATAD2 risk assessment.
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-4 py-4">
              <div className="flex items-start space-x-3">
                <Checkbox 
                  id="advisory" 
                  checked={confirmations.advisory}
                  onCheckedChange={(checked) => setConfirmations(prev => ({ ...prev, advisory: checked === true }))}
                />
                <label htmlFor="advisory" className="text-sm leading-relaxed cursor-pointer">
                  <span className="font-medium">Advisory tool & responsibility</span>
                  <br />
                  <span className="text-muted-foreground">I understand that this tool is an analytical aid only and does not replace professional judgement. I remain fully responsible for the accuracy, completeness, and interpretation of the assessment.</span>
                </label>
              </div>
              
              <div className="flex items-start space-x-3">
                <Checkbox 
                  id="highLevel" 
                  checked={confirmations.highLevel}
                  onCheckedChange={(checked) => setConfirmations(prev => ({ ...prev, highLevel: checked === true }))}
                />
                <label htmlFor="highLevel" className="text-sm leading-relaxed cursor-pointer">
                  <span className="font-medium">High-level ATAD2 risk indication</span>
                  <br />
                  <span className="text-muted-foreground">I understand that the assessment provides a high-level indication of potential ATAD2 risk only and does not determine whether a mismatch actually exists or whether a tax adjustment, denial of deduction, or reassessment will occur.</span>
                </label>
              </div>
              
              <div className="flex items-start space-x-3">
                <Checkbox 
                  id="factDriven" 
                  checked={confirmations.factDriven}
                  onCheckedChange={(checked) => setConfirmations(prev => ({ ...prev, factDriven: checked === true }))}
                />
                <label htmlFor="factDriven" className="text-sm leading-relaxed cursor-pointer">
                  <span className="font-medium">Completeness of information</span>
                  <br />
                  <span className="text-muted-foreground">I understand that the quality of the assessment depends entirely on the completeness and accuracy of the information I provide. The more relevant context I include, the more reliable the outcome will be.</span>
                </label>
              </div>
            </div>
            
            <div className="flex items-start space-x-3 pt-1 border-t">
              <Checkbox
                id="dont_show_before_you_start"
                checked={dontShowBeforeYouStartAgain}
                onCheckedChange={(checked) => setDontShowBeforeYouStartAgain(checked === true)}
              />
              <label htmlFor="dont_show_before_you_start" className="text-sm text-muted-foreground cursor-pointer">
                Don't show this again
              </label>
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                variant="outline"
                onClick={() => {
                  setShowStartWarningDialog(false);
                  setConfirmations({ advisory: false, highLevel: false, factDriven: false });
                  setDontShowBeforeYouStartAgain(false);
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={async () => {
                  if (dontShowBeforeYouStartAgain) {
                    await userPref.dismiss().catch((e) => console.error("dismiss failed", e));
                  }
                  setShowStartWarningDialog(false);
                  startSession();
                }}
                disabled={!confirmations.advisory || !confirmations.highLevel || !confirmations.factDriven}
              >
                Start assessment
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </>
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
    <div>
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
                <motion.div
                  key={currentQuestion.question_id}
                  initial={{ opacity: 0, x: 8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.32, ease: [0.2, 0, 0, 1] }}
                  className="max-w-[640px] mx-auto"
                >
                  {currentQuestion.question_title && (
                    <div className="mb-3">
                      <h2 className="text-sm uppercase tracking-[0.14em] font-medium text-muted-foreground">
                        {currentQuestion.question_title}
                      </h2>
                    </div>
                  )}
                  <div className="mb-6">
                    <p className="text-xl sm:text-2xl font-medium tracking-tight leading-snug text-left text-foreground">
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

                       // Cross-question logical constraints. A taxpayer is either
                       // resident (Q1) or non-resident (Q2) — not both. So if Q1
                       // was answered "No", lock out "No" on Q2.
                       const lockedReason: string | null =
                         currentQuestion?.question_id === "2" &&
                         answers["1"] === "No" &&
                         option.answer_option === "No"
                           ? "You already answered No to resident taxpayer, so this can't also be No."
                           : null;
                       const isLockedOut = !!lockedReason;

                       // Get styling based on answer type
                       const getAnswerStyle = () => {
                         switch (answerType) {
                           case 'yes':
                             return {
                               emoji: '✅',
                               selectedBg: 'border-green-500 bg-green-500/10 shadow-md ring-2 ring-green-500/20',
                               hoverBg: 'hover:border-green-400 hover:bg-green-500/5'
                             };
                           case 'no':
                             return {
                               emoji: '❌',
                               selectedBg: 'border-red-500 bg-red-500/10 shadow-md ring-2 ring-red-500/20',
                               hoverBg: 'hover:border-red-400 hover:bg-red-500/5'
                             };
                            case 'unknown':
                              return {
                                emoji: 'icon',
                                selectedBg: 'border-blue-600 bg-blue-500/10 shadow-md ring-2 ring-blue-600/20',
                                hoverBg: 'hover:border-blue-500 hover:bg-blue-500/5'
                              };
                            default:
                              return {
                                emoji: 'icon',
                                selectedBg: 'border-blue-600 bg-blue-500/10 shadow-md ring-2 ring-blue-600/20',
                                hoverBg: 'hover:border-blue-500 hover:bg-blue-500/5'
                              };
                         }
                       };
                       
                       const { emoji, selectedBg, hoverBg } = getAnswerStyle();

                       const isSuggestedAnswer = !!currentPrefill?.suggested_answer
                         && option.answer_option.toLowerCase() === currentPrefill.suggested_answer
                         && (currentPrefill.confidence_pct ?? 0) >= 40;
                       const rationaleTooltip = isSuggestedAnswer
                         ? currentPrefill?.answer_rationale ?? null
                         : null;

                       const answerButton = (
                         <button
                           key={index}
                           type="button"
                           onClick={() => handleAnswerSelect(option.answer_option)}
                           disabled={loading || isTransitioning || isLockedOut}
                           aria-disabled={isLockedOut || undefined}
                           title={lockedReason ?? undefined}
                           className={`
                             w-full p-4 rounded-lg border-2 transition-all duration-normal ease-emphasized text-left
                             ${isLockedOut
                               ? 'border-dashed border-[hsl(var(--border-default))] bg-muted/40 opacity-60 cursor-not-allowed'
                               : isSelected
                               ? selectedBg
                               : `border-border ${hoverBg}`
                             }
                             ${!isLockedOut && (loading || isTransitioning) ? 'opacity-50 cursor-not-allowed' : ''}
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
                                 answerType === 'unknown' ? 'text-foreground' : ''
                               }`}>
                                 {option.answer_option}
                               </span>
                               {isSuggestedAnswer && (
                                 <span className="ml-2 text-[10px] uppercase tracking-wide bg-primary/10 text-primary px-1.5 py-0.5 rounded">
                                   Suggested (<span className="font-mono text-[10px]">{currentPrefill!.confidence_pct}%</span>)
                                 </span>
                               )}
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
                             {lockedReason && (
                               <p className="mt-2 text-xs italic text-muted-foreground">
                                 {lockedReason}
                               </p>
                             )}
                           </button>
                       );

                       if (!rationaleTooltip) return answerButton;

                       return (
                         <TooltipProvider key={index} delayDuration={150}>
                           <Tooltip>
                             <TooltipTrigger asChild>{answerButton}</TooltipTrigger>
                             <TooltipContent side="right" align="start" className="max-w-sm whitespace-normal text-sm leading-relaxed">
                               {rationaleTooltip}
                             </TooltipContent>
                           </Tooltip>
                         </TooltipProvider>
                       );
                       })}
                    </div>

                    {/* Playful no-suggestion note. Fires when the session has docs,
                        analysis is done, this question has no prefill, and the user
                        already picked an answer. */}
                    {docsCount > 0
                      && prefillJob?.status === "completed"
                      && !currentPrefill?.suggested_answer
                      && selectedAnswer && (
                      <div className="text-xs italic text-muted-foreground mt-3 ml-1 mb-3">
                        No suggestion for this one. You're on your own here.
                      </div>
                    )}

                      {/* The AI's per-question prefill (suggestion + contextual hint
                          + committed text) only applies when the user picked the
                          answer the AI suggested. If they pick a different branch,
                          the AI material is for the wrong context — drop it. */}
                      {/* Question explanation - inline expandable. Appends the AI contextual_hint
                          seamlessly after the static admin-edited explanation when present.
                          contextual_hint is produced ONLY when the AI couldn't derive an
                          answer from the docs (per swarm prompt Rule 0 it's mutually
                          exclusive with suggested_toelichting / suggested_answer), so it
                          doesn't depend on which answer the user picks — surface it whenever
                          it exists. */}
                      <QuestionExplanationInline
                        key={currentQuestion.question_id}
                        explanation={currentQuestion.question_explanation}
                        contextualHint={currentPrefill?.contextual_hint ?? null}
                      />

                      {/* Context section - NEW hardened state machine */}
                      {/* RENDER GUARD: panel renders when the answer requires
                          explanation OR an AI prefill exists with text to act
                          on AND that prefill applies to the answer the user just
                          picked (suggested_answer matches selectedAnswer). When
                          the user picks a different branch than the AI suggested,
                          we treat this question as if no prefill exists so the
                          panel disappears and auto-advance on No can fire cleanly. */}
                      {sessionStarted && currentQuestion && qId && selectedAnswer && (() => {
                        const aiAppliesToAnswer =
                          !!currentPrefill?.suggested_answer &&
                          selectedAnswer.toLowerCase() === currentPrefill.suggested_answer;
                        const effectivePrefill = aiAppliesToAnswer ? currentPrefill : null;
                        const shouldRender =
                          selectedQuestionOption?.requires_explanation
                          || !!effectivePrefill?.suggested_toelichting
                          || !!effectivePrefill?.committed_text
                          || effectivePrefill?.user_action === "accepted"
                          || effectivePrefill?.user_action === "edited";
                        if (!shouldRender) return null;
                        // Once the SuggestionCard is committed it disappears,
                        // so the Textarea owns the full explanation — AI text
                        // and user notes live together as one freely editable
                        // string. SuggestionCard only needs userNotes for the
                        // pending Accept path, where contextValue is still
                        // just the user's typing.
                        const textareaValue = contextValue ?? "";
                        return (
                        <div
                          key={paneKey}
                          className="bg-muted/40 rounded-lg px-4 py-3 mb-8 border border-border"
                        >
                          {contextStatus === 'loading' && <ContextSkeleton />}

                          {(contextStatus === 'ready' || contextStatus === 'idle') && (
                            <>
                              <div className="flex items-center mb-3">
                                <div className="flex items-center text-sm text-foreground">
                                  <span className="text-lg mr-2">💡</span>
                                  <span>Explanation</span>
                                </div>
                              </div>

                              {effectivePrefill && currentQuestion && (
                                <SuggestionCard
                                  prefill={effectivePrefill}
                                  userNotes={textareaValue}
                                  onCommit={(next) => updateExplanation(next)}
                                />
                              )}
                              {prefillJob?.status === "failed" && !effectivePrefill && (
                                <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm mb-3">
                                  Couldn't generate suggestions. Continue without them.
                                </div>
                              )}

                              <Textarea
                                key={`explanation-${sessionId}-${qId}-${selectedAnswerId}`}
                                value={textareaValue}
                                disabled={committingExplanation}
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
                                className={`min-h-[120px] resize-none mt-3 transition-all duration-200 ${showExplanationShake ? 'explanation-shake' : ''} ${committingExplanation ? 'border-emerald-500 ring-2 ring-emerald-500/30 bg-emerald-50/50 disabled:opacity-100 disabled:cursor-default' : 'border-border bg-background'}`}
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
                        );
                      })()}

                      {/* Fallback Context Panel - Feature flagged */}
                      <ContextPanelFallback
                        sessionId={sessionId}
                        questionId={currentQuestion?.question_id || ''}
                        selectedAnswer={selectedAnswer}
                        requiresExplanation={dbRequiresExplanation}
                      />

                </motion.div>
              </CardContent>
            </Card>
          </div>
        </div>

      <AssessmentFooterSlot
        left={
          <Button
            onClick={goToPreviousQuestion}
            disabled={questionFlow.length === 0 || (navigationIndex !== -1 && navigationIndex === 0) || loading || isTransitioning}
            variant="outline"
            className="transition-all duration-fast disabled:opacity-50 disabled:cursor-not-allowed"
          >
            ← Previous
          </Button>
        }
        right={
          <>
            {/* Show Next button only when auto-advance is disabled and navigating */}
            {!autoAdvance && navigationIndex !== -1 && navigationIndex < questionFlow.length - 1 && (
              <Button
                onClick={goToNextQuestion}
                disabled={loading || isTransitioning || isWaitingForPrefill}
                variant="outline"
                className="transition-all duration-fast disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next →
              </Button>
            )}

            {/* Show Continue button when at last answered question and auto-advance is disabled */}
            {!autoAdvance && navigationIndex === questionFlow.length - 1 && (
              <Button
                onClick={continueToNextUnanswered}
                disabled={loading || isTransitioning || isWaitingForPrefill}
                variant="outline"
                className="transition-all duration-fast disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next →
              </Button>
            )}

            {/* Show Finish Assessment button when at end of flow */}
            {shouldShowFinishButton && (
              <Button
                onClick={finishAssessment}
                disabled={loading || isTransitioning}
                className="transition-all duration-fast disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? "Finishing..." : "Finish assessment"}
              </Button>
            )}

            {/* Show Submit/Continue button when (a) the context panel is visible
                AND it actually has content for the chosen answer (requires_explanation
                forces the textarea, or the AI suggestion applies to this answer)
                OR (b) the AI made a >=40% suggestion that pre-selected this
                answer and the question doesn't require explanation (the rationale
                strip is rendered above and the user must click Continue).
                The aiAppliesToAnswer gate prevents a Continue-button flash when
                the user picks a non-suggested answer that auto-advances. */}
            {(() => {
              const aiAppliesToAnswer =
                !!currentPrefill?.suggested_answer &&
                !!selectedAnswer &&
                selectedAnswer.toLowerCase() === currentPrefill.suggested_answer;
              const showContinue =
                !!selectedAnswer
                && !shouldShowFinishButton
                && (
                  (shouldShowContextPanel
                    && (aiAppliesToAnswer || !!selectedQuestionOption?.requires_explanation))
                  || (
                    !!currentPrefill?.suggested_answer
                    && (currentPrefill.confidence_pct ?? 0) >= 40
                    && aiAppliesToAnswer
                    && !selectedQuestionOption?.requires_explanation
                  )
                );
              if (!showContinue) return null;
              return (
                <Button
                  onClick={handleContinueWithReminder}
                  disabled={loading || isTransitioning}
                  className="transition-all duration-fast disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Continue
                </Button>
              );
            })()}

            {/* Show Submit button for answers that don't require context panel */}
            {!shouldShowContextPanel && selectedAnswer && !shouldShowFinishButton && (() => {
              const selectedQuestionOption = questions.find(q =>
                q.question_id === currentQuestion?.question_id &&
                q.answer_option === selectedAnswer
              );

              // If we're in normal flow (navigationIndex === -1) and auto-advance would happen, don't show button
              if (navigationIndex === -1 && canAutoAdvance(selectedQuestionOption)) {
                return null;
              }

              // For back-navigation or non-auto-advance answers, always show the button
              return (
                <Button
                  onClick={async () => {
                    console.debug('[nav] manual submit: user clicked button for answer submission');

                    // Check for flow changes when updating answers during back-navigation
                    if (navigationIndex >= 0) {
                      const existingAnswer = answers[currentQuestion.question_id];

                      if (existingAnswer && existingAnswer !== selectedAnswer) {
                        // Check if this change affects the flow
                        const oldSelectedOption = questions.find(q =>
                          q.question_id === currentQuestion.question_id &&
                          q.answer_option === existingAnswer
                        );
                        const newSelectedOption = questions.find(q =>
                          q.question_id === currentQuestion.question_id &&
                          q.answer_option === selectedAnswer
                        );

                        if (newSelectedOption && oldSelectedOption &&
                            newSelectedOption.next_question_id !== oldSelectedOption.next_question_id) {

                          setPendingAnswerChange({
                            answer: selectedAnswer,
                            newNextQuestionId: newSelectedOption.next_question_id
                          });
                          setShowFlowChangeDialog(true);
                          return;
                        }
                      }
                    }

                    await submitAnswerDirectly(selectedAnswer);
                  }}
                  disabled={loading || isTransitioning}
                  className="transition-all duration-fast disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {navigationIndex === -1 ? 'Next →' : 'Update answer'}
                </Button>
              );
            })()}
          </>
        }
      />

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
