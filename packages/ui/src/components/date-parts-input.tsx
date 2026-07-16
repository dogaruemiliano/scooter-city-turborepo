"use client";

import { Input } from "@repo/ui/components/input";
import { dateDigits, type DateParts } from "@repo/ui/lib/date-parts";
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
  const dayPlaceholder = locale === "ro" ? "ZZ" : "DD";
  const monthPlaceholder = locale === "ro" ? "LL" : "MM";
  const yearPlaceholder = locale === "ro" ? "AAAA" : "YYYY";
  const ariaInvalid = invalid || undefined;

  function changePart(
    part: keyof DateParts,
    nextValue: string,
    maxLength: number,
  ) {
    onChange({
      ...value,
      [part]: dateDigits(nextValue, maxLength),
    });
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
        onChange={(event) => changePart("day", event.target.value, 2)}
      />
      <span aria-hidden="true" className="text-muted-foreground">
        /
      </span>
      <Input
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
        onChange={(event) => changePart("month", event.target.value, 2)}
      />
      <span aria-hidden="true" className="text-muted-foreground">
        /
      </span>
      <Input
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

export type { DateParts };
