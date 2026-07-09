import { useState, useEffect, useRef } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Lock, Eye, EyeOff, Edit2, ArrowRight } from "lucide-react";
import { makeLocalPart, validateName, validateLocalPart } from "@/utils/emailNormalization";
import { cn } from "@/lib/utils";
import { AnimatedLogo } from "@/components/AnimatedLogo";
import { MotionPage } from "@/components/motion/MotionPage";

const DOMAIN = "svalneratlas.com";

const Auth = () => {
  // Tab state
  const [activeTab, setActiveTab] = useState("signin");

  // Reset signup state when switching tabs
  const handleTabChange = (newTab: string) => {
    if (newTab !== activeTab && activeTab === "signup") {
      // Reset all signup state when leaving signup
      setFirstName("");
      setLastName("");
      setLocalPart("");
      setPassword("");
      setCurrentStep(1);
      setIsEditingEmail(false);
      setEmailWasEdited(false);
      setFirstNameError("");
      setLastNameError("");
      setLocalPartError("");
    }
    setActiveTab(newTab);
  };

  // Sign In form state
  const [signInLocalPart, setSignInLocalPart] = useState("");
  const [signInPassword, setSignInPassword] = useState("");
  const [signInShowPassword, setSignInShowPassword] = useState(false);
  const [signInLoading, setSignInLoading] = useState(false);

  // Sign Up form state
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [localPart, setLocalPart] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  // Step state for Sign Up
  const [currentStep, setCurrentStep] = useState(1);
  const [isEditingEmail, setIsEditingEmail] = useState(false);
  const [emailWasEdited, setEmailWasEdited] = useState(false);

  // Validation state
  const [firstNameError, setFirstNameError] = useState("");
  const [lastNameError, setLastNameError] = useState("");
  const [localPartError, setLocalPartError] = useState("");
  const [signInLocalPartError, setSignInLocalPartError] = useState("");

  // Email input hints and notifications
  const [showEmailHint, setShowEmailHint] = useState(false);
  const [pasteNotice, setPasteNotice] = useState("");
  const [domainPulse, setDomainPulse] = useState(false);
  const [showUndo, setShowUndo] = useState(false);
  const [undoValue, setUndoValue] = useState("");

  // Refs for smooth scrolling
  const step2Ref = useRef<HTMLDivElement>(null);
  const step3Ref = useRef<HTMLDivElement>(null);

  const navigate = useNavigate();

  useEffect(() => {
    // Check if user is already logged in
    const checkUser = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        navigate("/");
      }
    };
    checkUser();
  }, [navigate]);

  // Generate email when names change (if not manually edited)
  useEffect(() => {
    if (firstName && lastName && !emailWasEdited) {
      try {
        const generated = makeLocalPart(firstName, lastName);
        setLocalPart(generated);
        setLocalPartError("");
      } catch (error) {
        // Silent fail - user will see validation on continue
      }
    }
  }, [firstName, lastName, emailWasEdited]);

  const validateStep1 = () => {
    const firstValidation = validateName(firstName);
    const lastValidation = validateName(lastName);

    setFirstNameError(firstValidation.valid ? "" : firstValidation.error || "");
    setLastNameError(lastValidation.valid ? "" : lastValidation.error || "");

    return firstValidation.valid && lastValidation.valid;
  };

  const handleStep1Continue = () => {
    if (validateStep1()) {
      try {
        const generated = makeLocalPart(firstName, lastName);
        setLocalPart(generated);
        setLocalPartError("");
        setCurrentStep(2);

        // Smooth scroll to step 2
        setTimeout(() => {
          step2Ref.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }, 100);
      } catch (error) {
        toast.error("Unable to generate email", {
          description: "Please check your name format",
        });
      }
    }
  };

  const handleEmailCorrect = () => {
    const validation = validateLocalPart(localPart);
    if (validation.valid) {
      setCurrentStep(3);
      setLocalPartError("");

      // Smooth scroll to step 3
      setTimeout(() => {
        step3Ref.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }, 100);
    } else {
      setLocalPartError(validation.error || "Invalid email format");
    }
  };

  const handleEmailEdit = () => {
    setIsEditingEmail(true);
  };

  // Enhanced email input handlers
  const handleEmailInput = (value: string) => {
    // Strip any @ and everything after it
    const cleanValue = value.replace(/@.*$/, '');

    // Check if @ was attempted
    if (value.includes('@')) {
      setShowEmailHint(true);
      // Remove pulse animation as requested
      // setDomainPulse(true);

      // Auto-dismiss hint after 3 seconds
      setTimeout(() => setShowEmailHint(false), 3000);
      // setTimeout(() => setDomainPulse(false), 200);
    }

    setSignInLocalPart(cleanValue.toLowerCase());
    setSignInLocalPartError("");
  };

  const handleEmailPaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasteText = e.clipboardData.getData('text');
    const emailMatch = pasteText.match(/^\s*([^@\s]+)@([^\s]+)\s*$/);

    if (emailMatch) {
      const localPart = emailMatch[1].toLowerCase();
      setUndoValue(signInLocalPart); // Store current value for undo
      setSignInLocalPart(localPart);
      setPasteNotice(`Kept "${localPart}" and locked the domain.`);
      setShowUndo(true);

      // Auto-dismiss notice and undo option after 3 seconds
      setTimeout(() => {
        setPasteNotice("");
        setShowUndo(false);
      }, 3000);
    } else {
      // Regular paste without @
      const cleanValue = pasteText.replace(/@.*$/, '').toLowerCase();
      setSignInLocalPart(cleanValue);
    }
    setSignInLocalPartError("");
  };

  const handleUndo = () => {
    setSignInLocalPart(undoValue);
    setPasteNotice("");
    setShowUndo(false);
  };

  const handleEmailSave = () => {
    const validation = validateLocalPart(localPart);
    if (validation.valid) {
      setIsEditingEmail(false);
      setLocalPartError("");
      // Advance to password step like "Looks good"
      setCurrentStep(3);

      // Smooth scroll to step 3
      setTimeout(() => {
        step3Ref.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }, 100);
    } else {
      setLocalPartError(validation.error || "Invalid email format");
    }
  };

  const handleRegenerateEmail = () => {
    try {
      const generated = makeLocalPart(firstName, lastName);
      setLocalPart(generated);
      setEmailWasEdited(false);
      setLocalPartError("");
    } catch (error) {
      toast.error("Unable to regenerate email", {
        description: "Please check your name format",
      });
    }
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!signInLocalPart || !signInPassword) {
      toast.error("Please fill in all fields");
      return;
    }

    const validation = validateLocalPart(signInLocalPart);
    if (!validation.valid) {
      setSignInLocalPartError(validation.error || "Invalid email format");
      return;
    }

    setSignInLoading(true);
    const email = `${signInLocalPart}@${DOMAIN}`;

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password: signInPassword,
      });

      if (error) {
        toast.error("Sign in failed", {
          description: error.message,
        });
      } else if (data.user && !data.user.email_confirmed_at) {
        // User exists but email not confirmed - redirect to verification
        await supabase.auth.signOut();
        navigate("/verify-email", {
          replace: true,
          state: { email, needsVerification: true }
        });
        toast.info("Please verify your email first", {
          description: "A verification code has been sent to your email.",
        });
      }
      // If confirmed, the auth listener will handle the redirect
    } catch (error) {
      toast.error("Something went wrong", {
        description: "Please try again.",
      });
    } finally {
      setSignInLoading(false);
    }
  };

  const handleSignUpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!password || password.length < 8) {
      toast.error("Password required", {
        description: "Password must be at least 8 characters",
      });
      return;
    }

    setLoading(true);
    const email = `${localPart}@${DOMAIN}`;

    try {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            first_name: firstName,
            last_name: lastName,
            full_name: `${firstName} ${lastName}`
          }
        }
      });

      if (error) {
        if (error.message.includes("User already registered")) {
          toast.error("Email address already exists", {
            description: "This email is already registered. Please try signing in instead.",
          });
        } else {
          toast.error("Registration failed", {
            description: error.message,
          });
        }
      } else {
        // Redirect to OTP verification page with email
        navigate("/verify-email", {
          replace: true,
          state: { email }
        });
      }
    } catch (error) {
      toast.error("Something went wrong", {
        description: "Please try again.",
      });
    } finally {
      setLoading(false);
    }
  };

  // Right-column header copy, tab-aware (reads existing state only).
  const heading = activeTab === "signin" ? "Sign in" : "Create your account";
  const subheading =
    activeTab === "signin"
      ? "Log in with your Svalner Atlas email address to continue."
      : "Set up your access to the ATAD2 risk assessment.";

  return (
    <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center bg-background p-4 sm:p-6">
      <div className="grid w-full max-w-5xl overflow-hidden rounded-sm border border-border shadow-[0_24px_70px_-28px_rgba(0,0,0,0.30)] lg:min-h-[620px] lg:grid-cols-2">
        {/* ── Left: editorial brand panel (hidden on small screens) ── */}
      <aside className="relative hidden flex-col justify-between overflow-hidden p-12 text-background lg:flex"
        style={{ background: "linear-gradient(158deg, #1f1c15 0%, #15130d 52%, #100e09 100%)" }}>
        {/* Oversized brand mark as a quiet watermark for depth (static, not the animated one) */}
        <img
          aria-hidden
          src="/brand/new-logo.png"
          alt=""
          draggable={false}
          className="pointer-events-none absolute -bottom-40 -right-40 h-[520px] w-[520px] object-contain opacity-[0.05] invert"
          style={{ transform: "rotate(-6deg)", filter: "brightness(0) invert(1)" }}
        />
        {/* Faint warm terracotta glow, top-left */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{ background: "radial-gradient(120% 90% at 12% 8%, rgba(194,92,60,0.14), rgba(194,92,60,0) 46%)" }}
        />

        <div className="relative z-10 flex items-center gap-3">
          <div className="[&_img]:brightness-0 [&_img]:invert">
            <AnimatedLogo size={34} />
          </div>
          <span className="text-[15px] font-normal tracking-tight">Svalner Atlas</span>
        </div>

        <div className="relative z-10">
          <div className="mb-5 text-[11px] font-normal uppercase tracking-[0.2em] text-brand-terracotta">
            ATAD2 Risk Assessment
          </div>
          <h2 className="max-w-sm text-[33px] font-normal leading-[1.16] tracking-[-0.025em]">
            Hybrid mismatches, found and documented.
          </h2>
          <div className="my-6 h-px w-11 bg-background/25" />
          <p className="max-w-xs text-[15px] leading-relaxed text-background/60">
            A review-ready position paper, built step by step.
          </p>
        </div>

        <div className="relative z-10 border-t border-background/10 pt-5 text-[11px] font-normal uppercase tracking-[0.14em] text-background/45">
          Powered by Svalner Atlas Advisors
        </div>
      </aside>

      {/* ── Right: the form (all original logic unchanged) ── */}
      <div className="flex items-center justify-center px-6 py-12 sm:px-12">
        <MotionPage className="w-full max-w-md">
          {/* Mobile-only brand mark (left panel is hidden < lg) */}
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <AnimatedLogo size={36} />
            <span className="text-[11px] font-normal uppercase tracking-[0.18em] text-muted-foreground">
              Svalner Atlas
            </span>
          </div>

          <header className="mb-8">
            <span className="text-[11px] font-normal uppercase tracking-[0.18em] text-muted-foreground">
              {activeTab === "signin" ? "Welcome back" : "Get started"}
            </span>
            <h1 className="mt-3 text-3xl font-normal tracking-[-0.02em] text-foreground">
              {heading}
            </h1>
            <p className="mt-3 text-[15px] text-muted-foreground">{subheading}</p>
          </header>

          <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="signin">Sign in</TabsTrigger>
              <TabsTrigger value="signup">Sign up</TabsTrigger>
            </TabsList>

            <TabsContent value="signin" className="mt-6 space-y-4">
              <form onSubmit={handleSignIn} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="signInEmail">Email address</Label>
                  {/* Hidden dummy field to trick autofill */}
                  <input type="email" name="fakeusernameremembered" style={{ display: 'none' }} tabIndex={-1} autoComplete="email" />
                  <div className={cn("flex items-center rounded-sm border focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2", signInLocalPartError && "border-destructive")}>
                    <Input
                      id="signInEmail"
                      type="text"
                      name="signin-username-custom"
                      value={signInLocalPart}
                      onChange={(e) => handleEmailInput(e.target.value)}
                      onPaste={handleEmailPaste}
                      className="rounded-l-sm border-0 bg-transparent shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
                      placeholder="your.name"
                      aria-describedby="email-helper email-hint"
                      autoComplete="new-password"
                      autoCorrect="off"
                      autoCapitalize="none"
                      spellCheck="false"
                      data-lpignore="true"
                      data-form-type="other"
                    />
                    <div
                      className={cn("flex h-10 items-center gap-1.5 rounded-r-sm bg-muted px-3 transition-transform", domainPulse && "animate-pulse")}
                      role="note"
                      aria-label="Domain fixed to @svalneratlas.com"
                      title="Domain is fixed to @svalneratlas.com"
                    >
                      <span className="text-muted-foreground">@{DOMAIN}</span>
                      <Lock className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </div>

                  {/* Error message */}
                  {signInLocalPartError && (
                    <p className="text-sm text-destructive" role="alert">{signInLocalPartError}</p>
                  )}

                  {/* Paste notice */}
                  {pasteNotice && (
                    <div className="flex items-center justify-between text-sm text-muted-foreground animate-fade-in" role="status" aria-live="polite">
                      <span>{pasteNotice}</span>
                      {showUndo && (
                        <button onClick={handleUndo} className="ml-2 text-foreground underline hover:no-underline">
                          Undo
                        </button>
                      )}
                    </div>
                  )}

                  {/* Helper text that changes to hint when needed */}
                  <p id="email-helper" className={cn("text-sm transition-all duration-200", showEmailHint ? "text-foreground font-normal animate-fade-in" : "text-muted-foreground")} role={showEmailHint ? "status" : undefined} aria-live={showEmailHint ? "polite" : undefined}>
                    {showEmailHint
                      ? "No need to add @svalneratlas.com, that's already included"
                      : "Fill in only the part before @. The domain is fixed."
                    }
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="signInPassword">Password</Label>
                  <div className="relative">
                    <Input
                      id="signInPassword"
                      type={signInShowPassword ? "text" : "password"}
                      value={signInPassword}
                      onChange={(e) => setSignInPassword(e.target.value)}
                      placeholder="Enter your password"
                      className="pr-10"
                      required
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                      onClick={() => setSignInShowPassword(!signInShowPassword)}
                    >
                      {signInShowPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>

                <div className="text-right">
                  <Link
                    to="/forgot-password"
                    className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                  >
                    Forgot password?
                  </Link>
                </div>

                <Button type="submit" className="w-full gap-2" disabled={signInLoading}>
                  {signInLoading ? "Signing in..." : "Sign in"}
                  {!signInLoading && <ArrowRight className="h-4 w-4 text-brand-terracotta" />}
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="signup" className="mt-6 space-y-4">
              {/* Step 1 - Name */}
              <div className="space-y-3">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="firstName">First name</Label>
                    </div>
                    <Input
                      id="firstName"
                      value={firstName}
                      onChange={(e) => {
                        setFirstName(e.target.value);
                        setFirstNameError("");
                      }}
                      placeholder="Enter your first name"
                      className={cn(firstNameError && "border-destructive")}
                      disabled={currentStep > 1 && !emailWasEdited}
                    />
                    {firstNameError && (
                      <p className="text-sm text-destructive">{firstNameError}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="lastName">Last name</Label>
                      {currentStep > 1 && !emailWasEdited && (
                        <button
                          type="button"
                          onClick={() => setCurrentStep(1)}
                          className="text-muted-foreground transition-colors hover:text-foreground"
                          title="Edit name"
                        >
                          <Edit2 className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                    <Input
                      id="lastName"
                      value={lastName}
                      onChange={(e) => {
                        setLastName(e.target.value);
                        setLastNameError("");
                      }}
                      placeholder="Enter your last name"
                      className={cn(lastNameError && "border-destructive")}
                      disabled={currentStep > 1 && !emailWasEdited}
                    />
                    {lastNameError && (
                      <p className="text-sm text-destructive">{lastNameError}</p>
                    )}
                  </div>
                </div>

                {currentStep === 1 && (
                  <Button
                    onClick={handleStep1Continue}
                    className="w-full"
                    disabled={!firstName.trim() || !lastName.trim()}
                  >
                    Continue
                  </Button>
                )}
              </div>

              {/* Step 2 - Email confirmation */}
              {currentStep >= 2 && (
                <div ref={step2Ref} className="space-y-3 animate-fade-in">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm font-normal">
                        {currentStep === 2 ? "Does this look like your email?" : "Your email address"}
                      </Label>
                      {currentStep > 2 && (
                        <button
                          type="button"
                          onClick={() => {
                            setCurrentStep(2);
                            setIsEditingEmail(true);
                          }}
                          className="text-muted-foreground transition-colors hover:text-foreground"
                          title="Edit email"
                        >
                          <Edit2 className="h-3 w-3" />
                        </button>
                      )}
                    </div>

                    {!isEditingEmail ? (
                      <div className="inline-flex items-center rounded-sm bg-muted px-3 py-2">
                        <span className="text-sm font-normal">
                          {localPart}@{DOMAIN}
                        </span>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {/* Hidden dummy field to trick autofill */}
                        <input type="email" name="fakeusernamesignup" style={{ display: 'none' }} tabIndex={-1} autoComplete="email" />
                        <div className="flex items-center rounded-sm focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2">
                          <Input
                            type="text"
                            name="signup-username-custom"
                            value={localPart}
                            onChange={(e) => {
                              setLocalPart(e.target.value.toLowerCase());
                              setLocalPartError("");
                            }}
                            className={cn("rounded-r-none focus-visible:ring-0 focus-visible:ring-offset-0", localPartError && "border-destructive")}
                            placeholder="username"
                            autoComplete="new-password"
                            autoCorrect="off"
                            autoCapitalize="none"
                            spellCheck="false"
                            data-lpignore="true"
                            data-form-type="other"
                          />
                          <div className="flex h-10 items-center gap-1.5 rounded-r-sm border border-l-0 bg-muted px-3">
                            <span className="text-muted-foreground">@{DOMAIN}</span>
                            <Lock className="h-4 w-4 text-muted-foreground" />
                          </div>
                        </div>
                        {localPartError && (
                          <p className="text-sm text-destructive">{localPartError}</p>
                        )}
                      </div>
                    )}

                    {currentStep === 2 && (
                      <div className="flex gap-3">
                        {!isEditingEmail ? (
                          <>
                            <Button onClick={handleEmailCorrect} className="flex-1">
                              Looks good
                            </Button>
                            <Button variant="outline" onClick={handleEmailEdit}>
                              Edit
                            </Button>
                          </>
                        ) : (
                          <Button onClick={handleEmailSave} className="flex-1">
                            Save
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Step 3 - Password */}
              {currentStep >= 3 && (
                <div ref={step3Ref} className="space-y-3 animate-fade-in">
                  <form onSubmit={handleSignUpSubmit} className="space-y-3">
                    <div className="space-y-2">
                      <Label htmlFor="password">Password</Label>
                      <div className="relative">
                        <Input
                          id="password"
                          type={showPassword ? "text" : "password"}
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder="Create your password"
                          className="pr-10"
                          minLength={8}
                          required
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                          onClick={() => setShowPassword(!showPassword)}
                        >
                          {showPassword ? (
                            <EyeOff className="h-4 w-4" />
                          ) : (
                            <Eye className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                      <p className="text-sm text-muted-foreground">At least 8 characters</p>
                    </div>

                    <Button type="submit" className="w-full" disabled={loading || password.length < 8}>
                      {loading ? "Creating account..." : "Create account"}
                    </Button>
                  </form>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </MotionPage>
      </div>
      </div>
    </div>
  );
};

export default Auth;
