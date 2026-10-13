"use client";

import { Label, SegmentedRadioGroup } from "@repo/ui/components";
import {
  Controller,
  useFormContext,
  type FieldPathByValue,
  type FieldValues,
} from "react-hook-form";
import { useId } from "react";

type BooleanDraft = "true" | "false" | "";

export function FormBooleanRow<T extends FieldValues>({
  name,
  label,
  falseLabel,
  trueLabel,
  disabled,
  stacked = false,
}: {
  name: FieldPathByValue<T, string>;
  label: string;
  falseLabel: string;
  trueLabel: string;
  disabled?: boolean;
  stacked?: boolean;
}) {
  const { control } = useFormContext<T>();
  const id = useId();
  return (
    <Controller
      name={name}
      control={control}
      render={({ field, fieldState }) => (
        <div
          className="@container/boolean-row min-w-0 text-base"
          data-field-name={name}
        >
          <div
            className={
              stacked
                ? "grid min-w-0 gap-2"
                : "grid min-w-0 gap-2 @boolean-row/boolean-row:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] @boolean-row/boolean-row:items-center"
            }
          >
            <Label htmlFor={id} className="wrap-anywhere">
              {label}
            </Label>
            <SegmentedRadioGroup<BooleanDraft>
              id={id}
              name={field.name}
              label={label}
              value={field.value ?? ""}
              onValueChange={field.onChange}
              onBlur={field.onBlur}
              inputRef={field.ref}
              disabled={disabled}
              deselectValue=""
              showCheckmark
              aria-invalid={fieldState.invalid || undefined}
              aria-describedby={fieldState.error ? `${id}-error` : undefined}
              options={[
                {
                  value: "false",
                  label: falseLabel,
                  tone: "destructiveSubtle",
                },
                { value: "true", label: trueLabel, tone: "successSubtle" },
              ]}
            />
          </div>
          {fieldState.error ? (
            <p
              id={`${id}-error`}
              role="alert"
              className="text-sm text-destructive"
            >
              {fieldState.error.message}
            </p>
          ) : null}
        </div>
      )}
    />
  );
}
