"use client";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  DatePartsField,
  Input,
  InputGroup,
  InputGroupInput,
  InputGroupSelectTrigger,
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
import {
  BuildingIcon,
  CreditCardIcon,
  LandmarkIcon,
  TagsIcon,
  UserIcon,
  WalletCardsIcon,
} from "lucide-react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useMemo, type Dispatch } from "react";

import {
  normalizeExpenseAmountInput,
  type ExpenseFormAction,
  type ExpenseFormErrors,
  type ExpenseFormState,
} from "../_lib/expense-form";
import {
  activeExpenseOwners,
  walletsForExpenseSource,
  type ExpenseFormBootstrap,
} from "../_lib/expense-options";
import { ExpenseCounterpartySelect } from "./ExpenseCounterpartySelect";
import { ExpenseScooterSelect } from "./ExpenseScooterSelect";

interface ExpenseDetailsStepProps {
  bootstrap: ExpenseFormBootstrap;
  categoriesHref: string;
  disabled: boolean;
  dispatch: Dispatch<ExpenseFormAction>;
  errors: ExpenseFormErrors;
  onBusinessEntityChange(businessEntityId: string, currency: string): void;
  onCompanyCuiAnswerChange(
    answer: Exclude<ExpenseFormState["hasCompanyCui"], "">,
  ): void;
  settingsHref: string;
  state: ExpenseFormState;
}

export function ExpenseDetailsStep({
  bootstrap,
  categoriesHref,
  disabled,
  dispatch,
  errors,
  onBusinessEntityChange,
  onCompanyCuiAnswerChange,
  settingsHref,
  state,
}: ExpenseDetailsStepProps) {
  const t = useTranslations("finance.expenses.form");
  const locale = useLocale();
  const entity = bootstrap.entities.find(
    (item) => item.id === state.businessEntityId,
  );
  const wallets = useMemo(
    () => walletsForExpenseSource(entity, state.paymentSource),
    [entity, state.paymentSource],
  );
  const owners = activeExpenseOwners(
    bootstrap.owners,
    state.businessEntityId,
    state.expenseDate,
  );
  const payer = bootstrap.users.find(
    (user) => user.id === bootstrap.currentUserId,
  );

  const setField = (
    field: Exclude<
      keyof ExpenseFormState,
      "hasCompanyCui" | "paymentSource" | "attributionTarget" | "vatLines"
    >,
    value: string,
  ) => dispatch({ type: "SET_FIELD", field, value });

  useEffect(() => {
    if (
      state.hasCompanyCui !== "YES" ||
      state.paymentSource === "PERSONAL_FUNDS"
    ) {
      return;
    }

    if (wallets.some((wallet) => wallet.id === state.companyWalletId)) return;
    const nextWalletId = wallets.length === 1 ? wallets[0]!.id : "";
    if (state.companyWalletId === nextWalletId) return;
    dispatch({
      type: "SET_FIELD",
      field: "companyWalletId",
      value: nextWalletId,
    });
  }, [
    dispatch,
    state.businessEntityId,
    state.companyWalletId,
    state.hasCompanyCui,
    state.paymentSource,
    wallets,
  ]);

  return (
    <div className="flex flex-col">
      <section className="flex flex-col gap-5 p-4 sm:p-6">
        {bootstrap.entities.length > 1 ? (
          <SelectField
            id="expense-entity"
            label={t("entity")}
            value={state.businessEntityId}
            items={bootstrap.entities.map((item) => ({
              value: item.id,
              label: item.label,
            }))}
            disabled={disabled}
            error={errors.businessEntityId}
            placeholder={t("placeholders.entity")}
            onChange={(value) => {
              const next = bootstrap.entities.find((item) => item.id === value);
              onBusinessEntityChange(value, next?.defaultCurrency ?? "RON");
            }}
          />
        ) : null}

        <div className="flex flex-col gap-2">
          <Label htmlFor="expense-amount" className="text-base font-semibold">
            {t("grossAmount")} <RequiredLabel>{t("required")}</RequiredLabel>
          </Label>
          <InputGroup className="h-16 md:h-16">
            <InputGroupInput
              id="expense-amount"
              autoFocus
              inputMode="decimal"
              autoComplete="off"
              required
              className="h-full text-2xl font-semibold tabular-nums md:h-full md:text-2xl"
              placeholder={t("placeholders.amount")}
              value={state.grossAmount}
              disabled={disabled}
              aria-invalid={Boolean(errors.grossAmount)}
              aria-describedby={
                errors.grossAmount || errors.currency
                  ? "expense-amount-error"
                  : undefined
              }
              onChange={(event) =>
                setField(
                  "grossAmount",
                  normalizeExpenseAmountInput(event.target.value, locale),
                )
              }
            />
            <Select
              value={state.currency}
              disabled={disabled}
              onValueChange={(value) => value && setField("currency", value)}
            >
              <InputGroupSelectTrigger aria-label={t("currency")}>
                <SelectValue />
              </InputGroupSelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {["RON", "EUR", "USD"].map((currency) => (
                    <SelectItem key={currency} value={currency}>
                      {currency}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </InputGroup>
          <FieldError
            id="expense-amount-error"
            value={errors.grossAmount ?? errors.currency}
          />
        </div>

        <div className="flex flex-col gap-2">
          <p id="expense-company-cui-label" className="text-base font-semibold">
            {t("companyCuiQuestion")}{" "}
            <RequiredLabel>{t("required")}</RequiredLabel>
          </p>
          <ToggleGroup
            aria-labelledby="expense-company-cui-label"
            aria-describedby={
              errors.hasCompanyCui ? "expense-company-cui-error" : undefined
            }
            value={state.hasCompanyCui ? [state.hasCompanyCui] : []}
            aria-required="true"
            disabled={disabled}
            className="grid w-full grid-cols-2"
            onValueChange={(values) => {
              const answer = values[0];
              if (answer !== "YES" && answer !== "NO") return;
              onCompanyCuiAnswerChange(answer);
            }}
          >
            <ToggleGroupItem
              value="YES"
              size="lg"
              aria-invalid={Boolean(errors.hasCompanyCui)}
            >
              {t("binary.yes")}
            </ToggleGroupItem>
            <ToggleGroupItem
              value="NO"
              size="lg"
              aria-invalid={Boolean(errors.hasCompanyCui)}
            >
              {t("binary.no")}
            </ToggleGroupItem>
          </ToggleGroup>
          <FieldError
            id="expense-company-cui-error"
            value={errors.hasCompanyCui}
          />
        </div>
      </section>

      {state.hasCompanyCui ? (
        <section className="animate-in fade-in-0 slide-in-from-bottom-2 flex flex-col gap-5 border-t border-border p-4 duration-fast ease-standard motion-reduce:animate-none sm:p-6">
          {state.hasCompanyCui === "YES" ? (
            <>
              <BinaryChoice
                label={t("paymentMethod")}
                value={state.paymentSource}
                error={errors.paymentCombination}
                disabled={disabled}
                options={[
                  {
                    value: "COMPANY_CASH_DESK",
                    label: t("paymentMethods.cash"),
                    icon: LandmarkIcon,
                  },
                  {
                    value: "COMPANY_CARD",
                    label: t("paymentMethods.companyCard"),
                    icon: CreditCardIcon,
                  },
                ]}
                onChange={(value) =>
                  dispatch({ type: "SET_PAYMENT_SOURCE", value })
                }
              />

              <BinaryChoice
                label={t("beneficiary")}
                value={state.attributionTarget}
                disabled={disabled}
                options={[
                  {
                    value: "BUSINESS",
                    label: t("attribution.BUSINESS"),
                    icon: BuildingIcon,
                  },
                  {
                    value: "OWNER",
                    label: t("attribution.OWNER"),
                    icon: UserIcon,
                    disabled: owners.length === 0,
                  },
                ]}
                onChange={(value) =>
                  dispatch({ type: "SET_ATTRIBUTION_TARGET", value })
                }
              />
              {owners.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  {t("attribution.noOwners")}
                </p>
              ) : null}
            </>
          ) : (
            <Alert>
              <WalletCardsIcon aria-hidden="true" />
              <AlertTitle>{t("personalFunds.title")}</AlertTitle>
              <AlertDescription>
                {t("personalFunds.description", {
                  name: payer?.label ?? t("personalFunds.currentUser"),
                })}
              </AlertDescription>
            </Alert>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              id="expense-date"
              label={t("expenseDate")}
              date
              value={state.expenseDate}
              disabled={disabled}
              error={errors.expenseDate}
              required
              requiredLabel={t("required")}
              onChange={(value) => {
                setField("expenseDate", value);
                if (
                  state.attributionTarget === "OWNER" &&
                  !activeExpenseOwners(
                    bootstrap.owners,
                    state.businessEntityId,
                    value,
                  ).some((owner) => owner.id === state.businessOwnerId)
                ) {
                  setField("businessOwnerId", "");
                }
              }}
            />
            <div className="flex min-w-0 flex-col gap-3">
              <SelectField
                id="expense-category"
                label={t("category")}
                value={state.categoryId}
                items={bootstrap.categories.map((item) => ({
                  value: item.id,
                  label: item.label,
                }))}
                disabled={disabled}
                error={errors.categoryId}
                placeholder={t("placeholders.category")}
                required
                requiredLabel={t("required")}
                onChange={(value) => setField("categoryId", value)}
              />
              {bootstrap.categories.length === 0 ? (
                <Alert variant="destructive">
                  <TagsIcon aria-hidden="true" />
                  <AlertTitle>{t("emptyCategories.title")}</AlertTitle>
                  <AlertDescription className="flex flex-col items-start gap-3">
                    <span>{t("emptyCategories.description")}</span>
                    <Button
                      size="sm"
                      variant="outline"
                      nativeButton={false}
                      render={<Link href={categoriesHref} />}
                    >
                      {t("emptyCategories.action")}
                    </Button>
                  </AlertDescription>
                </Alert>
              ) : null}
            </div>
          </div>

          {state.hasCompanyCui === "YES" ? (
            wallets.length > 1 ? (
              <SelectField
                id="expense-wallet"
                label={
                  state.paymentSource === "COMPANY_CASH_DESK"
                    ? t("cashDesk")
                    : t("companyCard")
                }
                value={state.companyWalletId}
                items={wallets.map((wallet) => ({
                  value: wallet.id,
                  label: wallet.name,
                }))}
                disabled={disabled}
                error={errors.companyWalletId}
                placeholder={t("placeholders.wallet")}
                required
                requiredLabel={t("required")}
                onChange={(value) => setField("companyWalletId", value)}
              />
            ) : wallets.length === 1 ? (
              <div className="flex min-w-0 items-center gap-3 rounded-lg bg-muted p-3 text-sm">
                <WalletCardsIcon
                  aria-hidden="true"
                  className="size-4 text-muted-foreground"
                />
                <span className="min-w-0 text-muted-foreground">
                  {t("walletSelected")}{" "}
                  <RequiredLabel>{t("required")}</RequiredLabel>
                </span>
                <span className="ml-auto min-w-0 truncate font-medium">
                  {wallets[0]!.name}
                </span>
              </div>
            ) : (
              <Alert variant="destructive">
                <WalletCardsIcon aria-hidden="true" />
                <AlertTitle>{t("emptyWallet.title")}</AlertTitle>
                <AlertDescription className="flex flex-col items-start gap-3">
                  <span>{t("emptyWallet.description")}</span>
                  <Button
                    size="sm"
                    variant="outline"
                    nativeButton={false}
                    render={<Link href={settingsHref} />}
                  >
                    {t("emptyWallet.action")}
                  </Button>
                </AlertDescription>
              </Alert>
            )
          ) : null}

          <ExpenseCounterpartySelect
            id="expense-payee"
            value={state.payeeCounterpartyId}
            disabled={disabled}
            error={errors.payeeCounterpartyId}
            onChange={(id) => setField("payeeCounterpartyId", id)}
          />

          {state.attributionTarget === "OWNER" ? (
            <SelectField
              id="expense-owner"
              label={t("specificOwner")}
              value={state.businessOwnerId}
              items={owners.map((owner) => ({
                value: owner.id,
                label: owner.label,
              }))}
              disabled={disabled}
              error={errors.businessOwnerId}
              placeholder={t("placeholders.owner")}
              required
              requiredLabel={t("required")}
              onChange={(value) => setField("businessOwnerId", value)}
            />
          ) : null}

          <ExpenseScooterSelect
            id="expense-related-record"
            value={state.relatedRecordId}
            disabled={disabled}
            onChange={(id) => {
              setField("relatedRecordId", id);
              setField("relatedRecordType", id ? "SCOOTER" : "");
            }}
          />

          {state.hasCompanyCui === "YES" ? (
            <Accordion>
              <AccordionItem
                value="more-details"
                className="rounded-lg border border-border px-3"
              >
                <AccordionTrigger>{t("moreDetails")}</AccordionTrigger>
                <AccordionContent className="flex flex-col gap-3">
                  <SelectField
                    id="expense-paid-by"
                    label={t("paidBy")}
                    value={state.paidByUserId}
                    items={bootstrap.users.map((user) => ({
                      value: user.id,
                      label:
                        user.id === bootstrap.currentUserId
                          ? t("currentUser", { name: user.label })
                          : user.label,
                    }))}
                    disabled={disabled}
                    error={errors.paidByUserId}
                    placeholder={t("placeholders.paidBy")}
                    onChange={(value) => setField("paidByUserId", value)}
                  />
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

function BinaryChoice<Value extends string>({
  disabled,
  error,
  label,
  onChange,
  options,
  value,
}: {
  disabled: boolean;
  error?: string;
  label: string;
  onChange(value: Value): void;
  options: Array<{
    description?: string;
    disabled?: boolean;
    icon: typeof BuildingIcon;
    label: string;
    value: Value;
  }>;
  value: Value;
}) {
  const errorId = `expense-${options.map((option) => option.value).join("-")}-error`;

  return (
    <div className="flex flex-col gap-2">
      <p id={`${errorId}-label`} className="text-sm font-semibold">
        {label}
      </p>
      <ToggleGroup
        aria-labelledby={`${errorId}-label`}
        aria-describedby={error ? errorId : undefined}
        value={[value]}
        disabled={disabled}
        className="grid w-full grid-cols-2"
        onValueChange={(values) => {
          const next = values[0];
          if (next) onChange(next);
        }}
      >
        {options.map((option) => {
          const Icon = option.icon;
          const descriptionId = `${errorId}-${option.value}-description`;
          return (
            <ToggleGroupItem
              key={option.value}
              value={option.value}
              disabled={option.disabled}
              aria-invalid={Boolean(error)}
              aria-label={option.label}
              aria-describedby={option.description ? descriptionId : undefined}
              className="group h-auto min-w-0 items-start py-3 whitespace-normal"
            >
              <Icon aria-hidden="true" className="mt-0.5 shrink-0" />
              <span className="flex min-w-0 flex-col text-start leading-tight">
                <span>{option.label}</span>
                {option.description ? (
                  <span
                    id={descriptionId}
                    className="text-xs font-normal text-muted-foreground group-data-pressed:text-primary-foreground"
                  >
                    {option.description}
                  </span>
                ) : null}
              </span>
            </ToggleGroupItem>
          );
        })}
      </ToggleGroup>
      <FieldError id={errorId} value={error} />
    </div>
  );
}

function TextField({
  date = false,
  disabled,
  error,
  id,
  label,
  onChange,
  placeholder,
  required = false,
  requiredLabel,
  value,
}: {
  date?: boolean;
  disabled: boolean;
  error?: string;
  id: string;
  label: string;
  onChange(value: string): void;
  placeholder?: string;
  required?: boolean;
  requiredLabel?: string;
  value: string;
}) {
  const locale = useLocale();

  if (date) {
    return (
      <div
        className="flex flex-col gap-2"
        role="group"
        aria-labelledby={`${id}-label`}
      >
        <Label id={`${id}-label`} htmlFor={`${id}-day`}>
          {label}{" "}
          {required && requiredLabel ? (
            <RequiredLabel>{requiredLabel}</RequiredLabel>
          ) : null}
        </Label>
        <DatePartsField
          baseId={id}
          aria-describedby={error ? `${id}-error` : undefined}
          disabled={disabled}
          invalid={Boolean(error)}
          label={label}
          locale={locale}
          name={id}
          required={required}
          value={value}
          onChange={onChange}
        />
        <FieldError id={`${id}-error`} value={error} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>
        {label}{" "}
        {required && requiredLabel ? (
          <RequiredLabel>{requiredLabel}</RequiredLabel>
        ) : null}
      </Label>
      <Input
        id={id}
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        required={required}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
        onChange={(event) => onChange(event.target.value)}
      />
      <FieldError id={`${id}-error`} value={error} />
    </div>
  );
}

function SelectField({
  disabled,
  error,
  id,
  items,
  label,
  onChange,
  placeholder,
  required = false,
  requiredLabel,
  value,
}: {
  disabled: boolean;
  error?: string;
  id: string;
  items: Array<{ label: string; value: string }>;
  label: string;
  onChange(value: string): void;
  placeholder: string;
  required?: boolean;
  requiredLabel?: string;
  value: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>
        {label}{" "}
        {required && requiredLabel ? (
          <RequiredLabel>{requiredLabel}</RequiredLabel>
        ) : null}
      </Label>
      <Select
        value={value || null}
        disabled={disabled || items.length === 0}
        onValueChange={(next) => next && onChange(next)}
      >
        <SelectTrigger
          id={id}
          className="w-full"
          aria-invalid={Boolean(error)}
          aria-required={required}
          aria-describedby={error ? `${id}-error` : undefined}
        >
          <SelectValue>{value ? undefined : placeholder}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {items.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
      <FieldError id={`${id}-error`} value={error} />
    </div>
  );
}

function RequiredLabel({ children }: { children: string }) {
  return (
    <>
      <span aria-hidden="true" className="text-destructive">
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
