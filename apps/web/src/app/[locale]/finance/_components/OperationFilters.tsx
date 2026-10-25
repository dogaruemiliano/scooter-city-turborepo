"use client";

import { v1 } from "@repo/api-shared";
import {
  Input,
  Label,
  ListFilterSheet,
  ListStatus,
  SheetSelect,
} from "@repo/ui/components";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useTransition } from "react";

import { usePathname, useRouter } from "@/i18n/navigation";
import {
  defaultOperationFilters,
  operationFilterCount,
  operationListHref,
  operationTimestampInput,
  operationTimestampValue,
  validOperationFilterRange,
  updateOperationFilter,
  type OperationFilters as Filters,
} from "../_lib/operation-list-query";

interface OperationFiltersProps {
  value: Filters;
  books: readonly {
    id: string;
    name: string;
    type: v1.finance.FinanceBookType;
  }[];
  fixedKind?: v1.finance.FinancialOperationKind;
}

export function OperationFilters({
  value,
  books,
  fixedKind,
}: OperationFiltersProps) {
  const t = useTranslations("finance");
  const shared = useTranslations("shared");
  const pathname = usePathname();
  const router = useRouter();
  const search = useSearchParams();
  const [pending, startTransition] = useTransition();
  const selectLabels = {
    placeholder: t("common.all"),
    clearOptionLabel: t("common.all"),
    searchPlaceholder: shared("list.selectSearch"),
    clearSearchLabel: shared("list.selectClearSearch"),
    emptyMessage: shared("list.selectEmpty"),
    closeLabel: shared("actions.close"),
  };

  return (
    <div className="flex flex-col items-start gap-2">
      <ListFilterSheet
        value={value}
        defaultValue={defaultOperationFilters(fixedKind)}
        appliedCount={operationFilterCount(value, fixedKind)}
        title={shared("list.filters")}
        description={t("operations.filters.description")}
        applyLabel={shared("list.apply")}
        applyingLabel={shared("list.applying")}
        resetLabel={shared("list.reset")}
        cancelLabel={shared("actions.cancel")}
        applyErrorLabel={t("operations.filters.invalidRange")}
        disabled={pending}
        onApply={(filters) => {
          if (!validOperationFilterRange(filters))
            throw new Error(t("operations.filters.invalidRange"));
          const href = operationListHref(
            pathname,
            new URLSearchParams(search.toString()),
            filters,
            1,
            fixedKind,
          );
          startTransition(() => router.push(href));
        }}
      >
        {({ value: draft, setValue }) => {
          const update = (key: keyof Filters, next: string) =>
            setValue(updateOperationFilter(draft, key, next));
          const choices = [
            {
              key: "bookId" as const,
              label: t("operations.filters.book"),
              options: books.map((book) => ({
                value: book.id,
                label: book.name,
              })),
            },
            {
              key: "bookType" as const,
              label: t("operations.filters.bookType"),
              options: v1.finance.FINANCE_BOOK_TYPES.map((type) => ({
                value: type,
                label: t(`books.${type}`),
                disabled: !books.some((book) => book.type === type),
              })),
            },
            ...(fixedKind
              ? []
              : [
                  {
                    key: "kind" as const,
                    label: t("operations.filters.kind"),
                    options: v1.finance.FINANCIAL_OPERATION_KINDS.map(
                      (kind) => ({
                        value: kind,
                        label: t(`operations.kinds.${kind}`),
                      }),
                    ),
                  },
                ]),
            {
              key: "status" as const,
              label: t("operations.filters.status"),
              options: v1.finance.FINANCIAL_OPERATION_STATUSES.map(
                (status) => ({
                  value: status,
                  label: t(`operations.statuses.${status}`),
                }),
              ),
            },
            {
              key: "treatment" as const,
              label: t("operations.filters.treatment"),
              options: v1.finance.EXPENSE_TREATMENTS.map((treatment) => ({
                value: treatment,
                label: t(`expense.treatments.${treatment}`),
              })),
            },
          ];

          return (
            <div className="flex flex-col gap-4">
              {choices.map(({ key, label, options }) => (
                <div key={key} className="flex flex-col gap-2">
                  <Label id={`operation-filter-${key}`}>{label}</Label>
                  <SheetSelect
                    {...selectLabels}
                    id={`operation-filter-${key}-select`}
                    label={label}
                    labelledById={`operation-filter-${key}`}
                    value={draft[key]}
                    options={options}
                    onValueChange={(next) => update(key, next)}
                    onClear={() => update(key, "")}
                  />
                </div>
              ))}
              {(["from", "to"] as const).map((key) => (
                <div key={key} className="flex flex-col gap-2">
                  <Label htmlFor={`operation-filter-${key}`}>
                    {t(`operations.filters.${key}`)}
                  </Label>
                  <Input
                    id={`operation-filter-${key}`}
                    type="datetime-local"
                    step="0.001"
                    value={operationTimestampInput(draft[key])}
                    onChange={(event) =>
                      update(key, operationTimestampValue(event.target.value))
                    }
                  />
                </div>
              ))}
            </div>
          );
        }}
      </ListFilterSheet>
      {pending ? (
        <div className="max-w-36">
          <ListStatus
            loading
            loadingLabel={shared("status.refreshing")}
            retryLabel={shared("actions.retry")}
          />
        </div>
      ) : null}
    </div>
  );
}
