"use client";

import {
  Input,
  InputGroup,
  InputGroupInput,
  Label,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
  ToggleGroup,
  ToggleGroupItem,
} from "@repo/ui/components";
import { BuildingIcon, UserIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { Dispatch } from "react";

import {
  normalizeExpenseAmountInput,
  type ExpenseFormAction,
  type ExpenseFormErrors,
  type ExpenseFormState,
  type QuickExpensePaymentSource,
} from "../_lib/expense-form";
import type { ExpenseFormBootstrap } from "../_lib/expense-options";
import { ExpenseCategorySelect } from "./ExpenseCategorySelect";
import { ExpenseScooterAllocationEditor } from "./ExpenseScooterAllocationEditor";

interface QuickExpenseFormProps {
  bootstrap: ExpenseFormBootstrap;
  disabled: boolean;
  dispatch: Dispatch<ExpenseFormAction>;
  errors: ExpenseFormErrors;
  state: ExpenseFormState;
}

interface CompanyWalletOption {
  id: string;
  name: string;
  source: QuickExpensePaymentSource;
}

/**
 * "Just spent money" entry mode: description, amount, and a personal/
 * business toggle, with category and scooter allocation left optional. No
 * payee, documents, or VAT fields — driven by the same shared
 * `ExpenseFormState`/reducer as the full form, just a leaner set of fields.
 */
export function QuickExpenseForm({
  bootstrap,
  disabled,
  dispatch,
  errors,
  state,
}: QuickExpenseFormProps) {
  const t = useTranslations("finance.expenses.form");
  const locale = useLocale();
  const entity = bootstrap.entities.find(
    (item) => item.id === state.businessEntityId,
  );

  const walletOptions: CompanyWalletOption[] = (entity?.wallets ?? []).map(
    (wallet) => ({
      id: wallet.id,
      name: wallet.name,
      source:
        wallet.type === "COMPANY_CASH" ? "COMPANY_CASH_DESK" : "COMPANY_CARD",
    }),
  );

  function selectBusinessPayment() {
    const first = walletOptions[0];
    dispatch({
      type: "SET_PAYMENT_SOURCE",
      value: first?.source ?? "COMPANY_CASH_DESK",
    });
    dispatch({
      type: "SET_FIELD",
      field: "companyWalletId",
      value: walletOptions.length === 1 ? (first?.id ?? "") : "",
    });
  }

  return (
    <div className="flex flex-col gap-5 p-4 sm:p-6">
      {bootstrap.entities.length > 1 ? (
        <div className="flex flex-col gap-2">
          <Label htmlFor="quick-expense-entity">{t("entity")}</Label>
          <Select
            value={state.businessEntityId}
            disabled={disabled}
            onValueChange={(value) => {
              const next = bootstrap.entities.find((item) => item.id === value);
              if (!next) return;
              dispatch({
                type: "SET_BUSINESS_ENTITY",
                businessEntityId: next.id,
                currency: next.defaultCurrency,
              });
            }}
          >
            <SelectTrigger id="quick-expense-entity" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {bootstrap.entities.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
      ) : null}

      <div className="flex flex-col gap-2">
        <Label htmlFor="quick-expense-description">
          {t("quickExpense.description")}{" "}
          <RequiredLabel>{t("required")}</RequiredLabel>
        </Label>
        <Input
          id="quick-expense-description"
          value={state.notes}
          disabled={disabled}
          autoFocus
          required
          aria-invalid={Boolean(errors.notes)}
          aria-describedby={
            errors.notes ? "quick-expense-description-error" : undefined
          }
          placeholder={t("quickExpense.descriptionPlaceholder")}
          onChange={(event) =>
            dispatch({
              type: "SET_FIELD",
              field: "notes",
              value: event.target.value,
            })
          }
        />
        <FieldError id="quick-expense-description-error" value={errors.notes} />
      </div>

      <div className="flex flex-col gap-2">
        <Label
          htmlFor="quick-expense-amount"
          className="text-base font-semibold"
        >
          {t("grossAmount")} <RequiredLabel>{t("required")}</RequiredLabel>
        </Label>
        <InputGroup className="h-16 md:h-16">
          <InputGroupInput
            id="quick-expense-amount"
            inputMode="decimal"
            autoComplete="off"
            required
            className="h-full text-2xl font-semibold tabular-nums md:h-full md:text-2xl"
            placeholder={t("placeholders.amount")}
            value={state.grossAmount}
            disabled={disabled}
            aria-invalid={Boolean(errors.grossAmount)}
            aria-describedby={
              errors.grossAmount ? "quick-expense-amount-error" : undefined
            }
            onChange={(event) =>
              dispatch({
                type: "SET_FIELD",
                field: "grossAmount",
                value: normalizeExpenseAmountInput(event.target.value, locale),
              })
            }
          />
          <span className="flex h-full shrink-0 items-center px-3 text-sm text-muted-foreground">
            {entity?.defaultCurrency ?? "RON"}
          </span>
        </InputGroup>
        <FieldError
          id="quick-expense-amount-error"
          value={errors.grossAmount}
        />
      </div>

      <div className="flex flex-col gap-2">
        <p id="quick-expense-source-label" className="text-sm font-semibold">
          {t("quickExpense.paidByLabel")}
        </p>
        <ToggleGroup
          aria-labelledby="quick-expense-source-label"
          value={[
            state.paymentSource === "PERSONAL_FUNDS" ? "PERSONAL" : "BUSINESS",
          ]}
          disabled={disabled}
          className="grid w-full grid-cols-2"
          onValueChange={(values) => {
            const next = values[0];
            if (next === "PERSONAL") {
              dispatch({ type: "SET_PAYMENT_SOURCE", value: "PERSONAL_FUNDS" });
            } else if (next === "BUSINESS") {
              selectBusinessPayment();
            }
          }}
        >
          <ToggleGroupItem value="PERSONAL" size="lg">
            <UserIcon aria-hidden="true" data-icon="inline-start" />
            {t("quickExpense.paidPersonally")}
          </ToggleGroupItem>
          <ToggleGroupItem
            value="BUSINESS"
            size="lg"
            disabled={walletOptions.length === 0}
          >
            <BuildingIcon aria-hidden="true" data-icon="inline-start" />
            {t("quickExpense.paidByBusiness")}
          </ToggleGroupItem>
        </ToggleGroup>
        {walletOptions.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            {t("quickExpense.noWallets")}
          </p>
        ) : null}
      </div>

      {state.paymentSource !== "PERSONAL_FUNDS" && walletOptions.length > 1 ? (
        <div className="flex flex-col gap-2">
          <Label htmlFor="quick-expense-wallet">{t("paidFrom")}</Label>
          <Select
            value={state.companyWalletId || null}
            disabled={disabled}
            onValueChange={(value) => {
              const wallet = walletOptions.find((item) => item.id === value);
              if (!wallet) return;
              dispatch({
                type: "SET_FIELD",
                field: "companyWalletId",
                value: wallet.id,
              });
              dispatch({ type: "SET_PAYMENT_SOURCE", value: wallet.source });
            }}
          >
            <SelectTrigger
              id="quick-expense-wallet"
              className="w-full"
              aria-invalid={Boolean(errors.companyWalletId)}
            >
              <SelectValue>
                {state.companyWalletId ? undefined : t("placeholders.wallet")}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {walletOptions.map((wallet) => (
                  <SelectItem key={wallet.id} value={wallet.id}>
                    {wallet.name}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          <FieldError value={errors.companyWalletId} />
        </div>
      ) : null}

      <ExpenseCategorySelect
        id="quick-expense-category"
        label={t("quickExpense.category")}
        categories={bootstrap.categories}
        value={state.categoryId}
        disabled={disabled}
        onChange={(value) =>
          dispatch({ type: "SET_FIELD", field: "categoryId", value })
        }
      />

      <ExpenseScooterAllocationEditor
        id="quick-expense-scooter-allocations"
        currency={entity?.defaultCurrency ?? "RON"}
        grossAmount={state.grossAmount}
        disabled={disabled}
        value={state.scooterAllocations}
        onChange={(value) =>
          dispatch({ type: "SET_SCOOTER_ALLOCATIONS", value })
        }
      />
    </div>
  );
}

function RequiredLabel({ children }: { children: string }) {
  return (
    <>
      <span aria-hidden="true" className="text-foreground">
        *
      </span>
      <span className="sr-only">{children}</span>
    </>
  );
}

function FieldError({ id, value }: { id?: string; value?: string }) {
  return value ? (
    <p id={id} role="alert" className="text-xs text-destructive">
      {value}
    </p>
  ) : null;
}
