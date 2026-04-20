import { useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/sonner";
import { Lock, ArrowLeft, Mail } from "lucide-react";
import { validateLocalPart } from "@/utils/emailNormalization";
import { cn } from "@/lib/utils";

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
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="flex justify-center">
          <img
            src="/lovable-uploads/new-logo.png"
            alt="Company Logo"
            className="h-16 w-16 object-contain"
          />
        </div>

        <Card className="w-full">
          {submitted ? (
            <CardContent className="pt-6">
              <div className="text-center space-y-6">
                <div className="flex justify-center">
                  <div className="p-4 bg-primary/10 rounded-full">
                    <Mail className="h-12 w-12 text-primary" />
                  </div>
                </div>
                <div className="space-y-2">
                  <h2 className="text-2xl font-semibold text-foreground">
                    Check your inbox
                  </h2>
                  <p className="text-muted-foreground">
                    If an account exists for this email, we've sent a reset link.
                  </p>
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
              <CardHeader className="text-center pb-4">
                <CardTitle className="text-2xl">Forgot password</CardTitle>
                <CardDescription>
                  Enter your email and we'll send you a reset link
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
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
      </div>
    </div>
  );
};

export default ForgotPassword;
