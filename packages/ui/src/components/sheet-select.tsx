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
import { bottomSheet, breakpoints } from "@repo/theme";
import { useIsMobile } from "@repo/ui/hooks/use-mobile";

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

interface SheetSelectBaseProps {
  /** Sheet title, and the trigger's accessible name unless `labelledById` is set. */
  label: string;
  options: readonly SheetSelectOption[];
  triggerRef?: React.Ref<HTMLButtonElement>;
  onBlur?: () => void;
  /** Optional action inside the sheet; call `select` to select and close it. */
  renderHeaderAction?: (select: (value: string) => void) => React.ReactNode;
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
  optionClassName?: string;
  /** Rich option content; label remains the search and accessible name. */
  renderOption?: (option: SheetSelectOption) => React.ReactNode;
  /** Custom trigger content, for collection add/change actions. */
  triggerContent?: React.ReactNode;
}

export type SheetSelectProps = SheetSelectBaseProps &
  (
    | {
        multiple?: false;
        value: string | null | undefined;
        onValueChange: (value: string) => void;
      }
    | {
        multiple: true;
        value: readonly string[];
        onValueChange: (value: string[]) => void;
      }
  );

function SheetSelect({
  multiple,
  label,
  value,
  options,
  onValueChange,
  triggerRef,
  onBlur,
  renderHeaderAction,
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
  optionClassName,
  renderOption,
  triggerContent,
}: SheetSelectProps) {
  const mobile = useIsMobile(breakpoints.lg);
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const searchInputRef = React.useRef<HTMLInputElement>(null);
  const searchIndex = React.useMemo(
    () => createFuzzyIndex(options, { keys: SEARCH_KEYS }),
    [options],
  );
  const selectedValues = multiple ? value : value ? [value] : [];
  const selectedSet = new Set(selectedValues);
  const hasSelection = selectedValues.length > 0;
  const selectedLabel = selectedValues
    .map(
      (selected) =>
        options.find((option) => option.value === selected)?.label ?? selected,
    )
    .join(", ");
  const filteredOptions = React.useMemo(
    () => searchFuzzyIndex(searchIndex, query, options),
    [options, query, searchIndex],
  );

  const showClearOption = Boolean(onClear && clearOptionLabel && !query.trim());

  function select(value: string) {
    if (multiple) {
      onValueChange(
        selectedSet.has(value)
          ? selectedValues.filter((selected) => selected !== value)
          : [...selectedValues, value],
      );
      return;
    }
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
      snapPoints={mobile ? [bottomSheet.selectSnapPoint] : undefined}
      snapPoint={mobile ? bottomSheet.selectSnapPoint : null}
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);

        if (!nextOpen) {
          setQuery("");
        }
      }}
    >
      <BottomSheetTrigger
        id={id}
        disabled={disabled}
        ref={triggerRef}
        onBlur={onBlur}
        render={
          <button
            type="button"
            aria-label={labelledById ? undefined : label}
            aria-labelledby={
              labelledById && id ? `${labelledById} ${id}` : undefined
            }
            aria-required={required || undefined}
            aria-describedby={describedById}
            aria-invalid={invalid || undefined}
            className={cn(
              "flex h-12 w-full items-center justify-between gap-2 rounded-lg border border-input bg-control px-3 py-2 text-base text-left outline-none transition-colors duration-fast ease-standard focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:bg-disabled disabled:text-disabled-foreground aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive md:h-11 md:text-sm",
              className,
            )}
          >
            {triggerContent ?? (
              <>
                <span
                  className={cn(
                    "truncate",
                    hasSelection ? "text-foreground" : "text-muted-foreground",
                  )}
                >
                  {selectedLabel || placeholder}
                </span>
                <ChevronDownIcon
                  aria-hidden="true"
                  className="size-4 shrink-0 text-muted-foreground"
                />
              </>
            )}
          </button>
        }
      />

      <BottomSheetContent
        initialFocus={searchInputRef}
        className="lg:h-(--select-sheet-height)"
        style={
          {
            "--select-sheet-height": bottomSheet.selectHeight,
          } as React.CSSProperties
        }
      >
        <BottomSheetHeader>
          <div className="flex items-center justify-between gap-2">
            <BottomSheetTitle>{label}</BottomSheetTitle>
            {renderHeaderAction?.(select)}
          </div>
        </BottomSheetHeader>

        <BottomSheetBody className="overflow-hidden pb-0">
          <div className="flex h-10 shrink-0 items-center rounded-lg border border-input bg-control px-3 transition-colors duration-fast ease-standard focus-within:border-ring focus-within:ring-2 focus-within:ring-ring">
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
            <ul className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto overscroll-contain">
              {showClearOption ? (
                <li>
                  <button
                    type="button"
                    onClick={clear}
                    aria-current={hasSelection ? undefined : "true"}
                    className={cn(
                      "flex h-10 w-full items-center justify-between gap-2 rounded px-3 py-2 text-left text-sm outline-none transition-colors duration-fast ease-standard focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:text-disabled-foreground",
                      hasSelection
                        ? "bg-selectable-row text-muted-foreground hover:bg-accent/50"
                        : "bg-accent font-medium text-accent-foreground",
                      optionClassName,
                    )}
                  >
                    <span className="truncate">{clearOptionLabel}</span>
                    {hasSelection ? null : (
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
                    aria-label={renderOption ? option.label : undefined}
                    aria-pressed={
                      multiple ? selectedSet.has(option.value) : undefined
                    }
                    aria-current={
                      !multiple && selectedSet.has(option.value)
                        ? "true"
                        : undefined
                    }
                    className={cn(
                      "flex h-10 w-full items-center justify-between gap-2 rounded px-3 py-2 text-left text-sm outline-none transition-colors duration-fast ease-standard focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:text-disabled-foreground",
                      selectedSet.has(option.value)
                        ? "bg-accent font-medium text-accent-foreground"
                        : "bg-selectable-row text-foreground hover:bg-accent/50",
                      optionClassName,
                    )}
                  >
                    {renderOption ? (
                      renderOption(option)
                    ) : (
                      <span className="truncate">{option.label}</span>
                    )}
                    {selectedSet.has(option.value) ? (
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
