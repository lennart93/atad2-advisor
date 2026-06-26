import * as React from "react";

import { cn } from "@/lib/utils";

export interface FormFieldControlProps {
  /** Put on the control so the label focuses it. */
  id: string;
  /** Put on the control as aria-describedby (helper/error text). */
  describedBy?: string;
  /** True while `error` is set; put on the control as aria-invalid. */
  invalid: boolean;
}

export interface FormFieldProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "children"> {
  label: string;
  /** Falls back to a generated id; pass the control's id if it has one. */
  htmlFor?: string;
  /** Adds "(required)" to the label text. No red asterisks. */
  required?: boolean;
  /** Persistent helper text under the control. */
  helper?: string;
  /** Validation message; replaces the helper while present. */
  error?: string;
  /**
   * The control. Use the function form to receive { id, describedBy,
   * invalid } and spread them onto the input for full screen-reader wiring.
   */
  children: React.ReactNode | ((control: FormFieldControlProps) => React.ReactNode);
}

/**
 * Label + control + helper. The browser autofill wash is neutralised for
 * everything inside via the .ds-field rule in tokens.css.
 */
function FormField({
  label,
  htmlFor,
  required,
  helper,
  error,
  children,
  className,
  ...props
}: FormFieldProps) {
  const generatedId = React.useId();
  const id = htmlFor ?? generatedId;
  const messageId = `${id}-message`;
  const hasMessage = !!error || !!helper;

  return (
    <div className={cn("ds-field space-y-1.5", className)} {...props}>
      <label
        htmlFor={id}
        className="block text-[13px] font-medium leading-none text-ds-ink"
      >
        {label}
        {required && (
          <span className="font-normal text-ds-ink-secondary"> (required)</span>
        )}
      </label>
      {typeof children === "function"
        ? children({
            id,
            describedBy: hasMessage ? messageId : undefined,
            invalid: !!error,
          })
        : children}
      {error ? (
        <p id={messageId} role="alert" className="text-[13px] text-ds-amber-text">
          {error}
        </p>
      ) : helper ? (
        <p id={messageId} className="text-[13px] text-ds-ink-secondary">
          {helper}
        </p>
      ) : null}
    </div>
  );
}

export { FormField };
