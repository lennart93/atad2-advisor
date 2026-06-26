import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Shield, AlertTriangle } from "lucide-react";

interface SecurityAlertProps {
  type: 'info' | 'warning' | 'error';
  title: string;
  message: string;
  className?: string;
}

export const SecurityAlert = ({ type, title, message, className }: SecurityAlertProps) => {
  const variants = {
    info: 'border-ds-hairline bg-ds-fill-muted text-ds-ink-secondary',
    warning: 'border-ds-hairline bg-ds-fill-muted text-ds-ink-secondary',
    error: 'border-ds-hairline bg-ds-fill-muted text-ds-ink-secondary'
  };

  const icons = {
    info: Shield,
    warning: AlertTriangle,
    error: AlertTriangle
  };

  const Icon = icons[type];

  return (
    <Alert className={`${variants[type]} ${className}`}>
      <Icon className="h-4 w-4" />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
};