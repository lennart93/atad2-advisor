import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import { Checkbox } from "@/components/ui/checkbox";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Check, Info } from "lucide-react";
import { ReactNode } from "react";

interface Props {
  id: string;
  label: string;
  description: string;
  checked: boolean;
  onCheckedChange: (next: boolean) => void;
  disabled?: boolean;
  /**
   * Checkbox treatment. "default" is the near-black fill; "sage" matches the
   * gate-check swatch used elsewhere (a met/true state reads sage-green), so
   * answered states stay consistent across the app.
   */
  variant?: "default" | "sage";
  /**
   * Optional content rendered below the checkbox row when `checked === true`.
   * Lets a toggle expose dependent fields.
   */
  children?: ReactNode;
}

export function OptionToggle({ id, label, description, checked, onCheckedChange, disabled, variant = "default", children }: Props) {
  return (
    <div className="space-y-4">
      <TooltipProvider>
        <div className="flex items-center gap-2">
          {variant === "sage" ? (
            <CheckboxPrimitive.Root
              id={id}
              checked={checked}
              disabled={disabled}
              onCheckedChange={(v) => onCheckedChange(v === true)}
              className="peer flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[4px] border border-[#cdc7ba] bg-white ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:border-[#cdc7ba] data-[state=checked]:bg-[#8f9866]"
            >
              <CheckboxPrimitive.Indicator className="flex items-center justify-center text-white">
                <Check className="h-3 w-3" strokeWidth={3} />
              </CheckboxPrimitive.Indicator>
            </CheckboxPrimitive.Root>
          ) : (
            <Checkbox
              id={id}
              checked={checked}
              disabled={disabled}
              onCheckedChange={(v) => onCheckedChange(v === true)}
            />
          )}
          <label htmlFor={id} className="text-[13px] font-normal text-ds-ink cursor-pointer flex-1">
            {label}
          </label>
          <Tooltip>
            <TooltipTrigger asChild>
              <Info className="h-4 w-4 text-ds-ink-secondary cursor-default ml-1" />
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
