"use client";

import {
  Button,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@repo/ui/components";
import { SearchIcon, XIcon } from "lucide-react";
import type { FormEvent } from "react";

interface ListSearchInputProps {
  clearLabel: string;
  disabled?: boolean;
  id: string;
  label: string;
  onChange: (value: string) => void;
  onClear: () => Promise<void> | void;
  onSearch: () => Promise<void> | void;
  placeholder: string;
  value: string;
}

export function ListSearchInput({
  clearLabel,
  disabled = false,
  id,
  label,
  onChange,
  onClear,
  onSearch,
  placeholder,
  value,
}: ListSearchInputProps) {
  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (disabled) return;
    void onSearch();
  }

  return (
    <form role="search" className="w-full" onSubmit={submitSearch}>
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <InputGroup>
        <InputGroupAddon aria-hidden="true">
          <SearchIcon />
        </InputGroupAddon>
        <InputGroupInput
          id={id}
          type="search"
          inputMode="search"
          enterKeyHint="search"
          autoComplete="off"
          className="px-0 [&::-webkit-search-cancel-button]:hidden"
          placeholder={placeholder}
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
        />
        {value ? (
          <InputGroupAddon className="px-1">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={clearLabel}
              disabled={disabled}
              onClick={() => void onClear()}
            >
              <XIcon />
            </Button>
          </InputGroupAddon>
        ) : null}
      </InputGroup>
    </form>
  );
}
