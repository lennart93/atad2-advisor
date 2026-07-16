
import React, { useEffect, useState, useRef, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ds";
import { toast } from "@/components/ui/sonner";
import { formatDate, formatDateTime } from "@/utils/formatDate";
import { formatFiscalYears } from "@/utils/formatFiscalYears";
import { taxpayerDisplayName, parseTaxpayerNames, dedupeEntityNames } from "@/lib/taxpayer";
import { ArrowLeft, ArrowRight, Loader2, AlertTriangle, Info, CheckCircle, Pencil, X, Check } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { EditableAnswer } from "@/components/EditableAnswer";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import ReactMarkdown from "react-markdown";
import WaitingMessage from "@/components/WaitingMessage";
import DownloadMemoButton from "@/components/DownloadMemoButton";
import MemoFeedbackEditor from "@/components/MemoFeedbackEditor";
import MemoDiffViewer from "@/components/MemoDiffViewer";
import { memoMarkdownComponents, MEMO_PROSE_CLASS, MEMO_REHYPE_PLUGINS } from "@/components/memo/memoProse";
import MissingExplanationsPopover from "@/components/MissingExplanationsPopover";
import { buildDocumentsBlock } from "@/lib/prefill/buildDocumentsBlock";
import { AssessmentFooterSlot } from "@/components/assessment/AssessmentFooterSlot";
import { loadChartSnapshot } from "@/lib/structure/client";
import { loadAppendix } from "@/lib/appendix/client";
import { appendixMemoBlock } from "@/lib/appendix/buildAppendixBlock";
import { loadAppendixSkeleton, useAppendixSkeleton } from "@/lib/appendix/skeletonStore";
import { checkAppendixSync } from "@/lib/appendix/memoSyncGuard";
import { FactsPanel } from "@/components/appendix/FactsPanel";
import { AppendixTable } from "@/components/appendix/AppendixTable";
import { SectionRow } from "@/components/appendix/v2/SectionRow";
import { useSectionOpenState } from "@/components/appendix/v2/hooks";
import { useUiBusySignal } from "@/stores/uiBusyStore";
import { cn } from "@/lib/utils";
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

// Shared uppercase eyebrow label (RULE 2 header rhythm).
const EYEBROW = "text-[11px] font-normal uppercase tracking-[0.16em] text-ds-ink-secondary";

// How many entity chips the roster shows before collapsing behind a
// "Show all {count}" toggle. Large structures (20+ entities) would otherwise
// flood the header.
const ROSTER_CAP = 8;

/**
 * One entity in the "Entities in scope" roster: a hairline-bordered, subtly
 * filled chip carrying the entity name plus two OPTIONAL adornments the design
 * calls for — a short role tag (when role data exists) and a risk marker (a
 * danger dot + tinted border when the entity carries a flagged mismatch). With
 * neither, it renders the name alone.
 */
function EntityChip({
  name,
  role,
  flagged,
}: {
  name: string;
  role?: string | null;
  flagged?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between gap-2 rounded-ds-card border px-3 py-2 ${
        flagged
          ? "border-brand-warning bg-brand-warning-soft"
          : "border-ds-hairline bg-ds-card"
      }`}
    >
      <span className="flex min-w-0 items-center gap-2">
        {flagged && (
          <span
            aria-hidden="true"
            className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand-warning"
          />
        )}
        <span className="truncate text-[14px] text-ds-ink">{name}</span>
      </span>
      {role && (
        <span className="shrink-0 text-[10px] font-medium uppercase tracking-[0.12em] text-ds-ink-tertiary">
          {role}
        </span>
      )}
    </div>
  );
}

// A clean full-width inclusion row for the "Generate memorandum" card: a filled
// sage checkbox + label, rows separated by hairlines. The sage fill maps the
// spec's --sage to the brand's canonical ds-green so the screen stays consistent.
function MemoInclusionRow({
  checked,
  disabled,
  onToggle,
  children,
}: {
  checked: boolean;
  disabled?: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      disabled={disabled}
      onClick={onToggle}
      className="group flex w-full items-center gap-3 py-3 text-left ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ds-accent focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
    >
      <span
        aria-hidden="true"
        className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[3px] border transition-colors ${
          checked
            ? "border-ds-green bg-ds-green"
            : "border-[#cdc7ba] bg-ds-card group-hover:border-ds-ink-tertiary"
        }`}
      >
        {checked && <Check className="h-3 w-3 text-ds-card" strokeWidth={3} />}
      </span>
      <span className="text-[14px] text-ds-ink">{children}</span>
    </button>
  );
}

const AssessmentReport = () => {
  const { sessionId } = useParams<{ sessionId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

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
  const [includeChartInMemo, setIncludeChartInMemo] = useState(true);
  // Per-download appendix choices. null = use the appendix's saved skip flag as the
  // default (appendices default on); local to the download, not persisted.
  const [includeFactsOverride, setIncludeFactsOverride] = useState<boolean | null>(null);
  const [includeChecklistOverride, setIncludeChecklistOverride] = useState<boolean | null>(null);
  // Per-download choice: stamp a diagonal DRAFT watermark on every page of the
  // Word export. On by default; local to the download, not persisted.
  const [includeDraftWatermark, setIncludeDraftWatermark] = useState(true);
  // Roster "Show all" toggle: large structures collapse to ROSTER_CAP chips.
  const [showAllEntities, setShowAllEntities] = useState(false);

  // While the memorandum is generating, spin the top-left brand logo the same
  // way the document analysis, structure and appendix flows do.
  useUiBusySignal(isGeneratingReport);

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
  // The downstream artifacts (structure chart, both appendices, responses) sit in
  // collapse-by-default disclosure cards so the memorandum is the only long-form
  // content. Advisor toggles persist per session (same primitive as appendix V2).
  const { isOpen: ovOpen, setOpen: setOvOpen } = useSectionOpenState(
    sessionId ? `overview:${sessionId}` : undefined,
    { structure: false, appendix1: false, appendix2: false, responses: false },
  );
  // Footer section nav: open the target card first so its content exists, then
  // scroll on the next frame (mirrors ChecklistV2's jump-to-first-flagged).
  const jumpToSection = useCallback(
    (id: string, section?: "structure" | "appendix1" | "appendix2" | "responses") => {
      if (section) setOvOpen(section, true);
      requestAnimationFrame(() => {
        document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    },
    [setOvOpen],
  );
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
        .is("archived_at", null)
        .order("generated_at", { ascending: false })
        .limit(3);

      if (error) throw error;
      return data as ReportData[];
    },
    enabled: !!sessionId && !!user,
  });

  // Query for the finalized structure-chart snapshot. Freshness after an edit is
  // handled at the source: the structure step invalidates this key before it
  // navigates back to the overview, so a plain revisit reuses the cache instead
  // of re-pulling the PNG on every mount.
  const { data: chartSnapshot } = useQuery({
    queryKey: ['report-chart-snapshot', sessionId],
    enabled: !!sessionId,
    staleTime: 5 * 60_000,
    queryFn: () => loadChartSnapshot(sessionId!),
  });

  // Confirmed appendix, loaded so the download options can show per-appendix
  // checkboxes seeded from the saved skip flags, and so Appendix 1/2 render
  // read-only on this page. Freshness after an edit is handled at the source:
  // the appendix step invalidates this key on its return-to-overview button, so
  // a plain revisit reuses the cache instead of re-pulling the full appendix.
  const { data: appendixForDownload } = useQuery({
    queryKey: ['appendix-download', sessionId],
    enabled: !!sessionId,
    staleTime: 5 * 60_000,
    queryFn: () => loadAppendix(sessionId!),
  });

  // Fixed appendix skeleton (the article-by-article rechtskader), needed to
  // render Appendix 2 read-only on this page.
  const { data: appendixSkeleton } = useAppendixSkeleton();

  // Get the most recent report for inline display
  const latestReport = reports?.[0];

  // Appendix availability + the effective per-download include choice. Default on
  // (unless a page was skipped); a local override wins for this download only.
  const appendixConfirmed = appendixForDownload?.review_status === 'confirmed';
  const factsAppendixAvailable = !!appendixConfirmed && (appendixForDownload?.facts?.entities?.length ?? 0) > 0;
  const checklistAppendixAvailable = !!appendixConfirmed && (appendixForDownload?.rows?.some((r) => !r.excludedFromClient) ?? false);
  const includeFactsAppendix = includeFactsOverride ?? !(appendixForDownload?.facts_skipped ?? false);
  const includeChecklistAppendix = includeChecklistOverride ?? !(appendixForDownload?.checklist_skipped ?? false);
  // Date-only label for the memorandum meta line (e.g. "26 June 2026").
  const generatedDateLabel = latestReport?.generated_at
    ? new Date(latestReport.generated_at).toLocaleDateString('en-GB', {
        day: 'numeric', month: 'long', year: 'numeric',
      })
    : '';

  // Sync currentMemoMarkdown with latestReport. The buffer exists to protect
  // accepted-feedback edits, so a freshly generated memo only replaces it when
  // the buffer still equals the report text that seeded it (i.e. the user has
  // no local edits). Without this, regenerating the memo kept showing the OLD
  // text on screen while downloads used the new one.
  const seededReportMdRef = useRef<string | null>(null);
  useEffect(() => {
    const incoming = latestReport?.report_md;
    if (!incoming) return;
    if (!currentMemoMarkdown || currentMemoMarkdown === seededReportMdRef.current || currentMemoMarkdown === incoming) {
      seededReportMdRef.current = incoming;
      if (currentMemoMarkdown !== incoming) setCurrentMemoMarkdown(incoming);
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
  type OutcomeDisplay = {
    text: string;
    /** Fuller phrasing for the hero banner under the page title. */
    heroText: string;
    icon: JSX.Element;
    status: "triggered" | "insufficient" | "complete";
    description: string;
  };

  const getFinalOutcome = (): OutcomeDisplay => {
    if (sessionData?.outcome_overridden && sessionData?.override_outcome) {
      // Map stored outcome string to display text
      const outcomeMap: Record<string, OutcomeDisplay> = {
        'risk_identified': {
          text: "ATAD2 risk identified",
          heroText: "ATAD2 hybrid-mismatch risk identified",
          icon: <AlertTriangle />,
          status: "triggered",
          description: "This outcome was manually selected based on your expert assessment."
        },
        'insufficient_information': {
          text: "Insufficient information",
          heroText: "Insufficient information for a full ATAD2 analysis",
          icon: <Info />,
          status: "insufficient",
          description: "This outcome was manually selected based on your expert assessment."
        },
        'low_risk': {
          text: "No risk identified",
          heroText: "No ATAD2 hybrid-mismatch risk identified",
          icon: <CheckCircle />,
          status: "complete",
          description: "This outcome was manually selected based on your expert assessment."
        }
      };
      return outcomeMap[sessionData.override_outcome] || getRiskOutcome(totalRiskPoints);
    }
    return getRiskOutcome(totalRiskPoints);
  };

  const getRiskOutcome = (points: number): OutcomeDisplay => {
    if (points >= 1.0) {
      return {
        text: "ATAD2 risk identified",
        heroText: "ATAD2 hybrid-mismatch risk identified",
        icon: <AlertTriangle />,
        status: "triggered",
        description: "You can generate a memorandum highlighting potential ATAD2 risk areas for further review."
      };
    } else if (points >= 0.2) {
      return {
        text: "Insufficient information",
        heroText: "Insufficient information for a full ATAD2 analysis",
        icon: <Info />,
        status: "insufficient",
        description: "You can generate a memorandum outlining which information is missing to complete a full ATAD2 analysis."
      };
    } else {
      return {
        text: "No risk identified",
        heroText: "No ATAD2 hybrid-mismatch risk identified",
        icon: <CheckCircle />,
        status: "complete",
        description: "You can generate a memorandum confirming that no ATAD2 hybrid-mismatch risk was identified based on the information provided."
      };
    }
  };

  const riskOutcome = getFinalOutcome();

  // Chrome for the hero outcome banner, from the existing status palette:
  // sage/success = no risk, warning = risk, info = insufficient information.
  const heroTone = {
    triggered: "border-brand-warning bg-brand-warning-soft text-brand-warning-deep",
    insufficient: "border-brand-info bg-brand-info-soft text-brand-info-deep",
    complete: "border-ds-green bg-ds-green-bg text-ds-green-text",
  }[riskOutcome.status];

  // The memo lock also freezes the responses (no edits after generation).
  const responsesLocked = isGeneratingReport || !!latestReport;

  // Calculate answers missing explanations
  const answersWithoutExplanation = answers.filter(answer => {
    const explanation = answer.explanation?.trim();
    return answer.answer && (!explanation || explanation === "No explanation provided");
  });
  const missingExplanationCount = answersWithoutExplanation.length;
  const missingExplanationQuestionIds = answersWithoutExplanation.map(a => a.question_id);

  // Context split for the responses summary strip: how many answers carry
  // reasoning vs. how many still need it. ("Answered / open" carried no signal —
  // every answer is drawn from the documents, so it is always answered.)
  const withExplanationCount = answers.length - missingExplanationCount;
  const needsContextCount = missingExplanationCount;

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

    // The responses live in a collapsed disclosure card: open it first so the
    // question refs exist, then scroll on the next frame.
    setOvOpen('responses', true);
    if (missingExplanationQuestionIds.length > 0) {
      const firstQuestionId = missingExplanationQuestionIds[0];
      requestAnimationFrame(() => {
        questionRefs.current[firstQuestionId]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
    }

    // Remove highlights after 8 seconds
    setTimeout(() => {
      setHighlightedQuestionIds([]);
    }, 8000);
  }, [missingExplanationQuestionIds, setOvOpen]);

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
    let workingToastId: string | number | undefined;

    try {
      console.log('Starting report generation for session:', sessionId);

      // Build the background documents block BEFORE the n8n call so we can pass
      // it through. Documents are retained after generation (dossier replatform
      // slice 1), so a failed call can always be retried without re-uploading.
      let documentsBlock = "";
      try {
        // Memo generation runs through n8n which is text-only — images stay
        // out of the documents_block but their content already lives in the
        // accepted prefill suggestions, so the memo doesn't lose anything.
        const bundle = await buildDocumentsBlock(sessionId);
        documentsBlock = bundle.textBlock;
      } catch (e) {
        console.warn('[generate-report] buildDocumentsBlock failed, continuing without docs', e);
      }
      console.log('[generate-report] documents_block bytes:', documentsBlock.length);

      // Feed the confirmed technical appendix into the memo so the narrative
      // agrees with the article-by-article analysis. Reference column is excluded.
      // Hard rule 0.1: never build a memo from a stale or unconfirmed appendix.
      // Block and ask the advisor to regenerate/confirm first.
      let confirmedAppendix: string | null = null;
      try {
        const [appendix, appendixSkeleton] = await Promise.all([loadAppendix(sessionId), loadAppendixSkeleton()]);
        const sync = checkAppendixSync(appendix);
        if (!sync.ok) {
          toast.error("Appendix not ready", { description: sync.reason });
          setIsGeneratingReport(false);
          return;
        }
        confirmedAppendix = appendixMemoBlock(appendix!, appendixSkeleton);
      } catch (e) {
        console.warn('[generate-report] appendix sync check failed', e);
        toast.error("Could not verify the appendix", {
          description: "The appendix could not be read to check it is in sync. Please try again in a moment.",
        });
        setIsGeneratingReport(false);
        return;
      }

      workingToastId = toast.working("Generating memorandum", {
        description: "Assembling sections and appendices. This can take a minute.",
      });

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
          confirmed_appendix: confirmedAppendix,
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

      // Refresh reports query to show the newly created report
      queryClient.invalidateQueries({ queryKey: ["reports", sessionId] });

      {
        const subjectName =
          (sessionData as unknown as { entity_name?: string | null })?.entity_name ||
          taxpayerDisplayName(sessionData?.taxpayer_name) ||
          "this session";
        toast.success("Memorandum generated", {
          id: workingToastId,
          description: `Memo for ${subjectName} is ready to download.`,
        });
      }

    } catch (error: any) {
      console.error('Error generating report:', error);
      
      // Check if it's a timeout/abort error
      if (error.name === 'AbortError') {
        toast.error("Request timed out", {
          id: workingToastId,
          description: "The memorandum generation is taking longer than expected. Please wait a moment and refresh the page to check if it completed.",
        });
      } else if (error.message?.includes('Failed to fetch') || error.message?.includes('NetworkError')) {
        // Network error - might still be processing
        toast.error("Connection issue", {
          id: workingToastId,
          description: "Lost connection during generation. The memo may still be processing. Refresh in a minute to check.",
        });
      } else {
        toast.error("Generation failed", {
          id: workingToastId,
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
        <p role="status" className="text-[15px] text-ds-ink-secondary">Loading assessment report...</p>
      </div>
    );
  }

  if (!sessionData) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="text-center">
          <p className="text-[15px] text-ds-ink-secondary">Assessment not found</p>
          <Button variant="secondary" onClick={() => navigate("/")} className="mt-4">
            Return to dashboard
          </Button>
        </div>
      </div>
    );
  }

  // The assessment as a named container with its entities as scannable contents.
  // The stored taxpayer_name is a newline-joined list of the entities assessed
  // together; dedupe it before counting or listing (the list can repeat a name).
  const entityNames = dedupeEntityNames(parseTaxpayerNames(sessionData.taxpayer_name));
  const entityCount = entityNames.length;
  const isMultiEntity = entityCount > 1;
  // Title + STRUCTURE field, in order of preference: a group/structure name (no
  // such field exists in the schema yet), then a designated lead entity (none is
  // flagged; the list has no lead marker), then the first entity. So both fall
  // back to the first entity, which is also the correct single-entity behaviour.
  const leadEntity =
    entityNames[0] || taxpayerDisplayName(sessionData.taxpayer_name) || "Assessment";
  // Collapse only when it hides at least two chips; a "Show all" that reveals
  // a single extra chip is sillier than just showing the chip.
  const rosterCollapses = entityNames.length > ROSTER_CAP + 1;
  const visibleEntities =
    showAllEntities || !rosterCollapses ? entityNames : entityNames.slice(0, ROSTER_CAP);

  // Shared "Improve memo" action. On desktop it lives in the metadata rail
  // (under Generated); on mobile the rail is hidden, so a copy sits in the
  // memo header instead. Only rendered while a memo exists and we are not
  // already in feedback/diff mode.
  const improveMemoButton = (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex shrink-0">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setIsFeedbackMode(true)}
            disabled={hasAcceptedChanges}
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
  );

  return (
    <div>
        <div className="space-y-6">
          {/* Memorandum cover */}
          <section className="space-y-6">
            <div className="space-y-3">
              {/* The dossier chip is hidden on this step, so the year lives
                  here: the one glanceable "which file" line above the title. */}
              <span className={EYEBROW}>
                Assessment report <span aria-hidden="true">·</span>{" "}
                <span className="ds-tabular-nums">FY{formatFiscalYears(sessionData.fiscal_year)}</span>
              </span>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                {/* The container title. No serif face exists in the system; the
                    title keeps the Neue Haas Grotesk Display treatment already
                    used for this H1. Falls back to the lead/first entity. */}
                <h1 className="text-4xl font-normal leading-[1.02] tracking-[-0.02em] text-ds-ink sm:text-5xl">
                  {leadEntity}
                </h1>
              </div>
              {/* The conclusion is the page's answer, so it reads directly under
                  the title as a hero banner instead of the smallest metadata cell. */}
              <div className={`inline-flex items-center gap-2.5 rounded-ds-control border px-3.5 py-2 ${heroTone}`}>
                {React.cloneElement(riskOutcome.icon, {
                  className: "h-4 w-4 shrink-0",
                  "aria-hidden": true,
                })}
                <span className="text-[15px] font-medium">{riskOutcome.heroText}</span>
                {sessionData.outcome_overridden && (
                  <span className="text-[12px] font-normal opacity-80">(adjusted)</span>
                )}
              </div>
              <p className="max-w-2xl text-[15px] text-ds-ink-secondary">
                The ATAD2 position for this structure, ready to compile into a memorandum.
              </p>
            </div>

            {/* The structure name is the page title and the outcome is the hero
                banner, so the row carries only what is stated nowhere else:
                the entity count, the year and the completion moment. */}
            <dl className="grid grid-cols-2 gap-x-6 gap-y-4 border-t border-ds-ink pt-4 sm:grid-cols-3">
              <div>
                <dt className={EYEBROW}>Entities in scope</dt>
                <dd className="mt-1.5 text-[15px] tabular-nums text-ds-ink">{entityCount}</dd>
              </div>
              <div>
                <dt className={EYEBROW}>Tax year</dt>
                <dd className="mt-1.5 text-[15px] tabular-nums text-ds-ink">{formatFiscalYears(sessionData.fiscal_year)}</dd>
              </div>
              <div>
                <dt className={EYEBROW}>Completed</dt>
                <dd className="mt-1.5 text-[15px] tabular-nums text-ds-ink">{formatDateTime(sessionData.created_at)}</dd>
              </div>
            </dl>

            {/* Entities in scope. Only shown for a multi-entity assessment; a
                single-entity one is fully described by the title + STRUCTURE
                field. A responsive chip grid, capped at ROSTER_CAP with a
                Show-all toggle for large structures. */}
            {isMultiEntity && (
              <div className="border-t border-ds-hairline pt-4">
                <p className={`${EYEBROW} mb-3`}>Entities in scope</p>
                <div className="grid gap-2 grid-cols-[repeat(auto-fit,minmax(185px,1fr))]">
                  {visibleEntities.map((name, i) => (
                    <EntityChip
                      key={`${name}-${i}`}
                      name={name}
                      // TODO(roster-role): entity roles are modeled on the
                      // FactEntity register (appendix facts) for the whole
                      // structure, not on the taxpayer-subject list that drives
                      // this roster. Wire a name-matched lookup here once the
                      // facts appendix is a reliable header dependency.
                      role={undefined}
                      // TODO(roster-risk): per-entity risk is not modeled. The
                      // assessment result carries a single aggregate outcome and
                      // per-condition appendix rows, not a per-entity mismatch
                      // flag. Wire the marker here once a per-entity flag exists;
                      // omitted rather than fabricated for now.
                      flagged={undefined}
                    />
                  ))}
                </div>
                {rosterCollapses && (
                  <button
                    type="button"
                    onClick={() => setShowAllEntities((v) => !v)}
                    className="mt-3 text-[13px] text-ds-ink-secondary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ds-accent focus-visible:ring-offset-2"
                  >
                    {showAllEntities ? "Show fewer" : `Show all ${entityCount}`}
                  </button>
                )}
              </div>
            )}

            {sessionData.is_custom_period && sessionData.period_start_date && sessionData.period_end_date && (
              <p className="text-[13px] text-ds-ink-secondary">
                Period:{" "}
                <span className="tabular-nums">
                  {formatDate(sessionData.period_start_date)} - {formatDate(sessionData.period_end_date)}
                </span>
              </p>
            )}

            <p className="max-w-2xl text-[13px] text-ds-ink-secondary">{riskOutcome.description}</p>

              {/* Reasoning and additions - full width grid below the main content */}
              {(sessionData.outcome_overridden && sessionData.override_reason) || sessionData.additional_context ? (
                <div className={`grid gap-3 ${
                  sessionData.outcome_overridden && sessionData.override_reason && sessionData.additional_context 
                    ? 'grid-cols-1 md:grid-cols-2' 
                    : 'grid-cols-1'
                }`}>
                  {sessionData.outcome_overridden && sessionData.override_reason && (
                    <div className="bg-ds-fill-muted rounded-ds-control p-4 overflow-hidden">
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-[13px] font-normal text-ds-ink-secondary">Your reasoning:</p>
                        {!isEditingReasoning && (
                          latestReport || isGeneratingReport ? (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button variant="ghost" size="sm" disabled className="h-6 w-6 p-0">
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
                            className="min-h-[80px] text-[15px]"
                          />
                          {editedReasoning.trim().length < 100 && (
                            <p className="text-[13px] text-ds-ink-secondary tabular">
                              {100 - editedReasoning.trim().length} more characters needed
                            </p>
                          )}
                          <div className="flex gap-2">
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={handleSaveReasoning}
                              disabled={editedReasoning.trim().length < 100 || isSavingReasoning}
                              className="h-7"
                            >
                              {isSavingReasoning ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3 mr-1" />}
                              Save
                            </Button>
                            <Button
                              variant="ghost"
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
                        <p className="text-[13px] break-words">{sessionData.override_reason}</p>
                      )}
                    </div>
                  )}
                  {sessionData.additional_context && (
                    <div className="bg-ds-fill-muted rounded-ds-control p-4 overflow-hidden">
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-[13px] font-normal text-ds-ink-secondary">Your additions:</p>
                        {!isEditingContext && (
                          latestReport || isGeneratingReport ? (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button variant="ghost" size="sm" disabled className="h-6 w-6 p-0">
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
                            className="min-h-[80px] text-[15px]"
                          />
                          <div className="flex gap-2">
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={handleSaveContext}
                              disabled={isSavingContext}
                              className="h-7"
                            >
                              {isSavingContext ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3 mr-1" />}
                              Save
                            </Button>
                            <Button
                              variant="ghost"
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
                        <p className="text-[13px] break-words">{sessionData.additional_context}</p>
                      )}
                    </div>
                  )}
                </div>
              ) : null}
          </section>

          {/* Generate Report Button — brought into the terracotta-top card family */}
          <Card>
            <CardHeader className="space-y-1.5">
              <CardTitle as="h2">Generate memorandum</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-5">
                {latestReport && (
                  <div>
                    <p className="mb-1 text-[11px] font-normal uppercase tracking-[0.07em] text-ds-ink-tertiary">
                      Include in the memorandum
                    </p>
                    <div className="grid grid-cols-1 gap-x-8 border-y border-ds-hairline sm:grid-cols-2">
                      <div className="divide-y divide-ds-hairline">
                        {chartSnapshot?.snapshot_png && (
                          <MemoInclusionRow
                            checked={includeChartInMemo}
                            disabled={isGeneratingReport}
                            onToggle={() => setIncludeChartInMemo(!includeChartInMemo)}
                          >
                            Structure chart
                          </MemoInclusionRow>
                        )}
                        <MemoInclusionRow
                          checked={includeDraftWatermark}
                          disabled={isGeneratingReport}
                          onToggle={() => setIncludeDraftWatermark(!includeDraftWatermark)}
                        >
                          DRAFT watermark
                        </MemoInclusionRow>
                      </div>
                      <div className="divide-y divide-ds-hairline">
                        {factsAppendixAvailable && (
                          <MemoInclusionRow
                            checked={includeFactsAppendix}
                            disabled={isGeneratingReport}
                            onToggle={() => setIncludeFactsOverride(!includeFactsAppendix)}
                          >
                            Appendix 1 · Facts &amp; relationships
                          </MemoInclusionRow>
                        )}
                        {checklistAppendixAvailable && (
                          <MemoInclusionRow
                            checked={includeChecklistAppendix}
                            disabled={isGeneratingReport}
                            onToggle={() => setIncludeChecklistOverride(!includeChecklistAppendix)}
                          >
                            Appendix 2 · Condition assessment
                          </MemoInclusionRow>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <MissingExplanationsPopover
                      missingCount={missingExplanationCount}
                      isOpen={showMissingExplanationsPopover}
                      onOpenChange={setShowMissingExplanationsPopover}
                      onGenerateAnyway={handleGenerateAnyway}
                      onReviewQuestions={handleReviewQuestions}
                      onTriggerClick={handleGenerateAnyway}
                    >
                      <Button
                        variant="primary"
                        size="lg"
                        onClick={handleGenerateButtonClick}
                        // Lock once a memo exists: the button stays visible but
                        // dimmed (disabled:opacity-50) and unclickable. No
                        // regeneration after the first run.
                        disabled={isGeneratingReport || !!latestReport}
                      >
                        {isGeneratingReport ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Generating memorandum…
                          </>
                        ) : (
                          <>
                            Generate memorandum
                            <ArrowRight />
                          </>
                        )}
                      </Button>
                    </MissingExplanationsPopover>

                    <DownloadMemoButton
                      sessionId={sessionId!}
                      memoMarkdown={displayMemo}
                      enabled={!!latestReport}
                      disabled={isApplyingFeedback}
                      // Only embed the chart when there is a saved snapshot AND the
                      // chip is on; otherwise the template's {{#hasStructureChart}}
                      // block drops the structure-overview section cleanly.
                      includeChart={includeChartInMemo && !!chartSnapshot?.snapshot_png}
                      includeFactsAppendix={includeFactsAppendix}
                      includeChecklistAppendix={includeChecklistAppendix}
                      draftWatermark={includeDraftWatermark}
                    />

                    {latestReport && (
                      // Status only; the generated timestamp is stated once, in
                      // the memorandum's metadata rail.
                      <p className="flex items-center gap-1.5 text-[13px] text-ds-green-text">
                        <CheckCircle className="h-3.5 w-3.5" aria-hidden="true" />
                        Generated
                      </p>
                    )}
                  </div>

                  {isGeneratingReport && (
                    <WaitingMessage />
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Memorandum. No `overflow-hidden` on the section: an overflow
              ancestor would become the sticky metadata rail's scroll container
              and break its pin. The card corners still clip visually because
              nothing inside reaches them (content is inset by the padding). */}
          {latestReport && (
            <section id="ov-memo" className="rounded-ds-card border border-ds-hairline bg-ds-card">
              <div className="flex flex-col gap-8 p-8 md:px-14 md:py-12">
                {/* Editorial reader header. On desktop the title moves into the
                    sticky rail (below) so it pins with the metadata while the
                    prose scrolls; this full-width copy is kept for mobile (no
                    rail there) and for diff mode (which replaces the grid). */}
                {displayMemo && sessionData && (
                  <header className={`space-y-2 ${isDiffMode ? "" : "md:hidden"}`}>
                    <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-ds-ink-tertiary">
                      Memorandum
                    </p>
                    <h2 className="text-[30px] font-medium leading-[1.12] tracking-[-0.018em] text-ds-ink">
                      ATAD2 assessment memorandum
                    </h2>
                    {!isFeedbackMode && !isDiffMode && (
                      <div className="pt-3 md:hidden">{improveMemoButton}</div>
                    )}
                  </header>
                )}

                {isDiffMode && originalMemoBeforeFeedback && revisedMemoFromFeedback ? (
                  <MemoDiffViewer
                    originalMemo={originalMemoBeforeFeedback}
                    revisedMemo={revisedMemoFromFeedback}
                    onAccept={handleAcceptChanges}
                    onReject={handleRejectChanges}
                  />
                ) : displayMemo && sessionData ? (
                  <div className="grid grid-cols-1 items-start gap-x-[52px] gap-y-8 md:grid-cols-[210px_minmax(0,1fr)]">
                    {/* Metadata rail, left column. Sticky (self-start so it keeps
                        its content height and has room to move) and identical in
                        read and edit; only the footer swaps the action for an
                        EDITING mark. The title lives here on desktop so it pins
                        together with the metadata as the prose scrolls. */}
                    <aside className="hidden md:sticky md:top-8 md:flex md:flex-col md:self-start">
                      <div className="mb-5">
                        <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-ds-ink-tertiary">
                          Memorandum
                        </p>
                        <h2 className="mt-2 text-[22px] font-medium leading-[1.16] tracking-[-0.015em] text-ds-ink">
                          ATAD2 assessment memorandum
                        </h2>
                      </div>
                      <div className="mb-4 border-b border-ds-hairline pb-4">
                        <p className={`${EYEBROW} mb-1.5`}>Prepared for</p>
                        {dedupeEntityNames(parseTaxpayerNames(sessionData.taxpayer_name)).map((name) => (
                          <p key={name} className="text-sm leading-relaxed text-ds-ink">{name}</p>
                        ))}
                      </div>
                      <div className="mb-4 border-b border-ds-hairline pb-4">
                        <p className={`${EYEBROW} mb-1.5`}>Fiscal year</p>
                        <p className="text-sm text-ds-ink">{formatFiscalYears(sessionData.fiscal_year)}</p>
                      </div>
                      <div className={isFeedbackMode ? "mb-4 border-b border-ds-hairline pb-4" : ""}>
                        <p className={`${EYEBROW} mb-1.5`}>Generated</p>
                        <p className="text-sm text-ds-ink">{generatedDateLabel}</p>
                      </div>
                      {isFeedbackMode ? (
                        <div className="flex items-center gap-2">
                          <span
                            className="h-1.5 w-1.5 rounded-full bg-brand-terracotta animate-[pulse_2.4s_cubic-bezier(0.4,0,0.6,1)_infinite]"
                            aria-hidden="true"
                          />
                          <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-brand-terracotta-deep">
                            Editing
                          </span>
                        </div>
                      ) : (
                        <div className="mt-6">{improveMemoButton}</div>
                      )}
                    </aside>

                    {/* Right reading column. In edit mode the feedback tool docks in
                        here so it shares the prose's exact left/right edges; in read
                        mode it holds the outcome callout and the memo prose. */}
                    <div className="flex flex-col gap-7">
                      {isFeedbackMode ? (
                        <MemoFeedbackEditor
                          memoMarkdown={displayMemo}
                          sessionId={sessionId!}
                          taxpayerName={taxpayerDisplayName(sessionData.taxpayer_name)}
                          fiscalYear={sessionData.fiscal_year}
                          onFeedbackSubmitted={handleFeedbackSubmitted}
                          onCancel={() => setIsFeedbackMode(false)}
                          onSubmittingChange={setIsApplyingFeedback}
                        />
                      ) : (
                        // Memo prose, shared renderer so it matches edit mode. The
                        // outcome is stated once, on the cover summary; the reading
                        // measure is capped (~68ch) for long-form legal prose.
                        <div className={cn(MEMO_PROSE_CLASS, "max-w-[68ch]")}>
                          <ReactMarkdown rehypePlugins={MEMO_REHYPE_PLUGINS} components={memoMarkdownComponents}>
                            {displayMemo}
                          </ReactMarkdown>
                        </div>
                      )}
                    </div>
                  </div>
                ) : null}
              </div>
            </section>
          )}

          {/* Structure chart snapshot. Collapsed by default; the PNG mounts only
              on expand so a plain visit stays a one-line row. */}
          {(chartSnapshot?.snapshot_png || chartSnapshot?.finalized_at) && (
            <SectionRow
              id="ov-structure"
              index=""
              title="Structure chart"
              action={
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => navigate(`/assessment/structure/${sessionId}?from=overview`)}
                >
                  <Pencil className="h-3.5 w-3.5 mr-1.5" />
                  Edit
                </Button>
              }
              open={ovOpen("structure")}
              onToggle={() => setOvOpen("structure", !ovOpen("structure"))}
            >
              {chartSnapshot?.snapshot_png ? (
                <div className="bg-ds-page border border-ds-hairline rounded-ds-control p-4">
                  <img
                    src={chartSnapshot.snapshot_png}
                    alt="Structure chart for this assessment"
                    className="mx-auto max-h-[480px] w-auto"
                  />
                </div>
              ) : (
                <p className="text-[13px] text-ds-ink-secondary">
                  Structure chart snapshot unavailable for this assessment.
                </p>
              )}
            </SectionRow>
          )}

          {/* Appendix 1 · Facts & relationships. Read-only, collapsed by default;
              the heavy embedded panel mounts only on expand. The Edit button
              reopens the appendix step (facts page), matching the structure chart. */}
          {factsAppendixAvailable && appendixForDownload?.facts && (
            <SectionRow
              id="ov-appendix1"
              index=""
              title="Appendix 1 · Facts & relationships"
              action={
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => navigate(`/assessment-appendix/${sessionId}?from=overview`)}
                >
                  <Pencil className="h-3.5 w-3.5 mr-1.5" />
                  Edit
                </Button>
              }
              open={ovOpen("appendix1")}
              onToggle={() => setOvOpen("appendix1", !ovOpen("appendix1"))}
            >
              <FactsPanel facts={appendixForDownload.facts} generated embedded />
            </SectionRow>
          )}

          {/* Appendix 2 · Condition assessment. Read-only, collapsed by default;
              the table mounts only on expand. The Edit button reopens the
              appendix step (checklist page). */}
          {checklistAppendixAvailable && appendixForDownload && appendixSkeleton && (
            <SectionRow
              id="ov-appendix2"
              index=""
              title="Appendix 2 · Condition assessment"
              action={
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => navigate(`/assessment-appendix/${sessionId}/checklist?from=overview`)}
                >
                  <Pencil className="h-3.5 w-3.5 mr-1.5" />
                  Edit
                </Button>
              }
              open={ovOpen("appendix2")}
              onToggle={() => setOvOpen("appendix2", !ovOpen("appendix2"))}
            >
              <AppendixTable
                rows={appendixForDownload.rows}
                skeleton={appendixSkeleton}
                showSources
                relatedParties={null}
                readOnly
                embedded
              />
            </SectionRow>
          )}

          {/* Question responses · the draft questionnaire behind this assessment.
              Editable until a memorandum exists; locked read-only afterwards.
              Collapsed by default; handleReviewQuestions opens it before jumping. */}
          {answers.length > 0 && (
            <SectionRow
              id="ov-responses"
              index=""
              title="Question responses"
              action={
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={responsesLocked}
                  onClick={() => setOvOpen("responses", true)}
                >
                  <Pencil className="h-3.5 w-3.5 mr-1.5" />
                  Edit
                </Button>
              }
              open={ovOpen("responses")}
              onToggle={() => setOvOpen("responses", !ovOpen("responses"))}
            >
              <p className="mb-5 text-[13px] text-ds-ink-secondary">
                {responsesLocked
                  ? "Responses are locked and can no longer be edited because a memorandum has been (or is being) generated."
                  : "The draft questionnaire answers drawn from the documents. Use the edit button next to any answer to make changes."}
              </p>
              <div className="space-y-6">
                  {answers.map((answer) => {
                    const isHighlighted = highlightedQuestionIds.includes(answer.question_id);
                    const isMissingExplanation = missingExplanationQuestionIds.includes(answer.question_id);

                    return (
                      <div
                        key={answer.id}
                        ref={(el) => { questionRefs.current[answer.question_id] = el; }}
                        className={`transition-all duration-500 rounded-ds-control ${
                          isHighlighted
                            ? 'border-l-2 border-ds-hairline bg-ds-fill-muted pl-4 -ml-4'
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
                          readOnly={responsesLocked}
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
            </SectionRow>
          )}
        </div>

        <AssessmentFooterSlot
          left={
            <Button variant="secondary" onClick={() => navigate('/')}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to dashboard
            </Button>
          }
          center={
            /* Slim in-page section nav; the footer bar is sticky, so this stays
               visible while the memo scrolls. Items open their card, then jump. */
            <nav aria-label="On this page" className="hidden items-center gap-4 text-[12.5px] text-ds-ink-secondary lg:flex">
              {latestReport && (
                <button type="button" onClick={() => jumpToSection("ov-memo")} className="transition-colors hover:text-ds-ink">
                  Memorandum
                </button>
              )}
              {(chartSnapshot?.snapshot_png || chartSnapshot?.finalized_at) && (
                <button type="button" onClick={() => jumpToSection("ov-structure", "structure")} className="transition-colors hover:text-ds-ink">
                  Structure
                </button>
              )}
              {factsAppendixAvailable && (
                <button type="button" onClick={() => jumpToSection("ov-appendix1", "appendix1")} className="transition-colors hover:text-ds-ink">
                  Appendix 1
                </button>
              )}
              {checklistAppendixAvailable && (
                <button type="button" onClick={() => jumpToSection("ov-appendix2", "appendix2")} className="transition-colors hover:text-ds-ink">
                  Appendix 2
                </button>
              )}
              {answers.length > 0 && (
                <button type="button" onClick={() => jumpToSection("ov-responses", "responses")} className="transition-colors hover:text-ds-ink">
                  Responses
                </button>
              )}
            </nav>
          }
        />
    </div>
  );
};

export default AssessmentReport;
