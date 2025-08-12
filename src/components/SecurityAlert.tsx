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
    info: 'border-blue-200 bg-blue-50 text-blue-800',
    warning: 'border-yellow-200 bg-yellow-50 text-yellow-800',
    error: 'border-red-200 bg-red-50 text-red-800'
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