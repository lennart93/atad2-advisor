import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/sonner";
import { ArrowLeft } from "lucide-react";

type OutcomeType = 'risk_identified' | 'insufficient_information' | 'low_risk';

interface SessionData {
  session_id: string;
  taxpayer_name: string;
  preliminary_outcome: OutcomeType | null;
  outcome_confirmed: boolean;
}

const outcomeLabels: Record<OutcomeType, string> = {
  risk_identified: "ATAD2 risk identified",
  insufficient_information: "Insufficient information",
  low_risk: "Low ATAD2 risk"
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
  
  // Validation
  const MIN_REASON_LENGTH = 30;
  const reasonCharCount = overrideReason.trim().length;
  const isReasonValid = reasonCharCount >= MIN_REASON_LENGTH;
  const isOverrideValid = isReasonValid && selectedOverrideOutcome && selectedOverrideOutcome !== sessionData?.preliminary_outcome;

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
      const { data, error } = await supabase
        .from('atad2_sessions')
        .select('session_id, taxpayer_name, preliminary_outcome, outcome_confirmed')
        .eq('session_id', sessionId)
        .eq('user_id', user.id)
        .single();

      if (error) throw error;

      // If already confirmed, redirect to report
      if (data.outcome_confirmed) {
        navigate(`/assessment-report/${sessionId}`);
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

  const handleConfirm = async () => {
    if (!sessionId || !user) return;

    setSubmitting(true);
    try {
      const { error } = await supabase
        .from('atad2_sessions')
        .update({
          outcome_confirmed: true,
          outcome_overridden: false,
          confirmed_at: new Date().toISOString()
        })
        .eq('session_id', sessionId)
        .eq('user_id', user.id);

      if (error) throw error;

      navigate(`/assessment-report/${sessionId}`);
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

  const handleConfirmOverride = async () => {
    if (!sessionId || !user || !isOverrideValid) return;

    setSubmitting(true);
    try {
      const { error } = await supabase
        .from('atad2_sessions')
        .update({
          outcome_confirmed: true,
          outcome_overridden: true,
          override_reason: overrideReason.trim(),
          override_outcome: selectedOverrideOutcome,
          confirmed_at: new Date().toISOString()
        })
        .eq('session_id', sessionId)
        .eq('user_id', user.id);

      if (error) throw error;

      navigate(`/assessment-report/${sessionId}`);
    } catch (error) {
      console.error('Error overriding outcome:', error);
      toast.error("Error", { description: "Failed to update outcome" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancelOverride = () => {
    setShowOverrideForm(false);
    setOverrideReason("");
    setSelectedOverrideOutcome(null);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (!sessionData || !sessionData.preliminary_outcome) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <p className="text-muted-foreground">Session not found</p>
          <Button variant="outline" onClick={() => navigate("/")} className="mt-4">
            Return to dashboard
          </Button>
        </div>
      </div>
    );
  }

  const outcome = sessionData.preliminary_outcome as OutcomeType;

  // Filter out current outcome for override selection
  const availableOverrideOutcomes = Object.entries(outcomeLabels).filter(
    ([key]) => key !== outcome
  );

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto px-4 py-8">
        {/* Back button */}
        <div className="mb-12">
          <Button 
            variant="ghost" 
            size="sm"
            onClick={() => navigate("/")}
            className="text-muted-foreground hover:text-foreground -ml-2"
          >
            <ArrowLeft className="h-4 w-4 mr-1.5" />
            Back to dashboard
          </Button>
        </div>

        {/* Page content */}
        <div className="space-y-8">
          {/* Header */}
          <div className="space-y-4">
            <h1 className="text-xl font-medium text-foreground">
              Preliminary ATAD2 assessment
            </h1>
            <p className="text-muted-foreground leading-relaxed">
              Thank you for completing the ATAD2 questionnaire for{" "}
              <span className="text-foreground">{sessionData.taxpayer_name}</span>.
              Based on your responses, a preliminary assessment has been determined 
              using predefined rule-based logic. This serves as a checkpoint before 
              generating the assessment report.
            </p>
          </div>

          {/* Preliminary outcome - understated */}
          <div className="py-6 border-y border-border">
            <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
              Preliminary outcome
            </p>
            <p className="text-lg text-foreground">
              {outcomeLabels[outcome]}
            </p>
          </div>

          {/* Confirmation section */}
          {!showOverrideForm ? (
            <div className="space-y-6">
              <p className="text-muted-foreground">
                Before we continue, please confirm whether this preliminary outcome 
                aligns with your own assessment.
              </p>

              <div className="flex gap-3">
                <Button
                  variant="outline"
                  onClick={handleConfirm}
                  disabled={submitting}
                  className="flex-1 sm:flex-none"
                >
                  Confirm outcome
                </Button>
                <Button
                  variant="outline"
                  onClick={handleAdjust}
                  disabled={submitting}
                  className="flex-1 sm:flex-none"
                >
                  Adjust outcome
                </Button>
              </div>
            </div>
          ) : (
            /* Override Form - inline, calm */
            <div className="space-y-6">
              <p className="text-muted-foreground">
                Please explain why you do not agree with the preliminary outcome 
                and select the outcome you consider more appropriate.
              </p>

              {/* Reason textarea */}
              <div className="space-y-2">
                <Label htmlFor="override-reason" className="text-sm text-muted-foreground">
                  Your reasoning
                </Label>
                <Textarea
                  id="override-reason"
                  placeholder="Share your reasoning here..."
                  value={overrideReason}
                  onChange={(e) => setOverrideReason(e.target.value)}
                  className="min-h-[100px] resize-none"
                />
                <p className="text-xs text-muted-foreground">
                  {reasonCharCount < MIN_REASON_LENGTH 
                    ? `${MIN_REASON_LENGTH - reasonCharCount} more characters needed`
                    : `${reasonCharCount} characters`
                  }
                </p>
              </div>

              {/* Alternative outcome selection */}
              <div className="space-y-3">
                <Label className="text-sm text-muted-foreground">
                  Alternative outcome
                </Label>
                <RadioGroup
                  value={selectedOverrideOutcome || ""}
                  onValueChange={(value) => setSelectedOverrideOutcome(value as OutcomeType)}
                  className="space-y-2"
                >
                  {availableOverrideOutcomes.map(([key, label]) => (
                    <div
                      key={key}
                      className={`flex items-center space-x-3 p-3 rounded border cursor-pointer transition-colors ${
                        selectedOverrideOutcome === key
                          ? "border-foreground bg-muted/30"
                          : "border-border hover:border-muted-foreground/50"
                      }`}
                      onClick={() => setSelectedOverrideOutcome(key as OutcomeType)}
                    >
                      <RadioGroupItem value={key} id={key} />
                      <Label htmlFor={key} className="cursor-pointer flex-1 font-normal">
                        {label}
                      </Label>
                    </div>
                  ))}
                </RadioGroup>
              </div>

              {/* Confirmation note - only when valid */}
              {isOverrideValid && (
                <p className="text-sm text-muted-foreground">
                  Your explanation will be taken into account when generating the 
                  assessment report and memorandum.
                </p>
              )}

              {/* Actions */}
              <div className="flex gap-3 pt-2">
                <Button
                  variant="ghost"
                  onClick={handleCancelOverride}
                  disabled={submitting}
                >
                  Cancel
                </Button>
                <Button
                  variant="outline"
                  onClick={handleConfirmOverride}
                  disabled={!isOverrideValid || submitting}
                >
                  Confirm and continue
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AssessmentConfirmation;
