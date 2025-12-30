import { useEffect, useState, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/sonner";
import { ArrowLeft, AlertTriangle, Info, CheckCircle, Upload, FileText, X, Loader2 } from "lucide-react";

interface UploadedFile {
  name: string;
  type: string;
  status: 'pending' | 'uploading' | 'success' | 'error';
  errorMessage?: string;
}

const N8N_CONTEXT_EXTRACT_URL = "https://lennartwilming.app.n8n.cloud/webhook/atad2/extract-context";

type OutcomeType = 'risk_identified' | 'insufficient_information' | 'low_risk';

interface SessionData {
  session_id: string;
  taxpayer_name: string;
  preliminary_outcome: OutcomeType | null;
  outcome_confirmed: boolean;
}

const outcomeConfig: Record<OutcomeType, { label: string; icon: typeof AlertTriangle; colorClass: string }> = {
  risk_identified: {
    label: "ATAD2 risk identified",
    icon: AlertTriangle,
    colorClass: "text-red-600"
  },
  insufficient_information: {
    label: "Insufficient information",
    icon: Info,
    colorClass: "text-orange-600"
  },
  low_risk: {
    label: "Low ATAD2 risk",
    icon: CheckCircle,
    colorClass: "text-green-600"
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
  
  // File upload state
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [isProcessingFiles, setIsProcessingFiles] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Validation
  const MIN_REASON_LENGTH = 100;
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
    setUploadedFiles([]);
    setPendingConfirmType(null);
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !sessionId) return;

    const allowedTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ];

    for (const file of Array.from(files)) {
      if (!allowedTypes.includes(file.type)) {
        toast.error("Invalid file type", { 
          description: `${file.name} is not a supported file type. Please upload PDF or Word documents.` 
        });
        continue;
      }

      if (file.size > 20 * 1024 * 1024) {
        toast.error("File too large", { 
          description: `${file.name} exceeds the 20MB limit.` 
        });
        continue;
      }

      // Add file to list as pending
      setUploadedFiles(prev => [...prev, { name: file.name, type: file.type, status: 'pending' }]);

      // Process and upload file
      processFile(file);
    }

    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const processFile = async (file: File) => {
    setIsProcessingFiles(true);
    
    // Update file status to uploading
    setUploadedFiles(prev => 
      prev.map(f => f.name === file.name ? { ...f, status: 'uploading' as const } : f)
    );

    try {
      // Convert file to base64
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          // Remove data URL prefix
          const base64Data = result.split(',')[1];
          resolve(base64Data);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      // Determine document type
      let documentType = 'onbekend';
      const lowerName = file.name.toLowerCase();
      if (lowerName.includes('jaarrekening') || lowerName.includes('annual')) {
        documentType = 'jaarrekening';
      } else if (lowerName.includes('cit') || lowerName.includes('tax return')) {
        documentType = 'CIT return';
      } else if (lowerName.includes('advisory') || lowerName.includes('advies')) {
        documentType = 'CIT advisory letter';
      }

      // Call n8n webhook with 5 minute timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5 * 60 * 1000);

      const response = await fetch(N8N_CONTEXT_EXTRACT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId,
          file_base64: base64,
          file_name: file.name,
          file_type: file.type,
          document_type: documentType
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Upload failed: ${response.statusText}`);
      }

      const result = await response.json();
      
      if (result.success) {
        setUploadedFiles(prev => 
          prev.map(f => f.name === file.name ? { ...f, status: 'success' as const } : f)
        );
        toast.success("Document processed", { 
          description: `Context extracted from ${file.name}` 
        });
      } else {
        throw new Error(result.error || 'Failed to extract context');
      }
    } catch (error) {
      console.error('File processing error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setUploadedFiles(prev => 
        prev.map(f => f.name === file.name ? { ...f, status: 'error' as const, errorMessage } : f)
      );
      toast.error("Processing failed", { 
        description: `Failed to process ${file.name}` 
      });
    } finally {
      setIsProcessingFiles(false);
    }
  };

  const removeFile = (fileName: string) => {
    setUploadedFiles(prev => prev.filter(f => f.name !== fileName));
  };

  const hasFilesProcessing = uploadedFiles.some(f => f.status === 'uploading' || f.status === 'pending');

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
  const config = outcomeConfig[outcome];
  const OutcomeIcon = config.icon;

  // Filter out current outcome for override selection
  const availableOverrideOutcomes = Object.entries(outcomeConfig).filter(
    ([key]) => key !== outcome
  );

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-2xl mx-auto">
        {/* Back button */}
        <div className="mb-8">
          <Button variant="outline" onClick={() => navigate("/")}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to dashboard
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-xl font-medium">
              Preliminary ATAD2 assessment
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Intro text */}
            <p className="text-muted-foreground">
              Thank you for completing the ATAD2 questionnaire for{" "}
              <span className="text-foreground font-medium">{sessionData.taxpayer_name}</span>.
              Based on your responses, a preliminary assessment has been determined 
              using predefined rule-based logic. This serves as a checkpoint before 
              generating the assessment report.
            </p>

            {/* Preliminary outcome - with color, matching report style */}
            <div className="py-4 border-y border-border">
              <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
                Preliminary outcome
              </p>
              <div className="flex items-center gap-2">
                <OutcomeIcon className={`h-4 w-4 ${config.colorClass}`} />
                <span className={`font-medium ${config.colorClass}`}>
                  {config.label}
                </span>
              </div>
            </div>

            {/* Context Form - shown after confirm or override */}
            {showContextForm ? (
              <div className="space-y-5 animate-in fade-in-50 duration-300">
                <p className="text-muted-foreground">
                  Great! Before we proceed, is there anything you'd like to add? 
                  The more context you provide, the more tailored the memorandum will be.
                </p>

                <div className="space-y-2">
                  <Textarea
                    placeholder="Any additional considerations, background information, or specific points you'd like addressed..."
                    value={additionalContext}
                    onChange={(e) => setAdditionalContext(e.target.value)}
                    className="min-h-[100px] resize-none"
                  />
                  {additionalContext.trim().length < 100 && additionalContext.trim().length > 0 && (
                    <p className="text-xs text-muted-foreground">
                      {100 - additionalContext.trim().length} more characters needed
                    </p>
                  )}
                </div>

                {/* File upload section */}
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    You may also upload documents to provide additional context (annual accounts, CIT returns, advisory letters).
                  </p>
                  
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                    onChange={handleFileSelect}
                    multiple
                    className="hidden"
                  />
                  
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isProcessingFiles}
                    className="w-full border-dashed"
                  >
                    <Upload className="h-4 w-4 mr-2" />
                    Upload PDF or Word document
                  </Button>

                  {/* Uploaded files list */}
                  {uploadedFiles.length > 0 && (
                    <div className="space-y-2">
                      {uploadedFiles.map((file) => (
                        <div 
                          key={file.name}
                          className="flex items-center justify-between p-2 rounded border border-border bg-muted/30"
                        >
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                            <span className="text-sm truncate">{file.name}</span>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            {file.status === 'uploading' || file.status === 'pending' ? (
                              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                            ) : file.status === 'success' ? (
                              <CheckCircle className="h-4 w-4 text-green-600" />
                            ) : file.status === 'error' ? (
                              <AlertTriangle className="h-4 w-4 text-red-600" />
                            ) : null}
                            <button
                              type="button"
                              onClick={() => removeFile(file.name)}
                              className="p-1 hover:bg-muted rounded"
                              disabled={file.status === 'uploading'}
                            >
                              <X className="h-3 w-3 text-muted-foreground" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex gap-3 pt-2">
                  <Button
                    variant="ghost"
                    onClick={() => handleFinalConfirm(true)}
                    disabled={submitting || hasFilesProcessing}
                  >
                    Skip
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => handleFinalConfirm(false)}
                    disabled={submitting || hasFilesProcessing || additionalContext.trim().length < 100}
                  >
                    {hasFilesProcessing ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Processing...
                      </>
                    ) : (
                      'Continue'
                    )}
                  </Button>
                </div>
              </div>
            ) : !showOverrideForm ? (
              /* Confirmation section */
              <div className="space-y-5">
                <p className="text-muted-foreground">
                  Before we continue, please confirm whether this preliminary outcome 
                  aligns with your own assessment.
                </p>

                <div className="flex gap-3">
                  <Button
                    variant="outline"
                    onClick={handleConfirm}
                    disabled={submitting}
                  >
                    Confirm outcome
                  </Button>
                  <Button
                    variant="outline"
                    onClick={handleAdjust}
                    disabled={submitting}
                  >
                    Adjust outcome
                  </Button>
                </div>
              </div>
            ) : (
              /* Override Form - inline */
              <div className="space-y-5">
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
                  {reasonCharCount < MIN_REASON_LENGTH && (
                    <p className="text-xs text-muted-foreground">
                      {MIN_REASON_LENGTH - reasonCharCount} more characters needed
                    </p>
                  )}
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
                    {availableOverrideOutcomes.map(([key, cfg]) => {
                      const Icon = cfg.icon;
                      return (
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
                          <Icon className={`h-4 w-4 ${cfg.colorClass}`} />
                          <Label htmlFor={key} className="cursor-pointer flex-1 font-normal">
                            {cfg.label}
                          </Label>
                        </div>
                      );
                    })}
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
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default AssessmentConfirmation;
