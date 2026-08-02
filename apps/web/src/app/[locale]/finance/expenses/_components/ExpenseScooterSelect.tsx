"use client";

import type { v1 } from "@repo/api-shared";
import { Label, SearchSelect } from "@repo/ui/components";
import { BikeIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useState } from "react";

import { FinanceSelectorOptionRow } from "../../_components/FinanceSelectorOptionRow";
import { searchExpenseScooters } from "../_lib/expense-api";

export function ExpenseScooterSelect({
  disabled,
  id,
  onChange,
  value,
}: {
  disabled: boolean;
  id: string;
  onChange(id: string, label: string): void;
  value: string;
}) {
  const t = useTranslations("finance.expenses.form");
  const [items, setItems] = useState<v1.scooters.Scooter[]>([]);
  const [selected, setSelected] = useState<v1.scooters.Scooter | undefined>();
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const search = useCallback(
    async (query: string, context: { signal: AbortSignal }) => {
      setLoading(true);
      setFailed(false);
      try {
        const result = await searchExpenseScooters(
          query.replace(/\s+/gu, " ").trim(),
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
  const options = items.map(scooterOption);

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id} id={`${id}-label`}>
        {t("relatedRecord")}
      </Label>
      <SearchSelect
        id={id}
        ariaLabelledBy={`${id}-label`}
        value={value || null}
        selectedOption={selected ? scooterOption(selected) : undefined}
        disabled={disabled}
        clearable
        options={options}
        renderOption={(option) => <FinanceSelectorOptionRow {...option} />}
        serverSearch
        loading={loading}
        errorMessage={failed ? t("search.failed") : null}
        placeholder={t("placeholders.relatedRecord")}
        searchPlaceholder={t("search.scooterPlaceholder")}
        emptyMessage={t("search.noScooters")}
        loadingMessage={t("search.loading")}
        clearLabel={t("search.clear")}
        toggleLabel={t("search.toggle")}
        onSearchQueryChange={search}
        onValueChange={(nextValue) => {
          const next = items.find((item) => item.id === nextValue);
          setSelected(next);
          onChange(nextValue ?? "", next ? scooterLabel(next) : "");
        }}
      />
    </div>
  );
}

function scooterOption(item: v1.scooters.Scooter) {
  return {
    value: item.id,
    label: scooterLabel(item),
    description: item.plateNumber ?? item.vin,
    icon: BikeIcon,
  };
}

function scooterLabel(item: v1.scooters.Scooter): string {
  return `${item.brand} ${item.model}`;
}
