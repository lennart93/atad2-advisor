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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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

const CATEGORY_ICON_COLOR: Record<Category, string> = {
  bug: "text-ds-ink-tertiary",
  idea: "text-ds-ink-tertiary",
  question: "text-ds-ink-tertiary",
  other: "text-ds-ink-tertiary",
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
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Send feedback"
        style={{ bottom: "calc(var(--app-bottom-inset, 0px) + 20px)" }}
        className="fixed left-5 z-30 inline-flex items-center gap-2 rounded-ds-control bg-foreground text-background px-4 py-2.5 text-sm font-medium shadow-lg shadow-black/15 transition-[bottom,box-shadow,transform] duration-fast hover:shadow-xl hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        <MessageSquare size={16} />
        <span>Feedback</span>
      </button>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) reset();
        }}
      >
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>Send feedback</DialogTitle>
            <DialogDescription>
              Bugs, ideas, or questions. It all comes through to the team.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Type
              </label>
              <Select value={category} onValueChange={(v) => setCategory(v as Category)}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(CATEGORY_LABELS) as Category[]).map((c) => {
                    const Icon = CATEGORY_ICONS[c];
                    return (
                      <SelectItem key={c} value={c}>
                        <span className="flex items-center gap-2">
                          <Icon size={14} className={CATEGORY_ICON_COLOR[c]} />
                          {CATEGORY_LABELS[c]}
                        </span>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Message
              </label>
              <Textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder={PLACEHOLDERS[category]}
                rows={5}
                maxLength={5000}
                autoFocus
              />
              <div className="text-[11px] text-muted-foreground text-right">
                {message.length}/5000
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={submitting || message.trim().length === 0}>
              <Send className="size-4 mr-2" />
              {submitting ? "Sending…" : "Send feedback"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
