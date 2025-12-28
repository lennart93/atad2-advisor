import { useState, useEffect, useRef } from "react";
import { Lightbulb, X, User, Check, Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

const FEEDBACK_TYPES = [
  { value: "feature", label: "💡 Feature idea", displayLabel: "Feature idea" },
  { value: "bug", label: "🐛 Bug report", displayLabel: "Bug report" },
  { value: "design", label: "🎨 Design suggestion", displayLabel: "Design suggestion" },
  { value: "question", label: "❓ Question", displayLabel: "Question" },
  { value: "other", label: "💬 Other", displayLabel: "Other" },
];

const MAX_CHARS = 500;
const WEBHOOK_URL = "https://lennartwilming.app.n8n.cloud/webhook/lovable-feedback";

export const FeedbackWidget = () => {
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [feedbackType, setFeedbackType] = useState("");
  const [feedbackText, setFeedbackText] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<"idle" | "success" | "error">("idle");
  const popupRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Fetch user profile for name
  const { data: userProfile } = useQuery({
    queryKey: ["user-profile-feedback", user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data, error } = await supabase
        .from("profiles")
        .select("first_name, last_name, full_name, email")
        .eq("user_id", user.id)
        .single();
      if (error) return null;
      return data;
    },
    enabled: !!user,
    staleTime: 60_000,
  });

  const getDisplayName = () => {
    if (userProfile?.first_name && userProfile?.last_name) {
      return `${userProfile.first_name} ${userProfile.last_name}`;
    }
    if (userProfile?.full_name) return userProfile.full_name;
    if (userProfile?.first_name) return userProfile.first_name;
    if (user?.email) return user.email.split("@")[0];
    return "Anonymous User";
  };
  const displayName = getDisplayName();
  const userEmail = userProfile?.email || user?.email || "";

  // Handle outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;

      // Radix Select renders its content in a Portal (outside popupRef). If we treat that as
      // an "outside click", the popup closes before the option can be selected.
      const clickedInRadixPortal = !!target.closest(
        "[data-radix-portal], [data-radix-popper-content-wrapper]"
      );
      if (clickedInRadixPortal) return;

      if (
        isOpen &&
        popupRef.current &&
        triggerRef.current &&
        !popupRef.current.contains(target) &&
        !triggerRef.current.contains(target)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  // Handle escape key
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && isOpen) {
        setIsOpen(false);
      }
    };

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [isOpen]);

  // Focus textarea when popup opens
  useEffect(() => {
    if (isOpen && textareaRef.current) {
      setTimeout(() => textareaRef.current?.focus(), 100);
    }
  }, [isOpen]);

  // Reset form when popup closes
  useEffect(() => {
    if (!isOpen && submitStatus === "idle") {
      // Keep form state when just closing
    }
    if (!isOpen && submitStatus === "success") {
      // Reset after success
      setFeedbackType("");
      setFeedbackText("");
      setSubmitStatus("idle");
    }
  }, [isOpen, submitStatus]);

  const handleSubmit = async () => {
    if (!feedbackText.trim() || !feedbackType) return;

    setIsSubmitting(true);
    setSubmitStatus("idle");

    const selectedType = FEEDBACK_TYPES.find((t) => t.value === feedbackType);

    const payload = {
      naam: displayName,
      email: userEmail,
      onderwerp: selectedType?.displayLabel || feedbackType,
      feedback: feedbackText.trim(),
      pagina: window.location.href,
      timestamp: new Date().toISOString(),
    };

    try {
      const response = await fetch(WEBHOOK_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      setSubmitStatus("success");

      // Auto-close after 2 seconds
      setTimeout(() => {
        setIsOpen(false);
      }, 2000);
    } catch (error) {
      console.error("Feedback submission error:", error);
      setSubmitStatus("error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRetry = () => {
    setSubmitStatus("idle");
    handleSubmit();
  };

  const togglePopup = () => {
    if (!isOpen) {
      setSubmitStatus("idle");
    }
    setIsOpen(!isOpen);
  };

  const charsRemaining = MAX_CHARS - feedbackText.length;
  const isFormValid = feedbackText.trim().length > 0 && feedbackType !== "";

  return (
    <>
      {/* Floating Trigger Button */}
      <button
        ref={triggerRef}
        onClick={togglePopup}
        className={cn(
          "fixed bottom-6 right-6 z-[9999] w-14 h-14 rounded-full",
          "bg-gradient-to-br from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70",
          "text-primary-foreground shadow-lg",
          "flex items-center justify-center",
          "transition-all duration-300 ease-out",
          "hover:scale-110 hover:shadow-xl",
          "focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2",
          !isOpen && submitStatus !== "success" && "animate-pulse-glow"
        )}
        aria-label={isOpen ? "Close feedback form" : "Open feedback form"}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
      >
        {submitStatus === "success" ? (
          <Check className="w-6 h-6" />
        ) : (
          <Lightbulb className="w-6 h-6" />
        )}
      </button>

      {/* Popup Panel */}
      {isOpen && (
        <div
          ref={popupRef}
          role="dialog"
          aria-labelledby="feedback-title"
          aria-describedby="feedback-subtitle"
          className={cn(
            "fixed z-[9999] bg-popover text-popover-foreground",
            "rounded-xl shadow-2xl border border-border",
            "animate-fade-in",
            // Desktop: positioned above button
            "bottom-24 right-6 w-80",
            // Mobile: bottom sheet style
            "max-sm:bottom-0 max-sm:right-0 max-sm:left-0 max-sm:w-full max-sm:rounded-b-none max-sm:max-h-[85vh] max-sm:overflow-y-auto"
          )}
        >
          {/* Arrow pointing to button (desktop only) */}
          <div className="hidden sm:block feedback-popup-arrow" />

          {/* Header */}
          <div className="p-4 border-b border-border">
            <div className="flex items-start justify-between">
              <div>
                <h2 id="feedback-title" className="text-base font-semibold flex items-center gap-2">
                  <Lightbulb className="w-5 h-5 text-primary flex-shrink-0" />
                  Help us improve
                </h2>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="p-1 rounded-md hover:bg-muted transition-colors focus:outline-none focus:ring-2 focus:ring-primary"
                aria-label="Close feedback form"
              >
                <X className="w-5 h-5 text-muted-foreground" />
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="p-4 space-y-4">
            {submitStatus === "success" ? (
              <div className="text-center py-6">
                <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-primary/10 flex items-center justify-center">
                  <Check className="w-6 h-6 text-primary" />
                </div>
                <p className="text-lg font-medium">Thanks for helping us improve! 🎉</p>
                <p className="text-sm text-muted-foreground mt-1">Your feedback means a lot.</p>
              </div>
            ) : submitStatus === "error" ? (
              <div className="text-center py-4">
                <p className="text-destructive font-medium">Oops! Something went wrong.</p>
                <p className="text-sm text-muted-foreground mt-1">Please try again.</p>
                <Button onClick={handleRetry} className="mt-4" variant="outline">
                  Retry
                </Button>
              </div>
            ) : (
              <>
                {/* User Info */}
                <div className="bg-muted/50 rounded-lg p-3">
                  <div className="flex items-center gap-2 text-sm">
                    <User className="w-4 h-4 text-muted-foreground" />
                    <span className="font-medium">{displayName}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Your name helps us follow up if needed
                  </p>
                </div>

                {/* Type Selector */}
                <div>
                  <Select value={feedbackType} onValueChange={setFeedbackType}>
                    <SelectTrigger className="w-full" aria-label="Select feedback type">
                      <SelectValue placeholder="What type of input?" />
                    </SelectTrigger>
                    <SelectContent className="z-[10000]">
                      {FEEDBACK_TYPES.map((type) => (
                        <SelectItem key={type.value} value={type.value}>
                          {type.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Feedback Textarea */}
                <div>
                  <Textarea
                    ref={textareaRef}
                    value={feedbackText}
                    onChange={(e) => setFeedbackText(e.target.value.slice(0, MAX_CHARS))}
                    placeholder="What would make this app better for you?"
                    rows={4}
                    className="resize-none"
                    aria-label="Your feedback"
                  />
                  <div className="flex justify-end mt-1">
                    <span
                      className={cn(
                        "text-xs",
                        charsRemaining < 50 ? "text-destructive" : "text-muted-foreground"
                      )}
                    >
                      {charsRemaining} characters remaining
                    </span>
                  </div>
                </div>

                {/* Motivational Footer */}
                <p className="text-xs text-muted-foreground italic text-center">
                  Your input shapes what we build next
                </p>

                {/* Submit Button */}
                <Button
                  onClick={handleSubmit}
                  disabled={!isFormValid || isSubmitting}
                  className="w-full"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Sending...
                    </>
                  ) : (
                    "Send"
                  )}
                </Button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
};
