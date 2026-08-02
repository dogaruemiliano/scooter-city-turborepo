"use client";

import { useEffect, useRef, useState } from "react";

import { Input } from "@repo/ui/components/input";
import {
  buildDateOnly,
  dateDigits,
  dateOnlyToDateParts,
  type DateParts,
} from "@repo/ui/lib/date-parts";
import { cn } from "@repo/ui/lib/utils";

export interface DatePartsInputProps {
  baseId: string;
  "aria-describedby"?: string;
  className?: string;
  disabled?: boolean;
  invalid?: boolean;
  label: string;
  locale?: string;
  value: DateParts;
  onChange: (value: DateParts) => void;
}

export function DatePartsInput({
  baseId,
  "aria-describedby": ariaDescribedBy,
  className,
  disabled = false,
  invalid = false,
  label,
  locale,
  value,
  onChange,
}: DatePartsInputProps) {
  const monthRef = useRef<HTMLInputElement>(null);
  const yearRef = useRef<HTMLInputElement>(null);
  const dayPlaceholder = locale === "ro" ? "ZZ" : "DD";
  const monthPlaceholder = locale === "ro" ? "LL" : "MM";
  const yearPlaceholder = locale === "ro" ? "AAAA" : "YYYY";
  const ariaInvalid = invalid || undefined;

  function changePart(
    part: keyof DateParts,
    nextValue: string,
    maxLength: number,
    nextInput?: HTMLInputElement | null,
  ) {
    const digits = dateDigits(nextValue, maxLength);
    onChange({
      ...value,
      [part]: digits,
    });
    if (digits.length === maxLength) {
      nextInput?.focus();
    }
  }

  return (
    <div className={cn("flex w-full items-center gap-2", className)}>
      <Input
        id={`${baseId}-day`}
        aria-describedby={ariaDescribedBy}
        aria-invalid={ariaInvalid}
        aria-label={label}
        disabled={disabled}
        inputMode="numeric"
        maxLength={2}
        placeholder={dayPlaceholder}
        value={value.day}
        className="min-w-0 flex-1"
        onChange={(event) =>
          changePart("day", event.target.value, 2, monthRef.current)
        }
      />
      <span aria-hidden="true" className="text-muted-foreground">
        /
      </span>
      <Input
        ref={monthRef}
        id={`${baseId}-month`}
        aria-describedby={ariaDescribedBy}
        aria-invalid={ariaInvalid}
        aria-label={`${label} ${monthPlaceholder}`}
        disabled={disabled}
        inputMode="numeric"
        maxLength={2}
        placeholder={monthPlaceholder}
        value={value.month}
        className="min-w-0 flex-1"
        onChange={(event) =>
          changePart("month", event.target.value, 2, yearRef.current)
        }
      />
      <span aria-hidden="true" className="text-muted-foreground">
        /
      </span>
      <Input
        ref={yearRef}
        id={`${baseId}-year`}
        aria-describedby={ariaDescribedBy}
        aria-invalid={ariaInvalid}
        aria-label={`${label} ${yearPlaceholder}`}
        disabled={disabled}
        inputMode="numeric"
        maxLength={4}
        placeholder={yearPlaceholder}
        value={value.year}
        className="min-w-0 flex-1"
        onChange={(event) => changePart("year", event.target.value, 4)}
      />
    </div>
  );
}

export interface DatePartsFieldProps {
  baseId: string;
  "aria-describedby"?: string;
  className?: string;
  disabled?: boolean;
  invalid?: boolean;
  label: string;
  locale?: string;
  name?: string;
  required?: boolean;
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
}

/**
 * Form-compatible date-only control that presents localized date parts while
 * keeping the submitted and application-facing value in ISO YYYY-MM-DD form.
 */
export function DatePartsField({
  baseId,
  "aria-describedby": ariaDescribedBy,
  className,
  defaultValue,
  disabled,
  invalid,
  label,
  locale,
  name,
  onChange,
  required,
  value,
}: DatePartsFieldProps) {
  const externalValue = value ?? defaultValue ?? "";
  const [parts, setParts] = useState(() => dateOnlyToDateParts(externalValue));
  const lastEmittedValue = useRef(externalValue);
  const result = buildDateOnly(parts);
  const isoValue = result.value ?? "";

  useEffect(() => {
    if (value === undefined || value === lastEmittedValue.current) return;
    lastEmittedValue.current = value;
    setParts(dateOnlyToDateParts(value));
  }, [value]);

  function changeParts(nextParts: DateParts) {
    setParts(nextParts);
    const nextValue = buildDateOnly(nextParts).value ?? "";
    lastEmittedValue.current = nextValue;
    onChange?.(nextValue);
  }

  return (
    <>
      <DatePartsInput
        baseId={baseId}
        aria-describedby={ariaDescribedBy}
        className={className}
        disabled={disabled}
        invalid={invalid}
        label={label}
        locale={locale}
        value={parts}
        onChange={changeParts}
      />
      {name ? (
        <input
          type="hidden"
          name={name}
          value={isoValue}
          disabled={disabled}
          required={required}
        />
      ) : null}
    </>
  );
}

export type { DateParts };
