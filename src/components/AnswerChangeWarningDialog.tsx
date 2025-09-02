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
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle>Answer Change Warning</AlertDialogTitle>
          <AlertDialogDescription>
            Changing this answer may have led to different follow-up questions. The results might not be fully reliable. Consider starting a new assessment for the most accurate outcome.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>
            Continue
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};