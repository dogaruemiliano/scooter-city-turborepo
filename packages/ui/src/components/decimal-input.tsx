"use client";

import { formatDecimalInput } from "../lib/decimal";
import { NormalizedInput, type NormalizedInputProps } from "./normalized-input";

export interface DecimalInputProps extends Omit<
  NormalizedInputProps,
  "normalize" | "inputMode"
> {
  locale: string;
}

/** Keeps a string draft (including a trailing separator); parsing is explicit. */
export function DecimalInput({ locale, ...props }: DecimalInputProps) {
  return (
    <NormalizedInput
      {...props}
      inputMode="decimal"
      normalize={(value) => formatDecimalInput(value, locale)}
    />
  );
}
