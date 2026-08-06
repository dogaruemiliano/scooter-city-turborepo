"use client";

import { Label, SearchSelect } from "@repo/ui/components";
import { useTranslations } from "next-intl";

import { FinanceSelectorOptionRow } from "../../_components/FinanceSelectorOptionRow";
import { categoryIconComponent } from "../../_lib/category-icons";
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

/** Category picker shared by the full and quick expense forms: hierarchy-labelled options with icons. */
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
  const options = categories.map((category) => ({
    value: category.id,
    label: category.label,
    icon: categoryIconComponent(category.icon),
  }));

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id} id={`${id}-label`}>
        {label}{" "}
        {required ? (
          <>
            <span aria-hidden="true" className="text-destructive">
              *
            </span>
            <span className="sr-only">{t("required")}</span>
          </>
        ) : null}
      </Label>
      <SearchSelect
        id={id}
        ariaLabelledBy={`${id}-label`}
        ariaInvalid={Boolean(error)}
        ariaRequired={required}
        ariaDescribedBy={error ? `${id}-error` : undefined}
        value={value || null}
        disabled={disabled || categories.length === 0}
        options={options}
        renderOption={(option) => <FinanceSelectorOptionRow {...option} />}
        placeholder={t("placeholders.category")}
        searchPlaceholder={t("placeholders.category")}
        emptyMessage={t("search.noCategories")}
        clearLabel={t("search.clear")}
        toggleLabel={t("search.toggle")}
        onValueChange={(next) => onChange(next ?? "")}
      />
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
