import React, { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, Lightbulb, X } from "lucide-react";
import { toast } from "@/components/ui/sonner";
import ReactMarkdown from "react-markdown";
import rehypeRaw from "rehype-raw";
import { useAuth } from "@/hooks/useAuth";

interface ParagraphFeedback {
  paragraphIndex: number;
  originalText: string;
  feedbackText: string;
}

interface MemoFeedbackEditorProps {
  memoMarkdown: string;
  sessionId: string;
  taxpayerName: string;
  fiscalYear: string;
  onFeedbackSubmitted: (newMemoMarkdown: string) => void;
  onCancel: () => void;
}

const MemoFeedbackEditor: React.FC<MemoFeedbackEditorProps> = ({
  memoMarkdown,
  sessionId,
  taxpayerName,
  fiscalYear,
  onFeedbackSubmitted,
  onCancel,
}) => {
  const { user } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [generalFeedback, setGeneralFeedback] = useState("");
  const [activeParagraphIndex, setActiveParagraphIndex] = useState<number | null>(null);
  const [feedbackByParagraph, setFeedbackByParagraph] = useState<Record<number, string>>({});

  // Get first name from user metadata or email
  const firstName = useMemo(() => {
    if (user?.user_metadata?.first_name) return user.user_metadata.first_name;
    if (user?.user_metadata?.full_name) return user.user_metadata.full_name.split(' ')[0];
    if (user?.email) return user.email.split('@')[0];
    return 'You';
  }, [user]);

  // Split memo into paragraphs, merging titles/headers with following content
  const paragraphs = useMemo(() => {
    const splits = memoMarkdown.split(/\n\n+/).map((p) => p.trim()).filter((p) => p.length > 0);
    
    const isContentParagraph = (text: string) => {
      const isHeader = /^#{1,6}\s/.test(text);
      const isMetadata = /^(Taxpayer|Tax year|Client|Date|Entity):/i.test(text);
      const hasSentenceStructure = text.includes('. ') || text.length > 150;
      const isShort = text.length < 100;
      
      return hasSentenceStructure || (!isShort && !isHeader && !isMetadata);
    };
    
    const merged: string[] = [];
    let buffer = '';
    
    for (let i = 0; i < splits.length; i++) {
      const current = splits[i];
      
      if (isContentParagraph(current)) {
        if (buffer) {
          merged.push(buffer + '\n\n' + current);
          buffer = '';
        } else {
          merged.push(current);
        }
      } else {
        buffer = buffer ? buffer + '\n\n' + current : current;
      }
    }
    
    if (buffer) {
      merged.push(buffer);
    }
    
    return merged;
  }, [memoMarkdown]);

  const handleFeedbackChange = (index: number, value: string) => {
    setFeedbackByParagraph((prev) => ({
      ...prev,
      [index]: value,
    }));
  };

  const handleParagraphClick = (index: number) => {
    if (isSubmitting) return;
    setActiveParagraphIndex(activeParagraphIndex === index ? null : index);
  };

  const closeParagraphFeedback = (index: number) => {
    if (activeParagraphIndex === index) {
      setActiveParagraphIndex(null);
    }
  };

  const hasParagraphFeedback = Object.values(feedbackByParagraph).some(
    (fb) => fb.trim().length > 0
  );
  const hasGeneralFeedback = generalFeedback.trim().length > 0;
  const canSubmit = hasParagraphFeedback || hasGeneralFeedback;

  const handleSubmit = async () => {
    if (!canSubmit) {
      toast.error("No feedback provided", {
        description: "Please add general feedback or comment on a specific paragraph.",
      });
      return;
    }

    setIsSubmitting(true);

    try {
      // Build paragraph feedback array - only non-empty
      const paragraphFeedback: ParagraphFeedback[] = paragraphs
        .map((text, index) => ({
          paragraphIndex: index,
          originalText: text,
          feedbackText: feedbackByParagraph[index] || "",
        }))
        .filter((item) => item.feedbackText.trim().length > 0);

      const payload = {
        session_id: sessionId,
        taxpayer_name: taxpayerName,
        fiscal_year: fiscalYear,
        original_memo: memoMarkdown,
        paragraph_feedback: paragraphFeedback,
        general_feedback: generalFeedback.trim() || null,
      };

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10 * 60 * 1000);

      console.log("Submitting feedback to n8n...", payload);

      const response = await fetch(
        "https://lennartwilming.app.n8n.cloud/webhook/atad2/submit-feedback",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
          signal: controller.signal,
        }
      );

      clearTimeout(timeoutId);

      console.log("n8n response status:", response.status);

      if (!response.ok) {
        const errorText = await response.text();
        console.error("n8n error response:", errorText);
        throw new Error(`Request failed: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      console.log("n8n response data:", JSON.stringify(data, null, 2));

      const updatedMemo = 
        data.revised_memo ||
        data.body?.report?.report_md || 
        data.report?.report_md ||
        data.report_md || 
        data.updated_memo ||
        data.memo ||
        data.body?.memo ||
        data.body?.updated_memo;

      if (updatedMemo) {
        toast.success("Feedback applied to memorandum", {
          description: "Review the changes below.",
        });
        onFeedbackSubmitted(updatedMemo);
      } else {
        console.error("Could not find updated memo in response. Full response:", data);
        throw new Error("No updated memo received in response");
      }
    } catch (error: any) {
      console.error("Error submitting feedback:", error);
      
      if (error.name === "AbortError") {
        toast.error("Request timed out", {
          description: "The AI processing took too long. Please try again.",
        });
      } else {
        toast.error("Something went wrong", {
          description: "Failed to apply your feedback. Please try again or contact support.",
        });
      }
    } finally {
      setIsSubmitting(false);
    }
  };


  return (
    <div className="space-y-4">
      {/* Compact Feedback Panel */}
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="p-4 space-y-3">
          {/* General Feedback Textarea */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">
              General feedback
            </label>
            <Textarea
              value={generalFeedback}
              onChange={(e) => setGeneralFeedback(e.target.value)}
              placeholder="Provide your technical feedback here (e.g. legal analysis, ATAD2 application, risk assessment, factual accuracy).

Want to comment on a specific paragraph? Click on it below."
              className="min-h-[100px] resize-y bg-background"
              disabled={isSubmitting}
            />
          </div>

          {/* Tip + Action Buttons on same row */}
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Lightbulb className="h-3 w-3" />
              Start with general feedback. Paragraph comments are optional.
            </p>
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={onCancel}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleSubmit}
                disabled={isSubmitting || !canSubmit}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Applying feedback...
                  </>
                ) : (
                  "Apply feedback"
                )}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Memo Text with Interactive Paragraphs */}
      <div className="space-y-1">
        {paragraphs.map((paragraph, index) => {
          const hasFeedback = (feedbackByParagraph[index] || "").trim().length > 0;
          const isActive = activeParagraphIndex === index;
          
          return (
            <div key={index} className="group">
              {/* Clickable Paragraph */}
              <div
                onClick={() => handleParagraphClick(index)}
                className={`
                  relative px-4 py-3 rounded-lg cursor-pointer transition-all duration-200
                  ${isActive 
                    ? 'bg-primary/10' 
                    : hasFeedback 
                      ? 'bg-primary/5 hover:bg-primary/10' 
                      : 'hover:bg-muted/50'
                  }
                `}
              >
                <div className="markdown-body prose prose-sm max-w-none dark:prose-invert text-sm">
                  <ReactMarkdown
                    rehypePlugins={[rehypeRaw]}
                    components={{
                      u: ({ children }) => (
                        <span className="underline" style={{ textDecorationLine: 'underline', textUnderlineOffset: '3px' }}>{children}</span>
                      ),
                      p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                      h1: ({ children }) => <h1 className="font-bold text-base mb-2">{children}</h1>,
                      h2: ({ children }) => <h2 className="font-bold text-base mb-2">{children}</h2>,
                      h3: ({ children }) => <h3 className="font-bold text-sm mb-2">{children}</h3>,
                      ul: ({ children }) => <ul className="list-disc list-inside mt-1 mb-2">{children}</ul>,
                      li: ({ children }) => <li className="ml-2">{children}</li>,
                    }}
                  >
                    {paragraph}
                  </ReactMarkdown>
                </div>
                
              </div>

              {/* Inline Feedback Box (editing mode) */}
              {isActive && (
                <div className="mt-2 py-3 px-3 bg-muted/30 rounded-lg animate-in slide-in-from-top-2 duration-200">
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-medium text-muted-foreground">
                      Feedback on this paragraph (optional)
                    </label>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        closeParagraphFeedback(index);
                      }}
                      className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                    >
                      <X className="h-3 w-3" />
                      Hide
                    </button>
                  </div>
                  <Textarea
                    value={feedbackByParagraph[index] || ""}
                    onChange={(e) => handleFeedbackChange(index, e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        closeParagraphFeedback(index);
                      }
                    }}
                    placeholder="Type feedback and press Enter to save (Shift+Enter for new line)"
                    className="min-h-[60px] resize-y text-sm bg-background"
                    disabled={isSubmitting}
                    autoFocus
                    onClick={(e) => e.stopPropagation()}
                  />
                </div>
              )}

              {/* Locked feedback display (when not editing but has feedback) */}
              {!isActive && hasFeedback && (
                <div 
                  className="mt-1 ml-4 py-2 px-3 bg-primary/5 rounded-md border-l-2 border-primary/30 cursor-pointer hover:bg-primary/10 transition-colors"
                  onClick={() => handleParagraphClick(index)}
                >
                  <p className="text-xs text-muted-foreground mb-1">Feedback {firstName}:</p>
                  <p className="text-sm text-foreground whitespace-pre-wrap italic">{feedbackByParagraph[index]}</p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default MemoFeedbackEditor;
