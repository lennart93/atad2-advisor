import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/sonner";
import { AlertTriangle, Info, CheckCircle, ArrowLeft } from "lucide-react";

type OutcomeType = 'risk_identified' | 'insufficient_information' | 'low_risk';

interface SessionData {
  session_id: string;
  taxpayer_name: string;
  preliminary_outcome: OutcomeType | null;
  outcome_confirmed: boolean;
}

const outcomeConfig = {
  risk_identified: {
    label: "ATAD2 risk identified",
    icon: AlertTriangle,
    colorClass: "text-red-600",
    bgClass: "bg-red-50 border-red-200",
    iconBg: "bg-red-100"
  },
  insufficient_information: {
    label: "Insufficient information",
    icon: Info,
    colorClass: "text-orange-600",
    bgClass: "bg-orange-50 border-orange-200",
    iconBg: "bg-orange-100"
  },
  low_risk: {
    label: "Low ATAD2 risk",
    icon: CheckCircle,
    colorClass: "text-green-600",
    bgClass: "bg-green-50 border-green-200",
    iconBg: "bg-green-100"
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

  const handleAgree = async () => {
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

  const handleDisagree = () => {
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

      toast.success("Assessment outcome updated", {
        description: "Your override has been recorded and will be reflected in the memorandum."
      });

      navigate(`/assessment-report/${sessionId}`);
    } catch (error) {
      console.error('Error overriding outcome:', error);
      toast.error("Error", { description: "Failed to override outcome" });
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
        <p className="text-xl text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (!sessionData || !sessionData.preliminary_outcome) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <p className="text-xl text-muted-foreground">Session not found</p>
          <Button onClick={() => navigate("/")} className="mt-4">
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
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-2xl mx-auto">
        <div className="mb-8">
          <Button variant="outline" onClick={() => navigate("/")}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to dashboard
          </Button>
        </div>

        <Card className="mb-6">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl">Preliminary ATAD2 Assessment</CardTitle>
            <CardDescription className="text-base mt-2">
              Thank you for completing the ATAD2 questionnaire for{" "}
              <span className="font-semibold">{sessionData.taxpayer_name}</span>.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <p className="text-muted-foreground text-center">
              Based on the answers you have provided, a preliminary ATAD2 assessment has been determined 
              using predefined rule-based logic. This assessment has been made without the use of AI and 
              is intended as an initial classification only.
            </p>

            {/* Preliminary Outcome Display */}
            <div className={`rounded-lg border-2 p-6 ${config.bgClass}`}>
              <div className="flex items-center justify-center gap-3">
                <div className={`p-2 rounded-full ${config.iconBg}`}>
                  <OutcomeIcon className={`h-6 w-6 ${config.colorClass}`} />
                </div>
                <div className="text-center">
                  <p className="text-sm text-muted-foreground mb-1">Preliminary outcome</p>
                  <p className={`text-xl font-semibold ${config.colorClass}`}>
                    {config.label}
                  </p>
                </div>
              </div>
            </div>

            {/* Confirmation Question */}
            {!showOverrideForm ? (
              <div className="space-y-4">
                <div className="text-center">
                  <p className="text-lg font-medium">
                    Do you agree with this preliminary assessment outcome?
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">
                    This is purely mathematically determined, but you may need to refine it based on your review.
                  </p>
                </div>

                <div className="flex justify-center gap-4">
                  <Button
                    size="lg"
                    onClick={handleAgree}
                    disabled={submitting}
                    className="min-w-[140px]"
                  >
                    Yes, I agree
                  </Button>
                  <Button
                    size="lg"
                    variant="outline"
                    onClick={handleDisagree}
                    disabled={submitting}
                    className="min-w-[140px]"
                  >
                    No, I do not agree
                  </Button>
                </div>
              </div>
            ) : (
              /* Override Form */
              <div className="space-y-6 pt-4 border-t">
                <div className="space-y-3">
                  <Label htmlFor="override-reason" className="text-base font-medium">
                    Please explain why you do not agree with the preliminary assessment
                  </Label>
                  <Textarea
                    id="override-reason"
                    placeholder="Share your reasoning here..."
                    value={overrideReason}
                    onChange={(e) => setOverrideReason(e.target.value)}
                    className="min-h-[120px]"
                  />
                  <div className="flex justify-between text-sm">
                    <p className={reasonCharCount < MIN_REASON_LENGTH ? "text-muted-foreground" : "text-green-600"}>
                      {reasonCharCount} / {MIN_REASON_LENGTH} characters minimum
                    </p>
                    {reasonCharCount > 0 && reasonCharCount < MIN_REASON_LENGTH && (
                      <p className="text-orange-600">
                        {MIN_REASON_LENGTH - reasonCharCount} more characters needed
                      </p>
                    )}
                  </div>
                </div>

                <div className="space-y-3">
                  <Label className="text-base font-medium">
                    Which assessment outcome do you consider more appropriate?
                  </Label>
                  <RadioGroup
                    value={selectedOverrideOutcome || ""}
                    onValueChange={(value) => setSelectedOverrideOutcome(value as OutcomeType)}
                    className="space-y-3"
                  >
                    {availableOverrideOutcomes.map(([key, cfg]) => {
                      const Icon = cfg.icon;
                      return (
                        <div
                          key={key}
                          className={`flex items-center space-x-3 p-4 rounded-lg border-2 cursor-pointer transition-all ${
                            selectedOverrideOutcome === key
                              ? cfg.bgClass + " border-current"
                              : "border-border hover:border-muted-foreground/50"
                          }`}
                          onClick={() => setSelectedOverrideOutcome(key as OutcomeType)}
                        >
                          <RadioGroupItem value={key} id={key} />
                          <Icon className={`h-5 w-5 ${cfg.colorClass}`} />
                          <Label htmlFor={key} className="cursor-pointer flex-1">
                            {cfg.label}
                          </Label>
                        </div>
                      );
                    })}
                  </RadioGroup>
                </div>

                {isOverrideValid && (
                  <div className="bg-muted/50 p-4 rounded-lg text-sm text-muted-foreground">
                    <p>
                      You have chosen to override the preliminary assessment. This explanation will be 
                      taken into account when generating the assessment report and memorandum.
                    </p>
                  </div>
                )}

                <div className="flex justify-end gap-3">
                  <Button
                    variant="outline"
                    onClick={handleCancelOverride}
                    disabled={submitting}
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleConfirmOverride}
                    disabled={!isOverrideValid || submitting}
                  >
                    Confirm and continue
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default AssessmentConfirmation;
