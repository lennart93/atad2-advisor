import React, { useState, useMemo } from "react";
import { Button } from "@/components/ds";
import { Textarea } from "@/components/ui/textarea";
import { Check, Loader2, MessageSquare, X } from "lucide-react";
import { toast } from "@/components/ui/sonner";
import { supabase } from "@/integrations/supabase/client";
import ReactMarkdown from "react-markdown";
import { useAuth } from "@/hooks/useAuth";
import { memoMarkdownComponents, MEMO_PROSE_CLASS, MEMO_REHYPE_PLUGINS } from "@/components/memo/memoProse";

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
  onSubmittingChange?: (isSubmitting: boolean) => void;
}

// A block is a lone section heading (its own line, starting with #). Those are
// rendered plain, without a comment affordance; only prose is commentable.
const isHeadingBlock = (text: string) =>
  /^#{1,6}\s/.test(text) && text.split("\n").length === 1;

/**
 * Edit-memo / feedback tool, docked into the memo reader's prose column.
 *
 * It renders ONLY the reading column's content: a compact feedback panel, a
 * labelled divider, then the memo prose split into commentable paragraphs. The
 * surrounding shell (editorial header, sticky meta rail, card) is owned by
 * `AssessmentReport`, so nothing about the reader changes when you enter or
 * leave edit mode. The prose shares the same renderer as the reader so the two
 * are visually identical.
 */
const MemoFeedbackEditor: React.FC<MemoFeedbackEditorProps> = ({
  memoMarkdown,
  sessionId,
  taxpayerName,
  fiscalYear,
  onFeedbackSubmitted,
  onCancel,
  onSubmittingChange,
}) => {
  const { user } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [generalFeedback, setGeneralFeedback] = useState("");
  const [activeParagraphIndex, setActiveParagraphIndex] = useState<number | null>(null);
  const [feedbackByParagraph, setFeedbackByParagraph] = useState<Record<number, string>>({});

  // Split the memo into blocks at blank lines, keeping headings as their own
  // (non-commentable) blocks so section titles read as titles, not tinted prose.
  const blocks = useMemo(
    () =>
      memoMarkdown
        .split(/\n\n+/)
        .map((p) => p.trim())
        .filter((p) => p.length > 0),
    [memoMarkdown],
  );

  const handleFeedbackChange = (index: number, value: string) => {
    setFeedbackByParagraph((prev) => ({ ...prev, [index]: value }));
  };

  const handleParagraphClick = (index: number) => {
    if (isSubmitting) return;
    setActiveParagraphIndex(activeParagraphIndex === index ? null : index);
  };

  const closeParagraphFeedback = (index: number) => {
    if (activeParagraphIndex === index) setActiveParagraphIndex(null);
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    onSubmittingChange?.(true);

    try {
      // Build paragraph feedback array - only non-empty
      const paragraphFeedback: ParagraphFeedback[] = blocks
        .map((text, index) => ({
          paragraphIndex: index,
          originalText: text,
          feedbackText: feedbackByParagraph[index] || "",
        }))
        .filter((item) => item.feedbackText.trim().length > 0);

      const { data: { session: authSession } } = await supabase.auth.getSession();

      const payload = {
        session_id: sessionId,
        auth_token: authSession?.access_token,
        taxpayer_name: taxpayerName,
        fiscal_year: fiscalYear,
        original_memo: memoMarkdown,
        paragraph_feedback: paragraphFeedback,
        general_feedback: generalFeedback.trim() || null,
      };

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10 * 60 * 1000);

      const response = await fetch(
        `${import.meta.env.VITE_N8N_WEBHOOK_BASE}/atad2/submit-feedback`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
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
      onSubmittingChange?.(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Docked feedback panel. Sits as the first child of the prose column, so
          it shares the prose's exact left/right edges (not the full card width). */}
      <div className="rounded-[7px] border border-ds-hairline border-t-2 border-t-brand-terracotta bg-ds-page px-5 pb-4 pt-[18px]">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <span className="text-[11px] font-medium uppercase tracking-[0.16em] text-ds-ink-tertiary">
            Feedback
          </span>
          <span className="text-[12.5px] text-ds-ink-tertiary">
            Add general notes, or comment on specific paragraphs.
          </span>
        </div>

        <Textarea
          value={generalFeedback}
          onChange={(e) => setGeneralFeedback(e.target.value)}
          placeholder="Technical, substantive, style, or general impressions."
          aria-label="Feedback"
          className="mt-3 min-h-[96px] resize-y rounded-[6px] border-ds-hairline bg-ds-card px-3.5 py-3 text-[14.5px] leading-[1.6] focus-visible:border-brand-terracotta focus-visible:shadow-[0_0_0_3px_rgba(194,92,60,0.12)] focus-visible:ring-0 focus-visible:ring-offset-0"
          disabled={isSubmitting}
        />

        <div className="mt-3 flex items-center justify-end gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={onCancel}
            disabled={isSubmitting}
            className="text-ds-ink-secondary hover:text-ds-ink"
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="rounded-[6px]"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="animate-spin" />
                Applying feedback…
              </>
            ) : (
              <>
                <Check className="text-[#e0a48f]" />
                Apply feedback
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Labelled divider — separates the tool from the document. */}
      <div className="flex items-center gap-3">
        <span className="h-px flex-1 bg-ds-hairline" />
        <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-ds-ink-tertiary">
          Memorandum
        </span>
        <span className="h-px flex-1 bg-ds-hairline" />
      </div>

      {/* Commentable prose. Same renderer as the reader; on hover a paragraph
          tints soft terracotta and a comment marker fades in in the left margin. */}
      <div className="flex flex-col gap-2">
        {blocks.map((block, index) => {
          if (isHeadingBlock(block)) {
            return (
              <div key={index} className={MEMO_PROSE_CLASS}>
                <ReactMarkdown rehypePlugins={MEMO_REHYPE_PLUGINS} components={memoMarkdownComponents}>
                  {block}
                </ReactMarkdown>
              </div>
            );
          }

          const hasFeedback = (feedbackByParagraph[index] || "").trim().length > 0;
          const isActive = activeParagraphIndex === index;
          const isMarked = isActive || hasFeedback;

          return (
            <div key={index} className="group relative">
              {/* Left-margin comment marker (desktop only; sits in the column gap) */}
              <button
                type="button"
                onClick={() => handleParagraphClick(index)}
                disabled={isSubmitting}
                aria-label="Comment on this paragraph"
                className={`absolute -left-[34px] top-1.5 hidden h-[22px] w-[22px] items-center justify-center rounded-[6px] border bg-ds-card transition-all md:flex ${
                  isMarked
                    ? "border-brand-terracotta text-brand-terracotta opacity-100"
                    : "border-ds-hairline text-ds-ink-tertiary opacity-0 hover:border-brand-terracotta hover:text-brand-terracotta focus-visible:opacity-100 group-hover:opacity-100"
                }`}
              >
                <MessageSquare className="h-3 w-3" />
              </button>

              {/* Paragraph body. Hover tints soft terracotta, bleeding ~20px into
                  both side margins via the negative horizontal margin + padding.
                  Mouse convenience only; the keyboard path is the adjacent
                  "Comment on this paragraph" button. */}
              {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
              <div
                onClick={() => handleParagraphClick(index)}
                className={`-mx-5 cursor-pointer rounded-[6px] px-5 py-1.5 transition-colors [&_p]:!mb-0 ${
                  isMarked ? "bg-[#faf2ee]" : "hover:bg-[#faf2ee]"
                }`}
              >
                <div className={MEMO_PROSE_CLASS}>
                  <ReactMarkdown rehypePlugins={MEMO_REHYPE_PLUGINS} components={memoMarkdownComponents}>
                    {block}
                  </ReactMarkdown>
                </div>
              </div>

              {/* Inline per-paragraph comment editor */}
              {isActive && (
                <div className="mt-2 rounded-[6px] border border-ds-hairline bg-ds-page p-3 duration-200 animate-in slide-in-from-top-2">
                  <div className="mb-2 flex items-center justify-between">
                    <label htmlFor={`memo-paragraph-feedback-${index}`} className="text-[13px] text-ds-ink-secondary">
                      Feedback on this paragraph (optional)
                    </label>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        closeParagraphFeedback(index);
                      }}
                      className="flex items-center gap-1 text-[13px] text-ds-ink-secondary hover:text-ds-ink"
                    >
                      <X className="h-3 w-3" />
                      Hide
                    </button>
                  </div>
                  <Textarea
                    id={`memo-paragraph-feedback-${index}`}
                    value={feedbackByParagraph[index] || ""}
                    onChange={(e) => handleFeedbackChange(index, e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        closeParagraphFeedback(index);
                      }
                    }}
                    placeholder="Type feedback and press Enter to save (Shift+Enter for new line)"
                    className="min-h-[60px] resize-y rounded-[6px] border-ds-hairline bg-ds-card text-[14px] focus-visible:border-brand-terracotta focus-visible:shadow-[0_0_0_3px_rgba(194,92,60,0.12)] focus-visible:ring-0 focus-visible:ring-offset-0"
                    disabled={isSubmitting}
                    // Editor opens on the user's own click; moving focus into it is expected.
                    // eslint-disable-next-line jsx-a11y/no-autofocus
                    autoFocus
                    onClick={(e) => e.stopPropagation()}
                  />
                </div>
              )}

              {/* Locked feedback display (has feedback, not currently editing) */}
              {!isActive && hasFeedback && (
                <div
                  role="button"
                  tabIndex={isSubmitting ? -1 : 0}
                  aria-label="Edit feedback for this paragraph"
                  className={`mt-2 rounded-[6px] border border-ds-hairline bg-ds-page p-3 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-terracotta ${
                    isSubmitting ? "cursor-default" : "cursor-pointer"
                  }`}
                  onClick={() => !isSubmitting && handleParagraphClick(index)}
                  onKeyDown={(e) => {
                    if (!isSubmitting && (e.key === "Enter" || e.key === " ")) {
                      e.preventDefault();
                      handleParagraphClick(index);
                    }
                  }}
                >
                  <p className="mb-1 flex items-center gap-1.5 text-[13px] text-ds-ink-secondary">
                    {isSubmitting && <Loader2 className="h-3 w-3 animate-spin" />}
                    Paragraph-specific feedback:
                  </p>
                  <p className="whitespace-pre-wrap text-[13px] italic text-ds-ink">
                    {feedbackByParagraph[index]}
                  </p>
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
