import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { AlertTriangle, RefreshCw } from "lucide-react";

export const ContextSkeleton = () => (
  <div className="space-y-3 p-4 border rounded-lg bg-muted/20">
    <div className="flex items-center gap-2">
      <div className="w-2 h-2 bg-primary rounded-full animate-pulse" />
      <span className="text-sm text-muted-foreground">Loading context questions...</span>
    </div>
    <Skeleton className="h-4 w-full" />
    <Skeleton className="h-4 w-3/4" />
    <Skeleton className="h-4 w-1/2" />
  </div>
);

export const ContextEmptyState = ({ text }: { text: string }) => (
  <div className="p-4 border rounded-lg bg-muted/10">
    <div className="flex items-center gap-2 text-muted-foreground">
      <span className="text-sm">{text}</span>
    </div>
  </div>
);

export const ContextErrorState = ({ 
  text, 
  onRetry 
}: { 
  text: string; 
  onRetry: () => void; 
}) => (
  <div className="p-4 border rounded-lg bg-destructive/10 border-destructive/20">
    <div className="flex items-start justify-between gap-2">
      <div className="flex items-center gap-2 text-destructive">
        <AlertTriangle className="w-4 h-4" />
        <span className="text-sm">{text}</span>
      </div>
      <Button 
        variant="outline" 
        size="sm" 
        onClick={onRetry}
        className="h-8 px-2"
      >
        <RefreshCw className="w-3 h-3 mr-1" />
        Retry
      </Button>
    </div>
  </div>
);

export const ContextPromptList = ({ prompts }: { prompts: string[] }) => (
  <div className="space-y-2">
    {prompts.map((prompt, index) => (
      <div key={index} className="p-3 border rounded-lg bg-background">
        <p className="text-sm leading-relaxed">{prompt}</p>
      </div>
    ))}
  </div>
);