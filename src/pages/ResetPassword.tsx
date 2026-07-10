import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/sonner";
import { Eye, EyeOff, ArrowLeft, AlertTriangle, Loader2, Mail } from "lucide-react";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import { MotionPage } from "@/components/motion/MotionPage";
import { AnimatedLogo } from "@/components/AnimatedLogo";

type Phase = "checking" | "code" | "form" | "invalid";

const RESEND_COOLDOWN = 60; // seconds

const ResetPassword = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const email = location.state?.email as string | undefined;

  const [phase, setPhase] = useState<Phase>("checking");

  // Code entry state
  const [otpCode, setOtpCode] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const [codeError, setCodeError] = useState("");
  const [isResending, setIsResending] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const cooldownIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // New password state
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [passwordError, setPasswordError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let resolved = false;

    // Legacy path: reset emails that carried a verify link land here with a
    // recovery session in the URL hash.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" && session) {
        resolved = true;
        setPhase("form");
      }
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (resolved) return;
      if (session) {
        setPhase("form");
      } else if (email) {
        setPhase("code");
      } else {
        setPhase("invalid");
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [email]);

  useEffect(() => {
    if (resendCooldown > 0) {
      cooldownIntervalRef.current = setInterval(() => {
        setResendCooldown((prev) => {
          if (prev <= 1) {
            if (cooldownIntervalRef.current) {
              clearInterval(cooldownIntervalRef.current);
            }
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }

    return () => {
      if (cooldownIntervalRef.current) {
        clearInterval(cooldownIntervalRef.current);
      }
    };
  }, [resendCooldown]);

  const handleVerifyCode = async () => {
    if (otpCode.length !== 6 || !email) return;

    setIsVerifying(true);
    setCodeError("");

    try {
      const { data, error } = await supabase.auth.verifyOtp({
        email,
        token: otpCode,
        type: "recovery",
      });

      if (error || !data.session) {
        setCodeError("Invalid or expired code. Please try again.");
        setOtpCode("");
      } else {
        setPhase("form");
      }
    } catch (err) {
      setCodeError("Something went wrong. Please try again.");
      setOtpCode("");
    } finally {
      setIsVerifying(false);
    }
  };

  // Auto-submit when 6 digits are entered
  useEffect(() => {
    if (otpCode.length === 6 && !isVerifying) {
      handleVerifyCode();
    }
  }, [otpCode]);

  const handleResend = async () => {
    if (resendCooldown > 0 || !email) return;

    setIsResending(true);
    setCodeError("");

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email);

      if (error) {
        toast.error("Failed to resend code", {
          description: error.message,
        });
      } else {
        toast.success("Reset code sent", {
          description: "Check your inbox for the new code.",
        });
        setResendCooldown(RESEND_COOLDOWN);
        setOtpCode("");
      }
    } catch (err) {
      toast.error("Something went wrong", {
        description: "Please try again.",
      });
    } finally {
      setIsResending(false);
    }
  };

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

  if (phase === "checking") {
    return (
      <div className="relative min-h-[calc(100vh-4rem)] flex items-center justify-center px-4 py-10 overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-gradient-to-b from-primary/5 via-background to-background"
        />
        <div className="relative flex items-center gap-2 text-ds-ink-secondary">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Preparing password reset...</span>
        </div>
      </div>
    );
  }

  const eyebrow =
    phase === "invalid" ? "Password reset" : phase === "code" ? "Account recovery" : "Account access";
  const headline =
    phase === "invalid"
      ? "Reset could not continue"
      : phase === "code"
        ? "Check your inbox"
        : "Set a new password";
  const subcopy =
    phase === "invalid"
      ? "This reset is no longer valid. Request a fresh code to continue."
      : phase === "code"
        ? "Enter the 6-digit code that was sent to your email to continue."
        : "Choose a new password to finish signing in to your account.";

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
          <p className="text-[11px] font-normal uppercase tracking-[0.16em] text-ds-ink-secondary">{eyebrow}</p>
          <h1 className="text-3xl sm:text-4xl font-normal tracking-tight text-ds-ink">
            {headline}
          </h1>
          <div className="mx-auto h-px w-16 bg-primary/40" />
          <p className="text-base text-ds-ink-secondary leading-relaxed">
            {phase === "code" && email ? (
              <>
                Enter the 6-digit code sent to{" "}
                <span className="font-normal text-foreground font-mono tabular-nums">{email}</span> to continue.
              </>
            ) : (
              subcopy
            )}
          </p>
        </div>

        <Card className="w-full">
          {phase === "invalid" ? (
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
                  Request a new reset code
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
          ) : phase === "code" ? (
            <CardContent className="pt-6">
              <div className="text-center space-y-6">
                <div className="flex justify-center">
                  <div className="p-4 bg-primary/10 rounded-full">
                    <Mail className="h-10 w-10 text-primary" />
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex justify-center">
                    <InputOTP
                      maxLength={6}
                      value={otpCode}
                      onChange={(value) => {
                        setOtpCode(value);
                        setCodeError("");
                      }}
                      disabled={isVerifying}
                      containerClassName="gap-3"
                    >
                      <InputOTPGroup className="gap-2">
                        <InputOTPSlot index={0} className="rounded-md border" />
                        <InputOTPSlot index={1} className="rounded-md border" />
                        <InputOTPSlot index={2} className="rounded-md border" />
                        <InputOTPSlot index={3} className="rounded-md border" />
                        <InputOTPSlot index={4} className="rounded-md border" />
                        <InputOTPSlot index={5} className="rounded-md border" />
                      </InputOTPGroup>
                    </InputOTP>
                  </div>

                  {codeError && (
                    <p className="text-sm text-destructive" role="alert">
                      {codeError}
                    </p>
                  )}

                  <Button
                    onClick={handleVerifyCode}
                    disabled={otpCode.length !== 6 || isVerifying}
                    className="w-full"
                  >
                    {isVerifying ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Verifying...
                      </>
                    ) : (
                      "Verify"
                    )}
                  </Button>
                </div>

                <div className="space-y-3 pt-2">
                  <div className="text-sm text-muted-foreground">
                    Didn't receive the code?{" "}
                    <button
                      onClick={handleResend}
                      disabled={resendCooldown > 0 || isResending}
                      className="text-primary hover:underline disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isResending ? (
                        "Sending..."
                      ) : resendCooldown > 0 ? (
                        `Resend in ${resendCooldown}s`
                      ) : (
                        "Resend code"
                      )}
                    </button>
                  </div>

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
