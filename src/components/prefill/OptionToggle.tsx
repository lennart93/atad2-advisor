import { Checkbox } from "@/components/ui/checkbox";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Info } from "lucide-react";
import { ReactNode } from "react";

interface Props {
  id: string;
  label: string;
  description: string;
  checked: boolean;
  onCheckedChange: (next: boolean) => void;
  disabled?: boolean;
  /**
   * Optional content rendered inside the same card below the checkbox row
   * when `checked === true`. Lets a toggle expose dependent fields without
   * breaking the card boundary.
   */
  children?: ReactNode;
}

export function OptionToggle({ id, label, description, checked, onCheckedChange, disabled, children }: Props) {
  return (
    <div className="border border-border rounded-lg p-4 space-y-4">
      <TooltipProvider>
        <div className="flex items-center space-x-2">
          <Checkbox
            id={id}
            checked={checked}
            disabled={disabled}
            onCheckedChange={(v) => onCheckedChange(v === true)}
          />
          <label htmlFor={id} className="text-sm font-medium cursor-pointer flex-1">
            {label}
          </label>
          <Tooltip>
            <TooltipTrigger asChild>
              <Info className="h-4 w-4 text-muted-foreground cursor-default ml-1" />
            </TooltipTrigger>
            <TooltipContent>
              <p className="max-w-xs">{description}</p>
            </TooltipContent>
          </Tooltip>
        </div>
      </TooltipProvider>
      {checked && children}
    </div>
  );
}
