"use client";

import * as React from "react";
import {
  getCountries,
  isSupportedCountry,
  type CountryCode,
} from "libphonenumber-js";
import { ChevronDownIcon } from "lucide-react";

import { cn } from "@repo/ui/lib/utils";

const DEFAULT_COUNTRY = "RO" satisfies CountryCode;
const DEFAULT_LOCALE = "en";

interface CountryOption {
  country: CountryCode;
  label: string;
}

export interface CountrySelectProps extends Omit<
  React.SelectHTMLAttributes<HTMLSelectElement>,
  "defaultValue" | "onChange" | "value"
> {
  value: CountryCode;
  locale?: string;
  onValueChange: (value: CountryCode) => void;
}

function CountrySelect({
  className,
  value,
  locale,
  onValueChange,
  ...props
}: CountrySelectProps) {
  const countryOptions = React.useMemo(
    () => getCountryOptions(locale),
    [locale],
  );
  const selectedValue = isSupportedCountry(value) ? value : DEFAULT_COUNTRY;

  function changeCountry(event: React.ChangeEvent<HTMLSelectElement>) {
    const nextCountry = event.currentTarget.value;

    if (isSupportedCountry(nextCountry)) {
      onValueChange(nextCountry);
    }
  }

  return (
    <div className="relative flex w-full">
      <select
        className={cn(
          "h-8 w-full appearance-none rounded-lg border border-input bg-background py-1 pr-8 pl-2.5 text-base transition-colors duration-fast ease-standard outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:bg-disabled disabled:text-disabled-foreground aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive md:text-sm",
          className,
        )}
        value={selectedValue}
        onChange={changeCountry}
        {...props}
      >
        {countryOptions.map((option) => (
          <option key={option.country} value={option.country}>
            {option.label}
          </option>
        ))}
      </select>
      <ChevronDownIcon
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 right-2 size-4 -translate-y-1/2 text-muted-foreground"
      />
    </div>
  );
}

function getCountryOptions(locale: string | undefined): CountryOption[] {
  const displayNames = getDisplayNames(locale);

  return getCountries()
    .map((country) => ({
      country,
      label: displayNames?.of(country) ?? country,
    }))
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

export { CountrySelect };
