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
    <AdminCard
      className={cn(
        "flex flex-col justify-between transition-all duration-normal ease-emphasized hover:shadow-sm hover:border-foreground/20",
        className
      )}
    >
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <IconChip entity={entity} icon={icon} size="sm" />
            <span className="text-xs uppercase tracking-[0.18em] text-muted-foreground font-medium">{label}</span>
          </div>
          <div
            className={cn(
              "font-semibold tracking-tight leading-none text-foreground tabular-nums",
              size === "lg" ? "text-3xl sm:text-4xl" : "text-3xl"
            )}
          >
            {value}
          </div>
          {subLabel && (
            <div className="text-[10px] text-muted-foreground mt-1.5 font-mono">{subLabel}</div>
          )}
          {trend && (
            <div className="text-[11px] font-medium mt-1 text-ds-ink-secondary">
              {trend.direction === "up" ? "↑" : "↓"} {trend.label}
            </div>
          )}
        </div>
        {sparkline && size === "lg" && (
          <Sparkline values={sparkline} color="var(--ds-ink-tertiary)" />
        )}
      </div>
    </AdminCard>
  );
}
