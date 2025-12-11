import React, { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, Info, X } from "lucide-react";
import { toast } from "@/components/ui/sonner";
import ReactMarkdown from "react-markdown";
import rehypeRaw from "rehype-raw";

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
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [generalFeedback, setGeneralFeedback] = useState("");

  // Split memo into paragraphs, merging titles/headers with following content
  const paragraphs = useMemo(() => {
    const splits = memoMarkdown.split(/\n\n+/).map((p) => p.trim()).filter((p) => p.length > 0);
    
    const isContentParagraph = (text: string) => {
      const isHeader = /^#{1,6}\s/.test(text);
      const isMetadata = /^(Taxpayer|Tax year|Client|Date|Entity):/i.test(text);
      const hasSentenceStructure = text.includes('. ') || text.length > 150;
      const isShort = text.length < 100;
      
      // Content paragraph = has sentences or is long, and not just a header
      return hasSentenceStructure || (!isShort && !isHeader && !isMetadata);
    };
    
    // Merge titles/headers with the next content paragraph
    const merged: string[] = [];
    let buffer = '';
    
    for (let i = 0; i < splits.length; i++) {
      const current = splits[i];
      
      if (isContentParagraph(current)) {
        // This is content - include any buffered titles before it
        if (buffer) {
          merged.push(buffer + '\n\n' + current);
          buffer = '';
        } else {
          merged.push(current);
        }
      } else {
        // This is a title/header - buffer it to merge with next content
        buffer = buffer ? buffer + '\n\n' + current : current;
      }
    }
    
    // If there's leftover buffer (titles at the end), add them
    if (buffer) {
      merged.push(buffer);
    }
    
    return merged;
  }, [memoMarkdown]);

  // Track feedback for each paragraph
  const [feedbackByParagraph, setFeedbackByParagraph] = useState<Record<number, string>>({});

  const handleFeedbackChange = (index: number, value: string) => {
    setFeedbackByParagraph((prev) => ({
      ...prev,
      [index]: value,
    }));
  };

  const handleSubmit = async () => {
    // Check if at least one feedback field is filled
    const hasParagraphFeedback = Object.values(feedbackByParagraph).some(
      (fb) => fb.trim().length > 0
    );
    const hasGeneralFeedback = generalFeedback.trim().length > 0;

    if (!hasParagraphFeedback && !hasGeneralFeedback) {
      toast.error("No feedback provided", {
        description: "Please add at least one comment before submitting.",
      });
      return;
    }

    setIsSubmitting(true);

    try {
      // Build paragraph feedback array
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

      // 10 minute timeout for AI processing (n8n can take a while)
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

      // Extract the updated memo from various possible response formats
      const updatedMemo = 
        data.body?.report?.report_md || 
        data.report?.report_md ||
        data.report_md || 
        data.updated_memo ||
        data.memo ||
        data.body?.memo ||
        data.body?.updated_memo;

      if (updatedMemo) {
        toast.success("Feedback applied", {
          description: "The memorandum has been updated.",
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
      {/* Info Banner */}
      <Alert className="bg-blue-50 border-blue-200 dark:bg-blue-950/30 dark:border-blue-800">
        <Info className="h-4 w-4 text-blue-600 dark:text-blue-400" />
        <AlertDescription className="text-blue-800 dark:text-blue-200">
          You are now reviewing the memorandum. Add feedback per paragraph; the AI will update the text based on your comments.
        </AlertDescription>
      </Alert>

      {/* Paragraphs with Feedback */}
      <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2">
        {paragraphs.map((paragraph, index) => (
          <Card key={index} className="border border-border/50">
            <CardContent className="p-4 space-y-3">
              {/* Paragraph Number */}
              <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Paragraph {index + 1}
              </div>

              {/* Original Text */}
              <div className="bg-muted/30 rounded-md p-3 text-sm markdown-body prose prose-sm max-w-none dark:prose-invert">
                <ReactMarkdown
                  rehypePlugins={[rehypeRaw]}
                  components={{
                    u: ({ children }) => (
                      <span className="underline" style={{ textDecorationLine: 'underline', textUnderlineOffset: '3px' }}>{children}</span>
                    ),
                    p: ({ children }) => <p className="mb-3 last:mb-0">{children}</p>,
                    h1: ({ children }) => <h1 className="font-bold text-base mb-2">{children}</h1>,
                    h2: ({ children }) => <h2 className="font-bold text-base mb-2">{children}</h2>,
                    h3: ({ children }) => <h3 className="font-bold text-sm mb-2">{children}</h3>,
                    ul: ({ children }) => <ul className="list-disc list-inside mt-1 mb-3">{children}</ul>,
                    li: ({ children }) => <li className="ml-2">{children}</li>,
                  }}
                >
                  {paragraph}
                </ReactMarkdown>
              </div>

              {/* Feedback Textarea */}
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">
                  Feedback for this paragraph
                </label>
                <Textarea
                  value={feedbackByParagraph[index] || ""}
                  onChange={(e) => handleFeedbackChange(index, e.target.value)}
                  placeholder="Optional: suggest changes, clarifications, tone, legal nuance, etc."
                  className="min-h-[80px] resize-y text-sm"
                  disabled={isSubmitting}
                />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* General Comments */}
      <Card className="border border-border/50">
        <CardContent className="p-4 space-y-2">
          <label className="text-sm font-medium">
            General comments (optional)
          </label>
          <Textarea
            value={generalFeedback}
            onChange={(e) => setGeneralFeedback(e.target.value)}
            placeholder="Add any general feedback about the entire document..."
            className="min-h-[100px] resize-y"
            disabled={isSubmitting}
          />
        </CardContent>
      </Card>

      {/* Action Buttons */}
      <div className="flex items-center justify-end gap-3 pt-2">
        <Button
          variant="outline"
          onClick={onCancel}
          disabled={isSubmitting}
        >
          <X className="h-4 w-4 mr-2" />
          Cancel
        </Button>
        <Button
          onClick={handleSubmit}
          disabled={isSubmitting}
          className="bg-primary"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Applying feedback...
            </>
          ) : (
            "Submit feedback"
          )}
        </Button>
      </div>
    </div>
  );
};

export default MemoFeedbackEditor;
