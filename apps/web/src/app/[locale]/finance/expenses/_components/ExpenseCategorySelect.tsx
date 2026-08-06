"use client";

import { useTranslations } from "next-intl";

import { CategorySelect } from "../../_components/CategorySelect";
import type { ExpenseCategoryOption } from "../_lib/expense-options";

interface ExpenseCategorySelectProps {
  categories: ExpenseCategoryOption[];
  disabled?: boolean;
  error?: string;
  id: string;
  label: string;
  onChange(id: string): void;
  required?: boolean;
  value: string;
}

/** Category picker shared by the full and quick expense forms: bottom-sheet with search and keyword support. */
export function ExpenseCategorySelect({
  categories,
  disabled,
  error,
  id,
  label,
  onChange,
  required,
  value,
}: ExpenseCategorySelectProps) {
  const t = useTranslations("finance.expenses.form");

  return (
    <CategorySelect
      id={id}
      label={label}
      value={value || null}
      categories={categories}
      disabled={disabled || categories.length === 0}
      error={error}
      placeholder={t("placeholders.category")}
      searchPlaceholder={t("placeholders.category")}
      emptyMessage={t("search.noCategories")}
      required={required}
      onChange={(next) => onChange(next ?? "")}
    />
  );
}
