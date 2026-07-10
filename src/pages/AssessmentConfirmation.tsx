import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ds";
import { WizardCard } from "@/components/assessment/WizardCard";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/sonner";
import { AssessmentFooterSlot } from "@/components/assessment/AssessmentFooterSlot";
import { cn } from "@/lib/utils";
import { TaxpayerSubject } from "@/components/TaxpayerSubject";
import { ArrowLeft, ArrowRight, AlertTriangle, Check, Info, CheckCircle, Pencil, ChevronDown } from "lucide-react";

type OutcomeType = 'risk_identified' | 'insufficient_information' | 'low_risk';

interface SessionData {
  session_id: string;
  taxpayer_name: string;
  preliminary_outcome: OutcomeType | null;
  outcome_confirmed: boolean;
}

/** A questionnaire response that carries risk, i.e. one of the reasons the
 *  preliminary outcome landed where it did. */
interface DriverAnswer {
  question_id: string;
  question_text: string;
  answer: string;
  explanation: string | null;
  risk_points: number;
}

/** Small uppercase section label, matching the restyled wizard-card screens. */
const EYEBROW = "text-[11px] font-medium uppercase tracking-[0.16em] text-ds-ink-secondary";

const outcomeConfig: Record<
  OutcomeType,
  {
    label: string;
    /** One-line, plain-language reading of what the outcome means. */
    subtitle: string;
    icon: typeof AlertTriangle;
    /** Round-token tint + icon colour on the preliminary outcome block. */
    tokenBg: string;
    tokenFg: string;
    /** Alternative-outcome card: one-line consequence shown under the title. */
    description: string;
    /** Persistent icon colour on the card (the card's colour anchor). */
    cardIcon: string;
    /** Selected-card styling, colour-matched to the outcome. */
    cardSelBorder: string;
    cardSelBg: string;
    cardSelTitle: string;
    /** Border + fill of the radio when this card is selected. */
    cardRadio: string;
    /** Hover border on an unselected card. */
    cardHover: string;
  }
> = {
  low_risk: {
    label: "No risk identified",
    subtitle: "No hybrid mismatch was identified on the responses given.",
    icon: CheckCircle,
    tokenBg: "bg-ds-green-bg",
    tokenFg: "text-ds-green",
    description:
      "No hybrid mismatch is present, so there is nothing to report in the memorandum.",
    cardIcon: "text-ds-green",
    cardSelBorder: "border-ds-green",
    cardSelBg: "bg-ds-green-bg",
    cardSelTitle: "text-ds-green-text",
    cardRadio: "border-ds-green text-ds-green",
    cardHover: "hover:border-ds-green",
  },
  risk_identified: {
    label: "ATAD2 risk identified",
    subtitle: "A potential hybrid mismatch fires on the responses given.",
    icon: AlertTriangle,
    tokenBg: "bg-ds-amber-bg",
    tokenFg: "text-ds-amber",
    description:
      "A hybrid mismatch is present and should be reported in the memorandum.",
    cardIcon: "text-ds-amber",
    cardSelBorder: "border-ds-amber",
    cardSelBg: "bg-ds-amber-bg",
    // Amber is the ATAD2 risk colour (terracotta is reserved for the active
    // wizard step + chart focus node). Title stays ink to keep AA on the amber
    // fill in both themes; border, fill, icon and radio carry the amber identity.
    cardSelTitle: "text-ds-ink",
    cardRadio: "border-ds-amber text-ds-amber",
    cardHover: "hover:border-ds-amber",
  },
  insufficient_information: {
    label: "Insufficient information",
    subtitle: "The responses leave the ATAD2 position open.",
    icon: Info,
    // Slate everywhere: "Insufficient information" reads slate-blue on both the
    // top block and the card, matching the appendix's "Insufficient info" status.
    tokenBg: "bg-ds-blue-bg",
    tokenFg: "text-ds-blue",
    description:
      "The file cannot yet settle the outcome; more is needed before it can be concluded.",
    cardIcon: "text-ds-blue",
    cardSelBorder: "border-ds-blue",
    cardSelBg: "bg-ds-blue-bg",
    cardSelTitle: "text-ds-blue-text",
    cardRadio: "border-ds-blue text-ds-blue",
    cardHover: "hover:border-ds-blue",
  },
};

const AssessmentConfirmation = () => {
  const { sessionId } = useParams<{ sessionId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [sessionData, setSessionData] = useState<SessionData | null>(null);
  const [drivers, setDrivers] = useState<DriverAnswer[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Which driver rows are expanded to show their full draft answer. Collapsed
  // rows clamp the explanation to two lines; a click reveals the rest.
  const [openDrivers, setOpenDrivers] = useState<Set<string>>(new Set());
  const toggleDriver = (id: string) =>
    setOpenDrivers((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  // Override flow state
  const [showOverrideForm, setShowOverrideForm] = useState(false);
  const [overrideReason, setOverrideReason] = useState("");
  const [selectedOverrideOutcome, setSelectedOverrideOutcome] = useState<OutcomeType | null>(null);

  // Additional context flow state
  const [showContextForm, setShowContextForm] = useState(false);
  const [additionalContext, setAdditionalContext] = useState("");
  const [pendingConfirmType, setPendingConfirmType] = useState<'confirm' | 'override' | null>(null);
  const [suggestedAdditionalContext, setSuggestedAdditionalContext] = useState<string | null>(null);
  const [suggestedAccepted, setSuggestedAccepted] = useState(false);


  // Validation
  const MIN_REASON_LENGTH = 100;
  const reasonCharCount = overrideReason.trim().length;
  const isReasonValid = reasonCharCount >= MIN_REASON_LENGTH;
  const isOverrideValid = isReasonValid && selectedOverrideOutcome && selectedOverrideOutcome !== sessionData?.preliminary_outcome;
  const contextCharCount = additionalContext.trim().length;

  useEffect(() => {
    if (!user) {
      navigate("/auth");
      return;
    }
    if (sessionId) {
      loadSessionData();
      loadSuggestedAdditionalContext();
      loadDrivingAnswers();
    }
  }, [user, sessionId]);

  /** The responses that carry risk, biggest driver first. These are the
   *  reasons a "risk identified" or "insufficient information" outcome fired,
   *  surfaced so the advisor can sanity-check the outcome against them. */
  const loadDrivingAnswers = async () => {
    if (!sessionId) return;
    const { data } = await supabase
      .from("atad2_answers")
      .select("question_id, question_text, answer, explanation, risk_points")
      .eq("session_id", sessionId)
      .gt("risk_points", 0)
      .order("risk_points", { ascending: false });
    if (data) setDrivers(data as DriverAnswer[]);
  };

  const loadSuggestedAdditionalContext = async () => {
    if (!sessionId) return;
    const { data } = await supabase
      .from("atad2_prefill_jobs")
      .select("suggested_additional_context")
      .eq("session_id", sessionId)
      .maybeSingle();
    if (data?.suggested_additional_context) {
      setSuggestedAdditionalContext(data.suggested_additional_context);
    }
  };

  const loadSessionData = async () => {
    if (!sessionId || !user) return;

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('atad2_sessions')
        .select('session_id, taxpayer_name, preliminary_outcome, outcome_confirmed')
        .eq('session_id', sessionId)
        .eq('user_id', user.id)
        .single();

      if (error) throw error;

      // Note: we deliberately do NOT bounce an already-confirmed session ahead
      // to the appendix. The stepper lets the advisor click back to Confirmation
      // to review or re-adjust the outcome; auto-redirecting made that tile look
      // broken (it landed on Appendix instead). Re-confirming here moves forward
      // again. Resume routing is handled by resumeUrlForSession, not this guard.

      // If no preliminary outcome, something went wrong - redirect back
      if (!data.preliminary_outcome) {
        toast.error("Error", { description: "No preliminary outcome found. Please complete the assessment first." });
        navigate("/");
        return;
      }

      setSessionData(data as SessionData);
    } catch (error) {
      console.error('Error loading session:', error);
      toast.error("Error", { description: "Failed to load session data" });
      navigate("/");
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = () => {
    // Show the optional context form instead of immediately saving
    setPendingConfirmType('confirm');
    setShowContextForm(true);
  };

  const handleFinalConfirm = async (skipContext: boolean = false) => {
    if (!sessionId || !user) return;

    setSubmitting(true);
    try {
      const updateData: Record<string, any> = {
        outcome_confirmed: true,
        confirmed_at: new Date().toISOString()
      };

      // Add the additional context if provided
      if (!skipContext && additionalContext.trim()) {
        updateData.additional_context = additionalContext.trim();
      }

      // Handle override vs regular confirm
      if (pendingConfirmType === 'override') {
        updateData.outcome_overridden = true;
        updateData.override_reason = overrideReason.trim();
        updateData.override_outcome = selectedOverrideOutcome;
      } else {
        updateData.outcome_overridden = false;
      }

      const { error } = await supabase
        .from('atad2_sessions')
        .update(updateData)
        .eq('session_id', sessionId)
        .eq('user_id', user.id);

      if (error) throw error;

      navigate(`/assessment-appendix/${sessionId}`);
    } catch (error) {
      console.error('Error confirming outcome:', error);
      toast.error("Error", { description: "Failed to confirm outcome" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleAdjust = () => {
    setShowOverrideForm(true);
  };

  const handleConfirmOverride = () => {
    if (!isOverrideValid) return;
    // Show the optional context form instead of immediately saving
    setPendingConfirmType('override');
    setShowContextForm(true);
  };

  const handleCancelOverride = () => {
    setShowOverrideForm(false);
    setOverrideReason("");
    setSelectedOverrideOutcome(null);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <p className="text-[13px] text-ds-ink-secondary">Loading...</p>
      </div>
    );
  }

  if (!sessionData || !sessionData.preliminary_outcome) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <p className="text-[13px] text-ds-ink-secondary">Session not found</p>
        <Button variant="secondary" onClick={() => navigate("/")} className="mt-4">
          Return to dashboard
        </Button>
      </div>
    );
  }

  const outcome = sessionData.preliminary_outcome as OutcomeType;

  // Only "risk identified" and "insufficient information" have responses to
  // point at; a clean outcome has nothing to explain.
  const isRiskOutcome = outcome === "risk_identified";
  const showDrivers = isRiskOutcome || outcome === "insufficient_information";

  // The outcome block reflects the adjusted outcome once an override has been
  // chosen and confirmed (the context step), otherwise the preliminary one.
  const isAdjusted = pendingConfirmType === 'override' && !!selectedOverrideOutcome;
  const shownOutcome = isAdjusted ? (selectedOverrideOutcome as OutcomeType) : outcome;
  const shownConfig = outcomeConfig[shownOutcome];
  const ShownIcon = shownConfig.icon;

  // Filter out current outcome for override selection
  const availableOverrideOutcomes = Object.entries(outcomeConfig).filter(
    ([key]) => key !== outcome
  );

  const reasonShort = reasonCharCount > 0 && reasonCharCount < MIN_REASON_LENGTH;
  const contextShort = contextCharCount > 0 && contextCharCount < 100;
  // The 100-character gate, surfaced by the progress track + live counter so a
  // disabled Continue button always reads as "not yet" rather than "broken".
  const contextSatisfied = contextCharCount >= 100;

  return (
    <>
      <WizardCard>
        {/* Header */}
        <h1 className="text-2xl font-normal tracking-tight text-ds-ink">
          Preliminary assessment
        </h1>
        <p className="mt-2 text-[13px] leading-relaxed text-ds-ink-secondary">
          Based on the responses, here is the preliminary ATAD2 outcome for{" "}
          <TaxpayerSubject stored={sessionData.taxpayer_name} form="others" className="text-ds-ink" />, ahead
          of the full assessment report. Confirm it, or adjust it if it does not
          match your expectations.
        </p>

        {/* Outcome block */}
        <div className="mt-8 border-t border-ds-hairline pt-6">
          <p className={EYEBROW}>Preliminary outcome</p>
          <div className="mt-4 flex items-center gap-4">
            <div
              className={cn(
                "flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full",
                shownConfig.tokenBg,
              )}
            >
              <ShownIcon className={cn("h-[18px] w-[18px]", shownConfig.tokenFg)} />
            </div>
            <div>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-normal tracking-tight text-ds-ink">
                  {shownConfig.label}
                </span>
                {isAdjusted && (
                  <span className="text-[13px] text-ds-ink-secondary">(adjusted)</span>
                )}
              </div>
              <p className="text-[13px] text-ds-ink-secondary">{shownConfig.subtitle}</p>
            </div>
          </div>
        </div>

        {/* Reasons behind the outcome · the responses that carry risk. Only
            shown for "risk identified" and "insufficient information" (a clean
            outcome has nothing to explain), and hidden during the final context
            step to keep that step focused. Reflects the preliminary (system)
            outcome, which is what these responses actually produced. */}
        {showDrivers && drivers.length > 0 && !showContextForm && (
          <div className="mt-8 border-t border-ds-hairline pt-6">
            <p className={EYEBROW}>
              {isRiskOutcome ? "What triggers this" : "What is still open"}
            </p>
            <p className="mt-2 text-[13px] leading-relaxed text-ds-ink-secondary">
              {isRiskOutcome
                ? "These responses fire the preliminary risk. Review them before confirming the outcome."
                : "These responses leave the position open. Resolving them would settle the outcome."}
            </p>
            <ul className="mt-4 space-y-2.5">
              {drivers.map((d) => {
                const isUnknown = d.answer === "Unknown";
                const hasExplanation = !!d.explanation;
                const isExpanded = openDrivers.has(d.question_id);
                return (
                  <li
                    key={d.question_id}
                    className="rounded-[3px] border border-ds-hairline bg-[#fffdfa]"
                  >
                    {/* The whole row is the toggle when there is a draft answer
                        to reveal; otherwise it is a plain, static row. */}
                    <div
                      role={hasExplanation ? "button" : undefined}
                      tabIndex={hasExplanation ? 0 : undefined}
                      aria-expanded={hasExplanation ? isExpanded : undefined}
                      onClick={hasExplanation ? () => toggleDriver(d.question_id) : undefined}
                      onKeyDown={
                        hasExplanation
                          ? (e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                toggleDriver(d.question_id);
                              }
                            }
                          : undefined
                      }
                      className={cn(
                        "flex items-start gap-3 px-4 py-[13px] outline-none",
                        hasExplanation &&
                          "cursor-pointer rounded-[3px] transition-colors hover:bg-[#faf6ef] focus-visible:shadow-[0_0_0_2px_rgba(194,92,60,0.35)]",
                      )}
                    >
                      <span
                        className={cn(
                          "mt-[1px] shrink-0 rounded-full px-2.5 py-[3px] text-[11px] font-medium tabular-nums",
                          isUnknown
                            ? "bg-ds-amber-bg text-ds-amber-text"
                            : "bg-ds-fill-muted text-ds-ink-secondary",
                        )}
                      >
                        {isUnknown ? "Unknown" : d.answer}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] leading-relaxed text-ds-ink">
                          {d.question_text}
                        </p>
                        {hasExplanation && (
                          <p
                            className={cn(
                              "mt-1 text-[12.5px] leading-relaxed text-ds-ink-secondary",
                              isExpanded ? "whitespace-pre-wrap" : "line-clamp-2",
                            )}
                          >
                            {d.explanation}
                          </p>
                        )}
                      </div>
                      {hasExplanation && (
                        <ChevronDown
                          className={cn(
                            "mt-[2px] h-4 w-4 shrink-0 text-ds-ink-tertiary transition-transform",
                            isExpanded && "rotate-180",
                          )}
                          strokeWidth={1.8}
                        />
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {/* Body: context form / default / override form */}
        {showContextForm ? (
          <div className="mt-8 space-y-5 border-t border-ds-hairline pt-6 animate-in fade-in-50 duration-300">
            {/* Label row: pencil + eyebrow on the left, an Optional tag on the
                right (the field can be skipped, so say so). */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Pencil
                    className="h-[15px] w-[15px] text-ds-accent"
                    strokeWidth={1.7}
                  />
                  <span className={EYEBROW}>Additional context</span>
                </div>
                <span className="shrink-0 rounded-full bg-ds-fill-muted px-2.5 py-[3px] text-[11px] text-ds-ink-secondary">
                  Optional
                </span>
              </div>
              <p className="text-[13.5px] leading-relaxed text-ds-ink-secondary">
                Anything that should shape the memorandum: background,
                considerations, or specific points to address. Skip if there is
                nothing to add.
              </p>
            </div>

            {suggestedAdditionalContext && !suggestedAccepted && (
              <div className="space-y-3 rounded-ds-control border border-ds-hairline bg-ds-fill-muted p-4">
                <p className={EYEBROW}>Suggested context from your documents</p>
                <p className="whitespace-pre-wrap text-[13px] text-ds-ink">{suggestedAdditionalContext}</p>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      const next = additionalContext.trim().length === 0
                        ? suggestedAdditionalContext
                        : `${additionalContext}\n\n${suggestedAdditionalContext}`;
                      setAdditionalContext(next);
                      setSuggestedAccepted(true);
                    }}
                  >
                    Accept
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setSuggestedAccepted(true)}
                  >
                    Dismiss
                  </Button>
                </div>
              </div>
            )}

            {/* Textarea, with the 100-character rule made visible underneath. */}
            <div>
              <textarea
                id="additional-context"
                aria-invalid={contextShort}
                aria-describedby="additional-context-counter"
                placeholder="For example: a recent restructuring, a pending ruling, or a position you want the memorandum to take into account."
                value={additionalContext}
                onChange={(e) => setAdditionalContext(e.target.value)}
                className="block min-h-[150px] w-full resize-y rounded-[3px] border border-ds-hairline bg-[#fffdfa] px-4 py-[15px] text-[15px] leading-[1.6] text-ds-ink outline-none transition-colors placeholder:text-ds-ink-tertiary focus:border-ds-accent focus:bg-white focus:shadow-[0_0_0_3px_rgba(194,92,60,0.1)]"
              />

              {/* Progress track: terra while below the minimum, sage once met. */}
              <div className="mt-3 h-[3px] w-full overflow-hidden rounded-[2px] bg-[#ece8e0]">
                <div
                  className={cn(
                    "h-full rounded-[2px] transition-[width] duration-200",
                    contextSatisfied ? "bg-[#97a06f]" : "bg-ds-accent",
                  )}
                  style={{ width: `${Math.min(100, contextCharCount)}%` }}
                />
              </div>

              {/* Footer: drafting note on the left, live counter on the right. */}
              <div className="mt-[11px] flex items-center justify-between gap-3">
                <span className="text-[12.5px] text-ds-ink-secondary">
                  This text is used when the memorandum is drafted.
                </span>
                {contextSatisfied ? (
                  <span
                    id="additional-context-counter"
                    className="flex shrink-0 items-center gap-1 text-[12.5px] tabular-nums text-ds-green-text"
                  >
                    {contextCharCount} characters
                    <Check className="h-3.5 w-3.5 text-ds-green" strokeWidth={2} />
                  </span>
                ) : (
                  <span
                    id="additional-context-counter"
                    className="shrink-0 text-[12.5px] tabular-nums text-ds-ink-secondary"
                  >
                    {contextCharCount} / 100 minimum
                  </span>
                )}
              </div>
            </div>

            {/* Skip sits left of the dark primary, which stays right-most. Skip is a
                visible outlined button (it is the actual way forward while Continue
                is gated on 100+ characters). */}
            <div className="flex items-center gap-2.5 pt-1">
              <Button
                variant="secondary"
                onClick={() => handleFinalConfirm(true)}
                disabled={submitting}
              >
                Skip
              </Button>
              <Button
                variant="primary"
                onClick={() => handleFinalConfirm(false)}
                disabled={submitting || contextCharCount < 100}
                className="disabled:pointer-events-auto disabled:cursor-not-allowed disabled:bg-ds-ink-disabled disabled:opacity-100"
              >
                Continue
                <ArrowRight />
              </Button>
            </div>
          </div>
        ) : !showOverrideForm ? (
          /* Default: confirm or adjust */
          <div className="mt-8 space-y-5 border-t border-ds-hairline pt-6">
            <p className="text-[13px] text-ds-ink-secondary">
              Does this preliminary outcome align with your own expectations?
            </p>
            <div className="flex items-center gap-2.5">
              <Button variant="secondary" onClick={handleAdjust} disabled={submitting}>
                Adjust
              </Button>
              <Button variant="primary" onClick={handleConfirm} disabled={submitting}>
                <Check />
                Confirm outcome
              </Button>
            </div>
          </div>
        ) : (
          /* Adjust: reasoning + alternative outcome */
          <div className="mt-8 space-y-5 border-t border-ds-hairline pt-6 animate-in fade-in-50 duration-300">
            <p className="text-[13px] leading-relaxed text-ds-ink-secondary">
              If this does not match your expectations, set out your reasoning
              and choose the outcome you consider more appropriate. Both are
              carried into the memorandum.
            </p>

            {/* Your reasoning: same field language as Additional context. */}
            <div className="space-y-2.5">
              <div className="flex items-center gap-2">
                <Pencil
                  className="h-[15px] w-[15px] text-ds-accent"
                  strokeWidth={1.7}
                />
                <span className={EYEBROW}>Your reasoning</span>
              </div>
              <p className="text-[13.5px] leading-relaxed text-ds-ink-secondary">
                Set out why the preliminary outcome does not fit, with the facts
                that support your view. The memorandum cites this directly.
              </p>
            </div>

            <div>
              <textarea
                id="override-reason"
                aria-invalid={reasonShort}
                aria-describedby="override-reason-counter"
                placeholder="Set out why the preliminary outcome does not fit, with the facts that support your view."
                value={overrideReason}
                onChange={(e) => setOverrideReason(e.target.value)}
                className="block min-h-[120px] w-full resize-y rounded-[3px] border border-ds-hairline bg-[#fffdfa] px-4 py-[15px] text-[15px] leading-[1.6] text-ds-ink outline-none transition-colors placeholder:text-ds-ink-tertiary focus:border-ds-accent focus:bg-white focus:shadow-[0_0_0_3px_rgba(194,92,60,0.1)]"
              />

              {/* Progress track: terra below the minimum, sage once met. */}
              <div className="mt-3 h-[3px] w-full overflow-hidden rounded-[2px] bg-[#ece8e0]">
                <div
                  className={cn(
                    "h-full rounded-[2px] transition-[width] duration-200",
                    isReasonValid ? "bg-[#97a06f]" : "bg-ds-accent",
                  )}
                  style={{ width: `${Math.min(100, reasonCharCount)}%` }}
                />
              </div>

              {/* Footer: requirement note on the left, live counter on the right. */}
              <div className="mt-[11px] flex items-center justify-between gap-3">
                <span className="text-[12.5px] text-ds-ink-secondary">
                  Required when you adjust the outcome.
                </span>
                {isReasonValid ? (
                  <span
                    id="override-reason-counter"
                    className="flex shrink-0 items-center gap-1 text-[12.5px] tabular-nums text-ds-green-text"
                  >
                    {reasonCharCount} characters
                    <Check className="h-3.5 w-3.5 text-ds-green" strokeWidth={2} />
                  </span>
                ) : (
                  <span
                    id="override-reason-counter"
                    className="shrink-0 text-[12.5px] tabular-nums text-ds-ink-secondary"
                  >
                    {reasonCharCount} / {MIN_REASON_LENGTH} minimum
                  </span>
                )}
              </div>
            </div>

            {/* Alternative outcome: informative, colour-coded cards. */}
            <div className="space-y-2.5">
              <p className={EYEBROW}>Alternative outcome</p>
              <RadioGroup
                value={selectedOverrideOutcome || ""}
                onValueChange={(value) => setSelectedOverrideOutcome(value as OutcomeType)}
                className="gap-2.5"
              >
                {availableOverrideOutcomes.map(([key, cfg]) => {
                  const Icon = cfg.icon;
                  const isSel = selectedOverrideOutcome === key;
                  return (
                    <div
                      key={key}
                      className={cn(
                        "flex cursor-pointer items-start gap-3 rounded-[3px] border px-[18px] py-[15px] transition-colors",
                        isSel
                          ? cn(cfg.cardSelBorder, cfg.cardSelBg)
                          : cn("border-ds-hairline", cfg.cardHover),
                      )}
                      onClick={() => setSelectedOverrideOutcome(key as OutcomeType)}
                    >
                      <RadioGroupItem
                        value={key}
                        id={key}
                        className={cn(
                          "mt-[3px]",
                          isSel
                            ? cfg.cardRadio
                            : "border-ds-ink-tertiary text-ds-ink-tertiary",
                        )}
                      />
                      <Icon
                        className={cn("mt-[1px] h-4 w-4 shrink-0", cfg.cardIcon)}
                        strokeWidth={1.8}
                      />
                      <div className="min-w-0 flex-1">
                        <Label
                          htmlFor={key}
                          className={cn(
                            "block cursor-pointer text-[13.5px]",
                            isSel
                              ? cn("font-medium", cfg.cardSelTitle)
                              : "font-normal text-ds-ink",
                          )}
                        >
                          {cfg.label}
                        </Label>
                        <p className="mt-1 text-[12.5px] leading-relaxed text-ds-ink-secondary">
                          {cfg.description}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </RadioGroup>
            </div>

            {/* Cancel sits left of the dark primary, which stays right-most. Confirm
                is gated on 100+ characters AND an alternative selected. */}
            <div className="flex items-center gap-2.5 pt-1">
              <Button
                variant="ghost"
                onClick={handleCancelOverride}
                disabled={submitting}
                className="text-ds-ink-secondary hover:bg-transparent hover:text-ds-ink"
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={handleConfirmOverride}
                disabled={!isOverrideValid || submitting}
                className="disabled:pointer-events-auto disabled:cursor-not-allowed disabled:bg-ds-ink-disabled disabled:opacity-100"
              >
                Confirm and continue
                <ArrowRight />
              </Button>
            </div>
          </div>
        )}
      </WizardCard>

      <AssessmentFooterSlot
        left={
          <Button variant="secondary" onClick={() => navigate(`/assessment?session=${sessionId}`)}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Previous
          </Button>
        }
      />
    </>
  );
};

export default AssessmentConfirmation;
