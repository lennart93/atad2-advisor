import { LucideIcon } from "lucide-react";
import type { EntityKey } from "./entityColors";
import { cn } from "@/lib/utils";

export interface IconChipProps {
  /**
   * Kept for API stability, but the chip now renders monochrome — entity tinting
   * felt too playful in the admin panel. Re-introduce accents selectively.
   */
  entity?: EntityKey;
  icon: LucideIcon;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const SIZES = {
  sm: { box: "h-7 w-7 rounded-[8px]", icon: 14 },
  md: { box: "h-9 w-9 rounded-[10px]", icon: 18 },
  lg: { box: "h-11 w-11 rounded-[12px]", icon: 22 },
};

export function IconChip({ icon: Icon, size = "md", className }: IconChipProps) {
  const { box, icon } = SIZES[size];
  return (
    <div
      className={cn(
        "inline-flex items-center justify-center bg-muted text-muted-foreground",
        box,
        className
      )}
    >
      <Icon size={icon} strokeWidth={1.75} />
    </div>
  );
}
