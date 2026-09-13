"use client";

import * as React from "react";
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
  createFuzzyIndex,
  searchFuzzyIndex,
  type FuzzySearchKey,
} from "@repo/ui/lib/fuzzy-search";
import { cn } from "@repo/ui/lib/utils";

export interface SheetSelectOption {
  value: string;
  label: string;
  keywords?: readonly string[];
  disabled?: boolean;
}

const SEARCH_KEYS: readonly FuzzySearchKey<SheetSelectOption>[] = [
  { name: "label", weight: 3, get: (option) => option.label },
  { name: "keywords", weight: 2, get: (option) => option.keywords },
  { name: "value", weight: 1, get: (option) => option.value },
];

export interface SheetSelectProps {
  /** Sheet title, and the trigger's accessible name unless `labelledById` is set. */
  label: string;
  value: string | null | undefined;
  options: readonly SheetSelectOption[];
  onValueChange: (value: string) => void;
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
  /** Shown until an option is picked. */
  placeholder?: string;
  /**
   * Renders a first row that unsets the selection — for filters, where "any
   * option" is a valid answer. Requires `clearOptionLabel`.
   */
  onClear?: () => void;
  clearOptionLabel?: string;
  searchPlaceholder?: string;
  clearSearchLabel?: string;
  emptyMessage?: string;
  closeLabel?: string;
  className?: string;
}

function SheetSelect({
  label,
  value,
  options,
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
  searchPlaceholder = "Search options",
  clearSearchLabel = "Clear search",
  emptyMessage = "No options found",
  closeLabel = "Close",
  className,
}: SheetSelectProps) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const searchInputRef = React.useRef<HTMLInputElement>(null);
  const searchIndex = React.useMemo(
    () => createFuzzyIndex(options, { keys: SEARCH_KEYS }),
    [options],
  );
  const selectedValue = value;
  const selectedOption = options.find((option) => option.value === value);
  const filteredOptions = React.useMemo(
    () => searchFuzzyIndex(searchIndex, query, options),
    [options, query, searchIndex],
  );

  const showClearOption = Boolean(onClear && clearOptionLabel && !query.trim());

  function select(value: string) {
    onValueChange(value);
    setOpen(false);
    setQuery("");
  }

  function clear() {
    onClear?.();
    setOpen(false);
    setQuery("");
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
          {selectedOption?.label ?? (value || placeholder)}
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
              aria-label={searchPlaceholder}
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
                      "flex w-full items-center justify-between gap-2 rounded px-3 py-2 text-left text-sm outline-none transition-colors duration-fast ease-standard focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:text-disabled-foreground",
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
                <li key={option.value}>
                  <button
                    type="button"
                    onClick={() => select(option.value)}
                    disabled={option.disabled}
                    aria-current={
                      option.value === selectedValue ? "true" : undefined
                    }
                    className={cn(
                      "flex w-full items-center justify-between gap-2 rounded px-3 py-2 text-left text-sm outline-none transition-colors duration-fast ease-standard focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:text-disabled-foreground",
                      option.value === selectedValue
                        ? "bg-accent font-medium text-accent-foreground"
                        : "text-foreground hover:bg-accent/50",
                    )}
                  >
                    <span className="truncate">{option.label}</span>
                    {option.value === selectedValue ? (
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

export { SheetSelect };
