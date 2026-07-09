import { useState, useEffect, useLayoutEffect, useCallback, useMemo, useRef, memo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useUserPreference } from "@/hooks/useUserPreference";
import { OptionToggle } from "@/components/prefill/OptionToggle";
import { useAuth } from "@/hooks/useAuth";
import { useContextPanel } from "@/hooks/useContextPanel";
import { usePanelController } from "@/hooks/usePanelController";
import { useHardenedContextLoader } from "@/hooks/useHardenedContextLoader";
import { useAssessmentStore } from "@/stores/assessmentStore";
import { useAssessmentProgress } from "@/stores/assessmentProgressStore";
import { aiHasExplanationForAnswer as computeAiHasExplanationForAnswer } from "@/lib/assessment/autoAdvanceGate";
import { supabase } from "@/integrations/supabase/client";
import {
  Button,
  FormField,
  OptionCheckbox,
} from "@/components/ds";
import { parseFiscalYears } from "@/utils/formatFiscalYears";
import { parseTaxpayerNames, formatTaxpayerNames, taxpayerDisplayName } from "@/lib/taxpayer";
import { WizardCard } from "@/components/assessment/WizardCard";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/sonner";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import {
  HelpCircle,
  CalendarIcon,
  Check,
  X,
  Plus,
  Link2,
  Lightbulb,
  BookOpen,
  ArrowLeft,
  ArrowRight,
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { format, parse, isValid } from "date-fns";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AssessmentSidebar } from "@/components/AssessmentSidebar";
import { QuestionExplanationInline } from "@/components/QuestionExplanationInline";
import { CommentModeToggle, type CommentMode } from "@/components/assessment/CommentModeToggle";
import { WhySuggestedTip } from "@/components/assessment/WhySuggestedTip";
import { AutoGrowTextarea } from "@/components/ui/AutoGrowTextarea";
import { ContextSkeleton, ContextEmptyState, ContextErrorState } from "@/components/ContextPanelStates";
import { ContextPanelFallback } from "@/components/ContextPanelFallback";
import { SuggestionCard } from "@/components/prefill/SuggestionCard";
import { useQuestionPrefill, usePrefillJob } from "@/hooks/usePrefill";
import { seededIndex } from "@/utils/random";
import { motion } from "framer-motion";
import { startExtraction } from "@/lib/structure/extraction";
import { startAppendixGeneration, loadAppendix, pollAppendixUntilReady } from "@/lib/appendix/client";
import { loadChart } from "@/lib/structure/client";
import { AssessmentFooterSlot } from "@/components/assessment/AssessmentFooterSlot";
import { useAssessmentSessionId } from "@/lib/assessment/useAssessmentSessionId";
import { OpenQuestionsPanel } from "@/components/openQuestions/OpenQuestionsPanel";
import { useAppendixPrewarm } from "@/hooks/useAppendixPrewarm";

// Playful placeholders that rotate (seeded per session+question) when the user
// picks "Unknown" and the explanation textarea is empty. Soften the moment by
// normalising "we don't know yet" as a respectable answer.
const UNKNOWN_PLACEHOLDERS = [
  "Nobody knows everything; note what's missing.",
  "Tax law isn't telepathy. Write what's still open.",
  "An honest \"we don't know yet\" beats a confident guess.",
  "What would you ask the client to confirm?",
  "The brave thing is naming the unknown.",
  "Not every dossier hands you the answer.",
  "\"Pending confirmation\" is a respectable answer.",
] as const;

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
  // One assessment can name several entities that are assessed together as the
  // subject (the taxpayer). The list is held here (single-entity is a one-element
  // list, the default) and stored newline-joined in atad2_sessions.taxpayer_name;
  // see src/lib/taxpayer.ts. Always carries at least one (possibly empty) row so
  // the first name field always renders.
  taxpayer_names: string[];
  // One assessment can cover several fiscal years. The selected years are held
  // here as strings (e.g. ["2023", "2024"]) and stored as one comma-joined
  // value in atad2_sessions.fiscal_year. A single-year assessment is just a
  // one-element list.
  tax_years: string[];
  tax_year_not_equals_calendar: boolean;
  // When the fiscal period deviates from the calendar year, each selected year
  // carries its own begin and end date (a single year is just a one-entry map).
  // Keyed by year string, e.g. { "2026": { start: "2026-07-01", end: "2027-06-30" } }.
  // On save these collapse to the overall span in period_start_date/period_end_date,
  // the only shape downstream (dossier header, report) consumes.
  period_dates?: Record<string, { start?: string; end?: string }>;
  period_start_date?: string;
  period_end_date?: string;
}


interface FiscalDateFieldProps {
  id: string;
  label: string;
  /** Stored value in yyyy-MM-dd, or undefined when empty. */
  value?: string;
  onChange: (value: string | undefined) => void;
}

// A single fiscal date field: a dd/mm/yyyy text input paired with a calendar
// popover. Used once per selected year for the custom-period start and end dates.
const FiscalDateField = ({ id, label, value, onChange }: FiscalDateFieldProps) => (
  <FormField label={label} htmlFor={id} required>
    <div className="flex gap-2">
      <Input
        id={id}
        placeholder="dd / mm / yyyy"
        defaultValue={
          value ? format(parse(value, "yyyy-MM-dd", new Date()), "dd/MM/yyyy") : ""
        }
        key={`${id}-${value ?? "empty"}`}
        onBlur={(e) => {
          const raw = e.target.value.trim();
          if (raw === "") {
            onChange(undefined);
            return;
          }
          // Accept the spaced placeholder form ("dd / mm / yyyy") too.
          const parsed = parse(raw.replace(/\s+/g, ""), "dd/MM/yyyy", new Date());
          // Require a real 4-digit year so a mistype like "1/1/26" is not
          // silently read as year 0026.
          if (isValid(parsed) && parsed.getFullYear() >= 1000) {
            onChange(format(parsed, "yyyy-MM-dd"));
            e.target.value = format(parsed, "dd/MM/yyyy");
            return;
          }
          // Unparseable or implausible: snap the box back to the stored value so
          // it can never display a date that differs from what is saved.
          e.target.value = value
            ? format(parse(value, "yyyy-MM-dd", new Date()), "dd/MM/yyyy")
            : "";
        }}
        className="flex-1"
      />
      <Popover>
        <PopoverTrigger asChild>
          <Button type="button" variant="secondary" size="icon" aria-label="Pick a date">
            <CalendarIcon className="h-4 w-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            weekStartsOn={1}
            selected={
              value
                ? (() => {
                    const d = parse(value, "yyyy-MM-dd", new Date());
                    return isValid(d) ? d : undefined;
                  })()
                : undefined
            }
            onSelect={(date) => onChange(date ? format(date, "yyyy-MM-dd") : undefined)}
            initialFocus
          />
        </PopoverContent>
      </Popover>
    </div>
  </FormField>
);

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
                    <span className="font-normal text-ds-ink underline decoration-dotted decoration-ds-ink-tertiary underline-offset-2 hover:bg-ds-fill-muted rounded-sm px-1 cursor-pointer transition-colors duration-200">
                      {matches[index]}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-sm p-3 bg-popover text-popover-foreground border rounded">
                    <div className="flex items-start gap-2">
                      <Lightbulb className="h-4 w-4 mt-0.5 shrink-0 text-ds-ink-secondary" />
                      <div>
                        <span className="font-normal text-ds-ink block mb-1">
                          {difficultTerm}
                        </span>
                        <p className="text-[13px] leading-relaxed text-ds-ink-secondary">
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
                className="ml-2 align-middle text-ds-ink-secondary cursor-pointer hover:text-ds-ink hover:bg-ds-fill-muted rounded-sm px-1 transition-colors duration-200"
                type="button"
                aria-label="View example"
              >
                <BookOpen className="h-4 w-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Click to view example</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}

      {showExample && exampleText && (
        <div className="w-full rounded-ds-control border border-ds-hairline bg-ds-fill-muted p-4 mt-4">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-start gap-2 flex-1">
              <BookOpen className="h-4 w-4 mt-0.5 shrink-0 text-ds-ink-secondary" />
              <div className="flex-1">
                <span className="font-normal text-ds-ink block mb-2">Example</span>
                <p className="text-[13px] leading-relaxed text-ds-ink-secondary">
                  {exampleText}
                </p>
              </div>
            </div>
            <button
              onClick={() => setShowExample(false)}
              className="text-ds-ink-secondary hover:underline text-[13px] font-normal transition"
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
    // "Always" comment mode keeps the comment field on every question, so never
    // auto-skip past one — the user must get the chance to type and click Next.
    if (commentMode === "always") return false;
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

  // Optional ?clientId= from a client folder. When present and the client
  // belongs to the current user, the intake prefills the taxpayer name and
  // the new session is linked to that client. Without the param (or when
  // the lookup fails) the intake behaves exactly as it does today.
  const [searchParams, setSearchParams] = useSearchParams();
  const intakeClientIdParam = searchParams.get("clientId");
  // ?focus=open swaps the question card region for the open questions panel
  // (deep link from the dossier and the sub-header button). Read-only here;
  // the render branch below acts on it once the session has started.
  const focusParam = searchParams.get("focus");
  // ?q=<question_id> jumps to that question once the flow is rebuilt. Read
  // here; the deep-link effect below goToPendingQuestion consumes it.
  const qParam = searchParams.get("q");
  const [intakeClient, setIntakeClient] = useState<{ id: string; client_name: string } | null>(null);

  const [sessionInfo, setSessionInfo] = useState<SessionInfo>({
    taxpayer_names: [""],
    tax_years: [],
    tax_year_not_equals_calendar: false,
  });

  // The taxpayer field is one unified list: a single plain input by default,
  // and from two entities on it reads as a numbered set. Every named entity is
  // assessed together as the subject of this one assessment (one memo, one
  // appendix).

  // Set the name at one position in the taxpayer list.
  const setTaxpayerNameAt = (index: number, value: string) =>
    setSessionInfo((prev) => {
      const next = [...prev.taxpayer_names];
      next[index] = value;
      return { ...prev, taxpayer_names: next };
    });

  // Append an empty name row (multi-entity editor only).
  const addTaxpayerEntity = () =>
    setSessionInfo((prev) => ({ ...prev, taxpayer_names: [...prev.taxpayer_names, ""] }));

  // Remove one name row; never drops the last row (the field must always render).
  const removeTaxpayerEntity = (index: number) =>
    setSessionInfo((prev) => {
      const next = prev.taxpayer_names.filter((_, i) => i !== index);
      return { ...prev, taxpayer_names: next.length ? next : [""] };
    });

  // Assessing a single year is the norm and shows a dropdown. Ticking "Assess
  // multiple years" switches to the year multi-select; "Just one year" switches
  // back and collapses the selection to the most recent year.
  const [multiYear, setMultiYear] = useState(false);

  // Toggle a fiscal year in/out of the multi-select. Years are kept sorted so
  // the stored value and the derived period are stable regardless of click order.
  // Removing a year also drops any per-year period dates it held, so an unticked
  // year leaves no stale dates behind.
  const toggleTaxYear = (year: string) =>
    setSessionInfo((prev) => {
      const has = prev.tax_years.includes(year);
      const next = has
        ? prev.tax_years.filter((y) => y !== year)
        : [...prev.tax_years, year];
      next.sort((a, b) => Number(a) - Number(b));
      let period_dates = prev.period_dates;
      if (has && period_dates && period_dates[year]) {
        period_dates = { ...period_dates };
        delete period_dates[year];
      }
      return { ...prev, tax_years: next, period_dates };
    });

  // Set one end of one year's fiscal period. `undefined` clears that date.
  const setYearDate = (year: string, which: "start" | "end", value: string | undefined) =>
    setSessionInfo((prev) => ({
      ...prev,
      period_dates: {
        ...prev.period_dates,
        [year]: { ...prev.period_dates?.[year], [which]: value },
      },
    }));

  // Keep only the period dates whose year is still selected.
  const prunePeriodDates = (
    period_dates: SessionInfo["period_dates"],
    years: string[],
  ): SessionInfo["period_dates"] => {
    if (!period_dates) return period_dates;
    const kept: Record<string, { start?: string; end?: string }> = {};
    for (const y of years) if (period_dates[y]) kept[y] = period_dates[y];
    return kept;
  };

  // Single-year (dropdown) selection: replaces the whole list with one year and
  // drops any period dates that belonged to a previously chosen year.
  const selectSingleYear = (year: string) =>
    setSessionInfo((prev) => ({
      ...prev,
      tax_years: [year],
      period_dates: prunePeriodDates(prev.period_dates, [year]),
    }));

  // Collapse a multi-year selection back to a single year: keep the most recent
  // selected year (if any) and drop the rest, then show the dropdown again.
  const switchToSingleYear = () => {
    setSessionInfo((prev) => {
      const newest = [...prev.tax_years].sort((a, b) => Number(b) - Number(a))[0];
      const next = newest ? [newest] : [];
      return { ...prev, tax_years: next, period_dates: prunePeriodDates(prev.period_dates, next) };
    });
    setMultiYear(false);
  };
  const [dontShowBeforeYouStartAgain, setDontShowBeforeYouStartAgain] = useState(false);
  const [sessionStarted, setSessionStarted] = useState(false);
  const [sessionId, setSessionId] = useState<string>("");
  useAppendixPrewarm(sessionId || undefined);
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
  // Per-session comment mode. "smart" lets the system decide which questions
  // ask for a comment; "always" reveals the comment field on every question.
  // Persisted per session (see effect below) and defaulting to "smart".
  const [commentMode, setCommentMode] = useState<CommentMode>("smart");
  const [pendingQuestion, setPendingQuestion] = useState<Question | null>(null);
  
  // Friendly explanation reminder state
  const [explanationReminderShown, setExplanationReminderShown] = useState(false);
  const [showExplanationShake, setShowExplanationShake] = useState(false);
  // True from the moment Continue locks in the explanation until we land on a
  // different question — keeps the textarea in a darker "accepted" state
  // through the navigation transition. Reset by the question-change effect
  // below so back-navigation lands on a fresh, editable textarea.
  const [committingExplanation, setCommittingExplanation] = useState(false);
  const [reminderMessage, setReminderMessage] = useState("");

  // Whenever the visible question changes (forward via Continue or back via
  // Previous), drop the committing lock so the new question's textarea
  // renders in its normal editable white state.
  useEffect(() => {
    setCommittingExplanation(false);
  }, [currentQuestion?.question_id]);

  // Hydrate the comment mode for this session. Persisted per session so the
  // choice holds while moving between questions and survives a reload of the
  // same session; a fresh session (no stored value) defaults to Smart.
  useEffect(() => {
    if (!sessionId) return;
    try {
      const stored = window.localStorage.getItem(`atad2:commentMode:${sessionId}`);
      setCommentMode(stored === "always" ? "always" : "smart");
    } catch {
      /* localStorage unavailable — keep the in-memory default */
    }
  }, [sessionId]);

  const handleCommentModeChange = (mode: CommentMode) => {
    setCommentMode(mode);
    if (!sessionId) return;
    try {
      window.localStorage.setItem(`atad2:commentMode:${sessionId}`, mode);
    } catch {
      /* ignore persistence failure; the in-memory choice still applies */
    }
  };

  // Resolve ?clientId= to a client folder owned by the current user. The
  // ownership filter runs in the query itself and RLS enforces it server-side.
  // Any error or missing row means "no client": the intake then behaves
  // exactly like the normal flow (fail soft, no toast). Skipped entirely in
  // resume mode (?session= present) because the intake form is not shown.
  useEffect(() => {
    if (!intakeClientIdParam || !user?.id || resumeSessionId) return;
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase
          .from('atad2_clients')
          .select('id, client_name')
          .eq('id', intakeClientIdParam)
          .eq('user_id', user.id)
          .maybeSingle();
        if (cancelled) return;
        if (error || !data) {
          if (error) console.warn('Client prefill lookup failed:', error.message);
          return;
        }
        setIntakeClient({ id: data.id, client_name: data.client_name });
        // Prefill only while the single default field is still empty; never
        // overwrite typing or a multi-entity list the user has started.
        setSessionInfo(prev => {
          const untouched = prev.taxpayer_names.length === 1 && !prev.taxpayer_names[0].trim();
          return untouched ? { ...prev, taxpayer_names: [data.client_name] } : prev;
        });
      } catch (err) {
        if (!cancelled) console.warn('Client prefill lookup failed:', err);
      }
    })();
    return () => { cancelled = true; };
  }, [intakeClientIdParam, user?.id, resumeSessionId]);

  // Friendly reminder messages for empty explanations
  const friendlyReminders = [
    "Some further context would be really helpful",
    "Don't leave this empty, just a few words?",
    "Please don't skip this one",
    "Even a little context makes the answers smarter!",
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

  // "Always" reveals the comment field on every question; once anything has
  // been typed the field stays visible even back in Smart mode so a comment is
  // never hidden or stranded. Computed once here so the panel render guard and
  // the footer proceed-button logic share one source of truth.
  const forceComment = commentMode === "always";
  const hasTypedComment = (contextValue?.trim().length ?? 0) > 0;

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
  // The upload page now gates entry on actual swarm completion, so we
  // don't need an in-assessment progress banner anymore — by the time
  // the user gets here the prefills should be in.
  const isWaitingForPrefill = false;
  void prefillJob; // referenced via job-status banner only

  // Picking the answer is always a deliberate user action. The AI's
  // suggestion shows up as a "Suggested" badge on the option, but we never
  // pre-select it — the user must click Yes / No / Unknown themselves.

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

        // Parse the stored taxpayer_name back into the entity list (newline-
        // joined; a legacy single name yields one row). The list numbers itself
        // automatically once it holds more than one entity.
        const resumedNames = parseTaxpayerNames(session.taxpayer_name);
        setSessionInfo({
          taxpayer_names: resumedNames.length ? resumedNames : [""],
          // Parse the stored value back into the multi-select list. Handles both
          // the legacy single-year form and the comma-joined multi-year form.
          tax_years: parseFiscalYears(session.fiscal_year).map(String),
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
    const namedEntities = sessionInfo.taxpayer_names.map((n) => n.trim()).filter(Boolean);
    if (namedEntities.length === 0 || sessionInfo.tax_years.length === 0) {
      toast.error("Missing information", {
        description: "Enter a taxpayer name and select at least one tax year",
      });
      return;
    }

    if (sessionInfo.tax_year_not_equals_calendar) {
      const missingDates = sessionInfo.tax_years.some(
        (y) => !sessionInfo.period_dates?.[y]?.start || !sessionInfo.period_dates?.[y]?.end,
      );
      if (missingDates) {
        toast.error("Missing information", {
          description: "Please fill in a start and end date for every selected year",
        });
        return;
      }
      const inverted = sessionInfo.tax_years.find((y) => {
        const d = sessionInfo.period_dates?.[y];
        return d?.start && d?.end && new Date(d.end) < new Date(d.start);
      });
      if (inverted) {
        toast.error("Invalid date range", {
          description: `End date cannot be before start date for year ${inverted}`,
        });
        return;
      }
    }

    // If the user previously opted "Don't show again" → skip modal and start directly.
    if (userPref.dismissed) {
      startSession();
      return;
    }
    setShowStartWarningDialog(true);
  };

  const startSession = async () => {
    // Validation (required dates + end>=start per year) already done in
    // validateAndShowWarning before the confirmation dialog opened.
    setShowStartWarningDialog(false);

    setLoading(true);
    try {
      const newSessionId = crypto.randomUUID();

      // Years are kept sorted in state; derive the assessed span from the
      // earliest and latest selected year. A custom period (one shared window)
      // overrides the calendar span when the user ticks the toggle.
      const sortedYears = [...sessionInfo.tax_years].sort((a, b) => Number(a) - Number(b));
      const firstYear = sortedYears[0];
      const lastYear = sortedYears[sortedYears.length - 1];

      // A custom period carries one begin/end date per year. The stored span is
      // the earliest start and the latest end across those years (ISO dates sort
      // chronologically), which is what the dossier header and report display.
      const customStarts = sortedYears
        .map((y) => sessionInfo.period_dates?.[y]?.start)
        .filter((v): v is string => !!v)
        .sort();
      const customEnds = sortedYears
        .map((y) => sessionInfo.period_dates?.[y]?.end)
        .filter((v): v is string => !!v)
        .sort();

      const startDate = sessionInfo.tax_year_not_equals_calendar
        ? customStarts[0]
        : `${firstYear}-01-01`;

      const endDate = sessionInfo.tax_year_not_equals_calendar
        ? customEnds[customEnds.length - 1]
        : `${lastYear}-12-31`;

      const { error } = await supabase
        .from('atad2_sessions')
        .insert({
          session_id: newSessionId,
          user_id: user?.id || null,
          // Store the named entities as one newline-joined value in the existing
          // TEXT column. A single entity stores one line (unchanged); the appendix
          // and prompts treat every named entity together as the taxpayer.
          taxpayer_name: formatTaxpayerNames(sessionInfo.taxpayer_names),
          // Store the selected years as one comma-joined value in the existing
          // TEXT column. Downstream display formats it; the AI prompts receive
          // the readable list verbatim.
          fiscal_year: sortedYears.join(", "),
          is_custom_period: sessionInfo.tax_year_not_equals_calendar,
          period_start_date: startDate,
          period_end_date: endDate,
          status: 'in_progress',
          completed: false,
          // Link the session to its client folder only when a validated
          // ?clientId= is present; otherwise the payload is unchanged.
          ...(intakeClient ? { client_id: intakeClient.id } : {})
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

    // Reminder fires when the user is expected to fill in a textarea but left
    // it empty: either the question requires explanation, OR the user picked
    // Unknown and the swarm staged the Route B Unknown companion
    // (contextual_hint + suggested_toelichting_unknown). Mirrors the same gate
    // in handleContinueWithReminder above.
    const unknownRouteBStagedForFinish =
      selectedAnswer === "Unknown"
      && !!currentPrefill?.contextual_hint
      && !!currentPrefill?.suggested_toelichting_unknown;
    const finishExplanationExpected =
      dbRequiresExplanation || unknownRouteBStagedForFinish;
    if (finishExplanationExpected && (!contextValue || contextValue.trim() === '') && !explanationReminderShown) {
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

      // Refresh the appendix/facts generation now that the Q&A answers exist.
      // The prewarm hook fires once on the Phase A chart draft (before answers),
      // so this explicit call folds the answers into the article rows and facts.
      // startAppendixGeneration merges fresh AI output with any prior advisor
      // edits/confirmations, so re-running is non-destructive. We first let any
      // in-flight (answer-less) prewarm run finish: otherwise the edge function
      // drops this invoke as a fresh duplicate, or races its final write, and
      // the appendix lands "ready" with answer-less content.
      void (async () => {
        try {
          const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
          // First let the just-dispatched Phase B refine settle, so this
          // answer-bearing appendix run reads the refined chart instead of the
          // docs-only one. Give the refine up to ~20s to actually start, then
          // wait (bounded) until the chart leaves its extracting state.
          const chartStatus = async () =>
            (await loadChart(sessionId).catch(() => null))?.chart?.status ?? null;
          for (let i = 0; i < 5; i++) {
            const st = await chartStatus();
            if (st && st.startsWith('extracting')) break;
            await sleep(4000);
          }
          const refineDeadline = Date.now() + 240_000;
          while (Date.now() < refineDeadline) {
            const st = await chartStatus();
            if (!st || !st.startsWith('extracting')) break;
            await sleep(4000);
          }
          const cur = await loadAppendix(sessionId);
          // Only wait when a FRESH prewarm run is still in flight: starting now
          // would make the edge function drop our answer-bearing run as a
          // duplicate. A stale 'generating' row (its work died) is not worth
          // waiting on, and the edge function just restarts it on our call.
          const freshRun =
            cur?.generation_status === 'generating' &&
            !!cur.updated_at &&
            Date.now() - new Date(cur.updated_at).getTime() < 90_000;
          if (freshRun) {
            await pollAppendixUntilReady(sessionId, () => {}).catch(() => {});
          }
          await startAppendixGeneration(sessionId);
        } catch { /* the appendix step has a cold-start backstop */ }
      })();

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

  // Deep link from the open-questions register: ?q=<question_id> jumps to
  // that question once the session has started and the flow is rebuilt, then
  // strips q and focus from the URL with a replace navigation. The ref guards
  // re-entry while the same q is still in the URL across renders; it resets
  // when q disappears so a later click on the same question works again.
  const lastHandledQRef = useRef<string | null>(null);
  useEffect(() => {
    if (!qParam) {
      lastHandledQRef.current = null;
      return;
    }
    if (!sessionStarted) return;
    if (lastHandledQRef.current === qParam) return;
    // Wait for the resume replay: with no flow and no pending question the
    // target cannot be located yet, so keep the param and try next render.
    if (questionFlow.length === 0 && !pendingQuestion) return;
    lastHandledQRef.current = qParam;

    const targetIndex = questionFlow.findIndex(
      (entry) => entry.question.question_id === qParam
    );
    if (targetIndex >= 0) {
      goToSpecificQuestion(targetIndex);
    } else if (pendingQuestion?.question_id === qParam) {
      goToPendingQuestion();
    }

    const next = new URLSearchParams(searchParams);
    next.delete("q");
    next.delete("focus");
    setSearchParams(next, { replace: true });
    // goToSpecificQuestion/goToPendingQuestion are stable per render and the
    // ref prevents double handling, so they are deliberately not dependencies.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qParam, sessionStarted, questionFlow, pendingQuestion, searchParams, setSearchParams]);

  const handleAnswerSelect = async (answer: string) => {
    if (loading || isTransitioning) return;
    
    if (!currentQuestion || !sessionId) return;
    
    const questionId = currentQuestion.question_id;
    
    // Check for flow changes during back-navigation BEFORE updating anything.
    // The dialog warns the user that downstream answers will be wiped when the
    // new answer branches differently. Skip the dialog when there are no
    // downstream answers to lose — typically right after the user answered the
    // current question and hasn't progressed further. Without this guard,
    // changing Q1 from Yes (→Q3) to Unknown (→Q2) pops a "Confirm change of
    // answer" dialog even though questionFlow has only Q1 and nothing
    // downstream would be deleted, forcing an unnecessary 2nd click.
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

        const currentIdx = questionFlow.findIndex(e => e.question.question_id === questionId);
        const hasDownstreamAnswers = currentIdx >= 0 && currentIdx < questionFlow.length - 1;

        if (hasDownstreamAnswers) {
          // Real flow change with answers downstream: show dialog so user can
          // confirm the wipe.
          setPendingAnswerChange({
            answer,
            newNextQuestionId: newSelectedOption.next_question_id
          });
          setShowFlowChangeDialog(true);
          return;
        }
        // Otherwise fall through: no downstream data to protect, treat as a
        // normal answer change. handleFlowChangeConfirm-equivalent work
        // (questionFlow trim, navigationIndex reset) is unnecessary because
        // there is nothing to trim and the auto-advance path below will set
        // navigationIndex back to -1 on the next question.
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

    // Block auto-advance when the AI has prepared explanation material for THIS
    // answer (suggested toelichting, a committed text, or a prior accept/edit).
    // Without this, picking the AI-suggested "no" — even when "no" wouldn't
    // normally need an explanation — would flash the suggestion and immediately
    // skip to the next question, leaving the user no chance to accept/edit it.
    // Mirrors the panel-render guard further down in the JSX.
    const aiHasExplanationForAnswer = computeAiHasExplanationForAnswer(currentPrefill, answer);
    // Belt-and-suspenders inline check for the Route B Unknown companion. The
    // gate function in src/lib already covers this, but Vite HMR occasionally
    // misses leaf .ts file edits — keeping the rule inline here ensures the
    // Assessment.tsx HMR cycle picks it up regardless.
    const unknownRouteBStaged =
      answer.toLowerCase() === "unknown"
      && !!currentPrefill?.contextual_hint
      && !!currentPrefill?.suggested_toelichting_unknown;
    const blockAutoAdvance = aiHasExplanationForAnswer || unknownRouteBStaged;

    console.debug('[answer]', {
      qid: questionId,
      answerId: `${questionId}-${answer}`,
      requiresExplanation: selectedOption?.requires_explanation,
      aiHasExplanationForAnswer,
      unknownRouteBStaged,
      blockAutoAdvance,
    });

    // If answer doesn't require explanation AND nothing has staged content for
    // this answer (neither the Route A gate nor the Route B Unknown companion),
    // auto-advance immediately. Otherwise the user needs to see/accept/edit
    // the suggested explanation first.
    if (!requiresExplanation && !blockAutoAdvance && commentMode !== "always") {
      console.log(`🚫 Answer ${answer} for Q${questionId} does not require explanation - auto-advancing`);
      store.setQuestionState(sessionId, questionId, answer, {
        shouldShowContext: false,
        contextPrompt: '',
      });

      // Auto-advance whenever the answer needs no dwell, regardless of nav
      // mode. Previously gated on navigationIndex === -1, but in nav mode that
      // left the user stranded on an already-answered question with no
      // Continue button after switching to a no-explanation answer (e.g.
      // picking Unknown on Q1 where no AI suggestion was staged).
      console.log(`⏩ Auto-advancing immediately after ${answer} selection (no context required)`);
      setTimeout(async () => {
        await submitAnswerDirectly(answer);
      }, 100);
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

      // Only auto-advance when not navigating, auto-advance is enabled, no
      // explanation is required, and nothing has staged an explanation for
      // this answer (otherwise the user must see/accept/edit it first).
      if (autoAdvance && !requiresExplanation && !blockAutoAdvance && commentMode !== "always") {
        console.log(`⏩ Auto-advancing to next question after ${answer} selection`);
        setTimeout(async () => {
          await submitAnswerDirectly(answer);
        }, 300);
      } else if (requiresExplanation) {
        console.debug('[nav] blocked: requires explanation; stay on question for context');
        setLoading(false);
      } else if (blockAutoAdvance) {
        console.debug('[nav] blocked: AI explanation staged for this answer (Route A or Route B Unknown companion); wait for user to accept/edit');
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
    // Reminder fires when the user is expected to fill in a textarea but left
    // it empty. That covers two cases:
    //   (a) the question option itself requires explanation (the classic
    //       Yes/No-with-required-explanation flow), and
    //   (b) the user picked Unknown and the swarm staged a contextual hint +
    //       suggested_toelichting_unknown pair (Route B Unknown companion) —
    //       there's a visible textarea+suggestion and submitting empty would
    //       silently skip past it. Same gate as the Continue-button visibility
    //       check and the answer-handler's blockAutoAdvance.
    const unknownRouteBStaged =
      selectedAnswer === "Unknown"
      && !!currentPrefill?.contextual_hint
      && !!currentPrefill?.suggested_toelichting_unknown;
    const explanationExpected =
      selectedQuestionOption?.requires_explanation === true
      || unknownRouteBStaged;

    if (explanationExpected
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
    // Lock the textarea in a "we got your text" darker state while we
    // navigate away. We do NOT clear it here — the question-change effect
    // resets it on the next/previous question so going back lands you in a
    // fresh, editable (white) textarea.
    const hasTypedExplanation = !!contextValue && contextValue.trim().length > 0;
    console.debug('[nav] context panel: allowing continue with answered question');
    if (hasTypedExplanation) {
      setCommittingExplanation(true);
    }
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
        <p className="text-[13px] text-ds-ink-secondary">Loading session…</p>
      </div>
    );
  }

  if (!sessionStarted) {
    return (
      <>
        <WizardCard>
              <h2 className="text-2xl font-normal tracking-tight text-ds-ink">Start risk assessment</h2>
              <p className="mt-2 text-[15px] text-ds-ink-secondary">
                Start with the taxpayer and the tax year. The rest follows step by step.
              </p>
              <div className="mt-7 space-y-6">
                <FormField
                  label="Taxpayer"
                  htmlFor="taxpayer_name"
                  required
                >
                  {(() => {
                    // A single taxpayer is one plain input. From two entities on,
                    // the set reads as an ordered list: each row gets a muted
                    // number, a per-row remove revealed on hover/focus, and one
                    // note that they are assessed together. Never show a lone "1",
                    // a remove, or the note on the only row.
                    const names = sessionInfo.taxpayer_names;
                    const numbered = names.length >= 2;
                    return (
                      <div className="space-y-3">
                        <div className="flex flex-col gap-2">
                          {names.map((name, i) => (
                            <div key={i} className="group flex items-center gap-3">
                              {numbered && (
                                <span className="w-[15px] shrink-0 text-right text-[13px] text-ds-ink-tertiary ds-tabular-nums">
                                  {i + 1}
                                </span>
                              )}
                              <Input
                                id={i === 0 ? "taxpayer_name" : undefined}
                                value={name}
                                onChange={(e) => setTaxpayerNameAt(i, e.target.value)}
                                placeholder="Legal entity name"
                                required={i === 0}
                                aria-label={numbered ? `Taxpayer entity ${i + 1} name` : undefined}
                              />
                              {numbered && (
                                <button
                                  type="button"
                                  onClick={() => removeTaxpayerEntity(i)}
                                  aria-label={`Remove entity ${i + 1}`}
                                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-ds-control text-ds-ink-tertiary opacity-0 transition-[opacity,color,background-color] hover:bg-ds-fill-muted hover:text-ds-ink focus-visible:opacity-100 group-hover:opacity-100 group-focus-within:opacity-100"
                                >
                                  <X className="h-4 w-4" />
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                        <div
                          className={cn(
                            "flex items-center justify-between gap-4",
                            // Align the action line under the input: 15px number
                            // gutter + 12px row gap = 27px.
                            numbered && "pl-[27px]",
                          )}
                        >
                          <button
                            type="button"
                            onClick={addTaxpayerEntity}
                            className="inline-flex items-center gap-1.5 text-[13px] font-normal text-ds-ink-secondary transition-colors hover:text-ds-ink"
                          >
                            <Plus className="h-3.5 w-3.5" />
                            Add entity
                          </button>
                          {numbered && (
                            <span className="inline-flex items-center gap-1.5 text-[12.5px] text-ds-ink-secondary">
                              <Link2 className="h-3.5 w-3.5 shrink-0 text-ds-ink-tertiary" />
                              Assessed together as one group of taxpayers
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })()}
                </FormField>

                <FormField label="Tax year" htmlFor="tax_year" required>
                  {multiYear ? (
                    <div className="space-y-2">
                      <div
                        id="tax_year"
                        role="group"
                        aria-label="Tax years"
                        className="grid grid-cols-3 gap-2 sm:grid-cols-6"
                      >
                        {Array.from({ length: 6 }, (_, i) => {
                          const year = (new Date().getFullYear() - i).toString();
                          const checked = sessionInfo.tax_years.includes(year);
                          return (
                            <OptionCheckbox
                              key={year}
                              checked={checked}
                              onToggle={() => toggleTaxYear(year)}
                              className={cn(
                                "ds-tabular-nums justify-center rounded-ds-control border px-3 py-2 transition-colors",
                                checked
                                  ? "border-ds-ink bg-ds-fill-muted"
                                  : "border-ds-hairline bg-ds-card hover:border-ds-ink-tertiary",
                              )}
                            >
                              {year}
                            </OptionCheckbox>
                          );
                        })}
                      </div>
                      <p className="text-[13px] text-ds-ink-secondary">
                        Selected years are assessed together in one assessment.
                      </p>
                      <button
                        type="button"
                        onClick={switchToSingleYear}
                        className="inline-flex items-center gap-1 text-[13px] text-ds-ink-secondary transition-colors hover:text-ds-ink"
                      >
                        <ArrowLeft className="h-3.5 w-3.5" />
                        Just one year
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <Select
                        value={sessionInfo.tax_years[0] ?? ""}
                        onValueChange={selectSingleYear}
                      >
                        <SelectTrigger id="tax_year" aria-label="Tax year">
                          <SelectValue placeholder="Select a year" />
                        </SelectTrigger>
                        <SelectContent>
                          {Array.from({ length: 6 }, (_, i) => {
                            const year = (new Date().getFullYear() - i).toString();
                            return (
                              <SelectItem key={year} value={year} className="ds-tabular-nums">
                                {year}
                              </SelectItem>
                            );
                          })}
                        </SelectContent>
                      </Select>
                      <button
                        type="button"
                        onClick={() => setMultiYear(true)}
                        className="text-[13px] text-ds-ink-secondary transition-colors hover:text-ds-ink"
                      >
                        Assess multiple years
                      </button>
                    </div>
                  )}
                </FormField>

                <OptionToggle
                  id="tax-year-different"
                  variant="sage"
                  label="The fiscal period does not match the calendar year"
                  description="Add a start and end date for each selected year whose period does not follow the calendar year."
                  checked={sessionInfo.tax_year_not_equals_calendar}
                  onCheckedChange={(checked) => setSessionInfo({
                    ...sessionInfo,
                    tax_year_not_equals_calendar: checked,
                    period_dates: checked ? sessionInfo.period_dates : undefined,
                  })}
                >
                    {(() => {
                      // One start/end pair per selected year, newest first (the
                      // order the year chips read). A single year needs no label;
                      // multiple years each get a small "FINANCIAL YEAR {year}"
                      // eyebrow. Blocks add/remove live as years are ticked.
                      const years = [...sessionInfo.tax_years].sort((a, b) => Number(b) - Number(a));
                      const multiple = years.length > 1;
                      return (
                        <div className="space-y-[18px]">
                          {years.map((year) => (
                            <div key={year} className="space-y-2">
                              {multiple && (
                                <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-ds-ink-tertiary">
                                  Financial year {year}
                                </div>
                              )}
                              <div className="grid grid-cols-2 gap-4">
                                <FiscalDateField
                                  id={`period_start_${year}`}
                                  label="Start date"
                                  value={sessionInfo.period_dates?.[year]?.start}
                                  onChange={(v) => setYearDate(year, "start", v)}
                                />
                                <FiscalDateField
                                  id={`period_end_${year}`}
                                  label="End date"
                                  value={sessionInfo.period_dates?.[year]?.end}
                                  onChange={(v) => setYearDate(year, "end", v)}
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                      );
                    })()}
                </OptionToggle>

                <div className="pt-2">
                  <Button
                    disabled={loading}
                    className="w-full gap-2"
                    onClick={validateAndShowWarning}
                  >
                    {loading ? "Starting assessment..." : "Start assessment"}
                    {!loading && <ArrowRight className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
        </WizardCard>

        {/* Warning dialog that shows AFTER validation */}
        <Dialog open={showStartWarningDialog} onOpenChange={(open) => {
          setShowStartWarningDialog(open);
          if (!open) {
            setConfirmations({ advisory: false, highLevel: false, factDriven: false });
          }
        }}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle className="text-[18px] font-normal leading-snug tracking-tight text-ds-ink">Before you start</DialogTitle>
              <DialogDescription className="text-[13px] text-ds-ink-secondary">
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
                <label htmlFor="advisory" className="text-[13px] leading-relaxed cursor-pointer">
                  <span className="font-normal text-ds-ink">Advisory tool & responsibility</span>
                  <br />
                  <span className="text-ds-ink-secondary">I understand that this tool is an analytical aid only and does not replace professional judgement. I remain fully responsible for the accuracy, completeness, and interpretation of the assessment.</span>
                </label>
              </div>

              <div className="flex items-start space-x-3">
                <Checkbox
                  id="highLevel"
                  checked={confirmations.highLevel}
                  onCheckedChange={(checked) => setConfirmations(prev => ({ ...prev, highLevel: checked === true }))}
                />
                <label htmlFor="highLevel" className="text-[13px] leading-relaxed cursor-pointer">
                  <span className="font-normal text-ds-ink">High-level ATAD2 risk indication</span>
                  <br />
                  <span className="text-ds-ink-secondary">I understand that the assessment provides a high-level indication of potential ATAD2 risk only and does not determine whether a mismatch actually exists or whether a tax adjustment, denial of deduction, or reassessment will occur.</span>
                </label>
              </div>

              <div className="flex items-start space-x-3">
                <Checkbox
                  id="factDriven"
                  checked={confirmations.factDriven}
                  onCheckedChange={(checked) => setConfirmations(prev => ({ ...prev, factDriven: checked === true }))}
                />
                <label htmlFor="factDriven" className="text-[13px] leading-relaxed cursor-pointer">
                  <span className="font-normal text-ds-ink">Completeness of information</span>
                  <br />
                  <span className="text-ds-ink-secondary">I understand that the quality of the assessment depends entirely on the completeness and accuracy of the information I provide. The more relevant context I include, the more reliable the outcome will be.</span>
                </label>
              </div>
            </div>

            <div className="flex items-start space-x-3 pt-1 border-t border-ds-hairline">
              <Checkbox
                id="dont_show_before_you_start"
                checked={dontShowBeforeYouStartAgain}
                onCheckedChange={(checked) => setDontShowBeforeYouStartAgain(checked === true)}
              />
              <label htmlFor="dont_show_before_you_start" className="text-[13px] text-ds-ink-secondary cursor-pointer">
                Don't show this again
              </label>
            </div>

            <DialogFooter className="gap-2 sm:gap-2">
              <Button
                variant="secondary"
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

  // Focus mode: ?focus=open swaps the question card region for the open
  // questions panel. Only this return changes; every hook, state value and
  // the resume replay above stay mounted, so dropping the param puts the
  // user back on exactly the question they left.
  if (focusParam === "open" && sessionId) {
    return (
      <div className="max-w-3xl mx-auto space-y-4">
        <div>
          <Button
            variant="secondary"
            onClick={() => {
              const next = new URLSearchParams(searchParams);
              next.delete("focus");
              setSearchParams(next, { replace: true });
            }}
          >
            Back to questions
          </Button>
        </div>
        <OpenQuestionsPanel
          variant="page"
          sessionId={sessionId}
          onGoToQuestion={(questionId) => {
            // Setting q and dropping focus hands off to the deep-link effect
            // above, which jumps to the question and then strips the params.
            const next = new URLSearchParams(searchParams);
            next.set("q", questionId);
            next.delete("focus");
            setSearchParams(next);
          }}
        />
      </div>
    );
  }

  if (!currentQuestion) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-ds-page">
        <p className="text-[13px] text-ds-ink-secondary">Loading question...</p>
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

  // The progress sidebar only mounts when it has content (an answered item or
  // a pending item). When empty, the thin progress line in the header (under
  // the stepper area) is the only progress signal and the question column
  // takes the full width.
  const showSidebar = questionFlow.length > 0 || !!pendingQuestion;

  return (
    <div>
        <WizardCard className="mx-auto max-w-5xl p-0">
        <div className={showSidebar ? "lg:grid lg:grid-cols-3" : undefined}>
          {showSidebar && (
          <div className="border-b border-ds-hairline p-8 lg:col-span-1 lg:border-b-0 lg:border-r">
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
          )}

          <div className={showSidebar ? "p-9 lg:col-span-2" : "p-9"}>
                <motion.div
                  key={currentQuestion.question_id}
                  initial={{ opacity: 0, x: 8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.32, ease: [0.2, 0, 0, 1] }}
                  className="max-w-[640px] mx-auto"
                >
                  <div className="mb-6">
                    {currentQuestion.question_title && (
                      <h2 className="mb-3 text-[11px] font-medium uppercase tracking-[0.16em] text-ds-accent-text">{currentQuestion.question_title}</h2>
                    )}
                    <p className="text-2xl sm:text-3xl font-normal tracking-tight leading-snug text-left text-ds-ink">
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

                       const isSuggestedAnswer = !!currentPrefill?.suggested_answer
                         && option.answer_option.toLowerCase() === currentPrefill.suggested_answer
                         && (currentPrefill.confidence_pct ?? 0) >= 40;

                       const OptionIcon =
                         answerType === 'yes' ? Check : answerType === 'no' ? X : HelpCircle;

                       // Brand semantic scale, flat (no shadow/ring): every
                       // answer owns a colour, previewed on hover and kept when
                       // selected. Yes = sage, No = terracotta, Unknown = slate
                       // blue (the neutral-uncertain accent). ds tokens are
                       // final colors, so no /opacity.
                       const semanticSelected =
                         answerType === 'yes' ? 'border-ds-green bg-ds-green-bg'
                         : answerType === 'no' ? 'border-ds-accent bg-ds-accent-bg'
                         : 'border-ds-blue bg-ds-blue-bg';
                       // Same colour previewed on hover for an UNSELECTED option,
                       // so hovering Yes previews sage, No terracotta, Unknown
                       // slate before clicking.
                       const semanticHover =
                         answerType === 'yes' ? 'hover:border-ds-green hover:bg-ds-green-bg'
                         : answerType === 'no' ? 'hover:border-ds-accent hover:bg-ds-accent-bg'
                         : 'hover:border-ds-blue hover:bg-ds-blue-bg';
                       const semanticIcon =
                         answerType === 'yes' ? 'text-ds-green-text'
                         : answerType === 'no' ? 'text-ds-accent'
                         : 'text-ds-blue-text';
                       // Icon previews the same colour on hover while unselected.
                       const semanticIconHover =
                         answerType === 'yes' ? 'group-hover:text-ds-green-text'
                         : answerType === 'no' ? 'group-hover:text-ds-accent'
                         : 'group-hover:text-ds-blue-text';

                       // "Previously answered" and the trailing arrow both sit at
                       // the right edge (ml-auto), so show only one: the label
                       // wins when revisiting an already-submitted answer.
                       const isOriginalAnswer =
                         isSelected && isViewingAnsweredQuestion &&
                         selectedAnswer === questionFlow.find(entry =>
                           entry.question.question_id === currentQuestion?.question_id
                         )?.answer;

                       const answerButton = (
                         <button
                           key={index}
                           type="button"
                           onClick={() => handleAnswerSelect(option.answer_option)}
                           disabled={loading || isTransitioning || isLockedOut}
                           aria-disabled={isLockedOut || undefined}
                           title={lockedReason ?? undefined}
                           className={`
                             group w-full p-4 rounded-ds-control border transition-colors duration-normal ease-emphasized text-left
                             ${isLockedOut
                               ? 'border-ds-hairline bg-ds-fill-muted opacity-60 cursor-not-allowed'
                               : isSelected
                               ? semanticSelected
                               : isSuggestedAnswer
                               ? `border-ds-ink-tertiary bg-ds-card ${semanticHover}`
                               : `border-ds-hairline bg-ds-card ${semanticHover}`
                             }
                             ${!isLockedOut && (loading || isTransitioning) ? 'opacity-50 cursor-not-allowed' : ''}
                             focus:outline-none focus-visible:ring-2 focus-visible:ring-ds-accent
                           `}
                         >
                            <div className="flex items-center gap-3">
                              <OptionIcon className={`w-5 h-5 transition-colors ${isSelected ? semanticIcon : isLockedOut ? 'text-ds-ink-secondary' : `text-ds-ink-secondary ${semanticIconHover}`}`} />
                               <span className="text-[15px] font-normal text-ds-ink">
                                 {option.answer_option}
                               </span>
                               {/* One right-pinned meta group so the "suggested" badge holds the
                                   same x in default, hover and selected. The arrow always
                                   reserves its slot and only fades in (opacity) on hover/selected,
                                   never toggled with display/margin and the row never switches to
                                   space-between, which is what made the badge jump. */}
                               {isSuggestedAnswer ? (
                                 <span className="ml-auto flex items-center gap-4 whitespace-nowrap">
                                   <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-ds-green-text ds-tabular-nums">
                                     suggested · {currentPrefill!.confidence_pct}%
                                   </span>
                                   {isOriginalAnswer ? (
                                     <span className="text-[13px] font-normal text-ds-ink-secondary">
                                       Previously answered
                                     </span>
                                   ) : (
                                     <ArrowRight
                                       aria-hidden="true"
                                       className={`w-4 h-4 ${semanticIcon} transition-opacity duration-normal ${isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
                                     />
                                   )}
                                 </span>
                               ) : isOriginalAnswer ? (
                                 /* Show "Previously answered" only for original submitted answers, not modified ones */
                                 <span className="ml-auto text-[13px] text-ds-ink-secondary font-normal">
                                   Previously answered
                                 </span>
                               ) : isSelected ? (
                                 <ArrowRight aria-hidden="true" className={`ml-auto w-4 h-4 ${semanticIcon}`} />
                               ) : null}
                             </div>
                             {lockedReason && (
                               <p className="mt-2 text-xs italic text-ds-ink-secondary">
                                 {lockedReason}
                               </p>
                             )}
                           </button>
                       );

                       return answerButton;
                       })}

                     {/* The rationale behind the AI's suggestion, previously a
                         loose tooltip on the whole suggested option. Now a
                         quiet hover affordance under the options; the tooltip
                         itself lives in WhySuggestedTip. */}
                     {(() => {
                       const suggestionApplies =
                         !!currentPrefill?.suggested_answer
                         && (currentPrefill.confidence_pct ?? 0) >= 40
                         && currentQuestionOptions.some(
                           (o) => o.answer_option.toLowerCase() === currentPrefill.suggested_answer,
                         );
                       const rationale = suggestionApplies
                         ? currentPrefill?.answer_rationale?.trim()
                         : null;
                       if (!rationale) return null;
                       return (
                         <div className="pt-1">
                           <WhySuggestedTip
                             rationale={rationale}
                             entityName={taxpayerDisplayName(formatTaxpayerNames(sessionInfo.taxpayer_names))}
                           />
                         </div>
                       );
                     })()}
                    </div>

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
                        isAnswered={!!selectedAnswer}
                        rowStart={
                          <CommentModeToggle
                            value={commentMode}
                            onChange={handleCommentModeChange}
                          />
                        }
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
                        // v9 Unknown branch: when the swarm couldn't derive an
                        // answer (Route B → contextual_hint) and the user picks
                        // Unknown, surface the companion unknown-toelichting in
                        // the existing SuggestionCard. Map it onto
                        // suggested_toelichting so the card renders unchanged;
                        // Accept/Edit still write committed_text on the same row.
                        const unknownToelichtingApplies =
                          selectedAnswer === "Unknown" &&
                          !!currentPrefill?.contextual_hint &&
                          !!currentPrefill?.suggested_toelichting_unknown;
                        const effectivePrefill = aiAppliesToAnswer
                          ? currentPrefill
                          : unknownToelichtingApplies && currentPrefill
                          ? { ...currentPrefill, suggested_toelichting: currentPrefill.suggested_toelichting_unknown }
                          : null;
                        // forceComment / hasTypedComment are hoisted to the
                        // component scope so this guard and the footer buttons
                        // agree: "Always" shows the field on every question, and
                        // a non-empty comment keeps it visible even back in Smart
                        // mode (only empty fields are hidden).
                        const shouldRender =
                          selectedQuestionOption?.requires_explanation
                          || !!effectivePrefill?.suggested_toelichting
                          || !!effectivePrefill?.committed_text
                          || effectivePrefill?.user_action === "accepted"
                          || effectivePrefill?.user_action === "edited"
                          || forceComment
                          || hasTypedComment;
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
                          className="mb-8"
                        >
                          {contextStatus === 'loading' && <ContextSkeleton />}

                          {/* Show the SuggestionCard + textarea whenever we have a
                              ready/idle context status OR an effectivePrefill
                              (Route A match or Route B Unknown companion). The
                              Unknown-toelichting path doesn't go through
                              atad2_context_questions, so contextStatus is often
                              'none' for these rows — we still want to render the
                              card. */}
                          {(contextStatus === 'ready' || contextStatus === 'idle' || !!effectivePrefill || forceComment || hasTypedComment) && (
                            <>
                              {effectivePrefill && currentQuestion && (
                                <SuggestionCard
                                  prefill={effectivePrefill}
                                  userNotes={textareaValue}
                                  onCommit={(next) => updateExplanation(next)}
                                />
                              )}
                              {prefillJob?.status === "failed" && !effectivePrefill && (
                                <div className="rounded-ds-control bg-ds-amber-bg p-3 text-[13px] text-ds-amber-text mb-3">
                                  Couldn't generate suggestions. Continue without them.
                                </div>
                              )}

                              <div className="mb-2 text-[13px] text-ds-ink-secondary">
                                Add your own context (optional)
                              </div>
                              <AutoGrowTextarea
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
                                  selectedAnswer === "Unknown"
                                    ? UNKNOWN_PLACEHOLDERS[seededIndex(`${sessionId}::${currentQuestion?.id}::unknown`, UNKNOWN_PLACEHOLDERS.length)]
                                    : contextPrompts.length > 0
                                    ? (contextPrompts.length === 1
                                        ? contextPrompts[0]
                                        : contextPrompts[seededIndex(`${sessionId}::${currentQuestion?.id}`, contextPrompts.length)]
                                      )
                                    : "Provide context for your answer..."
                                }
                                className={`min-h-[120px] resize-none transition-all duration-200 ${showExplanationShake ? 'explanation-shake' : ''} ${committingExplanation ? 'border-ds-ink bg-ds-fill-muted disabled:opacity-100 disabled:cursor-default' : 'border-ds-hairline bg-ds-card'}`}
                              />
                              {/* Friendly reminder message */}
                              {reminderMessage && (
                                <div className="mt-2 text-[13px] text-ds-ink-secondary italic animate-fade-in">
                                  {reminderMessage}
                                </div>
                              )}
                            </>
                          )}

                          {contextStatus === 'none' && !effectivePrefill && !forceComment && !hasTypedComment && (
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
          </div>
        </div>
        </WizardCard>

      <AssessmentFooterSlot
        left={
          <Button
            onClick={goToPreviousQuestion}
            disabled={questionFlow.length === 0 || (navigationIndex !== -1 && navigationIndex === 0) || loading || isTransitioning}
            variant="secondary"
            className="transition-all duration-fast disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ArrowLeft className="h-4 w-4" />
            Previous
          </Button>
        }
        right={
          <>
            {/* Show Next button only when auto-advance is disabled and navigating */}
            {!autoAdvance && navigationIndex !== -1 && navigationIndex < questionFlow.length - 1 && (
              <Button
                onClick={goToNextQuestion}
                disabled={loading || isTransitioning || isWaitingForPrefill}
                variant="secondary"
                className="transition-all duration-fast disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next
                <ArrowRight className="h-4 w-4" />
              </Button>
            )}

            {/* Show Continue button when at last answered question and auto-advance is disabled */}
            {!autoAdvance && navigationIndex === questionFlow.length - 1 && (
              <Button
                onClick={continueToNextUnanswered}
                disabled={loading || isTransitioning || isWaitingForPrefill}
                variant="secondary"
                className="transition-all duration-fast disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next
                <ArrowRight className="h-4 w-4" />
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
                OR (b) the AI made a >=40% suggestion matching this answer
                (the suggested option is highlighted, never pre-selected; the
                user clicked it) and the question doesn't require explanation
                (the rationale strip is rendered above and the user must click
                Continue).
                The aiAppliesToAnswer gate prevents a Continue-button flash when
                the user picks a non-suggested answer that auto-advances. */}
            {(() => {
              const aiAppliesToAnswer =
                !!currentPrefill?.suggested_answer &&
                !!selectedAnswer &&
                selectedAnswer.toLowerCase() === currentPrefill.suggested_answer;
              // Route B Unknown companion: same condition the panel/gate use.
              // When the user picked Unknown and the swarm staged a paired
              // hint+unknown-toelichting, surface the Continue button so the
              // user can accept/edit then proceed (no auto-advance fires for
              // this branch).
              const unknownRouteBStaged =
                selectedAnswer === "Unknown"
                && !!currentPrefill?.contextual_hint
                && !!currentPrefill?.suggested_toelichting_unknown;
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
                  || unknownRouteBStaged
                  // Whenever the comment field is forced up while the controller
                  // panel is also up (a prefill exists for a different branch),
                  // surface a proceed button — both for "Always" mode and for a
                  // kept comment in Smart mode — so the visible field is never a
                  // dead-end.
                  || (shouldShowContextPanel && (commentMode === "always" || hasTypedComment))
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

              // If we're in normal flow (navigationIndex === -1) and auto-advance
              // would happen, don't show the button — UNLESS a comment has been
              // typed (e.g. typed in Always then switched back to Smart): the
              // kept field must keep its proceed button so it's never stranded.
              if (navigationIndex === -1 && canAutoAdvance(selectedQuestionOption) && !hasTypedComment) {
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

                    // In "Always" mode canAutoAdvance is false, so bypass the
                    // internal auto-advance gate — this is an explicit Next click
                    // and must proceed (the optional comment is already saved via
                    // the store).
                    await submitAnswerDirectly(selectedAnswer, commentMode === "always");
                  }}
                  disabled={loading || isTransitioning}
                  className="transition-all duration-fast disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {navigationIndex === -1 ? (
                    <>
                      Next
                      <ArrowRight className="h-4 w-4" />
                    </>
                  ) : (
                    'Update answer'
                  )}
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
