import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/sonner";
import { Lock, ArrowLeft } from "lucide-react";
import { validateLocalPart } from "@/utils/emailNormalization";
import { cn } from "@/lib/utils";
import { MotionPage } from "@/components/motion/MotionPage";
import { AnimatedLogo } from "@/components/AnimatedLogo";

const DOMAIN = "svalneratlas.com";

const ForgotPassword = () => {
  const navigate = useNavigate();
  const [localPart, setLocalPart] = useState("");
  const [localPartError, setLocalPartError] = useState("");
  const [loading, setLoading] = useState(false);

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
      const { error } = await supabase.auth.resetPasswordForEmail(email);

      if (error && error.message.toLowerCase().includes("rate")) {
        toast.error("Too many attempts", {
          description: "Please try again in a minute.",
        });
      } else {
        navigate("/reset-password", { state: { email } });
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
          <p className="text-[11px] font-normal uppercase tracking-[0.16em] text-ds-ink-secondary">
            Account recovery
          </p>
          <h1 className="text-3xl sm:text-4xl font-normal tracking-tight text-foreground">
            Forgot password
          </h1>
          <div className="mx-auto h-px w-16 bg-primary/40" />
          <p className="text-base text-ds-ink-secondary leading-relaxed">
            Enter your Svalner Atlas email and a code to reset your password will be sent.
          </p>
        </div>

        <Card className="w-full">
          <CardContent className="space-y-4 pt-6">
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="forgotEmail">Email address</Label>
                    <div className={cn("flex items-center rounded-md border focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2", localPartError && "border-destructive")}>
                      <Input
                        id="forgotEmail"
                        type="text"
                        value={localPart}
                        onChange={(e) => handleEmailInput(e.target.value)}
                        className="border-0 rounded-l-md bg-transparent shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
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
                    {loading ? "Sending..." : "Send reset code"}
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
        </Card>
      </MotionPage>
    </div>
  );
};

export default ForgotPassword;
