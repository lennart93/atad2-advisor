import { useState } from "react";
import { useLocation } from "react-router-dom";
import {
  MessageSquare, Send,
  Bug, Lightbulb, HelpCircle, MoreHorizontal,
  type LucideIcon,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/sonner";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

type Category = "bug" | "idea" | "question" | "other";

const CATEGORY_LABELS: Record<Category, string> = {
  bug: "Bug",
  idea: "Idea",
  question: "Question",
  other: "Other",
};

const CATEGORY_ICONS: Record<Category, LucideIcon> = {
  bug: Bug,
  idea: Lightbulb,
  question: HelpCircle,
  other: MoreHorizontal,
};

const PLACEHOLDERS: Record<Category, string> = {
  bug: "What went wrong? Steps to reproduce help a lot.",
  idea: "What would make this tool better for you?",
  question: "What are you trying to figure out?",
  other: "Tell us what's on your mind.",
};

export function FloatingFeedbackButton() {
  const { user } = useAuth();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<Category>("idea");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (!user) return null;

  const reset = () => {
    setCategory("idea");
    setMessage("");
  };

  const handleSubmit = async () => {
    const trimmed = message.trim();
    if (trimmed.length === 0) {
      toast.error("Please enter a message before sending.");
      return;
    }
    setSubmitting(true);
    const { error } = await supabase.from("atad2_feedback").insert({
      user_id: user.id,
      user_email: user.email ?? "",
      category,
      message: trimmed,
      page_url: location.pathname + location.search,
      user_agent: typeof navigator !== "undefined" ? navigator.userAgent : null,
    });
    setSubmitting(false);
    if (error) {
      toast.error("Couldn't send feedback", { description: error.message });
      return;
    }
    toast.success("Thanks, your feedback has been sent.");
    reset();
    setOpen(false);
  };

  return (
    <>
      {/* Icon-only: the labelled pill overlapped the first table column and
          section titles on data-dense screens. A 44px circle clears the
          content gutter; the label lives in the tooltip and aria-label. */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Send feedback"
        title="Send feedback"
        style={{ bottom: "calc(var(--app-bottom-inset, 0px) + 20px)" }}
        className="fixed left-5 z-30 inline-flex size-11 items-center justify-center rounded-full bg-foreground text-background shadow-lg shadow-black/15 transition-[bottom,box-shadow,transform] duration-fast hover:shadow-xl hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        <MessageSquare size={17} />
      </button>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) reset();
        }}
      >
        <DialogContent className="sm:max-w-[480px] rounded-sm border-t-[3px] border-t-brand-terracotta bg-card">
          <DialogHeader>
            <DialogTitle className="font-normal">Send feedback</DialogTitle>
            <DialogDescription>
              Bugs, ideas, or questions. It all reaches the team.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <span className="text-[11px] font-medium tracking-[0.16em] uppercase text-muted-foreground">
                Type
              </span>
              <div className="grid grid-cols-4 gap-2">
                {(Object.keys(CATEGORY_LABELS) as Category[]).map((c) => {
                  const Icon = CATEGORY_ICONS[c];
                  const selected = category === c;
                  return (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setCategory(c)}
                      className={`flex flex-col items-center gap-1.5 rounded-sm border py-3 text-xs transition-colors ${
                        selected
                          ? "border-foreground bg-background text-foreground"
                          : "border-border text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <Icon
                        size={16}
                        className={selected ? "text-brand-terracotta" : "text-muted-foreground"}
                      />
                      {CATEGORY_LABELS[c]}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-1.5">
              <span className="text-[11px] font-medium tracking-[0.16em] uppercase text-muted-foreground">
                Message
              </span>
              <Textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder={PLACEHOLDERS[category]}
                maxLength={5000}
                autoFocus
                className="min-h-[120px] focus-visible:border-brand-terracotta focus-visible:ring-brand-terracotta-soft focus-visible:ring-offset-0"
              />
              <div className="text-[11px] text-muted-foreground text-right">
                {message.length} / 5000
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={submitting || message.trim().length === 0}>
              {submitting ? "Sending…" : "Send feedback"}
              <Send className="text-brand-terracotta" />
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
