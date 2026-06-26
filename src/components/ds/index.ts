/**
 * Design-system component library (Phase 1).
 *
 * Consumes the tokens in src/styles/tokens.css. From Phase 2 on, screens
 * import these instead of ad-hoc styled elements:
 *
 *   import { Button, StatusPill, Card } from "@/components/ds";
 *
 * Ground rules:
 * - one accent (monochrome near-black), reserved for the active wizard step
 *   and the structure-chart focus node; all other emphasis is neutral ink/grey
 * - semantic color only via StatusPill: amber = real risk, green = done; red
 *   is destructive actions only
 * - max one primary Button per screen
 * - icons are lucide-react only and inherit currentColor
 * - numbers, dates and counts render with tabular figures (.ds-tabular-nums)
 */
export { Button, dsButtonVariants, type ButtonProps } from "./button";
export { StatusPill, statusPillVariants, type StatusPillProps } from "./status-pill";
export {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "./card";
export { PageHeader, type PageHeaderProps } from "./page-header";
export { Stepper, type StepperProps } from "./stepper";
export {
  FooterBar,
  FooterBarGrid,
  type FooterBarProps,
  type FooterBarGridProps,
} from "./footer-bar";
export { EmptyState, type EmptyStateProps } from "./empty-state";
export {
  ProcessChecklist,
  type ProcessChecklistProps,
  type ProcessStep,
  type ProcessStepStatus,
} from "./process-checklist";
export {
  FormField,
  type FormFieldProps,
  type FormFieldControlProps,
} from "./form-field";
export { OptionCheckbox, type OptionCheckboxProps } from "./OptionCheckbox";
