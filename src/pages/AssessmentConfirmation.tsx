import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import {
  Button,
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
  FormField,
  StatusPill,
} from "@/components/ds";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/sonner";
import { AssessmentFooterSlot } from "@/components/assessment/AssessmentFooterSlot";
import { ArrowLeft, AlertTriangle, Info, CheckCircle } from "lucide-react";

type OutcomeType = 'risk_identified' | 'insufficient_information' | 'low_risk';

interface SessionData {
  session_id: string;
  taxpayer_name: string;
  preliminary_outcome: OutcomeType | null;
  outcome_confirmed: boolean;
}

const outcomeConfig: Record<
  OutcomeType,
  { label: string; icon: typeof AlertTriangle; status: "triggered" | "insufficient" | "complete" }
> = {
  risk_identified: {
    label: "ATAD2 risk identified",
    icon: AlertTriangle,
    status: "triggered"
  },
  insufficient_information: {
    label: "Insufficient information",
    icon: Info,
    status: "insufficient"
  },
  low_risk: {
    label: "Low ATAD2 risk",
    icon: CheckCircle,
    status: "complete"
  }
};

const AssessmentConfirmation = () => {
  const { sessionId } = useParams<{ sessionId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [sessionData, setSessionData] = useState<SessionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

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
    }
  }, [user, sessionId]);

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

      // If already confirmed, skip ahead to the appendix step (the next step
      // in the flow). The report itself enforces "must be confirmed first" so
      // a deep-link to /assessment-report still ends up here if needed.
      if (data.outcome_confirmed) {
        navigate(`/assessment-appendix/${sessionId}`);
        return;
      }

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

  const handleBackFromContext = () => {
    setShowContextForm(false);
    setAdditionalContext("");
    setPendingConfirmType(null);
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
      <div className="min-h-screen flex items-center justify-center bg-ds-page">
        <div className="text-center">
          <p className="text-[13px] text-ds-ink-secondary">Session not found</p>
          <Button variant="secondary" onClick={() => navigate("/")} className="mt-4">
            Return to dashboard
          </Button>
        </div>
      </div>
    );
  }

  const outcome = sessionData.preliminary_outcome as OutcomeType;
  const config = outcomeConfig[outcome];
  const OutcomeIcon = config.icon;

  // Filter out current outcome for override selection
  const availableOverrideOutcomes = Object.entries(outcomeConfig).filter(
    ([key]) => key !== outcome
  );

  return (
    <div className="max-w-2xl mx-auto">
      <Card>
          <CardHeader>
            <CardTitle>
              Preliminary ATAD2 assessment
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Intro text */}
            <p className="text-[13px] text-ds-ink-secondary">
              This preliminary outcome for{" "}
              <span className="text-ds-ink font-medium">{sessionData.taxpayer_name}</span>{" "}
              was determined from the responses, ahead of the assessment report.
            </p>

            {/* Preliminary outcome */}
            <div className="py-4 border-y border-ds-hairline">
              <p className="text-[13px] text-ds-ink-secondary mb-2">
                Preliminary outcome
              </p>
              {pendingConfirmType === 'override' && selectedOverrideOutcome ? (
                // Show the adjusted outcome when in override flow
                (() => {
                  const overrideConfig = outcomeConfig[selectedOverrideOutcome];
                  const OverrideIcon = overrideConfig.icon;
                  return (
                    <div className="flex items-center gap-2">
                      <StatusPill status={overrideConfig.status}>
                        <OverrideIcon />
                        {overrideConfig.label}
                      </StatusPill>
                      <span className="text-[13px] text-ds-ink-secondary">(adjusted)</span>
                    </div>
                  );
                })()
              ) : (
                <StatusPill status={config.status}>
                  <OutcomeIcon />
                  {config.label}
                </StatusPill>
              )}
            </div>

            {/* Context Form - shown after confirm or override */}
            {showContextForm ? (
              <div className="space-y-5 animate-in fade-in-50 duration-300">
                <p className="text-[13px] text-ds-ink-secondary">
                  Add any context that should shape the memorandum.
                </p>

                {suggestedAdditionalContext && !suggestedAccepted && (
                  <Card className="bg-ds-fill-muted">
                    <CardContent className="space-y-3 pt-5">
                      <p className="text-[13px] font-medium text-ds-ink-secondary">
                        Suggested context from your documents
                      </p>
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
                    </CardContent>
                  </Card>
                )}

                <FormField
                  label="Additional context"
                  error={
                    contextCharCount > 0 && contextCharCount < 100
                      ? `${100 - contextCharCount} more characters needed`
                      : undefined
                  }
                >
                  {({ id, describedBy, invalid }) => (
                    <Textarea
                      id={id}
                      aria-describedby={describedBy}
                      aria-invalid={invalid}
                      placeholder="Background, considerations, or specific points to address. At least 100 characters, or use Skip."
                      value={additionalContext}
                      onChange={(e) => setAdditionalContext(e.target.value)}
                      className="min-h-[100px] resize-none text-[15px]"
                    />
                  )}
                </FormField>
              </div>
            ) : !showOverrideForm ? (
              /* Confirmation section */
              <div className="space-y-5">
                <p className="text-[13px] text-ds-ink-secondary">
                  Before continuing, please confirm whether this preliminary outcome
                  aligns with your own expectations.
                </p>
              </div>
            ) : (
              /* Override Form - inline */
              <div className="space-y-5">
                <p className="text-[13px] text-ds-ink-secondary">
                  Please explain why you do not agree with the preliminary outcome
                  and select the outcome you consider more appropriate.
                </p>

                {/* Reason textarea */}
                <FormField
                  label="Your reasoning"
                  error={
                    reasonCharCount > 0 && reasonCharCount < MIN_REASON_LENGTH
                      ? `${MIN_REASON_LENGTH - reasonCharCount} more characters needed`
                      : undefined
                  }
                >
                  {({ id, describedBy, invalid }) => (
                    <Textarea
                      id={id}
                      aria-describedby={describedBy}
                      aria-invalid={invalid}
                      placeholder="Why the preliminary outcome does not fit, in at least 100 characters."
                      value={overrideReason}
                      onChange={(e) => setOverrideReason(e.target.value)}
                      className="min-h-[100px] resize-none text-[15px]"
                    />
                  )}
                </FormField>

                {/* Alternative outcome selection */}
                <FormField label="Alternative outcome">
                  <RadioGroup
                    value={selectedOverrideOutcome || ""}
                    onValueChange={(value) => setSelectedOverrideOutcome(value as OutcomeType)}
                    className="space-y-2"
                  >
                    {availableOverrideOutcomes.map(([key, cfg]) => {
                      const Icon = cfg.icon;
                      return (
                        <div
                          key={key}
                          className={`flex items-center space-x-3 p-3 rounded-ds-control border cursor-pointer transition-colors ${
                            selectedOverrideOutcome === key
                              ? "border-ds-ink bg-ds-fill-muted"
                              : "border-ds-hairline hover:bg-ds-fill-muted"
                          }`}
                          onClick={() => setSelectedOverrideOutcome(key as OutcomeType)}
                        >
                          <RadioGroupItem value={key} id={key} />
                          <Icon className="h-4 w-4 text-ds-ink-tertiary" />
                          <Label htmlFor={key} className="cursor-pointer flex-1 text-[13px] font-normal text-ds-ink">
                            {cfg.label}
                          </Label>
                        </div>
                      );
                    })}
                  </RadioGroup>
                </FormField>

                {/* Confirmation note - only when valid */}
                {isOverrideValid && (
                  <p className="text-[13px] text-ds-ink-secondary">
                    Your explanation will be taken into account when generating the
                    assessment report and memorandum.
                  </p>
                )}
              </div>
            )}
          </CardContent>
          <CardFooter>
            {showContextForm ? (
              <>
                <Button
                  variant="primary"
                  onClick={() => handleFinalConfirm(false)}
                  disabled={submitting || additionalContext.trim().length < 100}
                >
                  Continue
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => handleFinalConfirm(true)}
                  disabled={submitting}
                >
                  Skip
                </Button>
              </>
            ) : showOverrideForm ? (
              <>
                <Button
                  variant="primary"
                  onClick={handleConfirmOverride}
                  disabled={!isOverrideValid || submitting}
                >
                  Confirm and continue
                </Button>
                <Button
                  variant="ghost"
                  onClick={handleCancelOverride}
                  disabled={submitting}
                >
                  Cancel
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant="primary"
                  onClick={handleConfirm}
                  disabled={submitting}
                >
                  Confirm outcome
                </Button>
                <Button
                  variant="secondary"
                  onClick={handleAdjust}
                  disabled={submitting}
                >
                  Adjust
                </Button>
              </>
            )}
          </CardFooter>
        </Card>

        <AssessmentFooterSlot
          left={
            <Button variant="secondary" onClick={() => navigate(`/assessment?session=${sessionId}`)}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Previous
            </Button>
          }
        />
    </div>
  );
};

export default AssessmentConfirmation;
