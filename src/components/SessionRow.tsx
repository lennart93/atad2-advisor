import { useNavigate } from "react-router-dom";
import { FileText, Trash2, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
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
    <div className="flex items-center justify-between p-4 border border-[hsl(var(--border-subtle))] rounded-lg bg-background transition-[border-color,box-shadow,transform] duration-200 motion-safe:hover:-translate-y-px hover:border-[hsl(var(--border-default))] hover:shadow-md">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-3 mb-2">
          <h3 className="font-semibold tracking-tight truncate">{taxpayerName}</h3>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div>
                  {hasMemorandum ? (
                    <Badge variant="live">
                      Ready
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="gap-1">
                      <Clock className="h-3 w-3" />
                      In progress
                    </Badge>
                  )}
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p>
                  {hasMemorandum
                    ? `Memorandum generated on ${formatDate(memorandumDate)}`
                    : "No memorandum generated yet"}
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        <div className="text-sm text-muted-foreground tabular">
          FY {fiscalYear} · Completed {formatDate(completedAt)}
        </div>
      </div>
      <div className="flex items-center gap-3">
        <Button
          variant="outline"
          size="sm"
          onClick={() => navigate(`/assessment-report/${sessionId}`)}
        >
          <FileText className="h-4 w-4 mr-2" />
          View report
        </Button>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <button className="text-red-600 hover:text-red-800 text-sm flex items-center gap-1 transition-colors duration-200">
              <Trash2 className="h-4 w-4" />
              Delete
            </button>
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
