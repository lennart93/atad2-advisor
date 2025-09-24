import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Mail, CheckCircle2, Lock, Eye, EyeOff, Edit2, Info } from "lucide-react";
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
      setEmail("");
      setPassword("");
      setCurrentStep(1);
      setIsEditingEmail(false);
      setEmailWasEdited(false);
      setFirstNameError("");
      setLastNameError("");
      setEmailError("");
    }
    setActiveTab(newTab);
  };
  
  // Sign In form state
  const [signInEmail, setSignInEmail] = useState("");
  const [signInPassword, setSignInPassword] = useState("");
  const [signInShowPassword, setSignInShowPassword] = useState(false);
  const [signInLoading, setSignInLoading] = useState(false);
  
  // Sign Up form state
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
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
  const [emailError, setEmailError] = useState("");
  const [signInEmailError, setSignInEmailError] = useState("");
  
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
        setEmail(`${generated}@${DOMAIN}`);
        setEmailError("");
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
        setEmail(`${generated}@${DOMAIN}`);
        setEmailError("");
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
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (emailRegex.test(email)) {
      setCurrentStep(3);
      setEmailError("");
      
      // Smooth scroll to step 3
      setTimeout(() => {
        step3Ref.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }, 100);
    } else {
      setEmailError("Invalid email format");
    }
  };

  const handleEmailEdit = () => {
    setIsEditingEmail(true);
  };

  // Enhanced email input handlers
  const handleEmailInput = (value: string) => {
    setSignInEmail(value.toLowerCase());
    setSignInEmailError("");
  };
  
  const handleEmailPaste = (e: React.ClipboardEvent) => {
    const pasteText = e.clipboardData.getData('text').toLowerCase();
    setSignInEmail(pasteText);
    setSignInEmailError("");
  };
  

  const handleEmailSave = () => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (emailRegex.test(email)) {
      setIsEditingEmail(false);
      setEmailError("");
      // Advance to password step like "Looks good"
      setCurrentStep(3);
      
      // Smooth scroll to step 3
      setTimeout(() => {
        step3Ref.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }, 100);
    } else {
      setEmailError("Invalid email format");
    }
  };

  const handleRegenerateEmail = () => {
    try {
      const generated = makeLocalPart(firstName, lastName);
      setEmail(`${generated}@${DOMAIN}`);
      setEmailWasEdited(false);
      setEmailError("");
    } catch (error) {
      toast.error("Unable to regenerate email", {
        description: "Please check your name format",
      });
    }
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!signInEmail || !signInPassword) {
      toast.error("Please fill in all fields");
      return;
    }
    
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(signInEmail)) {
      setSignInEmailError("Invalid email format");
      return;
    }
    
    setSignInLoading(true);

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: signInEmail,
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
    
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setEmailError("Invalid email format");
      return;
    }
    
    setLoading(true);

    try {
      const redirectUrl = `${window.location.origin}/email-confirmed`;
      
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: redirectUrl,
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
              src="/lovable-uploads/new-logo.png" 
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
                      {email}
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
            src="/lovable-uploads/new-logo.png" 
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
                     <Input
                       id="signInEmail"
                       type="email"
                       value={signInEmail}
                       onChange={(e) => handleEmailInput(e.target.value)}
                       onPaste={handleEmailPaste}
                       placeholder="your.name@example.com"
                       required
                     />
                     
                     {/* Error message */}
                     {signInEmailError && (
                       <p className="text-sm text-destructive" role="alert">{signInEmailError}</p>
                     )}
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
                              className="text-muted-foreground hover:text-foreground transition-colors"
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
                        <Label className="text-sm font-medium">
                          {currentStep === 2 ? "Does this look like your email?" : "Your email address"}
                        </Label>
                        {currentStep > 2 && (
                          <button
                            type="button"
                            onClick={() => {
                              setCurrentStep(2);
                              setIsEditingEmail(true);
                            }}
                            className="text-muted-foreground hover:text-foreground transition-colors"
                            title="Edit email"
                          >
                            <Edit2 className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                      
                       {!isEditingEmail ? (
                         <div className="inline-flex items-center bg-muted px-3 py-2 rounded-md">
                           <span className="font-medium text-sm">
                             {email}
                           </span>
                         </div>
                       ) : (
                         <div className="space-y-2">
                           <Input
                             type="email"
                             value={email}
                             onChange={(e) => {
                               setEmail(e.target.value.toLowerCase());
                               setEmailError("");
                               setEmailWasEdited(true);
                             }}
                             className={cn(emailError && "border-destructive")}
                             placeholder="your.name@example.com"
                           />
                           {emailError && (
                             <p className="text-sm text-destructive">{emailError}</p>
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
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Auth;