"use client";

import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { CalendarIcon } from "lucide-react";

import { Button } from "@repo/ui/components/button";
import {
  CalendarPicker,
  type CalendarPickerLabels,
} from "@repo/ui/components/calendar-picker";
import { Input } from "@repo/ui/components/input";
import {
  buildDateOnly,
  dateDigits,
  dateOnlyToDateParts,
  type DateParts,
} from "@repo/ui/lib/date-parts";
import { cn } from "@repo/ui/lib/utils";

/** Props shared by the typed date parts and the calendar picker beside them. */
export interface DatePartsCalendarProps {
  /** Accessible name of the button that opens the calendar. */
  calendarTriggerLabel?: string;
  /** Calendar surface heading. Defaults to the field label. */
  calendarTitle?: ReactNode;
  calendarDescription?: ReactNode;
  calendarLabels?: CalendarPickerLabels;
  maxYear?: number;
  minYear?: number;
}

const DEFAULT_CALENDAR_TRIGGER_LABEL = "Open calendar";

export interface DatePartsInputProps extends DatePartsCalendarProps {
  baseId: string;
  "aria-describedby"?: string;
  className?: string;
  disabled?: boolean;
  invalid?: boolean;
  required?: boolean;
  label: string;
  locale?: string;
  value: DateParts;
  onChange: (value: DateParts) => void;
}

export function DatePartsInput({
  baseId,
  "aria-describedby": ariaDescribedBy,
  calendarDescription,
  calendarLabels,
  calendarTitle,
  calendarTriggerLabel = DEFAULT_CALENDAR_TRIGGER_LABEL,
  className,
  disabled = false,
  invalid = false,
  maxYear,
  minYear,
  required = false,
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
    <div
      data-disabled={disabled || undefined}
      className={cn("flex w-full items-center gap-2", className)}
    >
      <Input
        id={`${baseId}-day`}
        aria-describedby={ariaDescribedBy}
        aria-invalid={ariaInvalid}
        aria-required={required || undefined}
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
      <span
        aria-hidden="true"
        className={cn(
          "text-muted-foreground",
          disabled && "text-disabled-foreground",
        )}
      >
        /
      </span>
      <Input
        ref={monthRef}
        id={`${baseId}-month`}
        aria-describedby={ariaDescribedBy}
        aria-invalid={ariaInvalid}
        aria-required={required || undefined}
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
      <span
        aria-hidden="true"
        className={cn(
          "text-muted-foreground",
          disabled && "text-disabled-foreground",
        )}
      >
        /
      </span>
      <Input
        ref={yearRef}
        id={`${baseId}-year`}
        aria-describedby={ariaDescribedBy}
        aria-invalid={ariaInvalid}
        aria-required={required || undefined}
        aria-label={`${label} ${yearPlaceholder}`}
        disabled={disabled}
        inputMode="numeric"
        maxLength={4}
        placeholder={yearPlaceholder}
        value={value.year}
        className="min-w-0 flex-1"
        onChange={(event) => changePart("year", event.target.value, 4)}
      />
      <CalendarPicker
        description={calendarDescription}
        labels={calendarLabels}
        locale={locale}
        maxYear={maxYear}
        minYear={minYear}
        title={calendarTitle ?? label}
        value={buildDateOnly(value).value ?? null}
        onValueChange={(nextValue) => onChange(dateOnlyToDateParts(nextValue))}
        renderTrigger={
          <Button
            aria-label={calendarTriggerLabel}
            className="shrink-0"
            disabled={disabled}
            size="icon"
            type="button"
            variant="outline"
          />
        }
        triggerLabel={<CalendarIcon aria-hidden="true" />}
      />
    </div>
  );
}

export interface DatePartsFieldProps extends DatePartsCalendarProps {
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
  calendarDescription,
  calendarLabels,
  calendarTitle,
  calendarTriggerLabel,
  className,
  defaultValue,
  disabled,
  invalid,
  label,
  locale,
  maxYear,
  minYear,
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
        calendarDescription={calendarDescription}
        calendarLabels={calendarLabels}
        calendarTitle={calendarTitle}
        calendarTriggerLabel={calendarTriggerLabel}
        className={className}
        disabled={disabled}
        invalid={invalid}
        maxYear={maxYear}
        minYear={minYear}
        required={required}
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
