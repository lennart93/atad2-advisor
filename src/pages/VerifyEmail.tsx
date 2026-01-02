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
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-8">
        <div className="flex justify-center">
          <img
            src="/lovable-uploads/new-logo.png"
            alt="Company Logo"
            className="h-16 w-16 object-contain"
          />
        </div>

        <Card className="w-full">
          <CardContent className="pt-6">
            <div className="text-center space-y-6">
              {/* Icon */}
              <div className="flex justify-center">
                <div className="p-4 bg-primary/10 rounded-full">
                  <Mail className="h-12 w-12 text-primary" />
                </div>
              </div>

              {/* Heading */}
              <div className="space-y-2">
                <h2 className="text-2xl font-semibold text-foreground">
                  Check your email
                </h2>
                <p className="text-muted-foreground">
                  We've sent a 6-digit verification code to
                </p>
                <p className="font-semibold text-foreground bg-muted px-3 py-2 rounded-lg">
                  {email}
                </p>
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
      </div>
    </div>
  );
};

export default VerifyEmail;
