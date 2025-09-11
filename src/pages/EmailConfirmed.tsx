import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";

const EmailConfirmed = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-8">
        {/* Logo */}
        <div className="text-center">
          <img 
            src="/lovable-uploads/efcd43b8-7f08-4aea-87f2-be5e2978f8c1.png" 
            alt="Svalner Atlas"
            className="h-12 mx-auto mb-8"
          />
        </div>

        {/* Success Card */}
        <div className="bg-card rounded-lg border p-8 text-center space-y-6">
          <div className="flex justify-center">
            <CheckCircle2 className="h-16 w-16 text-green-500" />
          </div>
          
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold text-foreground">
              Email bevestigd!
            </h1>
            <p className="text-muted-foreground">
              Je account is succesvol geactiveerd. Je kunt nu beginnen met de ATAD2 assessment.
            </p>
          </div>

          <div className="space-y-3">
            <Button 
              onClick={() => navigate("/")}
              className="w-full"
            >
              Ga naar dashboard
            </Button>
            
            <Button 
              variant="outline"
              onClick={() => navigate("/assessment")}
              className="w-full"
            >
              Start assessment
            </Button>
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-sm text-muted-foreground">
          © Svalner Atlas • ATAD2 Assessment Tool
        </p>
      </div>
    </div>
  );
};

export default EmailConfirmed;