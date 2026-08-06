"use client";

import { ApiError, v1 } from "@repo/api-shared";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Checkbox,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  InputGroup,
  InputGroupInput,
  InputGroupSelectTrigger,
  Label,
  SearchSelect,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
  buttonVariants,
} from "@repo/ui/components";
import { cn } from "@repo/ui/lib/utils";
import {
  ArrowDownIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  Building2Icon,
  UserIcon,
  WalletCardsIcon,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCallback, useId, useMemo, useState, type FormEvent } from "react";

import { PageTitleOverride } from "@/components/PageTitleOverride";
import { financeUserLabel } from "@/lib/finance-format";
import { FinanceSelectorOptionRow } from "../../_components/FinanceSelectorOptionRow";
import { webApi } from "@/lib/api";
import {
  buildTransactionInput,
  createTransactionFormState,
  preferredTransactionWalletId,
  walletFieldRecipe,
  walletMatchesRole,
  type TransactionFormErrors,
  type TransactionFormState,
  type TransactionPrefill,
} from "../_lib/transaction-recipes";

interface TransactionCreateFormProps {
  adminWalletIds: string[];
  categories: v1.finance.FinancialCategory[];
  idempotencyKey: string;
  prefill: TransactionPrefill;
  transactionsHref: string;
  wallets: v1.finance.WalletOption[];
}

const PAYMENT_METHOD_TYPES = new Set<v1.finance.CreatableMoneyTransactionType>([
  "INCOME",
  "EXPENSE",
  "USER_PAYMENT",
  "GUARANTEE_RECEIVED",
  "GUARANTEE_REFUNDED",
  "REIMBURSEMENT",
  "PERSONAL_EXTRACTION",
  "COMPANY_DISTRIBUTION",
  "CAPITAL_CONTRIBUTION",
  "REFUND",
]);

const CATEGORY_TYPES = new Set<v1.finance.CreatableMoneyTransactionType>([
  "INCOME",
  "EXPENSE",
  "USER_CHARGE",
]);

const TRANSACTION_CURRENCIES = ["RON", "EUR", "USD"] as const;

export function TransactionCreateForm({
  adminWalletIds,
  categories,
  idempotencyKey,
  prefill,
  transactionsHref,
  wallets,
}: TransactionCreateFormProps) {
  const t = useTranslations("finance");
  const router = useRouter();
  const formId = useId();
  const [form, setForm] = useState<TransactionFormState>(() => {
    const initial = createTransactionFormState(wallets, {
      ...prefill,
      type: prefill.type === "EXPENSE" ? "EXPENSE" : "INCOME",
    });
    const primaryWalletId =
      initial.primaryWalletId ||
      preferredTransactionWalletId(initial, wallets, new Set(adminWalletIds));
    const primaryWallet = wallets.find(
      (wallet) => wallet.id === primaryWalletId,
    );
    return {
      ...initial,
      primaryWalletId,
      financialScope:
        primaryWallet?.type === "USER" ? "ADMIN_PERSONAL" : "COMPANY",
    };
  });
  const [errors, setErrors] = useState<TransactionFormErrors>({});
  const [feedback, setFeedback] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [unidentifiedRecipientInput, setUnidentifiedRecipientInput] =
    useState<v1.finance.CreateMoneyTransactionInput | null>(null);
  const adminWalletIdSet = useMemo(
    () => new Set(adminWalletIds),
    [adminWalletIds],
  );
  const recipe = walletFieldRecipe(form);
  const primaryWallets = wallets.filter((wallet) =>
    walletMatchesRole(wallet, recipe.primaryRole, adminWalletIdSet),
  );
  const secondaryWallets = recipe.secondaryRole
    ? wallets.filter((wallet) =>
        walletMatchesRole(wallet, recipe.secondaryRole!, adminWalletIdSet),
      )
    : [];
  const useSecondaryWalletSelector =
    form.type === "COMPANY_DISTRIBUTION" ||
    form.type === "CAPITAL_CONTRIBUTION";
  const showRepaysOwedBalance = form.type === "COMPANY_DISTRIBUTION";
  const visibleCategories = categories.filter((category) => {
    if (!category.isActive) return false;
    if (form.type === "EXPENSE") return category.kind !== "INCOME";
    return category.kind !== "EXPENSE";
  });
  const showPaymentMethod =
    PAYMENT_METHOD_TYPES.has(form.type) &&
    !(form.type === "INCOME" && form.financialScope === "ADMIN_PERSONAL");
  const showBillingStatus =
    form.type === "EXPENSE" ||
    (form.type === "INCOME" && form.financialScope === "COMPANY");
  const showCategory = CATEGORY_TYPES.has(form.type);
  const walletTypeLabels: Record<v1.finance.WalletType, string> = {
    USER: t("enums.walletTypes.USER"),
    COMPANY_CASH: t("enums.walletTypes.COMPANY_CASH"),
    COMPANY_BANK: t("enums.walletTypes.COMPANY_BANK"),
    PAYMENT_PROCESSOR: t("enums.walletTypes.PAYMENT_PROCESSOR"),
  };

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrors({});
    setFeedback(null);

    const candidate = buildTransactionInput(form, {
      idempotencyKey,
      wallets,
      requiredMessage: (field) =>
        t("transactionForm.validation.required", {
          field:
            field === "amount"
              ? t("transactionForm.fields.amount")
              : field === "category"
                ? t("transactionForm.fields.category")
                : field === "counterparty"
                  ? t("transactionForm.fields.payer")
                  : field === "description"
                    ? t("transactionForm.fields.description")
                    : field === "occurredAt"
                      ? t("transactionForm.fields.occurredAt")
                      : t("transactionForm.fields.wallet"),
        }),
      differentWalletsMessage: t("transactionForm.validation.differentWallets"),
      differentPeopleMessage: t("transactionForm.validation.differentPeople"),
      referencePairMessage: t("transactionForm.validation.referencePair"),
    });

    if (!candidate.input) {
      setErrors(candidate.errors);
      setFeedback(t("transactionForm.feedback.errorTitle"));
      return;
    }

    if (form.type === "EXPENSE" && !form.counterpartyId) {
      setUnidentifiedRecipientInput(candidate.input);
      return;
    }

    await createTransaction(candidate.input);
  }

  async function createTransaction(
    input: v1.finance.CreateMoneyTransactionInput,
  ) {
    setCreating(true);
    try {
      const transaction = await webApi.fetch(
        v1.finance.ROUTES.transactions.create,
        v1.finance.moneyTransactionSchema,
        {
          method: "POST",
          json: input,
        },
      );
      router.push(`${transactionsHref}/${encodeURIComponent(transaction.id)}`);
      router.refresh();
    } catch (error) {
      setFeedback(
        error instanceof ApiError
          ? error.message
          : t("transactionForm.feedback.genericError"),
      );
    } finally {
      setCreating(false);
    }
  }

  async function confirmUnidentifiedRecipient() {
    if (!unidentifiedRecipientInput) return;
    const input = unidentifiedRecipientInput;
    setUnidentifiedRecipientInput(null);
    await createTransaction(input);
  }

  function setValue<Key extends keyof TransactionFormState>(
    key: Key,
    value: TransactionFormState[Key],
  ) {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => clearErrorsForKey(current, key));
  }

  function selectFlowWallet(walletId: string) {
    const wallet = wallets.find((candidate) => candidate.id === walletId);
    setForm((current) => ({
      ...current,
      primaryWalletId: walletId,
      financialScope: wallet?.type === "USER" ? "ADMIN_PERSONAL" : "COMPANY",
    }));
    setErrors((current) => ({ ...current, primaryWalletId: undefined }));
  }

  function swapDirection() {
    setForm((current) => ({
      ...current,
      type: current.type === "INCOME" ? "EXPENSE" : "INCOME",
      billingStatus:
        current.type === "INCOME" ? "NOT_APPLICABLE" : current.billingStatus,
      categoryId: "",
    }));
    setErrors({});
    setFeedback(null);
  }

  function changePaymentMethod(value: v1.finance.PaymentMethod) {
    setForm((current) => {
      const next = { ...current, paymentMethod: value };
      const preferredWalletId = preferredTransactionWalletId(
        next,
        wallets,
        adminWalletIdSet,
      );
      return {
        ...next,
        primaryWalletId: preferredWalletId || current.primaryWalletId,
      };
    });
    setErrors((current) => ({
      ...current,
      paymentMethod: undefined,
      primaryWalletId: undefined,
    }));
  }

  return (
    <div className="mx-auto flex w-full max-w-screen-xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6 sm:py-10">
      <PageTitleOverride title={t("transactionForm.title")} />
      <Link
        href={transactionsHref}
        className={cn(
          buttonVariants({ variant: "ghost" }),
          "hidden w-fit text-muted-foreground md:inline-flex",
        )}
      >
        <ArrowLeftIcon data-icon="inline-start" />
        {t("transactionForm.back")}
      </Link>
      <form
        className="grid gap-6"
        noValidate
        onSubmit={(event) => void submit(event)}
      >
        <div className="mx-auto grid w-full max-w-screen-md gap-8">
          <div className="relative grid gap-3">
            <FlowRow
              sign={form.type === "INCOME" ? "+" : "−"}
              amountId={`${formId}-source-amount`}
              amount={form.amount}
              amountLabel={t("transactionForm.fields.sourceAmount")}
              currency={form.currency}
              currencyId={`${formId}-source-currency`}
              currencyLabel={t("transactionForm.fields.currency")}
              disabled={creating}
              error={errors.amount}
              autoFocus
              onAmountChange={(value) => setValue("amount", value)}
              onCurrencyChange={(value) => setValue("currency", value)}
            >
              <FlowWalletSelect
                id={`${formId}-wallet`}
                label={t("transactionForm.fields.wallet")}
                value={form.primaryWalletId}
                wallets={primaryWallets}
                disabled={creating}
                error={errors.primaryWalletId}
                walletTypeLabels={walletTypeLabels}
                t={t}
                onChange={selectFlowWallet}
              />
            </FlowRow>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="absolute left-1/2 top-1/2 z-10 size-12 -translate-x-1/2 -translate-y-1/2 rounded-full bg-background shadow-md"
              disabled={creating}
              aria-label={t("transactionForm.swapDirection")}
              onClick={swapDirection}
            >
              <ArrowDownIcon
                className={cn(
                  "transition-transform duration-normal ease-standard",
                  form.type === "INCOME" && "rotate-180",
                )}
              />
            </Button>
            <FlowRow
              sign={form.type === "INCOME" ? "−" : "+"}
              amountId={`${formId}-destination-amount`}
              amount={form.amount}
              amountLabel={t("transactionForm.fields.destinationAmount")}
              currency={form.currency}
              currencyId={`${formId}-destination-currency`}
              currencyLabel={t("transactionForm.fields.currency")}
              disabled={creating}
              error={errors.amount}
              onAmountChange={(value) => setValue("amount", value)}
              onCurrencyChange={(value) => setValue("currency", value)}
            >
              {useSecondaryWalletSelector ? (
                <FlowWalletSelect
                  id={`${formId}-secondary-wallet`}
                  label={t(
                    `transactionForm.fields.${recipe.secondaryLabel ?? "wallet"}`,
                  )}
                  value={form.secondaryWalletId}
                  wallets={secondaryWallets}
                  disabled={creating}
                  error={errors.secondaryWalletId}
                  walletTypeLabels={walletTypeLabels}
                  t={t}
                  onChange={(value) => setValue("secondaryWalletId", value)}
                />
              ) : (
                <FlowCounterpartySelect
                  key={`counterparty-${form.type}`}
                  id={`${formId}-counterparty`}
                  label={t(
                    form.type === "INCOME"
                      ? "transactionForm.fields.payer"
                      : "transactionForm.fields.recipient",
                  )}
                  transactionType={
                    form.type === "EXPENSE" ? "EXPENSE" : "INCOME"
                  }
                  value={form.counterpartyId}
                  disabled={creating}
                  error={errors.counterpartyId}
                  required={form.type === "INCOME"}
                  t={t}
                  onChange={(value) => setValue("counterpartyId", value)}
                />
              )}
            </FlowRow>
          </div>

          <div className="grid gap-4 border-t border-border pt-8 md:grid-cols-2">
            <div className="contents">
              {showPaymentMethod ? (
                <SelectField
                  id={`${formId}-payment-method`}
                  label={t("transactionForm.fields.paymentMethod")}
                  value={form.paymentMethod}
                  disabled={creating}
                  error={errors.paymentMethod}
                  items={v1.finance.PAYMENT_METHODS.map((method) => ({
                    value: method,
                    label: t(`enums.paymentMethods.${method}`),
                  }))}
                  onChange={(value) =>
                    changePaymentMethod(value as v1.finance.PaymentMethod)
                  }
                />
              ) : null}
              {showBillingStatus ? (
                <SelectField
                  id={`${formId}-billing-status`}
                  label={t("transactionForm.fields.billingStatus")}
                  value={form.billingStatus}
                  disabled={creating}
                  error={errors.billingStatus}
                  items={v1.finance.BILLING_STATUSES.map((status) => ({
                    value: status,
                    label: t(`enums.billingStatuses.${status}`),
                  }))}
                  onChange={(value) =>
                    setValue("billingStatus", value as v1.finance.BillingStatus)
                  }
                />
              ) : null}
              {showCategory ? (
                <SearchSelectField
                  id={`${formId}-category`}
                  label={t("transactionForm.fields.category")}
                  value={form.categoryId || null}
                  required={form.type === "EXPENSE"}
                  disabled={creating}
                  error={errors.categoryId}
                  options={visibleCategories.map((category) => ({
                    value: category.id,
                    label: category.name,
                  }))}
                  placeholder={t(
                    form.type === "EXPENSE"
                      ? "transactionForm.placeholders.select"
                      : "transactionForm.placeholders.optional",
                  )}
                  searchPlaceholder={t(
                    "transactionForm.placeholders.searchCategories",
                  )}
                  emptyMessage={t("transactionForm.placeholders.noCategories")}
                  clearLabel={t("transactionForm.placeholders.clearSelection")}
                  toggleLabel={t("transactionForm.placeholders.toggleOptions")}
                  onChange={(value) => setValue("categoryId", value ?? "")}
                />
              ) : null}
            </div>
          </div>

          {showRepaysOwedBalance ? (
            <div className="flex items-center gap-2 border-t border-border pt-8">
              <Checkbox
                id={`${formId}-repays-owed-balance`}
                checked={form.repaysOwedBalance}
                disabled={creating}
                onCheckedChange={(checked) =>
                  setValue("repaysOwedBalance", checked)
                }
              />
              <Label htmlFor={`${formId}-repays-owed-balance`}>
                {t("transactionForm.repaysOwedBalance")}
              </Label>
            </div>
          ) : null}

          <div className="grid gap-4 border-t border-border pt-8 md:grid-cols-2">
            <TextField
              id={`${formId}-occurred-at`}
              label={t("transactionForm.fields.occurredAt")}
              value={form.occurredAt}
              type="datetime-local"
              disabled={creating}
              error={errors.occurredAt}
              onChange={(value) => setValue("occurredAt", value)}
            />
            <div className="md:col-span-2">
              <Label htmlFor={`${formId}-description`}>
                {t("transactionForm.fields.description")}
              </Label>
              <Textarea
                id={`${formId}-description`}
                className="mt-1 min-h-24"
                value={form.description}
                disabled={creating}
                maxLength={2_000}
                aria-invalid={Boolean(errors.description)}
                aria-describedby={
                  errors.description ? `${formId}-description-error` : undefined
                }
                onChange={(event) =>
                  setValue("description", event.currentTarget.value)
                }
              />
              {errors.description ? (
                <p
                  id={`${formId}-description-error`}
                  className="mt-1 text-xs text-destructive"
                >
                  {errors.description}
                </p>
              ) : null}
            </div>
            <TextField
              id={`${formId}-reference-type`}
              label={t("transactionForm.fields.referenceType")}
              value={form.referenceType}
              disabled={creating}
              maxLength={80}
              error={errors.reference}
              onChange={(value) => setValue("referenceType", value)}
            />
            <TextField
              id={`${formId}-reference-id`}
              label={t("transactionForm.fields.referenceId")}
              value={form.referenceId}
              disabled={creating}
              maxLength={200}
              error={errors.reference}
              onChange={(value) => setValue("referenceId", value)}
            />
          </div>
        </div>

        {feedback ? (
          <Alert variant="destructive">
            <AlertTitle>{t("transactionForm.feedback.errorTitle")}</AlertTitle>
            <AlertDescription>{feedback}</AlertDescription>
          </Alert>
        ) : null}

        <div className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <Checkbox
              id={`${formId}-post-immediately`}
              checked={form.postImmediately}
              disabled={creating}
              onCheckedChange={(checked) =>
                setValue("postImmediately", checked)
              }
            />
            <Label htmlFor={`${formId}-post-immediately`}>
              {t("transactionForm.postImmediately")}
            </Label>
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <Link
              href={transactionsHref}
              aria-disabled={creating}
              className={buttonVariants({
                variant: "outline",
                className: creating ? "pointer-events-none opacity-60" : "",
              })}
            >
              {t("transactionForm.cancel")}
            </Link>
            <Button type="submit" disabled={creating}>
              {creating
                ? t("transactionForm.creating")
                : form.postImmediately
                  ? t("transactionForm.create")
                  : t("transactionForm.saveDraft")}
              <ArrowRightIcon data-icon="inline-end" />
            </Button>
          </div>
        </div>
      </form>
      <Dialog
        open={unidentifiedRecipientInput !== null}
        onOpenChange={(open) => {
          if (!open && !creating) setUnidentifiedRecipientInput(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {t("transactionForm.unidentifiedRecipient.title")}
            </DialogTitle>
            <DialogDescription>
              {t("transactionForm.unidentifiedRecipient.description")}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose
              render={<Button variant="outline" disabled={creating} />}
            >
              {t("transactionForm.unidentifiedRecipient.back")}
            </DialogClose>
            <Button
              type="button"
              disabled={creating}
              onClick={() => void confirmUnidentifiedRecipient()}
            >
              {t("transactionForm.unidentifiedRecipient.confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function FlowRow({
  amount,
  amountId,
  amountLabel,
  autoFocus = false,
  children,
  currency,
  currencyId,
  currencyLabel,
  disabled,
  error,
  onAmountChange,
  onCurrencyChange,
  sign,
}: {
  amount: string;
  amountId: string;
  amountLabel: string;
  autoFocus?: boolean;
  children: React.ReactNode;
  currency: string;
  currencyId: string;
  currencyLabel: string;
  disabled: boolean;
  error?: string;
  onAmountChange(value: string): void;
  onCurrencyChange(value: string): void;
  sign: "+" | "−";
}) {
  return (
    <div className="grid min-h-32 items-center gap-4 rounded-xl bg-muted/50 p-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] sm:p-6">
      <div className="[&_[data-slot=label]]:sr-only">{children}</div>
      <div>
        <Label className="sr-only" htmlFor={amountId}>
          {amountLabel}
        </Label>
        <InputGroup className="h-14 border-none bg-transparent shadow-none">
          <span
            className={cn(
              "pl-2 text-3xl font-semibold",
              sign === "+" ? "text-success" : "text-destructive",
            )}
            aria-hidden="true"
          >
            {sign}
          </span>
          <InputGroupInput
            id={amountId}
            value={amount}
            inputMode="decimal"
            disabled={disabled}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? `${amountId}-error` : undefined}
            autoFocus={autoFocus}
            className="text-right text-3xl font-semibold tracking-tight"
            onChange={(event) => onAmountChange(event.currentTarget.value)}
          />
          <Select
            value={currency}
            disabled={disabled}
            onValueChange={(value) => onCurrencyChange(value ?? "RON")}
          >
            <InputGroupSelectTrigger id={currencyId} aria-label={currencyLabel}>
              <SelectValue />
            </InputGroupSelectTrigger>
            <SelectContent>
              <SelectGroup>
                {TRANSACTION_CURRENCIES.map((option) => (
                  <SelectItem key={option} value={option}>
                    {option}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </InputGroup>
        {error ? (
          <p id={`${amountId}-error`} className="mt-1 text-xs text-destructive">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function FlowWalletSelect({
  t,
  ...props
}: Omit<
  React.ComponentProps<typeof WalletSelect>,
  | "clearLabel"
  | "emptyMessage"
  | "placeholder"
  | "searchPlaceholder"
  | "toggleLabel"
> & { t: ReturnType<typeof useTranslations> }) {
  return (
    <WalletSelect
      {...props}
      placeholder={t("transactionForm.placeholders.select")}
      searchPlaceholder={t("transactionForm.placeholders.searchWallets")}
      emptyMessage={t("transactionForm.placeholders.noWallets")}
      clearLabel={t("transactionForm.placeholders.clearSelection")}
      toggleLabel={t("transactionForm.placeholders.toggleOptions")}
    />
  );
}

function FlowCounterpartySelect({
  required = false,
  t,
  ...props
}: Omit<
  React.ComponentProps<typeof CounterpartySelect>,
  | "clearLabel"
  | "emptyMessage"
  | "errorMessage"
  | "loadMoreLabel"
  | "loadingMessage"
  | "minSearchMessage"
  | "placeholder"
  | "searchPlaceholder"
  | "toggleLabel"
> & { t: ReturnType<typeof useTranslations> }) {
  return (
    <CounterpartySelect
      {...props}
      required={required}
      placeholder={t(
        required
          ? "transactionForm.placeholders.selectPayer"
          : "transactionForm.placeholders.optionalCounterparty",
      )}
      searchPlaceholder={t("transactionForm.placeholders.searchCounterparties")}
      emptyMessage={t("transactionForm.placeholders.noCounterparties")}
      minSearchMessage={t(
        "transactionForm.placeholders.counterpartySearchHint",
      )}
      loadingMessage={t("transactionForm.placeholders.searchingCounterparties")}
      errorMessage={t("transactionForm.placeholders.counterpartySearchError")}
      loadMoreLabel={t("transactionForm.placeholders.loadMore")}
      clearLabel={t("transactionForm.placeholders.clearSelection")}
      toggleLabel={t("transactionForm.placeholders.toggleOptions")}
    />
  );
}

function TextField({
  error,
  id,
  label,
  onChange,
  ...props
}: Omit<React.ComponentProps<typeof Input>, "onChange"> & {
  error?: string;
  label: string;
  onChange(value: string): void;
}) {
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <Input
        {...props}
        id={id}
        className="mt-1"
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
        onChange={(event) => onChange(event.currentTarget.value)}
      />
      {error ? (
        <p id={`${id}-error`} className="mt-1 text-xs text-destructive">
          {error}
        </p>
      ) : null}
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
  value,
}: {
  disabled?: boolean;
  error?: string;
  id: string;
  items: Array<{ label: string; value: string }>;
  label: string;
  onChange(value: string): void;
  value: string;
}) {
  return (
    <div>
      <Label id={`${id}-label`}>{label}</Label>
      <Select
        value={value}
        disabled={disabled}
        onValueChange={(nextValue) => {
          if (nextValue) onChange(nextValue);
        }}
      >
        <SelectTrigger
          id={id}
          aria-labelledby={`${id}-label`}
          aria-invalid={Boolean(error)}
          className="mt-1 w-full"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {items.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {error ? <p className="mt-1 text-xs text-destructive">{error}</p> : null}
    </div>
  );
}

function WalletSelect({
  clearLabel,
  disabled,
  emptyMessage,
  error,
  id,
  label,
  onChange,
  placeholder,
  searchPlaceholder,
  toggleLabel,
  optionalLabel,
  value,
  walletTypeLabels,
  wallets,
}: {
  clearLabel: string;
  disabled?: boolean;
  emptyMessage: string;
  error?: string;
  id: string;
  label: string;
  onChange(value: string): void;
  placeholder: string;
  searchPlaceholder: string;
  toggleLabel: string;
  optionalLabel?: string;
  value: string;
  walletTypeLabels: Record<v1.finance.WalletType, string>;
  wallets: v1.finance.WalletOption[];
}) {
  return (
    <div>
      <Label htmlFor={id} id={`${id}-label`}>
        {label}
      </Label>
      <SearchSelect
        id={id}
        ariaLabelledBy={`${id}-label`}
        ariaInvalid={Boolean(error)}
        ariaDescribedBy={error ? `${id}-error` : undefined}
        value={value || null}
        disabled={disabled}
        clearable={Boolean(optionalLabel)}
        options={wallets.map((wallet) => ({
          value: wallet.id,
          label: walletLabel(wallet),
          icon: wallet.type === "USER" ? UserIcon : WalletCardsIcon,
          description: wallet.owner
            ? wallet.owner.email
            : walletTypeLabels[wallet.type],
          keywords: wallet.owner ? [wallet.owner.email] : undefined,
        }))}
        renderOption={(option) => <FinanceSelectorOptionRow {...option} />}
        placeholder={optionalLabel ?? placeholder}
        searchPlaceholder={searchPlaceholder}
        emptyMessage={emptyMessage}
        clearLabel={clearLabel}
        toggleLabel={toggleLabel}
        className="mt-1"
        onValueChange={(nextValue) => onChange(nextValue ?? "")}
      />
      {error ? (
        <p id={`${id}-error`} className="mt-1 text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function CounterpartySelect({
  clearLabel,
  disabled,
  emptyMessage,
  error,
  errorMessage,
  id,
  label,
  loadMoreLabel,
  loadingMessage,
  minSearchMessage,
  onChange,
  placeholder,
  required = false,
  searchPlaceholder,
  toggleLabel,
  transactionType,
  value,
}: {
  clearLabel: string;
  disabled?: boolean;
  emptyMessage: string;
  error?: string;
  errorMessage: string;
  id: string;
  label: string;
  loadMoreLabel: string;
  loadingMessage: string;
  minSearchMessage: string;
  onChange(value: string): void;
  placeholder: string;
  required?: boolean;
  searchPlaceholder: string;
  toggleLabel: string;
  transactionType: "INCOME" | "EXPENSE";
  value: string;
}) {
  const [items, setItems] = useState<
    v1.finance.FinancialCounterpartySearchItem[]
  >([]);
  const [selectedItem, setSelectedItem] = useState<
    v1.finance.FinancialCounterpartySearchItem | undefined
  >();
  const [query, setQuery] = useState("");
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [searchFailed, setSearchFailed] = useState(false);

  const search = useCallback(
    async (searchQuery: string, context: { signal: AbortSignal }) => {
      const normalizedQuery = searchQuery.replace(/\s+/g, " ").trim();
      setQuery(normalizedQuery);
      setSearchFailed(false);

      if (normalizedQuery.length === 1) {
        setItems([]);
        setNextCursor(null);
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const result = await fetchCounterparties(normalizedQuery, {
          signal: context.signal,
          transactionType,
        });
        if (context.signal.aborted) return;
        setItems(result.items);
        setNextCursor(result.nextCursor);
      } catch {
        if (context.signal.aborted) return;
        setItems([]);
        setNextCursor(null);
        setSearchFailed(true);
      } finally {
        if (!context.signal.aborted) setLoading(false);
      }
    },
    [transactionType],
  );

  async function loadMore() {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    setSearchFailed(false);
    try {
      const result = await fetchCounterparties(query, {
        cursor: nextCursor,
        transactionType,
      });
      setItems((current) => {
        const byId = new Map(current.map((item) => [item.id, item]));
        for (const item of result.items) byId.set(item.id, item);
        return [...byId.values()];
      });
      setNextCursor(result.nextCursor);
    } catch {
      setSearchFailed(true);
    } finally {
      setLoadingMore(false);
    }
  }

  const options = items.map(counterpartyOption);
  const preservedSelection = selectedItem
    ? counterpartyOption(selectedItem)
    : undefined;

  return (
    <div>
      <Label htmlFor={id} id={`${id}-label`}>
        {label}
      </Label>
      <SearchSelect
        id={id}
        ariaLabelledBy={`${id}-label`}
        ariaInvalid={Boolean(error)}
        ariaRequired={required}
        ariaDescribedBy={error ? `${id}-error` : undefined}
        value={value || null}
        selectedOption={preservedSelection}
        disabled={disabled}
        clearable
        options={options}
        renderOption={(option) => <FinanceSelectorOptionRow {...option} />}
        serverSearch
        loading={loading}
        loadingMore={loadingMore}
        hasMore={Boolean(nextCursor)}
        errorMessage={searchFailed ? errorMessage : null}
        placeholder={placeholder}
        searchPlaceholder={searchPlaceholder}
        emptyMessage={query.length === 1 ? minSearchMessage : emptyMessage}
        loadingMessage={loadingMessage}
        loadMoreLabel={loadMoreLabel}
        clearLabel={clearLabel}
        toggleLabel={toggleLabel}
        className="mt-1"
        onSearchQueryChange={search}
        onLoadMore={() => void loadMore()}
        onValueChange={(nextValue) => {
          setSelectedItem(items.find((item) => item.id === nextValue));
          onChange(nextValue ?? "");
        }}
      />
      {error ? (
        <p id={`${id}-error`} className="mt-1 text-xs text-destructive">
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

async function fetchCounterparties(
  search: string,
  options: {
    cursor?: string;
    signal?: AbortSignal;
    transactionType: "INCOME" | "EXPENSE";
  },
) {
  const params = new URLSearchParams({
    search,
    pageSize: "20",
    transactionType: options.transactionType,
  });
  if (options.cursor) params.set("cursor", options.cursor);

  return webApi.fetch(
    `${v1.finance.ROUTES.counterparties.search}?${params}`,
    v1.finance.financialCounterpartySearchResultSchema,
    { cache: "no-store", signal: options.signal },
  );
}

function SearchSelectField({
  clearLabel,
  disabled,
  emptyMessage,
  error,
  id,
  label,
  onChange,
  options,
  placeholder,
  required = false,
  searchPlaceholder,
  toggleLabel,
  value,
}: {
  clearLabel: string;
  disabled?: boolean;
  emptyMessage: string;
  error?: string;
  id: string;
  label: string;
  onChange(value: string | null): void;
  options: Array<{ label: string; value: string }>;
  placeholder: string;
  required?: boolean;
  searchPlaceholder: string;
  toggleLabel: string;
  value: string | null;
}) {
  return (
    <div>
      <Label htmlFor={id} id={`${id}-label`}>
        {label}
      </Label>
      <SearchSelect
        id={id}
        ariaLabelledBy={`${id}-label`}
        ariaInvalid={Boolean(error)}
        ariaRequired={required}
        ariaDescribedBy={error ? `${id}-error` : undefined}
        value={value}
        disabled={disabled}
        options={options}
        placeholder={placeholder}
        searchPlaceholder={searchPlaceholder}
        emptyMessage={emptyMessage}
        clearLabel={clearLabel}
        clearable={!required}
        toggleLabel={toggleLabel}
        className="mt-1"
        onValueChange={onChange}
      />
      {error ? (
        <p id={`${id}-error`} className="mt-1 text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function walletLabel(wallet: v1.finance.WalletOption): string {
  return wallet.owner ? financeUserLabel(wallet.owner) : wallet.name;
}

function clearErrorsForKey(
  errors: TransactionFormErrors,
  key: keyof TransactionFormState,
): TransactionFormErrors {
  const field =
    key === "referenceId" || key === "referenceType" ? "reference" : key;
  if (!(field in errors)) return errors;
  const next = { ...errors };
  delete next[field as keyof TransactionFormErrors];
  return next;
}
