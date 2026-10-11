"use client";

import * as React from "react";
import { SearchIcon, XIcon } from "lucide-react";

import { Button } from "@repo/ui/components/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@repo/ui/components/input-group";
import { cn } from "@repo/ui/lib/utils";

type SearchFieldProps = Omit<React.ComponentProps<"input">, "type"> & {
  label: string;
  /** Styles the input itself; className styles the shared input group. */
  inputClassName?: string;
} & (
    | { onClear?: undefined; clearLabel?: never }
    | {
        onClear: () => void | Promise<void>;
        clearLabel: string;
        value: string;
      }
  );

/** A labeled search input that composes into either live filters or search forms. */
function SearchField({
  label,
  id,
  className,
  inputClassName,
  onClear,
  clearLabel,
  ref,
  disabled,
  value,
  ...props
}: SearchFieldProps) {
  const generatedId = React.useId();
  const inputId = id ?? generatedId;
  const inputRef = React.useRef<HTMLInputElement>(null);
  React.useImperativeHandle(ref, () => inputRef.current!);

  return (
    <InputGroup data-slot="search-field" role={undefined} className={className}>
      <label htmlFor={inputId} className="sr-only">
        {label}
      </label>
      <InputGroupAddon aria-hidden="true">
        <SearchIcon className="size-4" />
      </InputGroupAddon>
      <InputGroupInput
        {...props}
        ref={inputRef}
        id={inputId}
        type="search"
        inputMode={props.inputMode ?? "search"}
        enterKeyHint={props.enterKeyHint ?? "search"}
        autoComplete={props.autoComplete ?? "off"}
        value={value}
        disabled={disabled}
        className={cn(
          "h-full pl-0 md:h-full md:pl-0",
          onClear && "pr-0 md:pr-0 [&::-webkit-search-cancel-button]:hidden",
          inputClassName,
        )}
      />
      {onClear && value ? (
        <InputGroupAddon className="px-1">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={clearLabel}
            disabled={disabled}
            onClick={() => {
              inputRef.current?.focus();
              void onClear();
            }}
          >
            <XIcon aria-hidden="true" />
          </Button>
        </InputGroupAddon>
      ) : null}
    </InputGroup>
  );
}

export { SearchField, type SearchFieldProps };
