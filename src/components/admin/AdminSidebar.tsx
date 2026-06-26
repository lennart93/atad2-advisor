import { NavLink } from "react-router-dom";
import {
  LayoutDashboard, ListChecks, HelpCircle, FileText, Users,
  BarChart3, Database, AlertCircle, ArrowLeft, Sparkles, Activity,
  MessageSquare, Scale, Wand2, LucideIcon,
} from "lucide-react";
import { IconChip } from "@/components/admin/IconChip";
import { cn } from "@/lib/utils";
import { useAdminAccess } from "@/hooks/useAdminAccess";
import { useFeedbackNewCount } from "@/hooks/useFeedbackNewCount";

type Item = { title: string; url: string; icon: LucideIcon; badgeKey?: "feedback" };

const ITEMS: Item[] = [
  { title: "Dashboard",         url: "/admin/dashboard",         icon: LayoutDashboard },
  { title: "Questions",         url: "/admin/questions",         icon: ListChecks },
  { title: "Context questions", url: "/admin/context-questions", icon: HelpCircle },
  { title: "Sessions",          url: "/admin/sessions",          icon: FileText },
  { title: "Users",             url: "/admin/users",             icon: Users },
  { title: "Feedback",          url: "/admin/feedback",          icon: MessageSquare, badgeKey: "feedback" },
  { title: "Analytics",         url: "/admin/analytics",         icon: BarChart3 },
  { title: "Data Explorer",     url: "/admin/explorer",          icon: Database },
  { title: "Prompts",           url: "/admin/prompts",           icon: Sparkles },
  { title: "Prompt Tuner",      url: "/admin/prompt-tuner",      icon: Wand2 },
  { title: "Appendix framework", url: "/admin/appendix-skeleton", icon: Scale },
  { title: "Pre-Fill Jobs",     url: "/admin/prefill-jobs",      icon: Activity },
  { title: "Audit Log",         url: "/admin/audit",             icon: AlertCircle },
];

const linkClasses = ({ isActive }: { isActive: boolean }) =>
  cn(
    "flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors duration-fast border-l-2",
    isActive
      ? "bg-ds-fill-muted border-l-ds-ink text-ds-ink font-medium"
      : "border-l-transparent text-muted-foreground hover:bg-muted/60 hover:text-foreground hover:border-l-border"
  );

export function AppSidebar() {
  const { isAdmin, isModerator } = useAdminAccess();
  const feedbackNew = useFeedbackNewCount();
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
        {ITEMS.map((item) => {
          const badge = item.badgeKey === "feedback" && feedbackNew > 0 ? feedbackNew : 0;
          return (
            <NavLink key={item.title} to={item.url} end className={linkClasses}>
              <IconChip icon={item.icon} size="sm" />
              <span className="flex-1">{item.title}</span>
              {badge > 0 && (
                <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] rounded-full bg-ds-ink text-ds-card text-[10px] font-semibold px-1">
                  {badge > 99 ? "99+" : badge}
                </span>
              )}
            </NavLink>
          );
        })}
      </nav>
    </aside>
  );
}
