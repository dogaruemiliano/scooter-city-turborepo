"use client";

import { Label } from "@repo/ui/components";
import { cn } from "@repo/ui/lib/utils";
import { createContext, useContext, useId, type ReactNode } from "react";
import { get, useFormContext, useFormState } from "react-hook-form";

interface FormFieldContextValue {
  /** Element id of the control; the label's `htmlFor`. */
  id: string;
  /** Id of the error paragraph, or `undefined` when the field is valid. */
  errorId: string | undefined;
  error: string | undefined;
  name: string;
  label: string;
  disabled: boolean;
  required: boolean;
}

const FormFieldContext = createContext<FormFieldContextValue | null>(null);

/**
 * Accessibility props every control inside a {@link FormField} must spread, so
 * no call site has to remember the `aria-describedby` / `aria-invalid` pair.
 */
export function useFormFieldControl() {
  const context = useContext(FormFieldContext);

  if (!context) {
    throw new Error("Form controls must be rendered inside a FormField.");
  }

  return {
    ...context,
    controlProps: {
      id: context.id,
      "aria-describedby": context.errorId,
      "aria-invalid": context.error ? (true as const) : undefined,
      "aria-required": context.required || undefined,
      disabled: context.disabled || undefined,
    },
  };
}

export interface FormFieldProps {
  /** Path into the form values, e.g. `email` or `documents.0.cnp`. */
  name: string;
  label: string;
  children: ReactNode;
  className?: string;
  disabled?: boolean;
  required?: boolean;
  /** Overrides the generated control id. */
  controlId?: string;
  /**
   * Suffix appended to the label's `htmlFor` for composite controls whose first
   * focusable input is a sub-element — the date field's `-day` input.
   */
  labelSuffix?: string;
}

/**
 * Label, control and error message for one form value, wired to
 * react-hook-form. Replaces the per-domain copies of this component.
 */
export function FormField({
  children,
  className,
  controlId,
  disabled = false,
  label,
  labelSuffix,
  name,
  required = false,
}: FormFieldProps) {
  const generatedId = useId();
  const id = controlId ?? generatedId;
  const { control } = useFormContext();
  const { errors } = useFormState({ control, name });
  const error = get(errors, name)?.message as string | undefined;
  const errorId = error ? `${id}-error` : undefined;

  return (
    <FormFieldContext.Provider
      value={{ disabled, error, errorId, id, label, name, required }}
    >
      <div
        data-disabled={disabled || undefined}
        className={cn("flex min-w-0 flex-col gap-2", className)}
      >
        <div
          className={cn(
            "flex items-center gap-1",
            disabled && "text-disabled-foreground",
          )}
        >
          <Label
            id={`${id}-label`}
            htmlFor={labelSuffix ? `${id}-${labelSuffix}` : id}
          >
            {label}
          </Label>
          {required ? (
            <span aria-hidden="true" className="text-current">
              *
            </span>
          ) : null}
        </div>

        {children}

        {error ? (
          <p id={errorId} role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
      </div>
    </FormFieldContext.Provider>
  );
}
