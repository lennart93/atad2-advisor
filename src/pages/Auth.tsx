import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/sonner";
import { Mail, CheckCircle2, Lock, Eye, EyeOff } from "lucide-react";
import { makeLocalPart, validateName, validateLocalPart } from "@/utils/emailNormalization";
import { cn } from "@/lib/utils";

const DOMAIN = "svalneratlas.com";

const Auth = () => {
  // Form state
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [localPart, setLocalPart] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showEmailConfirmation, setShowEmailConfirmation] = useState(false);
  
  // Step state
  const [currentStep, setCurrentStep] = useState(1);
  const [isEditingEmail, setIsEditingEmail] = useState(false);
  const [emailWasEdited, setEmailWasEdited] = useState(false);
  
  // Validation state
  const [firstNameError, setFirstNameError] = useState("");
  const [lastNameError, setLastNameError] = useState("");
  const [localPartError, setLocalPartError] = useState("");
  
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

  const handleEmailSave = () => {
    const validation = validateLocalPart(localPart);
    if (validation.valid) {
      setIsEditingEmail(false);
      setEmailWasEdited(true);
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

  const handleBackToEmail = () => {
    setCurrentStep(2);
    step2Ref.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  };

  const handleSubmit = async (e: React.FormEvent) => {
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
          // Try to sign in instead
          const { error: signInError } = await supabase.auth.signInWithPassword({
            email,
            password,
          });
          
          if (signInError) {
            toast.error("Account exists with different password", {
              description: "Please check your password or reset it.",
            });
          }
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
                  <p className="font-semibold text-foreground bg-muted px-3 py-2 rounded-lg font-mono">
                    {localPart}@{DOMAIN}
                  </p>
                </div>

                <div className="text-sm text-muted-foreground space-y-2">
                  <p>Don't see the email? Check your spam folder.</p>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => setShowEmailConfirmation(false)}
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
      <div className="w-full max-w-md space-y-8">
        <div className="flex justify-center">
          <img 
            src="/lovable-uploads/efcd43b8-7f08-4aea-87f2-be5e2978f8c1.png" 
            alt="Company Logo" 
            className="h-16 w-16 object-contain"
          />
        </div>
        
        <Card className="w-full max-w-lg mx-auto">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl">ATAD2 risk assessment</CardTitle>
            <CardDescription>
              Enter your details to access the assessment tool
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-8">
            {/* Step 1 - Name */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs">1</span>
                Your name
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
              <div ref={step2Ref} className="space-y-4 animate-fade-in">
                <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs">2</span>
                  Confirm your email
                </div>
                
                <div className="space-y-4">
                  <h3 className="text-lg font-medium">So this should be your email address, right?</h3>
                  
                  {!isEditingEmail ? (
                    <div className="p-4 bg-muted rounded-lg">
                      <div className="font-mono font-bold text-lg">
                        {localPart}@{DOMAIN}
                      </div>
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
                          className={cn("rounded-r-none font-mono", localPartError && "border-destructive")}
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
                  
                  <p className="text-sm text-muted-foreground">
                    We generated this from your name. You can adjust the part before @ if needed.
                  </p>
                  
                  {emailWasEdited && !isEditingEmail && (
                    <div className="flex items-center justify-between p-3 bg-blue-50 dark:bg-blue-950/20 rounded-lg border border-blue-200 dark:border-blue-800">
                      <span className="text-sm text-blue-700 dark:text-blue-300">You edited the email.</span>
                      <Button variant="link" size="sm" onClick={handleRegenerateEmail} className="h-auto p-0 text-blue-600 dark:text-blue-400">
                        Update from name?
                      </Button>
                    </div>
                  )}
                  
                  {currentStep === 2 && (
                    <div className="flex gap-3">
                      {!isEditingEmail ? (
                        <>
                          <Button onClick={handleEmailCorrect} className="flex-1">
                            Correct
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
              <div ref={step3Ref} className="space-y-4 animate-fade-in">
                <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs">3</span>
                  Password
                </div>
                
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="password">Password</Label>
                    <div className="relative">
                      <Input
                        id="password"
                        type={showPassword ? "text" : "password"}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Create or enter your password"
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
                  
                  <div className="flex gap-3">
                    <Button type="submit" className="flex-1" disabled={loading || password.length < 8}>
                      {loading ? "Signing in..." : "Sign in"}
                    </Button>
                    <Button type="button" variant="outline" onClick={handleBackToEmail}>
                      Back to email
                    </Button>
                  </div>
                </form>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Auth;