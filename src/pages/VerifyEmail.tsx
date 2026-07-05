import { useState, useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "@/components/ui/sonner";
import { Mail, Loader2, ArrowLeft } from "lucide-react";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import { MotionPage } from "@/components/motion/MotionPage";
import { AnimatedLogo } from "@/components/AnimatedLogo";

const RESEND_COOLDOWN = 60; // seconds

const VerifyEmail = () => {
  const navigate = useNavigate();
  const location = useLocation();
  
  // Get email from location state
  const email = location.state?.email as string | undefined;
  
  const [otpCode, setOtpCode] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [error, setError] = useState("");
  
  const cooldownIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Redirect to auth if no email in state
  useEffect(() => {
    if (!email) {
      navigate("/auth", { replace: true });
    }
  }, [email, navigate]);

  // Handle cooldown timer
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

  // Check if user is already verified on mount
  useEffect(() => {
    const checkVerification = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user?.email_confirmed_at) {
        navigate("/", { replace: true });
      }
    };
    checkVerification();
  }, [navigate]);

  const handleVerify = async () => {
    if (otpCode.length !== 6) {
      setError("Please enter the complete 6-digit code");
      return;
    }

    if (!email) {
      setError("Email address is missing");
      return;
    }

    setIsVerifying(true);
    setError("");

    try {
      const { data, error } = await supabase.auth.verifyOtp({
        email,
        token: otpCode,
        type: "signup",
      });

      if (error) {
        setError("Invalid or expired code. Please try again.");
        setOtpCode("");
      } else if (data.session) {
        toast.success("Email verified successfully!");
        navigate("/", { replace: true });
      }
    } catch (err) {
      setError("Something went wrong. Please try again.");
      setOtpCode("");
    } finally {
      setIsVerifying(false);
    }
  };

  const handleResend = async () => {
    if (resendCooldown > 0 || !email) return;

    setIsResending(true);
    setError("");

    try {
      const { error } = await supabase.auth.resend({
        type: "signup",
        email,
      });

      if (error) {
        toast.error("Failed to resend code", {
          description: error.message,
        });
      } else {
        toast.success("Verification code sent!", {
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

  const handleBackToSignup = () => {
    navigate("/auth", { replace: true, state: { tab: "signup" } });
  };

  // Auto-submit when 6 digits are entered
  useEffect(() => {
    if (otpCode.length === 6) {
      handleVerify();
    }
  }, [otpCode]);

  if (!email) {
    return null; // Will redirect in useEffect
  }

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
            Verify your email
          </p>
          <h1 className="text-3xl sm:text-4xl font-normal tracking-tight text-foreground">
            Check your inbox
          </h1>
          <div className="mx-auto h-px w-16 bg-primary/40" />
          <p className="text-base text-ds-ink-secondary leading-relaxed">
            Enter the 6-digit verification code sent to{" "}
            <span className="font-normal text-foreground font-mono tabular-nums">{email}</span> to confirm your account.
          </p>
        </div>

        <Card className="w-full">
          <CardContent className="pt-6">
            <div className="text-center space-y-6">
              {/* Icon */}
              <div className="flex justify-center">
                <div className="p-4 bg-primary/10 rounded-full">
                  <Mail className="h-10 w-10 text-primary" />
                </div>
              </div>

              {/* OTP Input */}
              <div className="space-y-4">
                <div className="flex justify-center">
                  <InputOTP
                    maxLength={6}
                    value={otpCode}
                    onChange={(value) => {
                      setOtpCode(value);
                      setError("");
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

                {/* Error message */}
                {error && (
                  <p className="text-sm text-destructive" role="alert">
                    {error}
                  </p>
                )}

                {/* Verify button */}
                <Button
                  onClick={handleVerify}
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

              {/* Resend and back links */}
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

                <button
                  onClick={handleBackToSignup}
                  className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  <ArrowLeft className="mr-1 h-3 w-3" />
                  Use a different email
                </button>
              </div>
            </div>
          </CardContent>
        </Card>
      </MotionPage>
    </div>
  );
};

export default VerifyEmail;
