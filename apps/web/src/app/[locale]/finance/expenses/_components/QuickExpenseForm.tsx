"use client";

import { ApiError, v1 } from "@repo/api-shared";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
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
import {
  AlertCircleIcon,
  BuildingIcon,
  CheckIcon,
  LoaderCircleIcon,
  UserIcon,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState, type FormEvent } from "react";

import {
  ExpenseCompletionPendingError,
  recordExpense,
} from "../_lib/expense-api";
import {
  buildQuickExpensePayload,
  normalizeExpenseAmountInput,
  type ExpenseScooterAllocationDraft,
  type QuickExpensePaymentSource,
} from "../_lib/expense-form";
import type { ExpenseFormBootstrap } from "../_lib/expense-options";
import { ExpenseCategorySelect } from "./ExpenseCategorySelect";
import { ExpenseScooterAllocationEditor } from "./ExpenseScooterAllocationEditor";

interface QuickExpenseFormProps {
  bootstrap: ExpenseFormBootstrap;
  idempotencyKey: string;
  onRecorded(): void;
}

interface CompanyWalletOption {
  id: string;
  name: string;
  source: QuickExpensePaymentSource;
}

/**
 * "Just spent money" entry point: description, amount, and a personal/
 * business toggle, with category and scooter allocation left optional. No
 * payee, documents, or VAT step — reuses the same create-expense pipeline.
 */
export function QuickExpenseForm({
  bootstrap,
  idempotencyKey,
  onRecorded,
}: QuickExpenseFormProps) {
  const t = useTranslations("finance.expenses.form");
  const locale = useLocale();
  const [entityId, setEntityId] = useState(bootstrap.entities[0]?.id ?? "");
  const entity = bootstrap.entities.find((item) => item.id === entityId);
  const [description, setDescription] = useState("");
  const [grossAmount, setGrossAmount] = useState("");
  const [paymentSource, setPaymentSource] =
    useState<QuickExpensePaymentSource>("PERSONAL_FUNDS");
  const [companyWalletId, setCompanyWalletId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [scooterAllocations, setScooterAllocations] = useState<
    ExpenseScooterAllocationDraft[]
  >([]);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [errors, setErrors] = useState<{
    description?: string;
    amount?: string;
    wallet?: string;
  }>({});

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
    setPaymentSource(first?.source ?? "COMPANY_CASH_DESK");
    setCompanyWalletId(walletOptions.length === 1 ? (first?.id ?? "") : "");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFeedback(null);

    const nextErrors: typeof errors = {};
    if (!description.trim()) {
      nextErrors.description = t("validation.required");
    }
    if (
      !v1.finance.positiveMoneyAmountSchema.safeParse(grossAmount.trim())
        .success
    ) {
      nextErrors.amount = t("validation.invalidAmount");
    }
    if (paymentSource !== "PERSONAL_FUNDS" && !companyWalletId) {
      nextErrors.wallet = t("validation.required");
    }
    setErrors(nextErrors);
    if (Object.values(nextErrors).some(Boolean) || !entity) return;

    const payload = buildQuickExpensePayload({
      idempotencyKey,
      legalEntityId: entity.id,
      currency: entity.defaultCurrency,
      grossAmount,
      occurredOn: bootstrap.today,
      description,
      paymentSource,
      companyWalletId,
      currentUserId: bootstrap.currentUserId,
      categoryId,
      scooterAllocations,
    });
    if (!payload) {
      setFeedback(t("feedback.invalid"));
      return;
    }

    setSubmitting(true);
    try {
      await recordExpense(payload, { fiscal: null, pos: null });
      onRecorded();
    } catch (error) {
      if (error instanceof ExpenseCompletionPendingError) {
        setFeedback(
          t("feedback.completionPending", { expenseId: error.expenseId }),
        );
      } else {
        setFeedback(
          error instanceof ApiError ? error.message : t("feedback.generic"),
        );
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      noValidate
      aria-busy={submitting}
      onSubmit={(event) => void submit(event)}
      className="flex flex-col gap-5 p-4 sm:p-6"
    >
      {feedback ? (
        <Alert variant="destructive">
          <AlertCircleIcon aria-hidden="true" />
          <AlertTitle>{t("feedback.title")}</AlertTitle>
          <AlertDescription>{feedback}</AlertDescription>
        </Alert>
      ) : null}

      {bootstrap.entities.length > 1 ? (
        <div className="flex flex-col gap-2">
          <Label htmlFor="quick-expense-entity">{t("entity")}</Label>
          <Select
            value={entityId}
            disabled={submitting}
            onValueChange={(value) => {
              if (!value) return;
              setEntityId(value);
              setCompanyWalletId("");
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
          value={description}
          disabled={submitting}
          autoFocus
          required
          aria-invalid={Boolean(errors.description)}
          aria-describedby={
            errors.description ? "quick-expense-description-error" : undefined
          }
          placeholder={t("quickExpense.descriptionPlaceholder")}
          onChange={(event) => setDescription(event.target.value)}
        />
        <FieldError
          id="quick-expense-description-error"
          value={errors.description}
        />
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
            value={grossAmount}
            disabled={submitting}
            aria-invalid={Boolean(errors.amount)}
            aria-describedby={
              errors.amount ? "quick-expense-amount-error" : undefined
            }
            onChange={(event) =>
              setGrossAmount(
                normalizeExpenseAmountInput(event.target.value, locale),
              )
            }
          />
          <span className="flex h-full shrink-0 items-center px-3 text-sm text-muted-foreground">
            {entity?.defaultCurrency ?? "RON"}
          </span>
        </InputGroup>
        <FieldError id="quick-expense-amount-error" value={errors.amount} />
      </div>

      <div className="flex flex-col gap-2">
        <p id="quick-expense-source-label" className="text-sm font-semibold">
          {t("quickExpense.paidByLabel")}
        </p>
        <ToggleGroup
          aria-labelledby="quick-expense-source-label"
          value={[paymentSource === "PERSONAL_FUNDS" ? "PERSONAL" : "BUSINESS"]}
          disabled={submitting}
          className="grid w-full grid-cols-2"
          onValueChange={(values) => {
            const next = values[0];
            if (next === "PERSONAL") {
              setPaymentSource("PERSONAL_FUNDS");
              setCompanyWalletId("");
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

      {paymentSource !== "PERSONAL_FUNDS" && walletOptions.length > 1 ? (
        <div className="flex flex-col gap-2">
          <Label htmlFor="quick-expense-wallet">{t("paidFrom")}</Label>
          <Select
            value={companyWalletId || null}
            disabled={submitting}
            onValueChange={(value) => {
              const wallet = walletOptions.find((item) => item.id === value);
              if (wallet) {
                setCompanyWalletId(wallet.id);
                setPaymentSource(wallet.source);
              }
            }}
          >
            <SelectTrigger
              id="quick-expense-wallet"
              className="w-full"
              aria-invalid={Boolean(errors.wallet)}
            >
              <SelectValue>
                {companyWalletId ? undefined : t("placeholders.wallet")}
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
          <FieldError value={errors.wallet} />
        </div>
      ) : null}

      <ExpenseCategorySelect
        id="quick-expense-category"
        label={t("quickExpense.category")}
        categories={bootstrap.categories}
        value={categoryId}
        disabled={submitting}
        onChange={setCategoryId}
      />

      <ExpenseScooterAllocationEditor
        id="quick-expense-scooter-allocations"
        currency={entity?.defaultCurrency ?? "RON"}
        grossAmount={grossAmount}
        disabled={submitting}
        value={scooterAllocations}
        onChange={setScooterAllocations}
      />

      <Button type="submit" disabled={submitting}>
        {submitting ? (
          <LoaderCircleIcon
            aria-hidden="true"
            data-icon="inline-start"
            className="animate-spin"
          />
        ) : null}
        {submitting ? t("recording") : t("record")}
        {submitting ? null : <CheckIcon data-icon="inline-end" />}
      </Button>
    </form>
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
