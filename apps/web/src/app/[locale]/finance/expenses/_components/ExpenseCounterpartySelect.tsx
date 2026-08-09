"use client";

import type { v1 } from "@repo/api-shared";
import { Label, SearchSelect } from "@repo/ui/components";
import { Building2Icon, UserIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useState } from "react";

import { FinanceSelectorOptionRow } from "../../_components/FinanceSelectorOptionRow";
import { searchExpenseCounterparties } from "../_lib/expense-api";

interface ExpenseCounterpartySelectProps {
  disabled?: boolean;
  error?: string;
  id: string;
  onChange(id: string, label: string): void;
  value: string;
}

export function ExpenseCounterpartySelect({
  disabled,
  error,
  id,
  onChange,
  value,
}: ExpenseCounterpartySelectProps) {
  const t = useTranslations("finance.expenses.form");
  const [items, setItems] = useState<
    v1.finance.FinancialCounterpartySearchItem[]
  >([]);
  const [selected, setSelected] = useState<
    v1.finance.FinancialCounterpartySearchItem | undefined
  >();
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  const search = useCallback(
    async (query: string, context: { signal: AbortSignal }) => {
      const normalized = query.replace(/\s+/gu, " ").trim();
      setFailed(false);
      if (normalized.length === 1) {
        setItems([]);
        return;
      }

      setLoading(true);
      try {
        const result = await searchExpenseCounterparties(
          normalized,
          context.signal,
        );
        if (!context.signal.aborted) setItems(result.items);
      } catch {
        if (!context.signal.aborted) {
          setItems([]);
          setFailed(true);
        }
      } finally {
        if (!context.signal.aborted) setLoading(false);
      }
    },
    [],
  );

  const options = items.map(counterpartyOption);
  const selectedOption = selected ? counterpartyOption(selected) : undefined;

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id} id={`${id}-label`}>
        {t("payee")}{" "}
        <span aria-hidden="true" className="text-destructive">
          *
        </span>
        <span className="sr-only">{t("required")}</span>
      </Label>
      <SearchSelect
        id={id}
        ariaLabelledBy={`${id}-label`}
        ariaInvalid={Boolean(error)}
        ariaRequired
        ariaDescribedBy={error ? `${id}-error` : undefined}
        value={value || null}
        selectedOption={selectedOption}
        disabled={disabled}
        options={options}
        renderOption={(option) => <FinanceSelectorOptionRow {...option} />}
        serverSearch
        loading={loading}
        errorMessage={failed ? t("search.failed") : null}
        placeholder={t("search.payeePlaceholder")}
        searchPlaceholder={t("search.payeePlaceholder")}
        emptyMessage={t("search.noPayees")}
        loadingMessage={t("search.loading")}
        clearLabel={t("search.clear")}
        toggleLabel={t("search.toggle")}
        onSearchQueryChange={search}
        onValueChange={(nextValue) => {
          const next = items.find((item) => item.id === nextValue);
          setSelected(next);
          onChange(nextValue ?? "", next?.label ?? "");
        }}
      />
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function counterpartyOption(item: v1.finance.FinancialCounterpartySearchItem) {
  return {
    value: item.id,
    label: item.label,
    description: [item.description, item.identifierMasked]
      .filter(Boolean)
      .join(" · "),
    icon: item.kind === "PERSON" ? UserIcon : Building2Icon,
  };
}
