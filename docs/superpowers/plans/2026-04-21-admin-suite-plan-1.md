# ATAD2 Admin Suite — Plan 1: Foundation + Hub + Vragen + Contextvragen

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Een mooie, coherente admin-suite met een Hub (startpagina), rijke Vragenbeheer (lijst + flow + slide-in editor), en Contextvragenbeheer, volgens design-spec `docs/superpowers/specs/2026-04-21-admin-suite-design.md`.

**Architecture:** React + Vite + TypeScript + Tailwind + shadcn/ui, met bestaande `/admin/*` routes die al afgeschermd zijn via `AdminRoute`. Gedeelde building-blocks in `src/components/admin/` (AdminCard, IconChip, SlideInPanel, etc.), pagina-rewrites in `src/pages/admin/`. Data via TanStack Query tegen self-hosted Supabase.

**Tech Stack:** React 18, TypeScript, Tailwind, shadcn/ui, TanStack Query 5, react-hook-form + zod, Supabase JS client, React Flow (`@xyflow/react`, nieuw) + `dagre` (nieuw) voor vragen-flow-visualisatie, `recharts` (al aanwezig, niet in dit plan gebruikt — komt terug in Plan 2).

**Scope Plan 1 (dit plan):** Phase 0-5. Na voltooiing werkt: admin-toegang + link-zichtbaarheid, gedeelde componenten, Hub-pagina, Vragenbeheer (lijst + flow + editor), Contextvragenbeheer (lijst + editor).

**Uitgesteld naar Plan 2 (later):** Sessie-detail met tabs, Analytics-pagina, Data Explorer, Users/Audit restyle.

**Committen:** Lennart committeert zelf. Aan het eind van elke taak staan `git add` + `git commit` commando's als checkpoints — voer ze alleen uit als Lennart dat expliciet zegt. Nooit `git push` zonder expliciete goedkeuring (push naar main triggert auto-deploy naar productie).

**Verificatie:** Geen test-framework aanwezig. Gebruik per taak: `npm run lint` + `npm run build` + handmatig browser-testen via `npm run dev` op `http://localhost:5173/admin`.

---

## File Structure

### Nieuwe bestanden

```
src/components/admin/
  entityColors.ts              - kleur-map per entiteit + risk-chip helper
  AdminCard.tsx                - basis-kaart (border, radius, padding)
  IconChip.tsx                 - gekleurde icoon-chip, entity-color gedreven
  StatChip.tsx                 - chip voor risk/status (groen/amber/rood)
  KpiCard.tsx                  - stat-tegel met icoon, getal, trend, sparkline
  Sparkline.tsx                - kleine lijngrafiek SVG
  SlideInPanel.tsx             - rechter slide-in paneel met overlay + Escape
  SearchFilterBar.tsx          - zoek + filter-pills + view-toggle toolbar
  QuestionEditorPanel.tsx      - content voor slide-in: vraag bewerken
  ContextQuestionEditorPanel.tsx - content voor slide-in: contextvraag bewerken
  QuestionFlowCanvas.tsx       - React Flow graph voor vragen
  QuestionNode.tsx             - custom node-renderer voor React Flow
  useAdminQuestions.ts         - shared query hook
  useAdminContextQuestions.ts  - shared query hook

src/hooks/
  useIsAdmin.ts                - is huidige user admin?
```

### Te wijzigen bestanden

```
src/pages/admin/Dashboard.tsx             - volledig herschreven als Hub
src/pages/admin/Questions.tsx             - volledig herschreven
src/pages/admin/ContextQuestions.tsx      - volledig herschreven
src/components/admin/AdminSidebar.tsx     - icons colorized, items toegevoegd
src/components/admin/QuestionForm.tsx     - uitgebreid met autocomplete next_question_id
src/pages/AppLayout.tsx                   - Admin-link alleen tonen aan admins
package.json                              - dependencies toevoegen
```

---

## Phase 0: Prerequisites

### Task 0.1: Admin-rol granten aan Lennart's werk-email

**Files:** geen code; SQL uitvoeren in self-hosted Supabase Studio.

- [ ] **Step 1: Check huidige admin-status**

Log in op Supabase Studio (`http://135.225.104.142:3000`), open SQL editor, draai:

```sql
SELECT au.email, ur.role
FROM auth.users au
LEFT JOIN user_roles ur ON ur.user_id = au.id
WHERE au.email = 'lennart.wilming@svalneratlas.com';
```

Expected: 1 rij. Als `role` al `admin` is, skip Step 2.

- [ ] **Step 2: Grant admin rol**

```sql
INSERT INTO user_roles (user_id, role)
VALUES (
  (SELECT id FROM auth.users WHERE email = 'lennart.wilming@svalneratlas.com'),
  'admin'
)
ON CONFLICT DO NOTHING;
```

- [ ] **Step 3: Valideer**

Herhaal Step 1 — `role` moet nu `admin` zijn.

- [ ] **Step 4: (optioneel) Test via app**

Draai `npm run dev`, log in als `lennart.wilming@svalneratlas.com`, ga naar `/admin/questions` — moet laden (niet NotAuthorized). Rapporteer resultaat aan Lennart.

---

### Task 0.2: Dependencies installeren

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Installeer React Flow en dagre**

Run:
```bash
npm install @xyflow/react dagre
npm install -D @types/dagre
```

- [ ] **Step 2: Verifieer**

Run: `npm run build`
Expected: build slaagt; geen type-errors; `package.json` toont `@xyflow/react`, `dagre`, `@types/dagre`.

- [ ] **Step 3: Optioneel commit-checkpoint (alleen op verzoek)**

```bash
git add package.json package-lock.json
git commit -m "chore: add React Flow + dagre for admin flow-diagram"
```

---

### Task 0.3: Hergebruikbare `useIsAdmin` hook

**Files:**
- Create: `src/hooks/useIsAdmin.ts`

- [ ] **Step 1: Schrijf de hook**

```typescript
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

export function useIsAdmin() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["is-admin", user?.id],
    queryFn: async () => {
      if (!user) return false;
      const { data, error } = await supabase.rpc("has_role", {
        _user_id: user.id,
        _role: "admin",
      });
      if (error) return false;
      return Boolean(data);
    },
    enabled: !!user,
    staleTime: 60_000,
  });
}
```

- [ ] **Step 2: Refactor AdminRoute om hook te gebruiken**

Open `src/components/routing/AdminRoute.tsx` — vervang de inline `useQuery(["is-admin", ...])` door `const { data: isAdmin, isLoading } = useIsAdmin();`. De rest (loading-check + NotAuthorized fallback) blijft hetzelfde.

Concreet: de regels die nu `useQuery({ queryKey: ["is-admin", ...], queryFn: ... })` doen vervangen door:

```typescript
import { useIsAdmin } from "@/hooks/useIsAdmin";
// ... verwijder useAuth + useQuery imports als ze niet meer elders gebruikt worden in dit bestand
// ... verwijder supabase import hier

const AdminRoute = ({ children }: AdminRouteProps) => {
  const { data: isAdmin, isLoading } = useIsAdmin();
  // NB: useIsAdmin gebruikt intern useAuth() dus loading-check wordt iets anders:
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Bezig met laden...</p>
      </div>
    );
  }
  if (!isAdmin) return <NotAuthorized />;
  return <>{children}</>;
};
```

- [ ] **Step 3: Verifieer**

Run: `npm run lint` en `npm run build`
Expected: geen errors, geen warnings op deze bestanden.

Handmatig: navigeer als admin naar `/admin/questions` (werkt nog), log uit en probeer als niet-admin (Niet Geautoriseerd).

- [ ] **Step 4: Optioneel commit-checkpoint**

```bash
git add src/hooks/useIsAdmin.ts src/components/routing/AdminRoute.tsx
git commit -m "refactor: extract useIsAdmin hook for reuse"
```

---

### Task 0.4: "Admin"-link tonen in hoofd-app voor admins

**Files:**
- Modify: `src/pages/AppLayout.tsx`

- [ ] **Step 1: Lees huidige AppLayout**

Open `src/pages/AppLayout.tsx` — zoek de navigatie/header waar Auth-knoppen of user-info staan. We gaan daar een "Admin"-link toevoegen (NavLink naar `/admin`) die alleen toont als `useIsAdmin()` true returnt.

- [ ] **Step 2: Importeer hook en render de link**

Voeg bovenaan toe:

```typescript
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { NavLink } from "react-router-dom"; // als nog niet geïmporteerd
import { Shield } from "lucide-react";
```

In de render-body, naast andere nav-items/account-knop:

```tsx
const { data: isAdmin } = useIsAdmin();
// ...
{isAdmin && (
  <NavLink
    to="/admin"
    className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted"
  >
    <Shield className="h-4 w-4" />
    Admin
  </NavLink>
)}
```

Plaats dit waar het visueel logisch past (bv. vlak vóór het avatar/account-menu). Exacte styling mag aansluiten bij bestaande nav-items.

- [ ] **Step 3: Verifieer**

Run: `npm run dev`
- Login als admin → zie "Admin"-link in header/nav
- Login als niet-admin → link is weg

- [ ] **Step 4: Optioneel commit-checkpoint**

```bash
git add src/pages/AppLayout.tsx
git commit -m "feat: show Admin link in main app for admin users"
```

---

## Phase 1: Shared Foundation

### Task 1.1: `entityColors.ts` — kleur-map + helpers

**Files:**
- Create: `src/components/admin/entityColors.ts`

- [ ] **Step 1: Schrijf de file**

```typescript
export type EntityKey =
  | "sessions"
  | "users"
  | "questions"
  | "contextQuestions"
  | "feedback"
  | "analytics"
  | "explorer"
  | "audit"
  | "settings";

export const ENTITY_COLORS: Record<EntityKey, { fg: string; bg: string; ring: string }> = {
  sessions:         { fg: "#4f46e5", bg: "#eef2ff", ring: "#c7d2fe" },
  users:            { fg: "#d97706", bg: "#fef3c7", ring: "#fcd34d" },
  questions:        { fg: "#16a34a", bg: "#dcfce7", ring: "#86efac" },
  contextQuestions: { fg: "#0891b2", bg: "#cffafe", ring: "#67e8f9" },
  feedback:         { fg: "#db2777", bg: "#fce7f3", ring: "#f9a8d4" },
  analytics:        { fg: "#6366f1", bg: "#e0e7ff", ring: "#c7d2fe" },
  explorer:         { fg: "#2563eb", bg: "#dbeafe", ring: "#93c5fd" },
  audit:            { fg: "#dc2626", bg: "#fee2e2", ring: "#fca5a5" },
  settings:         { fg: "#9333ea", bg: "#f3e8ff", ring: "#d8b4fe" },
};

export type RiskLevel = "low" | "medium" | "high";

export function getRiskLevel(points: number): RiskLevel {
  if (points <= 1.0) return "low";
  if (points <= 3.0) return "medium";
  return "high";
}

export const RISK_CHIP_CLASSES: Record<RiskLevel, { bg: string; text: string }> = {
  low:    { bg: "bg-[#dcfce7]", text: "text-[#166534]" },
  medium: { bg: "bg-[#fef3c7]", text: "text-[#92400e]" },
  high:   { bg: "bg-[#fee2e2]", text: "text-[#991b1b]" },
};
```

- [ ] **Step 2: Verifieer compilatie**

Run: `npm run build`
Expected: geen fouten.

---

### Task 1.2: `AdminCard` — basis-kaart

**Files:**
- Create: `src/components/admin/AdminCard.tsx`

- [ ] **Step 1: Schrijf de component**

```typescript
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
```

- [ ] **Step 2: Verifieer**

Run: `npm run build`
Expected: geen errors.

---

### Task 1.3: `IconChip` — gekleurde icoon-chip

**Files:**
- Create: `src/components/admin/IconChip.tsx`

- [ ] **Step 1: Schrijf de component**

```typescript
import { LucideIcon } from "lucide-react";
import { EntityKey, ENTITY_COLORS } from "./entityColors";
import { cn } from "@/lib/utils";

export interface IconChipProps {
  entity: EntityKey;
  icon: LucideIcon;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const SIZES = {
  sm: { box: "h-7 w-7 rounded-[8px]", icon: 14 },
  md: { box: "h-9 w-9 rounded-[10px]", icon: 18 },
  lg: { box: "h-11 w-11 rounded-[12px]", icon: 22 },
};

export function IconChip({ entity, icon: Icon, size = "md", className }: IconChipProps) {
  const color = ENTITY_COLORS[entity];
  const { box, icon } = SIZES[size];
  return (
    <div
      className={cn("inline-flex items-center justify-center", box, className)}
      style={{ backgroundColor: color.bg }}
    >
      <Icon size={icon} style={{ color: color.fg }} strokeWidth={2} />
    </div>
  );
}
```

- [ ] **Step 2: Verifieer**

Run: `npm run build`
Expected: geen errors.

---

### Task 1.4: `StatChip` — risk/status chip

**Files:**
- Create: `src/components/admin/StatChip.tsx`

- [ ] **Step 1: Schrijf de component**

```typescript
import { cn } from "@/lib/utils";
import { getRiskLevel, RISK_CHIP_CLASSES } from "./entityColors";

export interface RiskChipProps {
  points: number;
  className?: string;
}

export function RiskChip({ points, className }: RiskChipProps) {
  const level = getRiskLevel(points);
  const { bg, text } = RISK_CHIP_CLASSES[level];
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold",
        bg, text, className
      )}
    >
      {points.toFixed(1)}
    </span>
  );
}

export interface StatusChipProps {
  label: string;
  tone?: "neutral" | "success" | "warning" | "danger";
  className?: string;
}

const TONE_CLASSES: Record<NonNullable<StatusChipProps["tone"]>, string> = {
  neutral: "bg-gray-100 text-gray-700",
  success: "bg-green-100 text-green-800",
  warning: "bg-amber-100 text-amber-800",
  danger:  "bg-red-100 text-red-800",
};

export function StatusChip({ label, tone = "neutral", className }: StatusChipProps) {
  return (
    <span className={cn("inline-flex rounded-md px-2 py-0.5 text-xs font-medium", TONE_CLASSES[tone], className)}>
      {label}
    </span>
  );
}
```

- [ ] **Step 2: Verifieer**

Run: `npm run build`
Expected: geen errors.

---

### Task 1.5: `Sparkline` + `KpiCard`

**Files:**
- Create: `src/components/admin/Sparkline.tsx`
- Create: `src/components/admin/KpiCard.tsx`

- [ ] **Step 1: Sparkline component**

```typescript
// src/components/admin/Sparkline.tsx
export interface SparklineProps {
  values: number[];
  width?: number;
  height?: number;
  color?: string;
  fillOpacity?: number;
}

export function Sparkline({
  values,
  width = 80,
  height = 36,
  color = "#4f46e5",
  fillOpacity = 0.08,
}: SparklineProps) {
  if (values.length === 0) return <svg width={width} height={height} />;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const step = width / (values.length - 1 || 1);
  const points = values.map((v, i) => {
    const x = i * step;
    const y = height - ((v - min) / range) * height;
    return `${x},${y}`;
  });
  const poly = points.join(" ");
  const fillPoly = `0,${height} ${poly} ${width},${height}`;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <polyline points={fillPoly} fill={color} fillOpacity={fillOpacity} stroke="none" />
      <polyline points={poly} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" />
    </svg>
  );
}
```

- [ ] **Step 2: KpiCard component**

```typescript
// src/components/admin/KpiCard.tsx
import { LucideIcon } from "lucide-react";
import { IconChip } from "./IconChip";
import { AdminCard } from "./AdminCard";
import { Sparkline } from "./Sparkline";
import { EntityKey, ENTITY_COLORS } from "./entityColors";
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
  const color = ENTITY_COLORS[entity];
  return (
    <AdminCard className={cn("flex flex-col justify-between", className)}>
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <IconChip entity={entity} icon={icon} size="sm" />
            <span className="text-xs font-medium text-muted-foreground">{label}</span>
          </div>
          <div className={cn("font-bold leading-none text-foreground", size === "lg" ? "text-[30px]" : "text-[24px]")}>
            {value}
          </div>
          {subLabel && <div className="text-[10px] text-muted-foreground mt-1">{subLabel}</div>}
          {trend && (
            <div
              className={cn("text-[11px] font-medium mt-1", trend.direction === "up" ? "text-[#10b981]" : "text-[#ef4444]")}
            >
              {trend.direction === "up" ? "↑" : "↓"} {trend.label}
            </div>
          )}
        </div>
        {sparkline && size === "lg" && <Sparkline values={sparkline} color={color.fg} />}
      </div>
    </AdminCard>
  );
}
```

- [ ] **Step 3: Verifieer**

Run: `npm run build`
Expected: geen errors.

---

### Task 1.6: `SlideInPanel` — rechter slide-in

**Files:**
- Create: `src/components/admin/SlideInPanel.tsx`

- [ ] **Step 1: Schrijf de component**

```typescript
import { ReactNode, useEffect } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SlideInPanelProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  subtitle?: ReactNode;
  width?: number;
  children: ReactNode;
  footer?: ReactNode;
}

export function SlideInPanel({
  open, onClose, title, subtitle, width = 480, children, footer,
}: SlideInPanelProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <>
      <div
        className={cn(
          "fixed inset-0 bg-black/20 transition-opacity z-40",
          open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        )}
        onClick={onClose}
        aria-hidden="true"
      />
      <aside
        role="dialog"
        aria-modal="true"
        style={{ width }}
        className={cn(
          "fixed right-0 top-0 bottom-0 bg-white border-l border-[#ececec] shadow-[-8px_0_24px_rgba(0,0,0,0.08)] z-50",
          "transition-transform duration-200 ease-out flex flex-col",
          open ? "translate-x-0" : "translate-x-full"
        )}
      >
        <header className="flex items-start justify-between px-5 py-4 border-b border-[#ececec]">
          <div>
            {subtitle && <div className="text-xs font-semibold text-[#4f46e5] uppercase tracking-wide mb-0.5">{subtitle}</div>}
            {title && <div className="text-base font-semibold text-foreground">{title}</div>}
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-muted text-muted-foreground"
            aria-label="Sluiten"
          >
            <X size={18} />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <footer className="border-t border-[#ececec] px-5 py-3">{footer}</footer>}
      </aside>
    </>
  );
}
```

- [ ] **Step 2: Verifieer**

Run: `npm run build`
Expected: geen errors.

---

### Task 1.7: `SearchFilterBar` — toolbar

**Files:**
- Create: `src/components/admin/SearchFilterBar.tsx`

- [ ] **Step 1: Schrijf de component**

```typescript
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
  search, onSearchChange, searchPlaceholder = "Zoeken…", filters, actions, viewMode, onViewModeChange,
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
            <List size={14} /> Lijst
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
```

- [ ] **Step 2: Verifieer**

Run: `npm run build`
Expected: geen errors.

---

### Task 1.8: AdminSidebar — polish + uitbreiden

**Files:**
- Modify: `src/components/admin/AdminSidebar.tsx`

- [ ] **Step 1: Herschrijf met entity-kleuren en extra items**

Vervang de volledige inhoud van `src/components/admin/AdminSidebar.tsx` door:

```typescript
import { NavLink } from "react-router-dom";
import {
  LayoutDashboard, ListChecks, HelpCircle, FileText, Users,
  BarChart3, Database, AlertCircle,
} from "lucide-react";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  useSidebar, SidebarMenuButton,
} from "@/components/ui/sidebar";
import { IconChip } from "@/components/admin/IconChip";
import type { EntityKey } from "@/components/admin/entityColors";
import { LucideIcon } from "lucide-react";

type Item = { title: string; url: string; icon: LucideIcon; entity: EntityKey };

const ITEMS: Item[] = [
  { title: "Hub",            url: "/admin/dashboard",         icon: LayoutDashboard, entity: "settings" },
  { title: "Vragen",         url: "/admin/questions",         icon: ListChecks,      entity: "questions" },
  { title: "Contextvragen",  url: "/admin/context-questions", icon: HelpCircle,      entity: "contextQuestions" },
  { title: "Sessies",        url: "/admin/sessions",          icon: FileText,        entity: "sessions" },
  { title: "Gebruikers",     url: "/admin/users",             icon: Users,           entity: "users" },
  { title: "Analytics",      url: "/admin/analytics",         icon: BarChart3,       entity: "analytics" },
  { title: "Data Explorer",  url: "/admin/explorer",          icon: Database,        entity: "explorer" },
  { title: "Audit Log",      url: "/admin/audit",             icon: AlertCircle,     entity: "audit" },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";

  return (
    <Sidebar className={collapsed ? "w-14" : "w-60"}>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Admin</SidebarGroupLabel>
          <SidebarGroupContent>
            {ITEMS.map((item) => (
              <SidebarMenuButton asChild key={item.title}>
                <NavLink
                  to={item.url}
                  end
                  className={({ isActive }) =>
                    `flex items-center gap-2.5 py-2 px-2 rounded-md ${
                      isActive ? "bg-muted text-foreground font-medium" : "hover:bg-muted/50 text-foreground"
                    }`
                  }
                >
                  <IconChip entity={item.entity} icon={item.icon} size="sm" />
                  {!collapsed && <span>{item.title}</span>}
                </NavLink>
              </SidebarMenuButton>
            ))}
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
```

- [ ] **Step 2: Verifieer**

Run: `npm run dev`
Navigeer naar `/admin/dashboard` — sidebar toont 8 items met gekleurde icon-chips. Links naar `/admin/analytics`, `/admin/explorer` geven NotFound (we implementeren die in Plan 2) — dat is tijdelijk acceptabel.

**Belangrijk:** Voeg tijdelijke placeholder-routes toe zodat klikken niet crasht. Open `src/App.tsx` en voeg naast `AdminAuditLogs` (of vergelijkbaar) twee placeholder-routes toe:

```tsx
// In de /admin Route-sectie, tussen andere admin-subroutes:
<Route path="/admin/analytics" element={
  <div className="p-8 text-muted-foreground">Analytics komt in Plan 2.</div>
} />
<Route path="/admin/explorer" element={
  <div className="p-8 text-muted-foreground">Data Explorer komt in Plan 2.</div>
} />
```

(Deze placeholders worden later vervangen door echte pagina's.)

- [ ] **Step 3: Optioneel commit-checkpoint**

```bash
git add src/components/admin/ src/hooks/useIsAdmin.ts src/pages/AppLayout.tsx src/components/routing/AdminRoute.tsx src/App.tsx package.json package-lock.json
git commit -m "feat(admin): add shared foundation (IconChip, AdminCard, SlideInPanel, etc.) and sidebar polish"
```

---

## Phase 2: Hub (startpagina)

### Task 2.1: Hub — header + periode-selector

**Files:**
- Modify: `src/pages/admin/Dashboard.tsx` (volledig herschreven)

- [ ] **Step 1: Vervang inhoud**

```typescript
import { useState } from "react";
import { Seo } from "@/components/Seo";
import { useAuth } from "@/hooks/useAuth";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format } from "date-fns";
import { nl } from "date-fns/locale";

export type Period = "24h" | "7d" | "30d" | "90d";

const PERIOD_LABELS: Record<Period, string> = {
  "24h": "Laatste 24 uur",
  "7d":  "Laatste 7 dagen",
  "30d": "Laatste 30 dagen",
  "90d": "Laatste 90 dagen",
};

function getFirstName(user: { email?: string | null } | null): string {
  if (!user?.email) return "admin";
  const local = user.email.split("@")[0];
  return local.split(/[.\-_]/)[0].replace(/^./, (c) => c.toUpperCase());
}

const Dashboard = () => {
  const { user } = useAuth();
  const [period, setPeriod] = useState<Period>("7d");
  const today = new Date();

  return (
    <main className="p-6 max-w-[1400px] mx-auto">
      <Seo title="Admin Hub" description="ATAD2 Admin Hub" canonical="/admin/dashboard" />

      <header className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-[22px] font-bold text-foreground">Goedemorgen, {getFirstName(user)}</h1>
          <p className="text-[13px] text-muted-foreground">
            {format(today, "EEEE d MMMM", { locale: nl })} · Svalner Atlas Admin
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
            <SelectTrigger className="w-[180px] h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(PERIOD_LABELS).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </header>

      {/* KPI's en snelkoppelingen komen in 2.2 en 2.3 */}
    </main>
  );
};

export default Dashboard;
```

- [ ] **Step 2: Verifieer**

Run: `npm run dev`, ga naar `/admin/dashboard`
Expected: header toont "Goedemorgen, Lennart" + datum + periode-dropdown werkt (verandert staat).

---

### Task 2.2: Hub — KPI-tegels

**Files:**
- Modify: `src/pages/admin/Dashboard.tsx`

- [ ] **Step 1: Voeg data-fetch toe bovenaan het component**

Importeer en voeg toe vóór de `return`-statement:

```typescript
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { KpiCard } from "@/components/admin/KpiCard";
import { FileText, Star, FileCheck } from "lucide-react";

function periodToDate(p: Period): Date {
  const d = new Date();
  switch (p) {
    case "24h": d.setHours(d.getHours() - 24); break;
    case "7d":  d.setDate(d.getDate() - 7); break;
    case "30d": d.setDate(d.getDate() - 30); break;
    case "90d": d.setDate(d.getDate() - 90); break;
  }
  return d;
}

// Inside component, na useState(period):
const since = periodToDate(period).toISOString();

const { data: sessionStats } = useQuery({
  queryKey: ["hub-session-stats", period],
  queryFn: async () => {
    const { count, error } = await supabase
      .from("atad2_sessions")
      .select("id", { count: "exact", head: true })
      .gte("created_at", since);
    if (error) throw error;
    return { total: count ?? 0 };
  },
});

const { data: scoreStats } = useQuery({
  queryKey: ["hub-score", period],
  queryFn: async () => {
    const { data, error } = await supabase
      .from("atad2_sessions")
      .select("final_score")
      .gte("created_at", since)
      .not("final_score", "is", null);
    if (error) throw error;
    const vals = (data ?? []).map((r: any) => r.final_score).filter((n: any) => typeof n === "number");
    const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
    return { avg };
  },
});

const { data: sparkline } = useQuery({
  queryKey: ["hub-sparkline", period],
  queryFn: async () => {
    const days = period === "24h" ? 1 : period === "7d" ? 7 : period === "30d" ? 30 : 90;
    const { data, error } = await supabase
      .from("atad2_sessions")
      .select("created_at")
      .gte("created_at", since);
    if (error) throw error;
    const buckets = new Array(Math.max(days, 2)).fill(0);
    const now = Date.now();
    (data ?? []).forEach((row: any) => {
      const t = new Date(row.created_at).getTime();
      const ageDays = Math.floor((now - t) / 86_400_000);
      const idx = Math.min(buckets.length - 1, Math.max(0, buckets.length - 1 - ageDays));
      buckets[idx]++;
    });
    return buckets;
  },
});
```

**N.B.** over Memo-count: tijdens implementatie verifiëren welke tabel memo's bevat (mogelijk `atad2_memos` of `memos`). Als onduidelijk, open Supabase Studio → inspect tables → gebruik juiste naam. Placeholder:

```typescript
// Vervang 'atad2_memos' door de werkelijke tabelnaam
const { data: memoStats } = useQuery({
  queryKey: ["hub-memo-stats", period],
  queryFn: async () => {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const { count: total } = await supabase
      .from("atad2_memos")
      .select("id", { count: "exact", head: true })
      .gte("created_at", since);
    const { count: today } = await supabase
      .from("atad2_memos")
      .select("id", { count: "exact", head: true })
      .gte("created_at", todayStart.toISOString());
    return { total: total ?? 0, today: today ?? 0 };
  },
});
```

Als de memos-tabel niet bestaat, laat deze query wegvallen en toon `—` in de KPI-tegel (zie Step 2).

- [ ] **Step 2: Render KPI-rij in de JSX**

Na de `</header>` tag:

```tsx
<section className="mb-6">
  <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
    Kerncijfers
  </div>
  <div className="grid grid-cols-4 gap-3">
    <div className="col-span-2">
      <KpiCard
        entity="sessions"
        icon={FileText}
        label="Sessies totaal"
        value={sessionStats?.total ?? "—"}
        sparkline={sparkline}
        size="lg"
      />
    </div>
    <KpiCard
      entity="settings"
      icon={Star}
      label="Gem. score"
      value={scoreStats?.avg != null ? scoreStats.avg.toFixed(1) : "—"}
      subLabel="van 10"
    />
    <KpiCard
      entity="questions"
      icon={FileCheck}
      label="Memo's"
      value={memoStats?.total ?? "—"}
      subLabel={memoStats?.today ? `+${memoStats.today} vandaag` : undefined}
    />
  </div>
</section>
```

- [ ] **Step 3: Verifieer**

Run: `npm run dev`, ga naar `/admin/dashboard`
Expected: 3 KPI-tegels; getallen laden (of `—` als data leeg); sparkline rendert.

---

### Task 2.3: Hub — Snelkoppelingen-rij

**Files:**
- Modify: `src/pages/admin/Dashboard.tsx`

- [ ] **Step 1: Voeg shortcut-data en render toe**

Na de KPI-sectie in de JSX, en met deze imports bovenaan:

```typescript
import { NavLink } from "react-router-dom";
import {
  FileText, Star, FileCheck, Users, CheckSquare, HelpCircle,
  MessageSquare, BarChart3, Database, AlertCircle,
} from "lucide-react";
import { AdminCard } from "@/components/admin/AdminCard";
import { IconChip } from "@/components/admin/IconChip";
import type { EntityKey } from "@/components/admin/entityColors";
import { LucideIcon } from "lucide-react";

const SHORTCUTS: Array<{ title: string; url: string; entity: EntityKey; icon: LucideIcon; sub: string }> = [
  { title: "Sessies",        url: "/admin/sessions",          entity: "sessions",         icon: FileText,       sub: "Alle assessments bekijken" },
  { title: "Gebruikers",     url: "/admin/users",             entity: "users",            icon: Users,          sub: "Accounts & rollen" },
  { title: "Vragen",         url: "/admin/questions",         entity: "questions",        icon: CheckSquare,    sub: "ATAD2 vragenlijst" },
  { title: "Contextvragen",  url: "/admin/context-questions", entity: "contextQuestions", icon: HelpCircle,     sub: "Verdiepingsvragen" },
  { title: "Feedback",       url: "/admin/audit",             entity: "feedback",         icon: MessageSquare,  sub: "Opmerkingen van users" },
  { title: "Data Explorer",  url: "/admin/explorer",          entity: "explorer",         icon: Database,       sub: "Tabellen doorzoeken" },
  { title: "Analytics",      url: "/admin/analytics",         entity: "analytics",        icon: BarChart3,      sub: "Trends & inzichten" },
  { title: "Audit Log",      url: "/admin/audit",             entity: "audit",            icon: AlertCircle,    sub: "Security events" },
];
```

Render-block na `</section>` van KPI's:

```tsx
<section>
  <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
    Snelkoppelingen
  </div>
  <div className="grid grid-cols-4 gap-3">
    {SHORTCUTS.map((s) => (
      <NavLink key={s.title} to={s.url} className="block">
        <AdminCard interactive className="flex flex-col gap-3">
          <IconChip entity={s.entity} icon={s.icon} size="md" />
          <div>
            <div className="text-[13px] font-semibold text-foreground">{s.title}</div>
            <div className="text-[11px] text-muted-foreground mt-0.5">{s.sub}</div>
          </div>
        </AdminCard>
      </NavLink>
    ))}
  </div>
</section>
```

- [ ] **Step 2: Verifieer**

Run: `npm run dev`, ga naar `/admin/dashboard`
Expected: 8 snelkoppelings-tegels in 4×2 grid. Klikken navigeert correct. Hover geeft subtiele shadow.

- [ ] **Step 3: Optioneel commit-checkpoint**

```bash
git add src/pages/admin/Dashboard.tsx
git commit -m "feat(admin): rewrite Dashboard as Hub with KPIs and shortcuts"
```

---

## Phase 3: Vragenbeheer — lijst + slide-in editor

### Task 3.1: `useAdminQuestions` — shared query hook

**Files:**
- Create: `src/components/admin/useAdminQuestions.ts`

- [ ] **Step 1: Schrijf de hook**

```typescript
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/components/ui/sonner";

export interface AdminQuestion {
  id: string;
  question_id: string;
  question_title: string | null;
  question: string;
  answer_option: string;
  risk_points: number;
  next_question_id: string | null;
  difficult_term: string | null;
  term_explanation: string | null;
  created_at?: string;
}

export function useAdminQuestionsList() {
  return useQuery({
    queryKey: ["admin-questions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("atad2_questions")
        .select("*")
        .order("question_id", { ascending: true })
        .limit(2000);
      if (error) throw error;
      return (data ?? []) as AdminQuestion[];
    },
    staleTime: 30_000,
  });
}

export function useUpsertAdminQuestion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (values: Partial<AdminQuestion> & { question_id: string; question: string; answer_option: string }) => {
      const payload: any = { ...values };
      const { error } = await supabase.from("atad2_questions").upsert(payload).select().maybeSingle();
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Vraag opgeslagen");
      qc.invalidateQueries({ queryKey: ["admin-questions"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Opslaan mislukt"),
  });
}

export function useDeleteAdminQuestion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("atad2_questions").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Vraag verwijderd");
      qc.invalidateQueries({ queryKey: ["admin-questions"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Verwijderen mislukt"),
  });
}
```

- [ ] **Step 2: Verifieer**

Run: `npm run build`
Expected: geen errors.

---

### Task 3.2: Vragen lijst-pagina — scaffold met toolbar

**Files:**
- Modify: `src/pages/admin/Questions.tsx` (volledig herschreven)

- [ ] **Step 1: Basis-structuur**

Vervang volledig door:

```typescript
import { useMemo, useState, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Plus } from "lucide-react";
import { Seo } from "@/components/Seo";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { SearchFilterBar, ViewMode } from "@/components/admin/SearchFilterBar";
import { AdminCard } from "@/components/admin/AdminCard";
import { RiskChip } from "@/components/admin/StatChip";
import { useAdminQuestionsList, AdminQuestion } from "@/components/admin/useAdminQuestions";

const Questions = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id?: string }>();
  const { data, isLoading } = useAdminQuestionsList();

  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("list");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return data ?? [];
    return (data ?? []).filter((r) =>
      r.question_id.toLowerCase().includes(q) ||
      (r.question_title ?? "").toLowerCase().includes(q) ||
      r.question.toLowerCase().includes(q)
    );
  }, [data, search]);

  const openEdit = useCallback((qid: string) => navigate(`/admin/questions/${qid}`), [navigate]);
  const closeEdit = useCallback(() => navigate("/admin/questions"), [navigate]);

  return (
    <main className="p-6 max-w-[1400px] mx-auto">
      <Seo title="Admin Vragen" description="Beheer van ATAD2 vragen" canonical="/admin/questions" />
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-[22px] font-bold">Vragenbeheer</h1>
      </div>

      <SearchFilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder={`Zoek in ${data?.length ?? 0} vragen…`}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        actions={
          <Button size="sm" onClick={() => navigate("/admin/questions/new")}>
            <Plus className="mr-1 h-4 w-4" /> Nieuwe vraag
          </Button>
        }
      />

      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : viewMode === "list" ? (
        <QuestionList items={filtered} activeId={id} onRowClick={openEdit} />
      ) : (
        <div className="text-muted-foreground p-8 text-center">Flow-modus komt in Task 4.*</div>
      )}
    </main>
  );
};

function QuestionList({
  items, activeId, onRowClick,
}: { items: AdminQuestion[]; activeId?: string; onRowClick: (qid: string) => void }) {
  return (
    <div className="space-y-1.5">
      {items.map((q, i) => (
        <AdminCard
          key={q.id}
          interactive
          onClick={() => onRowClick(q.question_id)}
          className={`flex items-center gap-3 py-2.5 ${
            activeId === q.question_id ? "ring-2 ring-[#c7d2fe] border-[#c7d2fe]" : ""
          }`}
        >
          <div className="flex items-center justify-center h-6 w-6 rounded-md bg-muted text-[10px] font-bold text-muted-foreground shrink-0">
            {i + 1}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-semibold text-[#4f46e5]">{q.question_id}</span>
              {q.question_title && <span className="text-[12px] font-semibold truncate">· {q.question_title}</span>}
            </div>
            <div className="text-[12px] text-muted-foreground truncate">{q.question}</div>
          </div>
          <RiskChip points={q.risk_points ?? 0} />
          <div className="text-[11px] text-muted-foreground whitespace-nowrap w-[92px] text-right">
            → {q.next_question_id || "END"}
          </div>
        </AdminCard>
      ))}
      {items.length === 0 && (
        <div className="text-center text-muted-foreground py-8">Geen vragen gevonden.</div>
      )}
    </div>
  );
}

export default Questions;
```

- [ ] **Step 2: Voeg de detail-route toe aan App.tsx**

Open `src/App.tsx`. Zoek de `<Route path="/admin/questions" ... />` line en zorg dat er OOK een `:id` route is. Aangezien de lijst en detail beide dezelfde component renderen (met slide-in paneel), volstaat een wildcard:

```tsx
<Route path="questions" element={<AdminQuestions />} />
<Route path="questions/:id" element={<AdminQuestions />} />
```

Beide routes renderen `AdminQuestions`, die zelf via `useParams()` de `:id` uitleest voor de panel.

- [ ] **Step 3: Verifieer**

Run: `npm run dev`, ga naar `/admin/questions`
Expected: lijst met vragen laadt, zoekveld filtert, toggle tussen Lijst/Flow werkt (Flow toont placeholder-tekst), "+ Nieuwe vraag"-knop navigeert naar `/admin/questions/new` (geeft nog placeholder — wordt in Task 3.4 gebruikt).

---

### Task 3.3: `QuestionEditorPanel` — inhoud van slide-in

**Files:**
- Create: `src/components/admin/QuestionEditorPanel.tsx`

- [ ] **Step 1: Schrijf de component**

```typescript
import { useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Trash2 } from "lucide-react";
import type { AdminQuestion } from "./useAdminQuestions";
import { RiskChip } from "./StatChip";

const Schema = z.object({
  question_id: z.string().min(1, "Verplicht"),
  question_title: z.string().nullable().optional(),
  question: z.string().min(1, "Verplicht"),
  answer_option: z.string().min(1, "Verplicht"),
  risk_points: z.coerce.number().min(0).multipleOf(0.1).default(0),
  next_question_id: z.string().nullable().optional(),
  difficult_term: z.string().nullable().optional(),
  term_explanation: z.string().nullable().optional(),
});

export type QuestionFormValues = z.infer<typeof Schema>;

export interface QuestionEditorPanelProps {
  question: AdminQuestion | null; // null = nieuw
  allQuestions: AdminQuestion[];
  onSave: (values: QuestionFormValues) => Promise<void>;
  onDelete?: () => Promise<void>;
  onCancel: () => void;
}

export function QuestionEditorPanel({
  question, allQuestions, onSave, onDelete, onCancel,
}: QuestionEditorPanelProps) {
  const isNew = question === null;

  const form = useForm<QuestionFormValues>({
    resolver: zodResolver(Schema),
    defaultValues: {
      question_id: question?.question_id ?? "",
      question_title: question?.question_title ?? "",
      question: question?.question ?? "",
      answer_option: question?.answer_option ?? "",
      risk_points: question?.risk_points ?? 0,
      next_question_id: question?.next_question_id ?? "",
      difficult_term: question?.difficult_term ?? "",
      term_explanation: question?.term_explanation ?? "",
    },
  });

  const currentId = question?.question_id;
  const incomingRefs = useMemo(
    () => allQuestions.filter((q) => q.next_question_id === currentId && q.question_id !== currentId),
    [allQuestions, currentId]
  );
  const watchedNext = form.watch("next_question_id");
  const watchedQuestion = form.watch("question");
  const watchedTitle = form.watch("question_title");
  const watchedOptions = form.watch("answer_option");
  const watchedRisk = form.watch("risk_points");

  return (
    <Form {...form}>
      <form
        className="space-y-5"
        onSubmit={form.handleSubmit(async (v) => { await onSave(v); })}
      >
        {/* Formulier-sectie */}
        <div className="space-y-3">
          <FormField control={form.control} name="question_id" render={({ field }) => (
            <FormItem>
              <FormLabel className="text-[10px] uppercase tracking-wide text-muted-foreground">Question ID</FormLabel>
              <FormControl>
                <Input {...field} disabled={!isNew} placeholder="q_001" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )} />
          <FormField control={form.control} name="question_title" render={({ field }) => (
            <FormItem>
              <FormLabel className="text-[10px] uppercase tracking-wide text-muted-foreground">Titel</FormLabel>
              <FormControl>
                <Input {...field} value={field.value ?? ""} placeholder="Korte titel" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )} />
          <FormField control={form.control} name="question" render={({ field }) => (
            <FormItem>
              <FormLabel className="text-[10px] uppercase tracking-wide text-muted-foreground">Vraag</FormLabel>
              <FormControl>
                <Textarea {...field} rows={4} placeholder="Volledige vraag" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )} />
          <FormField control={form.control} name="answer_option" render={({ field }) => (
            <FormItem>
              <FormLabel className="text-[10px] uppercase tracking-wide text-muted-foreground">Antwoordopties</FormLabel>
              <FormControl>
                <Input {...field} placeholder="Ja|Nee of meerdere | gescheiden" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )} />
          <div className="grid grid-cols-2 gap-3">
            <FormField control={form.control} name="risk_points" render={({ field }) => (
              <FormItem>
                <FormLabel className="text-[10px] uppercase tracking-wide text-muted-foreground">Risicopunten</FormLabel>
                <FormControl>
                  <Input type="number" step="0.1" min="0" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="next_question_id" render={({ field }) => (
              <FormItem>
                <FormLabel className="text-[10px] uppercase tracking-wide text-muted-foreground">Volgende vraag</FormLabel>
                <FormControl>
                  {/* Gewone select voor bestaande IDs + leeg voor "EINDE" */}
                  <select
                    {...field}
                    value={field.value ?? ""}
                    onChange={(e) => field.onChange(e.target.value || null)}
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  >
                    <option value="">EINDE (geen vervolg)</option>
                    {allQuestions
                      .filter((q) => q.question_id !== currentId)
                      .map((q) => (
                        <option key={q.question_id} value={q.question_id}>{q.question_id} · {q.question_title ?? ""}</option>
                      ))}
                  </select>
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />
          </div>
          <FormField control={form.control} name="difficult_term" render={({ field }) => (
            <FormItem>
              <FormLabel className="text-[10px] uppercase tracking-wide text-muted-foreground">Moeilijke term</FormLabel>
              <FormControl><Input {...field} value={field.value ?? ""} placeholder="Optioneel" /></FormControl>
              <FormMessage />
            </FormItem>
          )} />
          <FormField control={form.control} name="term_explanation" render={({ field }) => (
            <FormItem>
              <FormLabel className="text-[10px] uppercase tracking-wide text-muted-foreground">Uitleg term</FormLabel>
              <FormControl><Textarea {...field} value={field.value ?? ""} rows={2} placeholder="Optioneel" /></FormControl>
              <FormMessage />
            </FormItem>
          )} />
        </div>

        {/* Flow-context */}
        <div className="border-t border-[#ececec] pt-4">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-2 font-semibold">Flow-context</div>
          <div className="space-y-2 text-[12px]">
            <div>
              <span className="text-muted-foreground">← Komt vanaf:</span>{" "}
              {incomingRefs.length === 0 ? (
                <span className="text-muted-foreground italic">geen inkomende verwijzingen</span>
              ) : (
                <span className="inline-flex flex-wrap gap-1 align-middle">
                  {incomingRefs.map((r) => (
                    <span key={r.question_id} className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[10px]">
                      {r.question_id}
                    </span>
                  ))}
                </span>
              )}
            </div>
            <div>
              <span className="text-muted-foreground">→ Gaat naar:</span>{" "}
              {watchedNext ? (
                <span className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[10px]">{watchedNext}</span>
              ) : (
                <span className="text-muted-foreground italic">EINDE</span>
              )}
            </div>
          </div>
        </div>

        {/* Preview */}
        <div className="border-t border-[#ececec] pt-4">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-2 font-semibold">Preview</div>
          <div className="rounded-xl bg-gradient-to-b from-[#eff6ff] to-[#f3f4f6] p-4">
            <div className="rounded-lg bg-white shadow-sm p-4">
              <div className="text-[10px] font-semibold text-[#4f46e5] mb-1">Vraag · risico {typeof watchedRisk === "number" ? watchedRisk.toFixed(1) : "0.0"}</div>
              {watchedTitle && <div className="text-[13px] font-bold mb-1.5">{watchedTitle}</div>}
              <div className="text-[12px] text-foreground mb-3">{watchedQuestion || <span className="text-muted-foreground italic">(leeg)</span>}</div>
              <div className="flex flex-wrap gap-1.5">
                {(watchedOptions || "").split("|").map((opt, i) => (
                  <span key={i} className="rounded-md bg-muted px-3 py-1 text-[11px]">{opt.trim() || "-"}</span>
                ))}
              </div>
            </div>
            <div className="mt-2 flex items-center gap-3 text-[10px] text-muted-foreground">
              <span>Risico:</span>
              <RiskChip points={Number(watchedRisk) || 0} />
            </div>
          </div>
        </div>

        {/* Footer buttons */}
        <div className="flex items-center justify-between pt-2">
          <div>
            {!isNew && onDelete && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button type="button" variant="outline" size="sm" className="text-[#991b1b] border-[#fecaca]">
                    <Trash2 className="mr-1 h-3.5 w-3.5" /> Verwijderen
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Vraag verwijderen?</AlertDialogTitle>
                    <AlertDialogDescription>
                      {question?.question_id} wordt permanent verwijderd. Dit kan niet ongedaan worden.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Annuleren</AlertDialogCancel>
                    <AlertDialogAction onClick={async () => { await onDelete(); }}>Verwijderen</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={onCancel}>Annuleren</Button>
            <Button type="submit" disabled={form.formState.isSubmitting}>Opslaan</Button>
          </div>
        </div>
      </form>
    </Form>
  );
}
```

- [ ] **Step 2: Verifieer compilatie**

Run: `npm run build`
Expected: geen errors.

---

### Task 3.4: Integreer slide-in paneel in Questions-pagina

**Files:**
- Modify: `src/pages/admin/Questions.tsx`

- [ ] **Step 1: Voeg paneel-integratie toe**

Voeg imports toe bovenin:

```typescript
import { SlideInPanel } from "@/components/admin/SlideInPanel";
import { QuestionEditorPanel } from "@/components/admin/QuestionEditorPanel";
import { useUpsertAdminQuestion, useDeleteAdminQuestion } from "@/components/admin/useAdminQuestions";
```

In de component-body, na de bestaande hooks:

```typescript
const upsert = useUpsertAdminQuestion();
const del = useDeleteAdminQuestion();

const isNewPath = id === "new";
const editingQuestion = !isNewPath && id
  ? (data ?? []).find((q) => q.question_id === id) ?? null
  : null;
const panelOpen = Boolean(id); // /:id OR /new
```

Aan het einde van de `<main>`, vóór de closing tag:

```tsx
<SlideInPanel
  open={panelOpen}
  onClose={closeEdit}
  subtitle={isNewPath ? "Nieuwe vraag" : editingQuestion?.question_id}
  title={isNewPath ? "Vraag toevoegen" : editingQuestion?.question_title ?? "Vraag bewerken"}
>
  {panelOpen && (
    <QuestionEditorPanel
      question={editingQuestion}
      allQuestions={data ?? []}
      onSave={async (values) => {
        const id = editingQuestion?.id;
        await upsert.mutateAsync({ ...(id ? { id } : {}), ...values });
        closeEdit();
      }}
      onDelete={editingQuestion ? async () => {
        await del.mutateAsync(editingQuestion.id);
        closeEdit();
      } : undefined}
      onCancel={closeEdit}
    />
  )}
</SlideInPanel>
```

- [ ] **Step 2: Verifieer**

Run: `npm run dev`, ga naar `/admin/questions`
- Klik een rij → slide-in paneel opent rechts met die vraag
- URL wordt `/admin/questions/<question_id>`
- Pas een veld aan → klik Opslaan → paneel sluit, lijst update
- Klik "+ Nieuwe vraag" → paneel opent leeg, question_id-veld is bewerkbaar
- Escape sluit het paneel
- Preview rechtsonder toont live de ingevulde velden

- [ ] **Step 3: Optioneel commit-checkpoint**

```bash
git add src/pages/admin/Questions.tsx src/components/admin/QuestionEditorPanel.tsx src/components/admin/useAdminQuestions.ts src/App.tsx
git commit -m "feat(admin): rewrite questions page with search, list and slide-in editor"
```

---

## Phase 4: Flow-modus voor vragen

### Task 4.1: `QuestionNode` — custom node-renderer

**Files:**
- Create: `src/components/admin/QuestionNode.tsx`

- [ ] **Step 1: Schrijf de component**

```typescript
import { Handle, Position, NodeProps } from "@xyflow/react";
import { RiskChip } from "./StatChip";

export interface QuestionNodeData {
  question_id: string;
  question_title: string | null;
  risk_points: number;
  orphan?: boolean;
  active?: boolean;
}

export function QuestionNode({ data }: NodeProps) {
  const d = data as QuestionNodeData;
  return (
    <div
      className={`rounded-lg border bg-white shadow-sm px-3 py-2 min-w-[180px] max-w-[220px] cursor-pointer ${
        d.active ? "border-[#4f46e5] ring-2 ring-[#c7d2fe]" : "border-[#ececec]"
      }`}
    >
      <Handle type="target" position={Position.Top} className="!bg-gray-400" />
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] font-bold text-[#4f46e5]">{d.question_id}</span>
        <RiskChip points={d.risk_points ?? 0} />
      </div>
      <div className="text-[11px] font-medium text-foreground line-clamp-2">
        {d.question_title || "(zonder titel)"}
      </div>
      {d.orphan && (
        <div className="mt-1.5 inline-flex items-center rounded bg-amber-100 text-amber-800 text-[9px] px-1.5 py-0.5">
          Geen inkomende edge
        </div>
      )}
      <Handle type="source" position={Position.Bottom} className="!bg-gray-400" />
    </div>
  );
}
```

- [ ] **Step 2: Verifieer**

Run: `npm run build`
Expected: geen errors.

---

### Task 4.2: `QuestionFlowCanvas` — React Flow + dagre

**Files:**
- Create: `src/components/admin/QuestionFlowCanvas.tsx`

- [ ] **Step 1: Schrijf de component**

```typescript
import { useMemo } from "react";
import {
  ReactFlow, Background, Controls, MiniMap, Node, Edge, useNodesState, useEdgesState,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import dagre from "dagre";
import { QuestionNode, QuestionNodeData } from "./QuestionNode";
import type { AdminQuestion } from "./useAdminQuestions";

const NODE_W = 200;
const NODE_H = 76;

function layout(nodes: Node[], edges: Edge[]): Node[] {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: "TB", nodesep: 40, ranksep: 70 });

  nodes.forEach((n) => g.setNode(n.id, { width: NODE_W, height: NODE_H }));
  edges.forEach((e) => g.setEdge(e.source, e.target));
  dagre.layout(g);

  return nodes.map((n) => {
    const pos = g.node(n.id);
    return { ...n, position: { x: pos.x - NODE_W / 2, y: pos.y - NODE_H / 2 } };
  });
}

const nodeTypes = { question: QuestionNode };

export interface QuestionFlowCanvasProps {
  questions: AdminQuestion[];
  activeId?: string;
  onNodeClick: (questionId: string) => void;
}

export function QuestionFlowCanvas({ questions, activeId, onNodeClick }: QuestionFlowCanvasProps) {
  const { initialNodes, initialEdges } = useMemo(() => {
    const incoming = new Set<string>();
    questions.forEach((q) => { if (q.next_question_id) incoming.add(q.next_question_id); });

    const rawNodes: Node[] = questions.map((q) => ({
      id: q.question_id,
      type: "question",
      position: { x: 0, y: 0 },
      data: {
        question_id: q.question_id,
        question_title: q.question_title,
        risk_points: q.risk_points,
        orphan: !incoming.has(q.question_id) && questions[0]?.question_id !== q.question_id,
        active: q.question_id === activeId,
      } as QuestionNodeData,
    }));
    const rawEdges: Edge[] = questions
      .filter((q) => q.next_question_id)
      .map((q) => ({
        id: `${q.question_id}->${q.next_question_id}`,
        source: q.question_id,
        target: q.next_question_id!,
        animated: false,
        style: { stroke: "#9ca3af", strokeWidth: 1.5 },
      }));
    return { initialNodes: layout(rawNodes, rawEdges), initialEdges: rawEdges };
  }, [questions, activeId]);

  const [nodes, , onNodesChange] = useNodesState(initialNodes);
  const [edges, , onEdgesChange] = useEdgesState(initialEdges);

  return (
    <div className="h-[600px] rounded-[14px] border border-[#ececec] bg-white overflow-hidden">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        onNodeClick={(_, node) => onNodeClick(node.id)}
        fitView
        minZoom={0.1}
        maxZoom={2}
      >
        <Background gap={16} />
        <Controls />
        <MiniMap zoomable pannable />
      </ReactFlow>
    </div>
  );
}
```

- [ ] **Step 2: Verifieer**

Run: `npm run build`
Expected: geen errors.

---

### Task 4.3: Integreer Flow-modus in Questions-pagina

**Files:**
- Modify: `src/pages/admin/Questions.tsx`

- [ ] **Step 1: Swap de placeholder**

Importeer bovenin:

```typescript
import { QuestionFlowCanvas } from "@/components/admin/QuestionFlowCanvas";
```

Vervang het placeholder-blok:

```tsx
) : (
  <div className="text-muted-foreground p-8 text-center">Flow-modus komt in Task 4.*</div>
)
```

Door:

```tsx
) : (
  <QuestionFlowCanvas
    questions={filtered}
    activeId={id}
    onNodeClick={openEdit}
  />
)
```

- [ ] **Step 2: Verifieer**

Run: `npm run dev`, ga naar `/admin/questions`, klik "🔀 Flow"
Expected:
- React Flow canvas verschijnt met nodes voor elke vraag
- Edges verbinden via `next_question_id`
- dagre layout vanzelf top-down
- Klik een node → slide-in paneel opent rechts
- MiniMap en zoom-controls werken

Zoek in terminal naar warnings (als bestaat) over "ReactFlow: ..." — React Flow vereist een parent met een ingestelde hoogte. We hebben `h-[600px]` op de wrapper, dat zou moeten volstaan.

- [ ] **Step 3: Optioneel commit-checkpoint**

```bash
git add src/components/admin/QuestionNode.tsx src/components/admin/QuestionFlowCanvas.tsx src/pages/admin/Questions.tsx
git commit -m "feat(admin): add Flow-mode for questions using React Flow + dagre"
```

---

## Phase 5: Contextvragen

### Task 5.1: `useAdminContextQuestions` hook

**Files:**
- Create: `src/components/admin/useAdminContextQuestions.ts`

- [ ] **Step 1: Schrijf de hook**

```typescript
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/components/ui/sonner";

export interface AdminContextQuestion {
  id: string;
  question_id: string;
  context_question: string;
  answer_trigger: string;
  created_at?: string;
}

export function useAdminContextQuestionsList() {
  return useQuery({
    queryKey: ["admin-context-questions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("atad2_context_questions")
        .select("*")
        .order("question_id", { ascending: true })
        .limit(2000);
      if (error) throw error;
      return (data ?? []) as AdminContextQuestion[];
    },
    staleTime: 30_000,
  });
}

export function useUpsertAdminContextQuestion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (values: Partial<AdminContextQuestion> & { question_id: string; context_question: string; answer_trigger: string }) => {
      const { error } = await supabase.from("atad2_context_questions").upsert(values as any).select().maybeSingle();
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Contextvraag opgeslagen");
      qc.invalidateQueries({ queryKey: ["admin-context-questions"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Opslaan mislukt"),
  });
}

export function useDeleteAdminContextQuestion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("atad2_context_questions").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Contextvraag verwijderd");
      qc.invalidateQueries({ queryKey: ["admin-context-questions"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Verwijderen mislukt"),
  });
}
```

- [ ] **Step 2: Verifieer**

Run: `npm run build`
Expected: geen errors.

**N.B.:** als tabel-naam (`atad2_context_questions`) afwijkt in de DB, pas aan na check in Supabase Studio.

---

### Task 5.2: `ContextQuestionEditorPanel`

**Files:**
- Create: `src/components/admin/ContextQuestionEditorPanel.tsx`

- [ ] **Step 1: Schrijf de component**

```typescript
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Trash2 } from "lucide-react";
import type { AdminContextQuestion } from "./useAdminContextQuestions";

const Schema = z.object({
  question_id: z.string().min(1, "Verplicht"),
  context_question: z.string().min(1, "Verplicht"),
  answer_trigger: z.string().min(1, "Verplicht"),
});
export type ContextQuestionFormValues = z.infer<typeof Schema>;

export interface ContextQuestionEditorPanelProps {
  question: AdminContextQuestion | null;
  parentQuestionIds: string[]; // voor suggestie in question_id dropdown
  onSave: (values: ContextQuestionFormValues) => Promise<void>;
  onDelete?: () => Promise<void>;
  onCancel: () => void;
}

export function ContextQuestionEditorPanel({
  question, parentQuestionIds, onSave, onDelete, onCancel,
}: ContextQuestionEditorPanelProps) {
  const isNew = question === null;

  const form = useForm<ContextQuestionFormValues>({
    resolver: zodResolver(Schema),
    defaultValues: {
      question_id: question?.question_id ?? "",
      context_question: question?.context_question ?? "",
      answer_trigger: question?.answer_trigger ?? "",
    },
  });

  const watchedQ = form.watch("context_question");
  const watchedTrigger = form.watch("answer_trigger");

  return (
    <Form {...form}>
      <form className="space-y-5" onSubmit={form.handleSubmit(async (v) => { await onSave(v); })}>
        <div className="space-y-3">
          <FormField control={form.control} name="question_id" render={({ field }) => (
            <FormItem>
              <FormLabel className="text-[10px] uppercase tracking-wide text-muted-foreground">Gekoppeld aan vraag</FormLabel>
              <FormControl>
                <select
                  {...field}
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="">— kies vraag —</option>
                  {parentQuestionIds.map((id) => (
                    <option key={id} value={id}>{id}</option>
                  ))}
                </select>
              </FormControl>
              <FormMessage />
            </FormItem>
          )} />
          <FormField control={form.control} name="answer_trigger" render={({ field }) => (
            <FormItem>
              <FormLabel className="text-[10px] uppercase tracking-wide text-muted-foreground">Trigger (bij welk antwoord?)</FormLabel>
              <FormControl><Input {...field} placeholder='bijv. "Ja" of "Nee"' /></FormControl>
              <FormMessage />
            </FormItem>
          )} />
          <FormField control={form.control} name="context_question" render={({ field }) => (
            <FormItem>
              <FormLabel className="text-[10px] uppercase tracking-wide text-muted-foreground">Contextvraag</FormLabel>
              <FormControl><Textarea {...field} rows={4} placeholder="De verdiepende vraag" /></FormControl>
              <FormMessage />
            </FormItem>
          )} />
        </div>

        <div className="border-t border-[#ececec] pt-4">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-2 font-semibold">Preview</div>
          <div className="rounded-xl bg-gradient-to-b from-[#cffafe] to-[#f3f4f6] p-4">
            <div className="rounded-lg bg-white shadow-sm p-4">
              <div className="text-[10px] font-semibold text-[#0891b2] mb-1">Wordt getoond als antwoord = "{watchedTrigger}"</div>
              <div className="text-[12px] text-foreground">{watchedQ || <span className="text-muted-foreground italic">(leeg)</span>}</div>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between pt-2">
          <div>
            {!isNew && onDelete && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button type="button" variant="outline" size="sm" className="text-[#991b1b] border-[#fecaca]">
                    <Trash2 className="mr-1 h-3.5 w-3.5" /> Verwijderen
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Contextvraag verwijderen?</AlertDialogTitle>
                    <AlertDialogDescription>Dit kan niet ongedaan worden.</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Annuleren</AlertDialogCancel>
                    <AlertDialogAction onClick={async () => { await onDelete(); }}>Verwijderen</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={onCancel}>Annuleren</Button>
            <Button type="submit" disabled={form.formState.isSubmitting}>Opslaan</Button>
          </div>
        </div>
      </form>
    </Form>
  );
}
```

- [ ] **Step 2: Verifieer**

Run: `npm run build`
Expected: geen errors.

---

### Task 5.3: Contextvragen-pagina herschrijven

**Files:**
- Modify: `src/pages/admin/ContextQuestions.tsx` (volledig herschreven)
- Modify: `src/App.tsx` (`:id` route toevoegen)

- [ ] **Step 1: Vervang pagina**

```typescript
import { useMemo, useState, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Plus } from "lucide-react";
import { Seo } from "@/components/Seo";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { SearchFilterBar } from "@/components/admin/SearchFilterBar";
import { AdminCard } from "@/components/admin/AdminCard";
import { SlideInPanel } from "@/components/admin/SlideInPanel";
import { ContextQuestionEditorPanel } from "@/components/admin/ContextQuestionEditorPanel";
import {
  useAdminContextQuestionsList, useUpsertAdminContextQuestion, useDeleteAdminContextQuestion,
  AdminContextQuestion,
} from "@/components/admin/useAdminContextQuestions";
import { useAdminQuestionsList } from "@/components/admin/useAdminQuestions";

const ContextQuestions = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id?: string }>();
  const { data, isLoading } = useAdminContextQuestionsList();
  const { data: parentQuestions } = useAdminQuestionsList();
  const upsert = useUpsertAdminContextQuestion();
  const del = useDeleteAdminContextQuestion();

  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return data ?? [];
    return (data ?? []).filter((r) =>
      r.question_id.toLowerCase().includes(q) ||
      r.context_question.toLowerCase().includes(q) ||
      r.answer_trigger.toLowerCase().includes(q)
    );
  }, [data, search]);

  const openEdit = useCallback((rid: string) => navigate(`/admin/context-questions/${rid}`), [navigate]);
  const closeEdit = useCallback(() => navigate("/admin/context-questions"), [navigate]);

  const isNewPath = id === "new";
  const editing: AdminContextQuestion | null = !isNewPath && id
    ? (data ?? []).find((r) => r.id === id) ?? null
    : null;
  const panelOpen = Boolean(id);

  return (
    <main className="p-6 max-w-[1400px] mx-auto">
      <Seo title="Admin Contextvragen" description="Beheer van ATAD2 contextvragen" canonical="/admin/context-questions" />
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-[22px] font-bold">Contextvragen</h1>
      </div>

      <SearchFilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder={`Zoek in ${data?.length ?? 0} contextvragen…`}
        actions={
          <Button size="sm" onClick={() => navigate("/admin/context-questions/new")}>
            <Plus className="mr-1 h-4 w-4" /> Nieuwe contextvraag
          </Button>
        }
      />

      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : (
        <div className="space-y-1.5">
          {filtered.map((r) => (
            <AdminCard key={r.id} interactive onClick={() => openEdit(r.id)}
              className={`flex items-center gap-3 py-2.5 ${id === r.id ? "ring-2 ring-[#67e8f9] border-[#67e8f9]" : ""}`}>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-semibold text-[#0891b2]">{r.question_id}</span>
                  <span className="text-[10px] rounded bg-muted px-1.5 py-0.5">trigger: {r.answer_trigger}</span>
                </div>
                <div className="text-[12px] text-muted-foreground truncate mt-0.5">{r.context_question}</div>
              </div>
            </AdminCard>
          ))}
          {filtered.length === 0 && (
            <div className="text-center text-muted-foreground py-8">Geen contextvragen gevonden.</div>
          )}
        </div>
      )}

      <SlideInPanel
        open={panelOpen}
        onClose={closeEdit}
        subtitle={isNewPath ? "Nieuwe contextvraag" : editing?.question_id}
        title={isNewPath ? "Contextvraag toevoegen" : "Contextvraag bewerken"}
      >
        {panelOpen && (
          <ContextQuestionEditorPanel
            question={editing}
            parentQuestionIds={(parentQuestions ?? []).map((p) => p.question_id)}
            onSave={async (values) => {
              const rid = editing?.id;
              await upsert.mutateAsync({ ...(rid ? { id: rid } : {}), ...values });
              closeEdit();
            }}
            onDelete={editing ? async () => {
              await del.mutateAsync(editing.id);
              closeEdit();
            } : undefined}
            onCancel={closeEdit}
          />
        )}
      </SlideInPanel>
    </main>
  );
};

export default ContextQuestions;
```

- [ ] **Step 2: Voeg `:id` route toe**

In `src/App.tsx`, naast `<Route path="context-questions" element={<AdminContextQuestions />} />`:

```tsx
<Route path="context-questions/:id" element={<AdminContextQuestions />} />
```

- [ ] **Step 3: Verifieer**

Run: `npm run dev`, ga naar `/admin/context-questions`
Expected: lijst laadt, zoek filtert, klik rij → slide-in paneel met form + preview, opslaan werkt, verwijderen met bevestiging.

- [ ] **Step 4: Optioneel commit-checkpoint**

```bash
git add src/components/admin/useAdminContextQuestions.ts src/components/admin/ContextQuestionEditorPanel.tsx src/pages/admin/ContextQuestions.tsx src/App.tsx
git commit -m "feat(admin): rewrite context-questions page with slide-in editor"
```

---

## Phase 6: End-to-end smoke test

### Task 6.1: Golden-path handmatig doorlopen

**Geen code; enkel manual verification.**

- [ ] **Step 1: Start dev-server**

Run: `npm run dev`
Open: `http://localhost:5173`

- [ ] **Step 2: Login-test (admin)**

Log in als `lennart.wilming@svalneratlas.com`.
Expected: na login zie je de "Admin"-link in de hoofd-nav.

- [ ] **Step 3: Hub-test**

Klik "Admin" → landing op `/admin/dashboard`.
Expected:
- Header: "Goedemorgen, Lennart" + vandaag datum
- Periode-selector werkt (wissel 7d ↔ 30d → getallen veranderen)
- 3 KPI-tegels (Sessies / Gem. score / Memo's) — getallen laden; sparkline op Sessies
- 8 snelkoppelings-tegels; hover = subtiele shadow
- Klik op "Vragen"-tegel → navigatie naar `/admin/questions`

- [ ] **Step 4: Vragen-test**

Op `/admin/questions`:
- Lijst laadt met risico-chips en `→ Q_xxx` op rechterkant
- Zoekveld filtert live
- Klik een rij → slide-in paneel opent rechts
- URL is nu `/admin/questions/<qid>`
- Flow-context sectie: zie inkomende refs + uitgaande ref
- Preview sectie: verandert als je de velden bewerkt
- Wijzig risicopunten van bv. 2.5 → 2.8 → klik Opslaan → toast "Vraag opgeslagen" → paneel sluit → lijst-chip toont nieuwe waarde
- Klik `+ Nieuwe vraag` → paneel opent leeg; vul `q_test` + minimale velden → Opslaan → verschijnt in lijst
- Klik die nieuwe rij → Verwijderen → bevestigen → verdwijnt uit lijst
- Klik Flow-toggle → canvas met nodes + edges + minimap
- Klik een node → zelfde slide-in paneel
- Escape sluit paneel

- [ ] **Step 5: Contextvragen-test**

Navigeer naar `/admin/context-questions`:
- Lijst met chips (question_id, trigger)
- Zoekveld filtert
- Klik rij → slide-in paneel met form (question_id dropdown, trigger, context_question) + preview
- Opslaan en verwijderen werken, lijst update

- [ ] **Step 6: Niet-admin test**

Log uit en log in met een niet-admin account (of gebruik een incognito-tab met een test-account).
Expected:
- Geen "Admin"-link in hoofd-nav
- Direct naar `http://localhost:5173/admin/questions` → NotAuthorized pagina

- [ ] **Step 7: Build-check**

Run: `npm run build`
Expected: build slaagt zonder errors/warnings.

Run: `npm run lint`
Expected: geen lint-errors. (Waarschuwingen over ongebruikte imports zijn acceptabel maar bij voorkeur oplossen.)

- [ ] **Step 8: Rapporteer resultaat aan Lennart**

Maak een kort rapport: wat werkt, eventuele issues (bv. "memo-tabel heet anders dan verwacht"), en vraag of hij het wil committen.

- [ ] **Step 9: Optionele eind-commit (alleen na Lennart's goedkeuring)**

```bash
git add .
git status  # controleer wat er gestaged is
git commit -m "feat(admin): complete Plan 1 — foundation + hub + questions + context-questions"
```

**Nooit** `git push` uitvoeren tenzij Lennart expliciet om een push vraagt (push → auto-deploy naar productie).

---

## Follow-up (Plan 2)

De volgende features zijn **niet** in Plan 1 gedekt en komen in een opvolgend plan:

1. **Sessies-lijst en Sessie-detail** — lijst in nieuwe stijl, detail-pagina met `Dossier` / `Journey` / `Audit` tabs
2. **Analytics-pagina** — grafieken (sessies per week, score per maand, drop-off per vraag, feedback-distributie) met recharts
3. **Data Explorer** — read-only curated tabel-browser met JSON-drawer
4. **Users & Audit restyle** — bestaande pagina's omzetten naar nieuwe kaart/chip-look

Wanneer Plan 1 afgerond is en stabiel draait, kan een nieuwe brainstorm-sessie of directe writing-plans-sessie deze Plan 2 opstellen.

---

## Open aandachtspunten tijdens implementatie

Tijdens het uitvoeren kunnen deze dingen opduiken — handel ze pragmatisch af:

1. **Memo-tabelnaam**: in Task 2.2 gebruik ik `atad2_memos` als aanname. Verifieer in Supabase Studio de werkelijke naam voordat je de query in productie gebruikt. Als tabel niet bestaat, laat de KPI leeg (`—`).

2. **Kolom `final_score`**: gebruikt in Task 2.2 voor score-KPI. Verifieer dat het veld daadwerkelijk zo heet op `atad2_sessions`. Zo niet, pas aan of laat KPI leeg.

3. **Contextvragen-tabel**: in Task 5.1 gebruik ik `atad2_context_questions`. Verifieer. De bestaande `src/pages/admin/ContextQuestions.tsx` gebruikte de tabel al, dus de naam zou moeten kloppen — bevestig alleen.

4. **React Flow render-performance**: bij 142+ nodes zou het geen issue moeten zijn. Als het wel traag voelt, memoize `initialNodes`/`initialEdges` op question-id-hash i.p.v. hele array.

5. **TypeScript strict errors**: als `form.watch("risk_points")` `unknown` of `string` retourneert in plaats van `number`, cast met `Number(...)` in de preview — zie voorbeeld in Task 3.3 Step 1.

6. **Leeg `next_question_id`**: database kan null OF lege string opslaan — de code in Task 3.3 stuurt `null` bij lege select. Als DB-kolom NOT NULL is, pas schema of default aan.

7. **Bestaande imports**: de huidige `QuestionForm.tsx` en `ContextQuestionForm.tsx` blijven ongewijzigd in Plan 1 (we vervangen hun gebruik door de nieuwe Panel-componenten). Je mag ze ook verwijderen als de pagina's ze niet meer importeren, maar dat is optioneel.
