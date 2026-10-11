"use client";

import { Label } from "@repo/ui/components";
import { cn } from "@repo/ui/lib/utils";
import { TriangleAlertIcon } from "lucide-react";
import { createContext, useContext, useId, type ReactNode } from "react";
import { get, useFormContext, useFormState } from "react-hook-form";

interface FormFieldContextValue {
  /** Element id of the control; the label's `htmlFor`. */
  id: string;
  /** Id of the error or warning description, when present. */
  errorId: string | undefined;
  error: string | undefined;
  name: string;
  label: string;
  disabled: boolean;
  required: boolean;
}

const FormFieldContext = createContext<FormFieldContextValue | null>(null);

/** Optional, non-blocking review feedback, keyed by form field path. */
export const FormFieldWarningsContext = createContext<
  Readonly<Record<string, string>>
>({});

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
  labelHint?: string;
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
  labelHint,
  name,
  required = false,
}: FormFieldProps) {
  const generatedId = useId();
  const id = controlId ?? generatedId;
  const { control } = useFormContext();
  const { errors } = useFormState({ control, name });
  const error = get(errors, name)?.message as string | undefined;
  const warnings = useContext(FormFieldWarningsContext);
  const warning = !error ? warnings[name] : undefined;
  const errorId = error ? `${id}-error` : warning ? `${id}-warning` : undefined;

  return (
    <FormFieldContext.Provider
      value={{ disabled, error, errorId, id, label, name, required }}
    >
      <div
        data-field-name={name}
        data-warning={warning ? true : undefined}
        data-disabled={disabled || undefined}
        className={cn(
          "flex min-w-0 flex-col gap-2",
          warning &&
            "[&_[data-slot=input]]:border-warning [&_[data-slot=textarea]]:border-warning [&_[data-slot=select-trigger]]:border-warning [&_[data-slot=search-select-control]]:border-warning [&_[data-slot=input-group]]:border-warning [&_button[aria-haspopup=dialog]]:border-warning",
          className,
        )}
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
          {labelHint ? (
            <span aria-hidden="true" className="text-xs text-muted-foreground">
              {labelHint}
            </span>
          ) : null}
          {required ? (
            <span
              aria-hidden="true"
              className="text-sm leading-none text-current"
            >
              *
            </span>
          ) : null}
          {warning ? (
            <span title={warning} className="text-warning">
              <TriangleAlertIcon aria-hidden="true" className="size-4" />
            </span>
          ) : null}
        </div>

        {children}

        {warning ? (
          <p id={errorId} className="sr-only">
            {warning}
          </p>
        ) : null}

        {error ? (
          <p id={errorId} role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
      </div>
    </FormFieldContext.Provider>
  );
}
