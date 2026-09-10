"use client";

import {
  CountrySheetSelect,
  Input,
  PhoneNumberInput,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from "@repo/ui/components";
import { cn } from "@repo/ui/lib/utils";
import type { ComponentProps } from "react";
import { Controller, useFormContext } from "react-hook-form";

import { DatePartsField } from "@/components/DateField";
import { useFormFieldControl } from "./FormField";

/** Stands in for "nothing selected" where the select cannot use `""`. */
const EMPTY_SELECT_VALUE = "__none__";

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

export interface FormSelectOption {
  value: string;
  label: string;
}

export interface FormSelectProps {
  options: readonly FormSelectOption[];
  placeholder?: string;
  /** Adds a "no selection" choice for optional fields. */
  emptyOption?: { label: string };
  className?: string;
  /** Runs after the form value is set — for dependent-field prefilling. */
  onValueChange?: (value: string) => void;
}

/**
 * A `Select` bound to the enclosing `FormField`.
 *
 * The empty choice carries a sentinel rather than `""`, because the
 * underlying select treats an empty value as "nothing selected" and would
 * refuse to render the option at all. The sentinel is translated back to `""`
 * before it reaches the form, so consumers only ever see an empty string.
 */
export function FormSelect({
  options,
  placeholder,
  emptyOption,
  className,
  onValueChange,
}: FormSelectProps) {
  const { control } = useFormContext();
  const { controlProps, disabled, error, errorId, id, name, required } =
    useFormFieldControl();

  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <Select
          value={
            field.value
              ? String(field.value)
              : emptyOption
                ? EMPTY_SELECT_VALUE
                : null
          }
          onValueChange={(value) => {
            const next = value === EMPTY_SELECT_VALUE ? "" : String(value);
            field.onChange(next);
            field.onBlur();
            onValueChange?.(next);
          }}
        >
          <SelectTrigger
            ref={field.ref}
            aria-describedby={errorId}
            aria-invalid={error ? true : undefined}
            aria-required={required || undefined}
            className={cn("w-full", className)}
            disabled={disabled || controlProps.disabled}
            id={id}
          >
            <SelectValue placeholder={placeholder} />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {emptyOption ? (
                <SelectItem value={EMPTY_SELECT_VALUE}>
                  {emptyOption.label}
                </SelectItem>
              ) : null}
              {options.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      )}
    />
  );
}
