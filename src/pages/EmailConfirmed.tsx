import { useNavigate } from "react-router-dom";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { MotionPage } from "@/components/motion/MotionPage";
import { AnimatedLogo } from "@/components/AnimatedLogo";

const EmailConfirmed = () => {
  const navigate = useNavigate();

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
            Account activated
          </p>
          <h1 className="text-3xl sm:text-4xl font-normal tracking-tight text-foreground">
            Email confirmed
          </h1>
          <div className="mx-auto h-px w-16 bg-primary/40" />
          <p className="text-base text-ds-ink-secondary leading-relaxed">
            Your account is active. Head to the dashboard or open a new ATAD2 assessment.
          </p>
        </div>

        <Card className="w-full">
          <CardContent className="pt-6">
            <div className="text-center space-y-6">
              <div className="flex justify-center">
                <div className="p-4 bg-primary/10 rounded-full">
                  <CheckCircle2 className="h-10 w-10 text-primary" />
                </div>
              </div>

              <div className="space-y-3">
                <Button onClick={() => navigate("/")} className="w-full">
                  Go to dashboard
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
          </CardContent>
        </Card>

        <p className="text-center text-sm text-ds-ink-secondary">
          Svalner Atlas - ATAD2 Assessment Tool
        </p>
      </MotionPage>
    </div>
  );
};

export default EmailConfirmed;
