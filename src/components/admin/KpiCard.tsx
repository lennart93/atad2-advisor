import { LucideIcon } from "lucide-react";
import { IconChip } from "./IconChip";
import { AdminCard } from "./AdminCard";
import { Sparkline } from "./Sparkline";
import type { EntityKey } from "./entityColors";
import { cn } from "@/lib/utils";

export interface KpiCardProps {
  entity: EntityKey;
  icon: LucideIcon;
  label: string;
  value: string | number;
  subLabel?: string;
  trend?: { direction: "up" | "down"; label: string };
  sparkline?: number[];
  size?: "sm" | "lg";
  className?: string;
}

export function KpiCard({
  entity, icon, label, value, subLabel, trend, sparkline, size = "sm", className,
}: KpiCardProps) {
  void entity;
  return (
    <AdminCard className={cn("flex flex-col justify-between", className)}>
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <IconChip entity={entity} icon={icon} size="sm" />
            <span className="text-xs font-medium text-muted-foreground">{label}</span>
          </div>
          <div
            className={cn(
              "font-bold leading-none text-foreground",
              size === "lg" ? "text-[30px]" : "text-[24px]"
            )}
          >
            {value}
          </div>
          {subLabel && (
            <div className="text-[10px] text-muted-foreground mt-1">{subLabel}</div>
          )}
          {trend && (
            <div
              className={cn(
                "text-[11px] font-medium mt-1",
                trend.direction === "up" ? "text-[#10b981]" : "text-[#ef4444]"
              )}
            >
              {trend.direction === "up" ? "↑" : "↓"} {trend.label}
            </div>
          )}
        </div>
        {sparkline && size === "lg" && (
          <Sparkline values={sparkline} color="hsl(var(--muted-foreground))" />
        )}
      </div>
    </AdminCard>
  );
}
