import { useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/sonner";
import { Lock, ArrowLeft, Mail } from "lucide-react";
import { validateLocalPart } from "@/utils/emailNormalization";
import { cn } from "@/lib/utils";
import { MotionPage } from "@/components/motion/MotionPage";
import { AnimatedLogo } from "@/components/AnimatedLogo";

const DOMAIN = "svalneratlas.com";

const ForgotPassword = () => {
  const [localPart, setLocalPart] = useState("");
  const [localPartError, setLocalPartError] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleEmailInput = (value: string) => {
    const cleanValue = value.replace(/@.*$/, '').toLowerCase();
    setLocalPart(cleanValue);
    setLocalPartError("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const validation = validateLocalPart(localPart);
    if (!validation.valid) {
      setLocalPartError(validation.error || "Invalid email format");
      return;
    }

    setLoading(true);
    const email = `${localPart}@${DOMAIN}`;

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });

      if (error && error.message.toLowerCase().includes("rate")) {
        toast.error("Too many attempts", {
          description: "Please try again in a minute.",
        });
      } else {
        setSubmitted(true);
      }
    } catch (err) {
      toast.error("Something went wrong", {
        description: "Please try again.",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-[calc(100vh-4rem)] flex items-center justify-center px-4 py-10 overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-gradient-to-b from-primary/5 via-background to-background"
      />
      <MotionPage className="relative w-full max-w-md space-y-8">
        <div className="text-center space-y-5">
          <div className="flex justify-center">
            <AnimatedLogo size={56} />
          </div>
          <p className="text-sm uppercase tracking-[0.2em] text-muted-foreground">
            {submitted ? "Reset email sent" : "Account recovery"}
          </p>
          <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight text-foreground">
            {submitted ? "Check your inbox" : "Forgot password"}
          </h1>
          <div className="mx-auto h-px w-16 bg-primary/40" />
          <p className="text-base text-muted-foreground leading-relaxed">
            {submitted
              ? "If an account exists for this email, a reset link has been sent."
              : "Enter your email and a reset link will be sent."}
          </p>
        </div>

        <Card className="w-full">
          {submitted ? (
            <CardContent className="pt-6">
              <div className="text-center space-y-6">
                <div className="flex justify-center">
                  <div className="p-4 bg-primary/10 rounded-full">
                    <Mail className="h-10 w-10 text-primary" />
                  </div>
                </div>
                <Link
                  to="/auth"
                  className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  <ArrowLeft className="mr-1 h-3 w-3" />
                  Back to sign in
                </Link>
              </div>
            </CardContent>
          ) : (
            <>
              <CardContent className="space-y-4 pt-6">
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="forgotEmail">Email address</Label>
                    <div className={cn("flex items-center rounded-md border", localPartError && "border-destructive")}>
                      <Input
                        id="forgotEmail"
                        type="text"
                        value={localPart}
                        onChange={(e) => handleEmailInput(e.target.value)}
                        className="border-0 rounded-l-md bg-transparent shadow-none"
                        placeholder="your.name"
                        autoComplete="username"
                        autoCorrect="off"
                        autoCapitalize="none"
                        spellCheck="false"
                      />
                      <div
                        className="flex items-center gap-1 bg-muted px-3 py-2 h-10 rounded-r-md"
                        role="note"
                        aria-label={`Domain fixed to @${DOMAIN}`}
                      >
                        <span className="text-muted-foreground">@{DOMAIN}</span>
                        <Lock className="h-4 w-4 text-muted-foreground" />
                      </div>
                    </div>
                    {localPartError && (
                      <p className="text-sm text-destructive" role="alert">
                        {localPartError}
                      </p>
                    )}
                  </div>

                  <Button type="submit" className="w-full" disabled={loading || !localPart.trim()}>
                    {loading ? "Sending..." : "Send reset link"}
                  </Button>
                </form>

                <div className="text-center pt-2">
                  <Link
                    to="/auth"
                    className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <ArrowLeft className="mr-1 h-3 w-3" />
                    Back to sign in
                  </Link>
                </div>
              </CardContent>
            </>
          )}
        </Card>
      </MotionPage>
    </div>
  );
};

export default ForgotPassword;
