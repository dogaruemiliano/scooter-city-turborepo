"use client";

import * as React from "react";
import { type CountryCode } from "libphonenumber-js";
import { CheckIcon, ChevronDownIcon, SearchIcon, XIcon } from "lucide-react";

import {
  BottomSheet,
  BottomSheetBody,
  BottomSheetClose,
  BottomSheetContent,
  BottomSheetFooter,
  BottomSheetHeader,
  BottomSheetTitle,
  BottomSheetTrigger,
} from "@repo/ui/components/bottom-sheet";
import { Button } from "@repo/ui/components/button";
import {
  COUNTRIES,
  findCountry,
  resolveCountryNameLocale,
} from "@repo/ui/lib/countries";
import {
  createFuzzyIndex,
  searchFuzzyIndex,
  type FuzzySearchKey,
} from "@repo/ui/lib/fuzzy-search";
import { cn } from "@repo/ui/lib/utils";

const DEFAULT_COUNTRY = "RO" satisfies CountryCode;
const DEFAULT_LOCALE = "en";

interface CountryOption {
  country: CountryCode;
  label: string;
  /** The other locale's name, so "Germany" still finds "Germania". */
  alternateLabel: string;
}

const SEARCH_KEYS: readonly FuzzySearchKey<CountryOption>[] = [
  { name: "label", weight: 3, get: (option) => option.label },
  { name: "alternateLabel", weight: 2, get: (option) => option.alternateLabel },
  { name: "country", weight: 1, get: (option) => option.country },
];

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
  label,
  value,
  locale,
  onValueChange,
  id,
  labelledById,
  describedById,
  invalid = false,
  disabled = false,
  required = false,
  placeholder,
  onClear,
  clearOptionLabel,
  searchPlaceholder = "Search countries",
  clearSearchLabel = "Clear search",
  emptyMessage = "No countries found",
  closeLabel = "Close",
  className,
}: CountrySheetSelectProps) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const searchInputRef = React.useRef<HTMLInputElement>(null);
  const countryOptions = React.useMemo(
    () => getCountryOptions(locale),
    [locale],
  );
  const searchIndex = React.useMemo(
    () => createFuzzyIndex(countryOptions, { keys: SEARCH_KEYS }),
    [countryOptions],
  );
  const matchedValue = findCountry(value)?.code;
  // A picker that can show a placeholder or be cleared is allowed to hold no
  // country; every other one falls back to the default.
  const selectedValue =
    placeholder || onClear ? matchedValue : (matchedValue ?? DEFAULT_COUNTRY);
  const selectedOption = countryOptions.find(
    (option) => option.country === selectedValue,
  );
  const filteredOptions = React.useMemo(
    () => searchFuzzyIndex(searchIndex, query, countryOptions),
    [countryOptions, query, searchIndex],
  );

  const showClearOption = Boolean(onClear && clearOptionLabel && !query.trim());

  function select(country: CountryCode) {
    onValueChange(country);
    setOpen(false);
  }

  function clear() {
    onClear?.();
    setOpen(false);
  }

  return (
    <BottomSheet
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);

        if (!nextOpen) {
          setQuery("");
        }
      }}
    >
      <BottomSheetTrigger
        render={
          <button
            type="button"
            id={id}
            disabled={disabled}
            aria-label={labelledById ? undefined : label}
            aria-labelledby={
              labelledById && id ? `${labelledById} ${id}` : undefined
            }
            aria-required={required || undefined}
            aria-describedby={describedById}
            aria-invalid={invalid || undefined}
            className={cn(
              "flex h-12 w-full items-center justify-between gap-2 rounded-lg border border-input bg-background px-3 py-2 text-base text-left outline-none transition-colors duration-fast ease-standard focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:bg-disabled disabled:text-disabled-foreground aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive md:h-11 md:text-sm",
              className,
            )}
          />
        }
      >
        <span
          className={cn(
            "truncate",
            selectedOption ? "text-foreground" : "text-muted-foreground",
          )}
        >
          {selectedOption?.label ?? placeholder ?? selectedValue}
        </span>
        <ChevronDownIcon
          aria-hidden="true"
          className="size-4 shrink-0 text-muted-foreground"
        />
      </BottomSheetTrigger>

      <BottomSheetContent initialFocus={searchInputRef}>
        <BottomSheetHeader>
          <BottomSheetTitle>{label}</BottomSheetTitle>
        </BottomSheetHeader>

        <BottomSheetBody>
          <div className="flex h-10 shrink-0 items-center rounded-lg border border-input bg-background px-3 transition-colors duration-fast ease-standard focus-within:border-ring focus-within:ring-2 focus-within:ring-ring">
            <SearchIcon
              aria-hidden="true"
              className="pointer-events-none size-4 shrink-0 text-muted-foreground"
            />
            <input
              ref={searchInputRef}
              type="text"
              placeholder={searchPlaceholder}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="min-w-0 flex-1 bg-transparent px-2 text-sm outline-none placeholder:text-muted-foreground"
            />
            {query ? (
              <button
                type="button"
                aria-label={clearSearchLabel}
                onClick={() => setQuery("")}
                className="flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground outline-none transition-colors duration-fast ease-standard hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring"
              >
                <XIcon aria-hidden="true" className="size-4" />
              </button>
            ) : null}
          </div>

          {filteredOptions.length === 0 && !showClearOption ? (
            <div className="flex min-h-24 items-center justify-center text-center text-sm text-muted-foreground">
              {emptyMessage}
            </div>
          ) : (
            <ul className="flex min-h-0 flex-col gap-1 overflow-y-auto overscroll-contain">
              {showClearOption ? (
                <li>
                  <button
                    type="button"
                    onClick={clear}
                    aria-current={selectedValue ? undefined : "true"}
                    className={cn(
                      "flex w-full items-center justify-between gap-2 rounded px-3 py-2 text-left text-sm outline-none transition-colors duration-fast ease-standard focus-visible:ring-2 focus-visible:ring-ring",
                      selectedValue
                        ? "text-muted-foreground hover:bg-accent/50"
                        : "bg-accent font-medium text-accent-foreground",
                    )}
                  >
                    <span className="truncate">{clearOptionLabel}</span>
                    {selectedValue ? null : (
                      <CheckIcon
                        aria-hidden="true"
                        className="size-4 shrink-0"
                      />
                    )}
                  </button>
                </li>
              ) : null}
              {filteredOptions.map((option) => (
                <li key={option.country}>
                  <button
                    type="button"
                    onClick={() => select(option.country)}
                    aria-current={
                      option.country === selectedValue ? "true" : undefined
                    }
                    className={cn(
                      "flex w-full items-center justify-between gap-2 rounded px-3 py-2 text-left text-sm outline-none transition-colors duration-fast ease-standard focus-visible:ring-2 focus-visible:ring-ring",
                      option.country === selectedValue
                        ? "bg-accent font-medium text-accent-foreground"
                        : "text-foreground hover:bg-accent/50",
                    )}
                  >
                    <span className="truncate">{option.label}</span>
                    {option.country === selectedValue ? (
                      <CheckIcon
                        aria-hidden="true"
                        className="size-4 shrink-0"
                      />
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </BottomSheetBody>

        <BottomSheetFooter>
          <BottomSheetClose render={<Button type="button" variant="outline" />}>
            {closeLabel}
          </BottomSheetClose>
        </BottomSheetFooter>
      </BottomSheetContent>
    </BottomSheet>
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
