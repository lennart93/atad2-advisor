import { NavLink } from "react-router-dom";
import {
  LayoutDashboard, ListChecks, HelpCircle, FileText, Users,
  BarChart3, Database, AlertCircle, ArrowLeft, Sparkles, Activity, LucideIcon,
} from "lucide-react";
import { IconChip } from "@/components/admin/IconChip";
import { cn } from "@/lib/utils";
import { useAdminAccess } from "@/hooks/useAdminAccess";

type Item = { title: string; url: string; icon: LucideIcon };

const ITEMS: Item[] = [
  { title: "Hub",               url: "/admin/dashboard",         icon: LayoutDashboard },
  { title: "Questions",         url: "/admin/questions",         icon: ListChecks },
  { title: "Context questions", url: "/admin/context-questions", icon: HelpCircle },
  { title: "Sessions",          url: "/admin/sessions",          icon: FileText },
  { title: "Users",             url: "/admin/users",             icon: Users },
  { title: "Analytics",         url: "/admin/analytics",         icon: BarChart3 },
  { title: "Data Explorer",     url: "/admin/explorer",          icon: Database },
  { title: "Pre-Fill Prompts",  url: "/admin/prefill-prompts",   icon: Sparkles },
  { title: "Pre-Fill Jobs",     url: "/admin/prefill-jobs",      icon: Activity },
  { title: "Audit Log",         url: "/admin/audit",             icon: AlertCircle },
];

const linkClasses = ({ isActive }: { isActive: boolean }) =>
  cn(
    "flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors duration-fast border-l-2",
    isActive
      ? "bg-accent border-l-primary text-foreground font-medium"
      : "border-l-transparent text-muted-foreground hover:bg-muted/60 hover:text-foreground hover:border-l-border"
  );

export function AppSidebar() {
  const { isAdmin, isModerator } = useAdminAccess();
  const sectionLabel = isAdmin ? "Admin" : isModerator ? "Moderator" : "Admin";
  return (
    <aside className="w-52 shrink-0">
      <nav className="sticky top-20 flex flex-col gap-1">
        <NavLink
          to="/"
          className="flex items-center gap-2.5 px-3 py-2 rounded-md text-sm border-l-2 border-l-transparent text-muted-foreground hover:bg-muted/60 hover:text-foreground hover:border-l-border transition-colors duration-fast"
        >
          <IconChip icon={ArrowLeft} size="sm" />
          <span>Back to dashboard</span>
        </NavLink>

        <div className="mt-4 mb-1 px-3 text-xs uppercase tracking-[0.18em] text-muted-foreground font-medium">
          {sectionLabel}
        </div>
        {ITEMS.map((item) => (
          <NavLink key={item.title} to={item.url} end className={linkClasses}>
            <IconChip icon={item.icon} size="sm" />
            <span>{item.title}</span>
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
