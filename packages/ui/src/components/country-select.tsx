"use client";

import * as React from "react";
import { type CountryCode } from "libphonenumber-js";
import { ChevronDownIcon } from "lucide-react";

import { SheetSelect } from "@repo/ui/components/sheet-select";
import {
  COUNTRIES,
  findCountry,
  resolveCountryNameLocale,
} from "@repo/ui/lib/countries";
import { cn } from "@repo/ui/lib/utils";

const DEFAULT_COUNTRY = "RO" satisfies CountryCode;
const DEFAULT_LOCALE = "en";

interface CountryOption {
  country: CountryCode;
  label: string;
  /** The other locale's name, so "Germany" still finds "Germania". */
  alternateLabel: string;
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
  const selectedValue = findCountry(value)?.code ?? DEFAULT_COUNTRY;

  function changeCountry(event: React.ChangeEvent<HTMLSelectElement>) {
    const nextCountry = findCountry(event.currentTarget.value)?.code;

    if (nextCountry) {
      onValueChange(nextCountry);
    }
  }

  return (
    <div className="relative flex w-full">
      <select
        className={cn(
          "h-12 w-full appearance-none rounded-lg border border-input bg-background py-2 pr-10 pl-3 text-base transition-colors duration-fast ease-standard outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:bg-disabled disabled:text-disabled-foreground aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive md:h-11 md:pr-8 md:text-sm",
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

export interface CountrySheetSelectProps {
  /** Sheet title, and the trigger's accessible name unless `labelledById` is set. */
  label: string;
  /**
   * ISO 3166-1 alpha-2 code. An unknown code (including an empty string) shows
   * `placeholder` when one is set, and falls back to Romania otherwise.
   */
  value: string | null | undefined;
  locale?: string;
  onValueChange: (value: CountryCode) => void;
  id?: string;
  /**
   * Id of an external `<label>`. A `<label for>` cannot bind to the button
   * trigger, so the name is composed from that element plus the trigger's own
   * text — announced as "Country, Romania" rather than just "Country".
   */
  labelledById?: string;
  /** Id of the element describing the trigger, typically a field error. */
  describedById?: string;
  invalid?: boolean;
  disabled?: boolean;
  required?: boolean;
  /** Shown until a country is picked. Omit to always resolve to a country. */
  placeholder?: string;
  /**
   * Renders a first row that unsets the selection — for filters, where "any
   * country" is a valid answer. Requires `clearOptionLabel`.
   */
  onClear?: () => void;
  clearOptionLabel?: string;
  searchPlaceholder?: string;
  clearSearchLabel?: string;
  emptyMessage?: string;
  closeLabel?: string;
  className?: string;
}

/**
 * Country picker that opens the full country list in a bottom sheet (centered
 * dialog from `lg` up), with typo- and diacritic-tolerant search: "Romania" and
 * "Rmania" both find "România". Always resolves to a country unless a
 * `placeholder` is given — use {@link CountrySelect} where a compact native
 * control is enough.
 */
function CountrySheetSelect({
  value,
  locale,
  onValueChange,
  placeholder,
  onClear,
  searchPlaceholder = "Search countries",
  emptyMessage = "No countries found",
  ...props
}: CountrySheetSelectProps) {
  const options = React.useMemo(
    () =>
      getCountryOptions(locale).map((option) => ({
        value: option.country,
        label: option.label,
        keywords: [option.alternateLabel],
      })),
    [locale],
  );
  const matchedValue = findCountry(value)?.code;
  const selectedValue =
    placeholder || onClear ? matchedValue : (matchedValue ?? DEFAULT_COUNTRY);

  return (
    <SheetSelect
      {...props}
      options={options}
      value={selectedValue}
      onValueChange={(nextValue) => {
        const country = findCountry(nextValue)?.code;
        if (country) onValueChange(country);
      }}
      placeholder={placeholder}
      onClear={onClear}
      searchPlaceholder={searchPlaceholder}
      emptyMessage={emptyMessage}
    />
  );
}

function getCountryOptions(locale: string | undefined): CountryOption[] {
  const nameLocale = resolveCountryNameLocale(locale);
  const alternateLocale = nameLocale === "en" ? "ro" : "en";

  return COUNTRIES.map((country) => ({
    country: country.code,
    label: country.names[nameLocale],
    alternateLabel: country.names[alternateLocale],
  })).sort((first, second) =>
    first.label.localeCompare(second.label, locale ?? DEFAULT_LOCALE),
  );
}

export { CountrySelect, CountrySheetSelect, DEFAULT_COUNTRY };
