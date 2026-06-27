import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/sonner";
import { Eye, EyeOff, ArrowLeft, AlertTriangle, Loader2 } from "lucide-react";
import { MotionPage } from "@/components/motion/MotionPage";
import { AnimatedLogo } from "@/components/AnimatedLogo";

type SessionState = "checking" | "valid" | "invalid";

const ResetPassword = () => {
  const navigate = useNavigate();
  const [sessionState, setSessionState] = useState<SessionState>("checking");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [passwordError, setPasswordError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let resolved = false;

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" && session) {
        resolved = true;
        setSessionState("valid");
      }
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (resolved) return;
      setSessionState(session ? "valid" : "invalid");
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError("");

    if (password.length < 8) {
      setPasswordError("Password must be at least 8 characters");
      return;
    }

    if (password !== confirmPassword) {
      setPasswordError("Passwords do not match");
      return;
    }

    setLoading(true);

    try {
      const { error } = await supabase.auth.updateUser({ password });

      if (error) {
        toast.error("Could not update password", {
          description: error.message,
        });
      } else {
        toast.success("Password updated", {
          description: "You are now signed in.",
        });
        navigate("/", { replace: true });
      }
    } catch (err) {
      toast.error("Something went wrong", {
        description: "Please try again.",
      });
    } finally {
      setLoading(false);
    }
  };

  if (sessionState === "checking") {
    return (
      <div className="relative min-h-[calc(100vh-4rem)] flex items-center justify-center px-4 py-10 overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-gradient-to-b from-primary/5 via-background to-background"
        />
        <div className="relative flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Verifying reset link...</span>
        </div>
      </div>
    );
  }

  const eyebrow = sessionState === "invalid" ? "Reset link" : "Set a new password";
  const headline = sessionState === "invalid" ? "Invalid or expired link" : "Set new password";
  const subcopy =
    sessionState === "invalid"
      ? "This reset link is no longer valid. Please request a new one."
      : "Choose a new password for your account.";

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
          <p className="text-sm uppercase tracking-[0.2em] text-muted-foreground">{eyebrow}</p>
          <h1 className="text-3xl sm:text-4xl font-medium tracking-tight text-foreground">
            {headline}
          </h1>
          <div className="mx-auto h-px w-16 bg-primary/40" />
          <p className="text-base text-muted-foreground leading-relaxed">{subcopy}</p>
        </div>

        <Card className="w-full">
          {sessionState === "invalid" ? (
            <CardContent className="pt-6">
              <div className="text-center space-y-6">
                <div className="flex justify-center">
                  <div className="p-4 bg-destructive/10 rounded-full">
                    <AlertTriangle className="h-10 w-10 text-destructive" />
                  </div>
                </div>
                <Link
                  to="/forgot-password"
                  className="inline-flex items-center text-sm text-primary hover:underline"
                >
                  Request a new reset link
                </Link>
                <div>
                  <Link
                    to="/auth"
                    className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <ArrowLeft className="mr-1 h-3 w-3" />
                    Back to sign in
                  </Link>
                </div>
              </div>
            </CardContent>
          ) : (
            <>
              <CardContent className="space-y-4 pt-6">
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="newPassword">New password</Label>
                    <div className="relative">
                      <Input
                        id="newPassword"
                        type={showPassword ? "text" : "password"}
                        value={password}
                        onChange={(e) => {
                          setPassword(e.target.value);
                          setPasswordError("");
                        }}
                        placeholder="Enter new password"
                        className="pr-10"
                        minLength={8}
                        required
                        autoComplete="new-password"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                        onClick={() => setShowPassword(!showPassword)}
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                    </div>
                    <p className="text-sm text-muted-foreground">At least 8 characters</p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="confirmPassword">Confirm password</Label>
                    <div className="relative">
                      <Input
                        id="confirmPassword"
                        type={showConfirmPassword ? "text" : "password"}
                        value={confirmPassword}
                        onChange={(e) => {
                          setConfirmPassword(e.target.value);
                          setPasswordError("");
                        }}
                        placeholder="Re-enter new password"
                        className="pr-10"
                        minLength={8}
                        required
                        autoComplete="new-password"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      >
                        {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                    </div>
                    {passwordError && (
                      <p className="text-sm text-destructive" role="alert">
                        {passwordError}
                      </p>
                    )}
                  </div>

                  <Button
                    type="submit"
                    className="w-full"
                    disabled={loading || password.length < 8 || confirmPassword.length < 8}
                  >
                    {loading ? "Updating..." : "Update password"}
                  </Button>
                </form>
              </CardContent>
            </>
          )}
        </Card>
      </MotionPage>
    </div>
  );
};

export default ResetPassword;
