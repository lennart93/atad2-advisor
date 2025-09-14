import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmailSplitField, validateLocalPart } from "@/components/EmailSplitField";
import { Mail, CheckCircle2 } from "lucide-react";

const Auth = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);
  const [isEmailValid, setIsEmailValid] = useState(false);
  const [showEmailConfirmation, setShowEmailConfirmation] = useState(false);
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

  const handleEmailChange = (fullEmail: string, parts: { localPart: string; domain: string }) => {
    setEmail(fullEmail);
    setIsEmailValid(fullEmail.length > 0 && validateLocalPart(parts.localPart).valid);
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isEmailValid) return;
    
    setLoading(true);

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
          toast.error("Account already exists", {
            description: "An account with this email already exists. Try signing in instead.",
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

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isEmailValid) return;
    
    setLoading(true);

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        if (error.message.includes("Invalid login credentials")) {
          toast.error("Sign in failed", {
            description: "Invalid email or password.",
          });
        } else {
          toast.error("Sign in failed", {
            description: error.message,
          });
        }
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
          {/* Logo */}
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
                    Thanks for signing up! 🎉
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
        {/* Logo */}
        <div className="flex justify-center">
          <img 
            src="/lovable-uploads/efcd43b8-7f08-4aea-87f2-be5e2978f8c1.png" 
            alt="Company Logo" 
            className="h-16 w-16 object-contain"
          />
        </div>
        
        <Card className="w-full">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl">ATAD2 risk assessment</CardTitle>
            <CardDescription>
              Sign in or create an account to get started
            </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="signin" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="signin">Sign In</TabsTrigger>
              <TabsTrigger value="signup">Sign Up</TabsTrigger>
            </TabsList>
            
            <TabsContent value="signin">
              <form onSubmit={handleSignIn} className="space-y-4">
                <EmailSplitField
                  id="signin-email"
                  value={email}
                  onChange={handleEmailChange}
                  autoFocus
                  required
                />
                <div className="space-y-2">
                  <Label htmlFor="signin-password">Password</Label>
                  <Input
                    id="signin-password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="rounded-2xl border px-3 py-2 shadow-sm"
                  />
                </div>
                <Button type="submit" className="w-full" disabled={loading || !isEmailValid}>
                  {loading ? "Signing in..." : "Sign In"}
                </Button>
              </form>
            </TabsContent>
            
            <TabsContent value="signup">
              <form onSubmit={handleSignUp} className="space-y-4">
                <EmailSplitField
                  id="signup-email"
                  value={email}
                  onChange={handleEmailChange}
                  required
                />
                <div className="space-y-2">
                  <Label htmlFor="signup-password">Password</Label>
                  <Input
                    id="signup-password"
                    type="password"
                    placeholder="At least 6 characters"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={6}
                    className="rounded-2xl border px-3 py-2 shadow-sm"
                  />
                </div>
                <Button type="submit" className="w-full" disabled={loading || !isEmailValid}>
                  {loading ? "Creating account..." : "Create Account"}
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Auth;