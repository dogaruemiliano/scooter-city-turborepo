"use client";

import type { v1 } from "@repo/api-shared";
import {
  Button,
  Input,
  Label,
  SearchSelect,
  ToggleGroup,
  ToggleGroupItem,
} from "@repo/ui/components";
import { BikeIcon, TrashIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useState } from "react";

import { FinanceSelectorOptionRow } from "../../_components/FinanceSelectorOptionRow";
import {
  minorToMoney,
  scooterAllocationTotalMinor,
  splitScooterAllocationsEvenly,
  type ExpenseScooterAllocationDraft,
} from "../_lib/expense-form";
import { searchExpenseScooters } from "../_lib/expense-api";

type AllocationMode = "EVEN" | "CUSTOM";

interface ExpenseScooterAllocationEditorProps {
  currency: string;
  disabled: boolean;
  grossAmount: string;
  id: string;
  onChange(next: ExpenseScooterAllocationDraft[]): void;
  value: ExpenseScooterAllocationDraft[];
}

export function ExpenseScooterAllocationEditor({
  currency,
  disabled,
  grossAmount,
  id,
  onChange,
  value,
}: ExpenseScooterAllocationEditorProps) {
  const t = useTranslations("finance.expenses.form");
  const [mode, setMode] = useState<AllocationMode>("EVEN");
  const [items, setItems] = useState<v1.scooters.Scooter[]>([]);
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

  const options = items
    .filter((item) => !value.some((row) => row.scooterId === item.id))
    .map(scooterOption);

  function applyMode(
    rows: ExpenseScooterAllocationDraft[],
    nextMode: AllocationMode,
  ) {
    onChange(
      nextMode === "EVEN"
        ? splitScooterAllocationsEvenly(rows, grossAmount)
        : rows,
    );
  }

  function addScooter(scooterId: string, label: string) {
    if (!scooterId || value.some((row) => row.scooterId === scooterId)) return;
    applyMode([...value, { scooterId, label, amount: "0.00" }], mode);
  }

  function removeScooter(scooterId: string) {
    applyMode(
      value.filter((row) => row.scooterId !== scooterId),
      mode,
    );
  }

  function changeMode(nextMode: AllocationMode) {
    setMode(nextMode);
    applyMode(value, nextMode);
  }

  function changeAmount(scooterId: string, amount: string) {
    onChange(
      value.map((row) =>
        row.scooterId === scooterId ? { ...row, amount } : row,
      ),
    );
  }

  const totalLabel = minorToMoney(scooterAllocationTotalMinor(value));

  return (
    <div className="flex flex-col gap-3">
      <Label htmlFor={id} id={`${id}-label`}>
        {t("scooterAllocation.label")}
      </Label>
      <SearchSelect
        id={id}
        ariaLabelledBy={`${id}-label`}
        value={null}
        disabled={disabled}
        clearable={false}
        options={options}
        renderOption={(option) => <FinanceSelectorOptionRow {...option} />}
        serverSearch
        loading={loading}
        errorMessage={failed ? t("search.failed") : null}
        placeholder={t("scooterAllocation.addPlaceholder")}
        searchPlaceholder={t("search.scooterPlaceholder")}
        emptyMessage={t("search.noScooters")}
        loadingMessage={t("search.loading")}
        toggleLabel={t("search.toggle")}
        onSearchQueryChange={search}
        onValueChange={(nextValue) => {
          if (!nextValue) return;
          const next = items.find((item) => item.id === nextValue);
          if (next) addScooter(next.id, scooterLabel(next));
        }}
      />

      {value.length > 0 ? (
        <>
          <ToggleGroup
            value={[mode]}
            disabled={disabled}
            className="grid w-full grid-cols-2"
            onValueChange={(values) => {
              const next = values[0];
              if (next === "EVEN" || next === "CUSTOM") changeMode(next);
            }}
          >
            <ToggleGroupItem value="EVEN">
              {t("scooterAllocation.splitEvenly")}
            </ToggleGroupItem>
            <ToggleGroupItem value="CUSTOM">
              {t("scooterAllocation.customAmounts")}
            </ToggleGroupItem>
          </ToggleGroup>

          <ul className="flex flex-col gap-2">
            {value.map((row) => (
              <li
                key={row.scooterId}
                className="flex items-center gap-2 rounded-lg border border-border p-2"
              >
                <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                  <BikeIcon aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-medium">
                  {row.label}
                </span>
                <Input
                  inputMode="decimal"
                  autoComplete="off"
                  className="w-28 shrink-0 text-right tabular-nums"
                  value={row.amount}
                  disabled={disabled || mode === "EVEN"}
                  aria-label={t("scooterAllocation.amountFor", {
                    scooter: row.label,
                  })}
                  onChange={(event) =>
                    changeAmount(row.scooterId, event.target.value)
                  }
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  disabled={disabled}
                  aria-label={t("scooterAllocation.remove", {
                    scooter: row.label,
                  })}
                  onClick={() => removeScooter(row.scooterId)}
                >
                  <TrashIcon aria-hidden="true" />
                </Button>
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">
            {t("scooterAllocation.total", {
              amount: totalLabel,
              currency,
            })}
          </p>
        </>
      ) : null}
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
