"use client";

import type { v1 } from "@repo/api-shared";
import { Label, SearchSelect } from "@repo/ui/components";
import { UserIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useState } from "react";

import { searchScooterBuyers } from "../_lib/scooter-sale-api";

interface ScooterBuyerSelectProps {
  disabled?: boolean;
  error?: string;
  id: string;
  onChange(id: string, label: string): void;
  value: string;
}

export function ScooterBuyerSelect({
  disabled,
  error,
  id,
  onChange,
  value,
}: ScooterBuyerSelectProps) {
  const t = useTranslations("scooters.sales");
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
        const result = await searchScooterBuyers(normalized, context.signal);
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

  const options = items.map(buyerOption);
  const selectedOption = selected ? buyerOption(selected) : undefined;

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id} id={`${id}-label`}>
        {t("fields.buyer")}{" "}
        <span aria-hidden="true" className="text-destructive">
          *
        </span>
        <span className="sr-only">
          {t("validation.required", { field: t("fields.buyer") })}
        </span>
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
        renderOption={(option) => (
          <span className="flex min-w-0 flex-1 items-center gap-2">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
              <UserIcon aria-hidden="true" />
            </span>
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="truncate text-sm font-medium">
                {option.label}
              </span>
              {option.description ? (
                <span className="truncate text-xs text-muted-foreground">
                  {option.description}
                </span>
              ) : null}
            </span>
          </span>
        )}
        serverSearch
        loading={loading}
        errorMessage={failed ? t("search.failed") : null}
        placeholder={t("search.buyerPlaceholder")}
        searchPlaceholder={t("search.buyerPlaceholder")}
        emptyMessage={t("search.noBuyers")}
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

function buyerOption(item: v1.finance.FinancialCounterpartySearchItem) {
  return {
    value: item.id,
    label: item.label,
    description: item.description,
  };
}
