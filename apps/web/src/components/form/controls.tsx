"use client";

import {
  CountrySheetSelect,
  Input,
  PhoneNumberInput,
  Textarea,
} from "@repo/ui/components";
import type { ComponentProps } from "react";
import { Controller, useFormContext } from "react-hook-form";

import { DatePartsField } from "@/components/DateField";
import { useFormFieldControl } from "./FormField";

/**
 * Controls bound to the enclosing `FormField`. Native inputs use `register`
 * (blur and change already flow through react-hook-form); everything else is
 * wrapped in a `Controller`, since these components report values through
 * their own callbacks rather than DOM events.
 */

export function FormInput({
  type = "text",
  ...props
}: Omit<ComponentProps<typeof Input>, "name">) {
  const { controlProps, name } = useFormFieldControl();
  const { register } = useFormContext();

  return <Input {...controlProps} {...props} type={type} {...register(name)} />;
}

export function FormTextarea(
  props: Omit<ComponentProps<typeof Textarea>, "name">,
) {
  const { controlProps, name } = useFormFieldControl();
  const { register } = useFormContext();

  return <Textarea {...controlProps} {...props} {...register(name)} />;
}

export interface FormDateFieldProps {
  /** Latest selectable day, ISO `YYYY-MM-DD`. Use for dates of birth. */
  maxDate?: string;
  minDate?: string;
  className?: string;
}

export function FormDateField({
  className,
  maxDate,
  minDate,
}: FormDateFieldProps) {
  const { control } = useFormContext();
  const { disabled, error, errorId, id, label, name, required } =
    useFormFieldControl();

  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <DatePartsField
          aria-describedby={errorId}
          baseId={id}
          className={className}
          disabled={disabled}
          invalid={Boolean(error)}
          label={label}
          maxDate={maxDate}
          minDate={minDate}
          onBlur={field.onBlur}
          onChange={field.onChange}
          required={required}
          value={field.value ?? ""}
        />
      )}
    />
  );
}

export function FormPhoneInput(
  props: Omit<
    ComponentProps<typeof PhoneNumberInput>,
    "value" | "onValueChange" | "onBlur" | "name"
  >,
) {
  const { control } = useFormContext();
  const { controlProps, disabled, error, errorId, name, required } =
    useFormFieldControl();

  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <PhoneNumberInput
          {...props}
          aria-describedby={errorId}
          disabled={disabled}
          errorMessage={undefined}
          id={controlProps.id}
          invalid={Boolean(error)}
          name={field.name}
          onBlur={field.onBlur}
          onValueChange={field.onChange}
          required={required}
          value={field.value ?? ""}
        />
      )}
    />
  );
}

export function FormCountrySelect(
  props: Omit<
    ComponentProps<typeof CountrySheetSelect>,
    "value" | "onValueChange" | "labelledById" | "describedById"
  >,
) {
  const { control } = useFormContext();
  const { disabled, error, errorId, id, name, required } =
    useFormFieldControl();

  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <CountrySheetSelect
          {...props}
          describedById={errorId}
          disabled={disabled}
          id={id}
          invalid={Boolean(error)}
          labelledById={`${id}-label`}
          onValueChange={(value) => {
            field.onChange(value);
            field.onBlur();
          }}
          required={required}
          value={field.value ?? ""}
        />
      )}
    />
  );
}
