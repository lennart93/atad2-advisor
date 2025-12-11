import React, { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
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

  // Split memo into paragraphs (by double newlines or significant breaks)
  const paragraphs = useMemo(() => {
    const splits = memoMarkdown.split(/\n\n+/);
    return splits
      .map((p) => p.trim())
      .filter((p) => p.length > 0);
  }, [memoMarkdown]);

  // Track feedback tags for each paragraph (array of strings per paragraph)
  const [feedbackTagsByParagraph, setFeedbackTagsByParagraph] = useState<Record<number, string[]>>({});
  // Track current input value per paragraph
  const [inputValues, setInputValues] = useState<Record<number, string>>({});

  const handleInputChange = (index: number, value: string) => {
    setInputValues((prev) => ({
      ...prev,
      [index]: value,
    }));
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && inputValues[index]?.trim()) {
      e.preventDefault();
      const newTag = inputValues[index].trim();
      setFeedbackTagsByParagraph((prev) => ({
        ...prev,
        [index]: [...(prev[index] || []), newTag],
      }));
      setInputValues((prev) => ({
        ...prev,
        [index]: "",
      }));
    }
  };

  const removeTag = (paragraphIndex: number, tagIndex: number) => {
    setFeedbackTagsByParagraph((prev) => ({
      ...prev,
      [paragraphIndex]: (prev[paragraphIndex] || []).filter((_, i) => i !== tagIndex),
    }));
  };

  const handleSubmit = async () => {
    // Check if at least one feedback tag or general feedback is provided
    const hasParagraphFeedback = Object.values(feedbackTagsByParagraph).some(
      (tags) => tags && tags.length > 0
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
      // Build paragraph feedback array - combine tags into single feedback string
      const paragraphFeedback: ParagraphFeedback[] = paragraphs
        .map((text, index) => ({
          paragraphIndex: index,
          originalText: text,
          feedbackText: (feedbackTagsByParagraph[index] || []).join("; "),
        }))
        .filter((item) => item.feedbackText.length > 0);

      const payload = {
        session_id: sessionId,
        taxpayer_name: taxpayerName,
        fiscal_year: fiscalYear,
        original_memo: memoMarkdown,
        paragraph_feedback: paragraphFeedback,
        general_feedback: generalFeedback.trim() || null,
      };

      // 5 minute timeout for AI processing
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5 * 60 * 1000);

      const response = await fetch(
        "https://lennartwilming.app.n8n.cloud/webhook/atad2/update-memo",
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

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Request failed: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      console.log("Feedback response:", data);

      // Extract the updated memo from the response
      const updatedMemo = data.body?.report?.report_md || data.report_md || data.updated_memo;

      if (updatedMemo) {
        toast.success("Feedback applied", {
          description: "The memorandum has been updated.",
        });
        onFeedbackSubmitted(updatedMemo);
      } else {
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
          You are now reviewing the memorandum. Add feedback per paragraph by typing and pressing Enter. The AI will update the text based on your comments.
        </AlertDescription>
      </Alert>

      {/* Paragraphs with Feedback Tags */}
      <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-2">
        {paragraphs.map((paragraph, index) => (
          <div key={index} className="border border-border/40 rounded-lg p-3 space-y-2 bg-card/50">
            {/* Paragraph Number */}
            <div className="text-[10px] font-medium text-muted-foreground/60 uppercase tracking-wider">
              Paragraph {index + 1}
            </div>

            {/* Original Text */}
            <div className="text-sm text-foreground/90 markdown-body">
              <ReactMarkdown
                rehypePlugins={[rehypeRaw]}
                components={{
                  u: ({ children }) => (
                    <span className="underline" style={{ textDecorationLine: 'underline', textUnderlineOffset: '3px' }}>{children}</span>
                  ),
                  p: ({ children }) => <span>{children}</span>,
                  h1: ({ children }) => <span className="font-bold">{children}</span>,
                  h2: ({ children }) => <span className="font-bold">{children}</span>,
                  h3: ({ children }) => <span className="font-bold">{children}</span>,
                  ul: ({ children }) => <ul className="list-disc list-inside mt-1">{children}</ul>,
                  li: ({ children }) => <li className="ml-2">{children}</li>,
                }}
              >
                {paragraph}
              </ReactMarkdown>
            </div>

            {/* Feedback Tags + Input */}
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              {/* Existing Tags */}
              {(feedbackTagsByParagraph[index] || []).map((tag, tagIndex) => (
                <Badge
                  key={tagIndex}
                  variant="secondary"
                  className="pl-2 pr-1 py-0.5 text-xs font-normal bg-primary/10 text-primary hover:bg-primary/15 gap-1"
                >
                  {tag}
                  <button
                    type="button"
                    onClick={() => removeTag(index, tagIndex)}
                    className="ml-0.5 hover:bg-primary/20 rounded-full p-0.5"
                    disabled={isSubmitting}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
              
              {/* Tag Input */}
              <Input
                type="text"
                value={inputValues[index] || ""}
                onChange={(e) => handleInputChange(index, e.target.value)}
                onKeyDown={(e) => handleKeyDown(index, e)}
                placeholder="Add feedback..."
                className="h-6 w-32 text-xs border-dashed border-muted-foreground/30 bg-transparent px-2 focus-visible:ring-1 focus-visible:ring-primary/30"
                disabled={isSubmitting}
              />
            </div>
          </div>
        ))}
      </div>

      {/* General Comments */}
      <div className="border border-border/40 rounded-lg p-3 space-y-2 bg-card/50">
        <label className="text-xs font-medium text-muted-foreground">
          General comments (optional)
        </label>
        <Textarea
          value={generalFeedback}
          onChange={(e) => setGeneralFeedback(e.target.value)}
          placeholder="Add any general feedback about the entire document..."
          className="min-h-[60px] resize-y text-sm"
          disabled={isSubmitting}
        />
      </div>

      {/* Action Buttons */}
      <div className="flex items-center justify-end gap-3 pt-2">
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
          disabled={isSubmitting}
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
