"use client";

import { SearchSelect } from "@repo/ui/components";
import type { ComponentProps } from "react";
import { Controller, useFormContext } from "react-hook-form";
import { useFormFieldControl } from "./FormField";

export function FormSearchSelect({
  onSelectionChange,
  ...props
}: Omit<
  ComponentProps<typeof SearchSelect>,
  "value" | "defaultValue" | "onValueChange" | "name" | "id"
> & { onSelectionChange?: (value: string | null) => void }) {
  const { control } = useFormContext();
  const { id, name, disabled, error, errorId, required } =
    useFormFieldControl();
  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <div
          onBlur={field.onBlur}
          ref={(node) => field.ref(node?.querySelector("input") ?? null)}
        >
          <SearchSelect
            {...props}
            id={id}
            name={name}
            value={field.value || null}
            disabled={disabled || props.disabled}
            ariaLabelledBy={`${id}-label`}
            ariaDescribedBy={errorId}
            ariaInvalid={Boolean(error)}
            ariaRequired={required}
            onValueChange={(value) => {
              field.onChange(value ?? "");
              field.onBlur();
              onSelectionChange?.(value);
            }}
          />
        </div>
      )}
    />
  );
}
