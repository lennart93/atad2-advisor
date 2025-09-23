import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Mail, CheckCircle2, Lock, Eye, EyeOff } from "lucide-react";
import { makeLocalPart, validateName, validateLocalPart } from "@/utils/emailNormalization";
import { cn } from "@/lib/utils";

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
  const [showEmailConfirmation, setShowEmailConfirmation] = useState(false);
  
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
      setDomainPulse(true);
      
      // Auto-dismiss hint after 3 seconds
      setTimeout(() => setShowEmailHint(false), 3000);
      setTimeout(() => setDomainPulse(false), 200);
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
      setPasteNotice(`We kept "${localPart}" and locked the domain.`);
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
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password: signInPassword,
      });
      
      if (error) {
        toast.error("Sign in failed", {
          description: error.message,
        });
      }
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
      const redirectUrl = `${window.location.origin}/email-confirmed`;
      
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: redirectUrl
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
        setShowEmailConfirmation(true);
      }
    } catch (error) {
      toast.error("Something went wrong", {
        description: "Please try again.",
      });
    } finally {
      setLoading(false);
    }
  };

  if (showEmailConfirmation) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="w-full max-w-md space-y-8">
          <div className="flex justify-center">
            <img 
              src="/lovable-uploads/efcd43b8-7f08-4aea-87f2-be5e2978f8c1.png" 
              alt="Company Logo" 
              className="h-16 w-16 object-contain"
            />
          </div>
          
          <Card className="w-full">
            <CardContent className="pt-6">
              <div className="text-center space-y-6">
                <div className="flex justify-center">
                  <div className="relative">
                    <Mail className="h-16 w-16 text-primary" />
                    <CheckCircle2 className="h-6 w-6 text-green-500 absolute -top-1 -right-1 bg-background rounded-full" />
                  </div>
                </div>
                
                <div className="space-y-3">
                  <h2 className="text-2xl font-semibold text-foreground">
                    Account created
                  </h2>
                  <p className="text-muted-foreground">
                    We've sent a confirmation email to
                  </p>
                   <p className="font-semibold text-foreground bg-muted px-3 py-2 rounded-lg">
                     {localPart}@{DOMAIN}
                   </p>
                </div>

                <div className="text-sm text-muted-foreground space-y-2">
                  <p>Don't see the email? Check your spam folder.</p>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => {
                      setShowEmailConfirmation(false);
                      setActiveTab("signin");
                    }}
                  >
                    Back to sign in
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="flex justify-center">
          <img 
            src="/lovable-uploads/efcd43b8-7f08-4aea-87f2-be5e2978f8c1.png" 
            alt="Company Logo" 
            className="h-16 w-16 object-contain"
          />
        </div>
        
        <Card className="w-full max-w-[480px] mx-auto">
          <CardHeader className="text-center pb-4">
            <CardTitle className="text-2xl">ATAD2 risk assessment</CardTitle>
            <CardDescription>
              Sign in or create an account to get started
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="signin">Sign in</TabsTrigger>
                <TabsTrigger value="signup">Sign up</TabsTrigger>
              </TabsList>
              
              <TabsContent value="signin" className="space-y-4 mt-4">
                <form onSubmit={handleSignIn} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="signInEmail">Email address</Label>
                    <div className={cn("flex items-center rounded-md border transition-colors", "focus-within:border-primary focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2", signInLocalPartError && "border-destructive")}>
                      <Input
                        id="signInEmail"
                        value={signInLocalPart}
                        onChange={(e) => handleEmailInput(e.target.value)}
                        onPaste={handleEmailPaste}
                        className="border-0 rounded-l-md focus:ring-0 focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:outline-0 focus:outline-0 focus:border-0 focus-visible:border-0 bg-transparent shadow-none outline-0 [&:focus]:border-0 [&:focus]:outline-0 [&:focus]:ring-0"
                        placeholder="your.name"
                        aria-describedby="email-helper email-hint"
                      />
                      <div 
                        className={cn("flex items-center gap-1 bg-muted px-3 py-2 h-10 rounded-r-md transition-transform", domainPulse && "animate-pulse")}
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
                    
                    {/* Inline hint */}
                    {showEmailHint && (
                      <div id="email-hint" className="text-sm text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/20 px-3 py-2 rounded-md animate-fade-in" role="status" aria-live="polite">
                        No need to add @svalneratlas.com — we've already got that.
                      </div>
                    )}
                    
                    {/* Paste notice */}
                    {pasteNotice && (
                      <div className="flex items-center justify-between text-sm text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-950/20 px-3 py-2 rounded-md animate-fade-in" role="status" aria-live="polite">
                        <span>{pasteNotice}</span>
                        {showUndo && (
                          <button onClick={handleUndo} className="text-green-700 dark:text-green-300 underline hover:no-underline">
                            Undo
                          </button>
                        )}
                      </div>
                    )}
                    
                    {/* Helper text */}
                    <p id="email-helper" className="text-sm text-muted-foreground">
                      Fill in only the part before @. The domain is fixed.
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
                  
                  <Button type="submit" className="w-full" disabled={signInLoading}>
                    {signInLoading ? "Signing in..." : "Sign in"}
                  </Button>
                </form>
              </TabsContent>
              
              <TabsContent value="signup" className="space-y-4 mt-4">
                {/* Step 1 - Name */}
                <div className="space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label htmlFor="firstName">First name</Label>
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
                      <Label htmlFor="lastName">Last name</Label>
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
                      <Label className="text-sm font-medium">
                        {currentStep === 2 ? "Does this look like your email?" : "Your email address"}
                      </Label>
                      
                      {!isEditingEmail ? (
                        <div className="inline-flex items-center bg-muted px-3 py-2 rounded-md">
                          <span className="font-medium text-sm">
                            {localPart}@{DOMAIN}
                          </span>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <div className="flex items-center">
                            <Input
                              value={localPart}
                              onChange={(e) => {
                                setLocalPart(e.target.value.toLowerCase());
                                setLocalPartError("");
                              }}
                              className={cn("rounded-r-none", localPartError && "border-destructive")}
                              placeholder="username"
                            />
                            <div className="flex items-center gap-1 bg-muted border border-l-0 px-3 py-2 h-10 rounded-r-md">
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
                        <p className="text-sm text-muted-foreground">At least 8 characters.</p>
                      </div>
                      
                      <Button type="submit" className="w-full" disabled={loading || password.length < 8}>
                        {loading ? "Creating account..." : "Create account"}
                      </Button>
                    </form>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Auth;