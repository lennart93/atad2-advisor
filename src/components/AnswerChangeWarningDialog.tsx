import React from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface AnswerChangeWarningDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  questionText: string;
  oldAnswer: string;
  newAnswer: string;
}

export const AnswerChangeWarningDialog: React.FC<AnswerChangeWarningDialogProps> = ({
  open,
  onOpenChange,
  onConfirm,
  questionText,
  oldAnswer,
  newAnswer,
}) => {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Antwoord wijziging kan leiden tot andere vragen</AlertDialogTitle>
          <AlertDialogDescription className="space-y-3">
            <p>
              Je bent bezig om het antwoord op de volgende vraag te wijzigen:
            </p>
            <div className="bg-muted p-3 rounded">
              <p className="font-medium text-sm">{questionText}</p>
              <p className="text-sm mt-2">
                <span className="font-medium">Van:</span> {oldAnswer} → <span className="font-medium">Naar:</span> {newAnswer}
              </p>
            </div>
            <p>
              Deze wijziging zou kunnen leiden tot andere vervolgvragen dan die nu zijn gesteld. 
              Het is goed denkbaar dat de uitkomst niet helemaal zuiver is. 
            </p>
            <p className="font-medium">
              Overweeg een nieuwe assessment te maken voor de meest betrouwbare resultaten.
            </p>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Annuleren</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>
            Doorgaan met wijziging
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};