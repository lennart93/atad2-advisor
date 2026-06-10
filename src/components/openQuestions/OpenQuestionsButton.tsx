import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useOpenQuestionsView } from "@/hooks/useOpenQuestions";
import { OpenQuestionsSheet } from "./OpenQuestionsSheet";

export interface OpenQuestionsButtonProps {
  sessionId: string | null;
}

/**
 * Sub-header button with the live open-questions count. Opens the register
 * sheet; "Go to question" closes the sheet and deep links into the questions
 * flow via ?q=<id>, which the guarded effect in Assessment.tsx consumes.
 * Lives beside the stepper for now; moves to DossierShell in a later slice.
 */
export function OpenQuestionsButton({ sessionId }: OpenQuestionsButtonProps) {
  const navigate = useNavigate();
  const [sheetOpen, setSheetOpen] = useState(false);
  // Queries inside the view hook are disabled while sessionId is null, so
  // calling it before the guard below is safe and keeps hook order stable.
  const { badgeCount } = useOpenQuestionsView(sessionId);

  if (!sessionId) return null;

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setSheetOpen(true)}>
        Open questions
        {badgeCount > 0 && (
          <Badge variant="secondary" className="ml-2">
            {badgeCount}
          </Badge>
        )}
      </Button>
      <OpenQuestionsSheet
        sessionId={sessionId}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        onGoToQuestion={(questionId) => {
          setSheetOpen(false);
          navigate(`/assessment?session=${sessionId}&q=${questionId}`);
        }}
      />
    </>
  );
}
