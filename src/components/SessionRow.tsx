import { useNavigate } from "react-router-dom";
import { FileText, Trash2 } from "lucide-react";
import { Button, StatusPill } from "@/components/ds";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { formatDate } from "@/utils/formatDate";

export interface SessionRowProps {
  sessionId: string;
  taxpayerName: string;
  fiscalYear: string;
  completedAt: string | Date | null | undefined;
  hasMemorandum: boolean;
  memorandumDate?: string | null;
  onDelete: () => void;
}

export function SessionRow({
  sessionId,
  taxpayerName,
  fiscalYear,
  completedAt,
  hasMemorandum,
  memorandumDate,
  onDelete,
}: SessionRowProps) {
  const navigate = useNavigate();

  return (
    <div className="flex items-center justify-between gap-4 rounded-ds-card border border-ds-hairline bg-ds-card p-4 transition-colors duration-150 hover:bg-ds-fill-muted">
      <div className="min-w-0 flex-1">
        <div className="mb-1.5 flex items-center gap-3">
          <h3 className="truncate text-[15px] font-medium tracking-tight text-ds-ink">
            {taxpayerName}
          </h3>
          <Tooltip>
            <TooltipTrigger asChild>
              <span>
                {hasMemorandum ? (
                  <StatusPill status="complete">Ready</StatusPill>
                ) : (
                  <StatusPill status="neutral">Memo pending</StatusPill>
                )}
              </span>
            </TooltipTrigger>
            <TooltipContent>
              <p>
                {hasMemorandum
                  ? `Memorandum generated on ${formatDate(memorandumDate)}`
                  : "No memorandum generated yet"}
              </p>
            </TooltipContent>
          </Tooltip>
        </div>
        <p className="tabular text-[13px] text-ds-ink-secondary">
          FY{fiscalYear} · completed {formatDate(completedAt)}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => navigate(`/assessment-report/${sessionId}`)}
        >
          <FileText />
          View report
        </Button>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Delete assessment"
              className="text-ds-ink-secondary hover:text-ds-red"
            >
              <Trash2 />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete assessment</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to permanently delete this assessment for {taxpayerName}?
                This will delete all answers and cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={onDelete}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Delete permanently
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
