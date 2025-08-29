import * as React from "react";
import { useState, useEffect, useRef } from "react";
import { ChevronDown, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type Domain = "@atlas.tax" | "@stp.nl" | "@svalner.se";

const DOMAINS: Domain[] = ["@atlas.tax", "@stp.nl", "@svalner.se"];
const DEFAULT_DOMAIN: Domain = "@atlas.tax";
const STORAGE_KEY = "email-split-field-domain";

export interface EmailParts {
  localPart: string;
  domain: Domain;
}

export interface EmailSplitFieldProps {
  value?: string;
  onChange: (email: string, parts: EmailParts) => void;
  defaultDomain?: Domain;
  rememberDomain?: boolean;
  disabled?: boolean;
  autoFocus?: boolean;
  id?: string;
  required?: boolean;
}

export const validateLocalPart = (local: string): { valid: boolean; error?: string } => {
  const trimmed = local.trim();
  
  if (!trimmed) {
    return { valid: false, error: "Local part is required" };
  }
  
  if (trimmed.length > 64) {
    return { valid: false, error: "Local part must be 64 characters or less" };
  }
  
  // Check for double dots
  if (trimmed.includes("..")) {
    return { valid: false, error: "Double dots (..) are not allowed" };
  }
  
  // Check for leading/trailing dots
  if (trimmed.startsWith(".") || trimmed.endsWith(".")) {
    return { valid: false, error: "Local part cannot start or end with a dot" };
  }
  
  // Validate allowed characters
  const regex = /^[A-Za-z0-9._%+\-]{1,64}$/;
  if (!regex.test(trimmed)) {
    return { valid: false, error: "Only letters, numbers, and ._%+- are allowed" };
  }
  
  return { valid: true };
};

export const composeEmail = (localPart: string, domain: Domain): string => {
  return `${localPart.trim()}${domain}`;
};

export const EmailSplitField = React.forwardRef<HTMLInputElement, EmailSplitFieldProps>(
  ({ 
    value = "", 
    onChange, 
    defaultDomain, 
    rememberDomain = true, 
    disabled = false, 
    autoFocus = false,
    id,
    required = false
  }, ref) => {
    const [localPart, setLocalPart] = useState("");
    const [selectedDomain, setSelectedDomain] = useState<Domain>(DEFAULT_DOMAIN);
    const [focused, setFocused] = useState(false);
    const [error, setError] = useState<string>("");
    const inputRef = useRef<HTMLInputElement>(null);
    
    // Combine refs
    React.useImperativeHandle(ref, () => inputRef.current!);

    // Initialize domain from localStorage or defaultDomain
    useEffect(() => {
      let initialDomain = defaultDomain || DEFAULT_DOMAIN;
      
      if (rememberDomain) {
        const stored = localStorage.getItem(STORAGE_KEY) as Domain;
        if (stored && DOMAINS.includes(stored)) {
          initialDomain = stored;
        }
      }
      
      setSelectedDomain(initialDomain);
    }, [defaultDomain, rememberDomain]);

    // Parse initial value
    useEffect(() => {
      if (value) {
        const atIndex = value.lastIndexOf("@");
        if (atIndex > 0) {
          const local = value.substring(0, atIndex);
          const domain = value.substring(atIndex) as Domain;
          
          if (DOMAINS.includes(domain)) {
            setLocalPart(local);
            setSelectedDomain(domain);
          }
        }
      }
    }, [value]);

    // Validate and update
    useEffect(() => {
      const validation = validateLocalPart(localPart);
      setError(validation.error || "");
      
      const email = localPart.trim() ? composeEmail(localPart, selectedDomain) : "";
      onChange(email, { localPart: localPart.trim(), domain: selectedDomain });
    }, [localPart, selectedDomain, onChange]);

    const handleLocalPartChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const newValue = e.target.value;
      setLocalPart(newValue);
    };

    const handleDomainChange = (domain: Domain) => {
      setSelectedDomain(domain);
      if (rememberDomain) {
        localStorage.setItem(STORAGE_KEY, domain);
      }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        e.preventDefault();
        if (validateLocalPart(localPart).valid) {
          // Let parent handle submit
          const form = e.currentTarget.closest('form');
          if (form) {
            const submitEvent = new Event('submit', { bubbles: true, cancelable: true });
            form.dispatchEvent(submitEvent);
          }
        }
      }
    };

    const isValid = validateLocalPart(localPart).valid;
    const hasContent = localPart.trim().length > 0;

    return (
      <div className="space-y-2">
        <Label htmlFor={id} className="text-sm font-medium">
          Email address {required && <span className="text-destructive">*</span>}
        </Label>
        
        <div
          className={cn(
            "flex items-center rounded-2xl border px-3 py-2 shadow-sm transition-all",
            "bg-background",
            focused && "ring-2 ring-ring ring-offset-2",
            error && hasContent && "border-destructive",
            disabled && "opacity-50 cursor-not-allowed"
          )}
        >
          <input
            ref={inputRef}
            id={id}
            type="text"
            className="flex-[2] bg-transparent outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed"
            placeholder="email"
            value={localPart}
            onChange={handleLocalPartChange}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onKeyDown={handleKeyDown}
            disabled={disabled}
            autoFocus={autoFocus}
            maxLength={64}
            aria-describedby={error ? `${id}-error` : `${id}-help`}
            aria-invalid={error ? "true" : "false"}
          />
          
          <span 
            className="px-1 text-muted-foreground select-none" 
            aria-hidden="true"
          >
            @
          </span>
          
          <Select
            value={selectedDomain}
            onValueChange={handleDomainChange}
            disabled={disabled}
          >
            <SelectTrigger 
              className="flex-1 max-w-[8rem] bg-transparent border-0 shadow-none focus:ring-0 hover:bg-accent/50 h-auto p-1 gap-1 [&>svg]:hidden"
              aria-label="Select email domain"
            >
              <SelectValue />
              <ChevronDown className="h-4 w-4 opacity-50 ml-1" />
            </SelectTrigger>
            <SelectContent align="end">
              {DOMAINS.map((domain) => (
                <SelectItem key={domain} value={domain}>
                  {domain.substring(1)} {/* Remove @ for display */}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="min-h-[1.25rem]">
          {error && hasContent ? (
            <div 
              id={`${id}-error`}
              className="flex items-center gap-1 text-sm text-destructive"
              aria-live="polite"
            >
              <AlertCircle className="h-4 w-4" />
              {error}
            </div>
          ) : (
            <p 
              id={`${id}-help`}
              className="text-sm text-muted-foreground"
            >
              Fill in only the part before @ and choose the domain.
            </p>
          )}
        </div>
      </div>
    );
  }
);

EmailSplitField.displayName = "EmailSplitField";