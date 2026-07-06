"use client";

import * as React from "react";
import {
  getCountries,
  getCountryCallingCode,
  isSupportedCountry,
  parsePhoneNumberFromString,
  type CountryCode,
} from "libphonenumber-js";
import { ChevronDownIcon } from "lucide-react";

import { cn } from "@repo/ui/lib/utils";

const DEFAULT_COUNTRY = "RO" satisfies CountryCode;
const DEFAULT_LOCALE = "en";

interface PhoneNumberParts {
  country: CountryCode;
  nationalNumber: string;
}

interface CountryOption {
  country: CountryCode;
  label: string;
}

export interface PhoneNumberInputChangeDetails {
  country: CountryCode;
  countryCallingCode: string;
  nationalNumber: string;
}

export interface PhoneNumberInputProps {
  id?: string;
  className?: string;
  value?: string;
  defaultValue?: string;
  defaultCountry?: CountryCode;
  placeholder?: string;
  invalid?: boolean;
  errorMessage?: React.ReactNode;
  name?: string;
  disabled?: boolean;
  required?: boolean;
  locale?: string;
  autoComplete?: string;
  countrySelectLabel?: string;
  numberInputLabel?: string;
  "aria-describedby"?: string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  onBlur?: React.FocusEventHandler<HTMLInputElement>;
  onFocus?: React.FocusEventHandler<HTMLInputElement>;
  onValueChange?: (
    value: string,
    details: PhoneNumberInputChangeDetails,
  ) => void;
}

function PhoneNumberInput({
  id,
  className,
  value,
  defaultValue,
  defaultCountry,
  placeholder,
  invalid = false,
  errorMessage,
  name,
  disabled = false,
  required = false,
  locale,
  autoComplete = "tel-national",
  countrySelectLabel = "Country code",
  numberInputLabel = "Phone number",
  "aria-describedby": ariaDescribedBy,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledBy,
  onBlur,
  onFocus,
  onValueChange,
}: PhoneNumberInputProps) {
  const fallbackCountry = normalizeCountry(defaultCountry);
  const isControlled = value !== undefined;
  const generatedId = React.useId();
  const errorId = errorMessage ? `${generatedId}-error` : undefined;
  const describedBy = [ariaDescribedBy, errorId].filter(Boolean).join(" ");
  const isInvalid = invalid || Boolean(errorMessage);
  const countryOptions = React.useMemo(
    () => getCountryOptions(locale),
    [locale],
  );
  const [uncontrolledParts, setUncontrolledParts] = React.useState(() =>
    parsePhoneValue(defaultValue, fallbackCountry),
  );
  const parts = isControlled
    ? parsePhoneValue(value, fallbackCountry)
    : uncontrolledParts;
  const countryCallingCode = getCountryCallingCode(parts.country);
  const phoneValue = formatPhoneValue(parts);

  function commitParts(nextParts: PhoneNumberParts) {
    if (!isControlled) {
      setUncontrolledParts(nextParts);
    }

    onValueChange?.(formatPhoneValue(nextParts), {
      country: nextParts.country,
      countryCallingCode: getCountryCallingCode(nextParts.country),
      nationalNumber: nextParts.nationalNumber,
    });
  }

  function handleCountryChange(event: React.ChangeEvent<HTMLSelectElement>) {
    const nextCountry = event.currentTarget.value;

    if (!isSupportedCountry(nextCountry)) {
      return;
    }

    commitParts({
      country: nextCountry,
      nationalNumber: parts.nationalNumber,
    });
  }

  function handleNationalNumberChange(
    event: React.ChangeEvent<HTMLInputElement>,
  ) {
    const nextValue = event.currentTarget.value.trim();

    if (nextValue.startsWith("+")) {
      commitParts(parsePhoneValue(nextValue, parts.country));
      return;
    }

    commitParts({
      country: parts.country,
      nationalNumber: digitsOnly(nextValue),
    });
  }

  function handleNationalNumberBlur(event: React.FocusEvent<HTMLInputElement>) {
    onBlur?.(event);
  }

  function handleNationalNumberFocus(
    event: React.FocusEvent<HTMLInputElement>,
  ) {
    onFocus?.(event);
  }

  return (
    <div className={cn("flex w-full flex-col gap-1.5", className)}>
      <div
        aria-invalid={isInvalid || undefined}
        className={cn(
          "flex w-full rounded-lg border border-input bg-background transition-colors duration-fast ease-standard focus-within:border-ring focus-within:ring-2 focus-within:ring-ring aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive",
          disabled ? "bg-disabled text-disabled-foreground" : undefined,
        )}
      >
        <div className="relative flex shrink-0">
          <select
            aria-invalid={isInvalid || undefined}
            aria-label={countrySelectLabel}
            autoComplete="tel-country-code"
            className="h-8 appearance-none rounded-l-lg border-0 bg-transparent py-1 pr-8 pl-2.5 text-base outline-none disabled:cursor-not-allowed disabled:text-disabled-foreground md:text-sm"
            disabled={disabled}
            required={required}
            value={parts.country}
            onChange={handleCountryChange}
          >
            {countryOptions.map((option) => (
              <option key={option.country} value={option.country}>
                {option.country} (+{getCountryCallingCode(option.country)})
              </option>
            ))}
          </select>
          <ChevronDownIcon
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 right-2 z-raised size-4 -translate-y-1/2 text-muted-foreground"
          />
        </div>
        <input
          id={id}
          aria-describedby={describedBy || undefined}
          aria-invalid={isInvalid || undefined}
          aria-label={
            ariaLabel ?? (ariaLabelledBy ? undefined : numberInputLabel)
          }
          aria-labelledby={ariaLabelledBy}
          autoComplete={autoComplete}
          className={cn(
            "h-8 w-full min-w-0 rounded-r-lg border-0 border-l border-input bg-transparent px-2.5 py-1 text-base outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:text-disabled-foreground md:text-sm",
          )}
          disabled={disabled}
          inputMode="numeric"
          placeholder={placeholder}
          required={required}
          type="text"
          value={parts.nationalNumber}
          onBlur={handleNationalNumberBlur}
          onChange={handleNationalNumberChange}
          onFocus={handleNationalNumberFocus}
        />
      </div>
      {name ? <input type="hidden" name={name} value={phoneValue} /> : null}
      {errorMessage ? (
        <p id={errorId} role="alert" className="text-sm text-destructive">
          {errorMessage}
        </p>
      ) : null}
      <span className="sr-only" aria-live="polite">
        +{countryCallingCode}
      </span>
    </div>
  );
}

function parsePhoneValue(
  value: string | undefined,
  fallbackCountry: CountryCode,
): PhoneNumberParts {
  const trimmedValue = value?.trim();

  if (!trimmedValue) {
    return {
      country: fallbackCountry,
      nationalNumber: "",
    };
  }

  const parsed = parsePhoneNumberFromString(trimmedValue);

  if (parsed?.country) {
    return {
      country: parsed.country,
      nationalNumber: String(parsed.nationalNumber),
    };
  }

  return {
    country: fallbackCountry,
    nationalNumber: digitsOnly(trimmedValue),
  };
}

function formatPhoneValue(parts: PhoneNumberParts) {
  if (parts.nationalNumber.length === 0) {
    return "";
  }

  return `+${getCountryCallingCode(parts.country)}${parts.nationalNumber}`;
}

function digitsOnly(value: string) {
  return value.replace(/\D/g, "");
}

function normalizeCountry(country: CountryCode | undefined) {
  if (country && isSupportedCountry(country)) {
    return country;
  }

  return DEFAULT_COUNTRY;
}

function getCountryOptions(locale: string | undefined): CountryOption[] {
  const displayNames = getDisplayNames(locale);

  return getCountries()
    .map((country) => {
      const countryName = displayNames?.of(country) ?? country;
      const callingCode = getCountryCallingCode(country);

      return {
        country,
        label: `${countryName} (+${callingCode})`,
      };
    })
    .sort((first, second) =>
      first.label.localeCompare(second.label, locale ?? DEFAULT_LOCALE),
    );
}

function getDisplayNames(locale: string | undefined) {
  if (typeof Intl.DisplayNames !== "function") {
    return undefined;
  }

  try {
    return new Intl.DisplayNames(
      locale ? [locale, DEFAULT_LOCALE] : [DEFAULT_LOCALE],
      {
        type: "region",
      },
    );
  } catch {
    return undefined;
  }
}

export { PhoneNumberInput };
export type { CountryCode };
