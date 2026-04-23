import { ReactNode } from "react";
import { Search, List, GitBranch } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type ViewMode = "list" | "flow";

export interface SearchFilterBarProps {
  search: string;
  onSearchChange: (v: string) => void;
  searchPlaceholder?: string;
  filters?: ReactNode;
  actions?: ReactNode;
  viewMode?: ViewMode;
  onViewModeChange?: (m: ViewMode) => void;
}

export function SearchFilterBar({
  search, onSearchChange, searchPlaceholder = "Search…", filters, actions, viewMode, onViewModeChange,
}: SearchFilterBarProps) {
  return (
    <div className="sticky top-0 z-10 bg-white/90 backdrop-blur border border-[#ececec] rounded-[12px] p-3 flex flex-wrap items-center gap-2 mb-4">
      <div className="relative flex-1 min-w-[240px]">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={searchPlaceholder}
          className="pl-9"
        />
      </div>
      {filters && <div className="flex items-center gap-2">{filters}</div>}
      {onViewModeChange && (
        <div className="flex items-center bg-muted rounded-md p-0.5">
          <button
            type="button"
            onClick={() => onViewModeChange("list")}
            className={cn(
              "inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium",
              viewMode === "list" ? "bg-white shadow-sm text-foreground" : "text-muted-foreground"
            )}
          >
            <List size={14} /> List
          </button>
          <button
            type="button"
            onClick={() => onViewModeChange("flow")}
            className={cn(
              "inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium",
              viewMode === "flow" ? "bg-white shadow-sm text-foreground" : "text-muted-foreground"
            )}
          >
            <GitBranch size={14} /> Flow
          </button>
        </div>
      )}
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
