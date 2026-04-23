import { forwardRef, HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export interface AdminCardProps extends HTMLAttributes<HTMLDivElement> {
  interactive?: boolean;
}

export const AdminCard = forwardRef<HTMLDivElement, AdminCardProps>(
  ({ className, interactive, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "bg-white border border-[#ececec] rounded-[14px] p-4",
        interactive && "cursor-pointer transition-shadow hover:shadow-[0_2px_8px_rgba(0,0,0,0.06)]",
        className
      )}
      {...props}
    />
  )
);
AdminCard.displayName = "AdminCard";
