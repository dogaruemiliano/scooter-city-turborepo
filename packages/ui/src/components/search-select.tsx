"use client";

import * as React from "react";
import { Combobox as ComboboxPrimitive } from "@base-ui/react/combobox";
import { tokens } from "@repo/theme";
import {
  AlertCircleIcon,
  CheckIcon,
  ChevronsUpDownIcon,
  LoaderCircleIcon,
  SearchIcon,
  XIcon,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { cn } from "@repo/ui/lib/utils";

export interface SearchSelectOption {
  value: string;
  label: string;
  description?: string;
  keywords?: readonly string[];
  disabled?: boolean;
  icon?: LucideIcon;
}

export interface SearchSelectRequestContext {
  /** Aborted when the query changes or the component unmounts. */
  signal: AbortSignal;
}

export interface SearchSelectProps {
  options: readonly SearchSelectOption[];
  renderOption?: (option: SearchSelectOption) => React.ReactNode;
  /** Keeps a controlled selection renderable when it is outside the current result page. */
  selectedOption?: SearchSelectOption;
  value?: string | null;
  defaultValue?: string;
  onValueChange?: (value: string | null) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  /**
   * Disables local filtering so `options` can contain server-ranked results.
   */
  serverSearch?: boolean;
  /**
   * Called after `searchDebounceMs` when the input query changes. Pass `signal`
   * to fetch so superseded requests cannot overwrite newer results.
   */
  onSearchQueryChange?: (
    query: string,
    context: SearchSelectRequestContext,
  ) => void;
  searchDebounceMs?: number;
  loading?: boolean;
  loadingMore?: boolean;
  loadingMessage?: string;
  errorMessage?: string | null;
  hasMore?: boolean;
  onLoadMore?: () => void;
  loadMoreLabel?: string;
  /** Distance from the scroll bottom that triggers automatic pagination. */
  loadMoreOffset?: number;
  ariaLabel?: string;
  ariaLabelledBy?: string;
  ariaDescribedBy?: string;
  ariaInvalid?: boolean;
  ariaRequired?: boolean;
  clearLabel?: string;
  toggleLabel?: string;
  id?: string;
  name?: string;
  disabled?: boolean;
  clearable?: boolean;
  className?: string;
}

function SearchSelect({
  options,
  renderOption,
  selectedOption: selectedOptionProp,
  value,
  defaultValue,
  onValueChange,
  placeholder = "Select an option",
  searchPlaceholder = "Search options",
  emptyMessage = "No options found",
  serverSearch = false,
  onSearchQueryChange,
  searchDebounceMs = tokens.motion.duration.normal,
  loading = false,
  loadingMore = false,
  loadingMessage = "Searching…",
  errorMessage,
  hasMore = false,
  onLoadMore,
  loadMoreLabel = "Load more",
  loadMoreOffset = tokens.spacing[24],
  ariaLabel,
  ariaLabelledBy,
  ariaDescribedBy,
  ariaInvalid,
  ariaRequired,
  clearLabel = "Clear selection",
  toggleLabel = "Toggle options",
  id,
  name,
  disabled = false,
  clearable = true,
  className,
}: SearchSelectProps) {
  const selectedOption =
    findOption(options, value) ??
    (selectedOptionProp?.value === value ? selectedOptionProp : undefined);
  const defaultOption = findOption(options, defaultValue);
  const filter = ComboboxPrimitive.useFilter();
  const [searchQuery, setSearchQuery] = React.useState("");
  const searchCallbackRef = React.useRef(onSearchQueryChange);

  React.useEffect(() => {
    searchCallbackRef.current = onSearchQueryChange;
  }, [onSearchQueryChange]);

  React.useEffect(() => {
    if (!searchCallbackRef.current) {
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      searchCallbackRef.current?.(searchQuery, {
        signal: controller.signal,
      });
    }, searchDebounceMs);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [searchDebounceMs, searchQuery]);

  const statusMessage = loading
    ? loadingMessage
    : errorMessage
      ? errorMessage
      : emptyMessage;

  return (
    <ComboboxPrimitive.Root
      items={options}
      value={value === undefined ? undefined : (selectedOption ?? null)}
      defaultValue={defaultOption}
      disabled={disabled}
      name={name}
      itemToStringLabel={(option) => option.label}
      itemToStringValue={(option) => option.value}
      isItemEqualToValue={(option, selected) => option.value === selected.value}
      filter={
        serverSearch
          ? null
          : (option, query) =>
              [
                option.label,
                option.description,
                ...(option.keywords ?? []),
              ].some(
                (term) => term !== undefined && filter.contains(term, query),
              )
      }
      onInputValueChange={(query, eventDetails) => {
        if (
          eventDetails.reason === "input-change" ||
          eventDetails.reason === "input-clear"
        ) {
          setSearchQuery(query);
        }
      }}
      onValueChange={(option) => onValueChange?.(option?.value ?? null)}
    >
      <ComboboxPrimitive.InputGroup
        data-slot="search-select-control"
        className={cn(
          "flex h-12 w-full items-center rounded-lg border border-input bg-background transition-colors duration-fast ease-standard focus-within:border-ring focus-within:ring-2 focus-within:ring-ring has-aria-invalid:border-destructive has-aria-invalid:ring-2 has-aria-invalid:ring-destructive data-disabled:cursor-not-allowed data-disabled:bg-disabled data-disabled:text-disabled-foreground md:h-11",
          className,
        )}
      >
        <SearchIcon
          aria-hidden="true"
          className="pointer-events-none ml-2.5 size-4 shrink-0 text-muted-foreground"
        />
        <ComboboxPrimitive.Input
          id={id}
          aria-label={ariaLabel}
          aria-labelledby={ariaLabelledBy}
          aria-describedby={ariaDescribedBy}
          aria-invalid={ariaInvalid}
          aria-required={ariaRequired}
          placeholder={selectedOption ? searchPlaceholder : placeholder}
          className="h-full min-w-0 flex-1 bg-transparent px-2 text-base outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed md:text-sm"
        />
        {clearable && selectedOption ? (
          <ComboboxPrimitive.Clear
            aria-label={clearLabel}
            className="flex size-12 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors duration-fast ease-standard hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 md:size-10"
          >
            <XIcon aria-hidden="true" />
          </ComboboxPrimitive.Clear>
        ) : null}
        <ComboboxPrimitive.Trigger
          aria-label={toggleLabel}
          className="flex size-12 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors duration-fast ease-standard hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 md:size-10"
        >
          <ChevronsUpDownIcon aria-hidden="true" />
        </ComboboxPrimitive.Trigger>
      </ComboboxPrimitive.InputGroup>

      <ComboboxPrimitive.Portal>
        <ComboboxPrimitive.Positioner
          side="bottom"
          sideOffset={tokens.spacing[1.5]}
          align="start"
          className="isolate z-popover"
        >
          <ComboboxPrimitive.Popup
            data-slot="search-select-content"
            className="group/search-select-content relative max-h-(--available-height) w-(--anchor-width) min-w-64 origin-(--transform-origin) overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground shadow-md duration-fast ease-standard data-[side=bottom]:slide-in-from-top-2 data-[side=top]:slide-in-from-bottom-2 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95"
          >
            <ComboboxPrimitive.Empty
              role="status"
              aria-live="polite"
              className="hidden px-3 py-8 text-center text-sm text-muted-foreground group-data-empty/search-select-content:flex group-data-empty/search-select-content:flex-col group-data-empty/search-select-content:items-center group-data-empty/search-select-content:gap-2"
            >
              {loading ? (
                <LoaderCircleIcon aria-hidden="true" className="animate-spin" />
              ) : errorMessage ? (
                <AlertCircleIcon aria-hidden="true" />
              ) : null}
              <span>{statusMessage}</span>
            </ComboboxPrimitive.Empty>
            <div
              className="max-h-72 scroll-py-1 overflow-y-auto overscroll-contain"
              onScroll={(event) => {
                if (!hasMore || loadingMore || !onLoadMore) return;
                const list = event.currentTarget;
                const remaining =
                  list.scrollHeight - list.scrollTop - list.clientHeight;
                if (remaining <= loadMoreOffset) onLoadMore();
              }}
            >
              <ComboboxPrimitive.List className="p-1 data-empty:p-0">
                {(option: SearchSelectOption, index: number) => (
                  <ComboboxPrimitive.Item
                    key={option.value}
                    value={option}
                    index={index}
                    disabled={option.disabled}
                    className="relative flex min-h-12 w-full cursor-default items-center gap-2 rounded-md py-2 pr-10 pl-3 outline-none select-none data-highlighted:bg-accent data-highlighted:text-accent-foreground data-disabled:pointer-events-none data-disabled:opacity-50 md:min-h-10 md:pr-8 md:pl-2"
                  >
                    {renderOption ? (
                      renderOption(option)
                    ) : (
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">
                        {option.label}
                      </span>
                    )}
                    <ComboboxPrimitive.ItemIndicator className="pointer-events-none absolute right-2 flex size-4 items-center justify-center">
                      <CheckIcon aria-hidden="true" />
                    </ComboboxPrimitive.ItemIndicator>
                  </ComboboxPrimitive.Item>
                )}
              </ComboboxPrimitive.List>
              {options.length > 0 && hasMore && onLoadMore ? (
                <button
                  type="button"
                  disabled={loadingMore}
                  onClick={onLoadMore}
                  className="flex w-full items-center justify-center gap-2 border-t border-border px-3 py-2 text-sm font-medium text-foreground outline-none transition-colors duration-fast ease-standard hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:text-disabled-foreground"
                >
                  {loadingMore ? (
                    <LoaderCircleIcon
                      aria-hidden="true"
                      className="animate-spin"
                    />
                  ) : null}
                  {loadMoreLabel}
                </button>
              ) : null}
            </div>
            {options.length > 0 && (loading || errorMessage) ? (
              <div
                role="status"
                className="flex items-center gap-2 border-t border-border px-3 py-2 text-xs text-muted-foreground"
              >
                {loading ? (
                  <LoaderCircleIcon
                    aria-hidden="true"
                    className="animate-spin"
                  />
                ) : (
                  <AlertCircleIcon aria-hidden="true" />
                )}
                <span>{loading ? loadingMessage : errorMessage}</span>
              </div>
            ) : null}
          </ComboboxPrimitive.Popup>
        </ComboboxPrimitive.Positioner>
      </ComboboxPrimitive.Portal>
    </ComboboxPrimitive.Root>
  );
}

function findOption(
  options: readonly SearchSelectOption[],
  value: string | null | undefined,
) {
  if (value == null) {
    return undefined;
  }

  return options.find((option) => option.value === value);
}

export { SearchSelect };
