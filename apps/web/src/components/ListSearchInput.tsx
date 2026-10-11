"use client";

import { SearchField } from "@repo/ui/components/search-field";
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
      <SearchField
        id={id}
        label={label}
        clearLabel={clearLabel}
        placeholder={placeholder}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        onClear={onClear}
      />
    </form>
  );
}
