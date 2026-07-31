"use client";

import { ApiError, v1 } from "@repo/api-shared";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Checkbox,
  Input,
  Label,
  SearchSelect,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
  buttonVariants,
} from "@repo/ui/components";
import { cn } from "@repo/ui/lib/utils";
import {
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
import { FinancePageHeader } from "../../_components/FinancePageHeader";
import {
  buildTransactionInput,
  createTransactionFormState,
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
  "REFUND",
]);

const CATEGORY_TYPES = new Set<v1.finance.CreatableMoneyTransactionType>([
  "INCOME",
  "EXPENSE",
  "USER_CHARGE",
]);

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
  const [form, setForm] = useState<TransactionFormState>(() =>
    createTransactionFormState(wallets, prefill),
  );
  const [errors, setErrors] = useState<TransactionFormErrors>({});
  const [feedback, setFeedback] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
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
  const visibleCategories = categories.filter((category) => {
    if (!category.isActive) return false;
    if (form.type === "EXPENSE") return category.kind !== "INCOME";
    return category.kind !== "EXPENSE";
  });
  const showScope = form.type === "INCOME" || form.type === "EXPENSE";
  const showBucket = form.type === "TRANSFER" || form.type === "ADJUSTMENT";
  const showDirection = form.type === "ADJUSTMENT";
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

    setCreating(true);
    try {
      const transaction = await webApi.fetch(
        v1.finance.ROUTES.transactions.create,
        v1.finance.moneyTransactionSchema,
        {
          method: "POST",
          json: candidate.input,
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

  function setValue<Key extends keyof TransactionFormState>(
    key: Key,
    value: TransactionFormState[Key],
  ) {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => clearErrorsForKey(current, key));
  }

  function changeType(type: v1.finance.CreatableMoneyTransactionType) {
    const reset = createTransactionFormState(wallets, { type });
    setForm((current) => ({
      ...reset,
      amount: current.amount,
      currency: current.currency,
      occurredAt: current.occurredAt,
      description: current.description,
      postImmediately: current.postImmediately,
      referenceType: current.referenceType,
      referenceId: current.referenceId,
    }));
    setErrors({});
    setFeedback(null);
  }

  function changeRoutingValue<Key extends "bucket" | "financialScope">(
    key: Key,
    value: TransactionFormState[Key],
  ) {
    setForm((current) => ({
      ...current,
      [key]: value,
      primaryWalletId: "",
      secondaryWalletId: "",
    }));
    setErrors((current) => ({
      ...current,
      primaryWalletId: undefined,
      secondaryWalletId: undefined,
    }));
  }

  return (
    <div className="mx-auto flex w-full max-w-screen-xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6 sm:py-10">
      <PageTitleOverride title={t("transactionForm.title")} />
      <Link
        href={transactionsHref}
        className={cn(
          buttonVariants({ variant: "ghost" }),
          "w-fit text-muted-foreground",
        )}
      >
        <ArrowLeftIcon data-icon="inline-start" />
        {t("transactionForm.back")}
      </Link>
      <FinancePageHeader
        title={t("transactionForm.title")}
        description={t("transactionForm.description")}
      />

      <form
        className="grid gap-6"
        noValidate
        onSubmit={(event) => void submit(event)}
      >
        <Card>
          <CardHeader>
            <CardTitle>{t("transactionForm.sections.transaction")}</CardTitle>
            <CardDescription>
              {t(`transactionForm.typeHelp.${form.type}`)}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <SelectField
              id={`${formId}-type`}
              label={t("transactionForm.fields.type")}
              value={form.type}
              disabled={creating}
              items={v1.finance.CREATABLE_MONEY_TRANSACTION_TYPES.map(
                (type) => ({
                  value: type,
                  label: t(`enums.transactionTypes.${type}`),
                }),
              )}
              onChange={(value) =>
                changeType(value as v1.finance.CreatableMoneyTransactionType)
              }
            />
            <TextField
              id={`${formId}-amount`}
              label={t("transactionForm.fields.amount")}
              value={form.amount}
              inputMode="decimal"
              disabled={creating}
              error={errors.amount}
              onChange={(value) => setValue("amount", value)}
            />
            <TextField
              id={`${formId}-currency`}
              label={t("transactionForm.fields.currency")}
              value={form.currency}
              autoCapitalize="characters"
              disabled={creating}
              maxLength={3}
              error={errors.currency}
              onChange={(value) => setValue("currency", value.toUpperCase())}
            />
            {showScope ? (
              <SelectField
                id={`${formId}-scope`}
                label={t("transactionForm.fields.scope")}
                value={form.financialScope}
                disabled={creating}
                items={(["COMPANY", "ADMIN_PERSONAL"] as const).map(
                  (scope) => ({
                    value: scope,
                    label: t(`enums.financialScopes.${scope}`),
                  }),
                )}
                onChange={(value) =>
                  changeRoutingValue(
                    "financialScope",
                    value as TransactionFormState["financialScope"],
                  )
                }
              />
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("transactionForm.sections.routing")}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            {showBucket ? (
              <SelectField
                id={`${formId}-bucket`}
                label={t("transactionForm.fields.bucket")}
                value={form.bucket}
                disabled={creating}
                items={v1.finance.WALLET_BALANCE_BUCKETS.map((bucket) => ({
                  value: bucket,
                  label: t(`enums.balanceBuckets.${bucket}`),
                }))}
                onChange={(value) =>
                  changeRoutingValue(
                    "bucket",
                    value as v1.finance.WalletBalanceBucket,
                  )
                }
              />
            ) : null}
            {showDirection ? (
              <SelectField
                id={`${formId}-direction`}
                label={t("transactionForm.fields.direction")}
                value={form.direction}
                disabled={creating}
                items={(["POSITIVE", "NEGATIVE"] as const).map((direction) => ({
                  value: direction,
                  label: t(`enums.directions.${direction}`),
                }))}
                onChange={(value) =>
                  setValue(
                    "direction",
                    value as TransactionFormState["direction"],
                  )
                }
              />
            ) : null}
            <WalletSelect
              id={`${formId}-primary-wallet`}
              label={t(`transactionForm.fields.${recipe.primaryLabel}`)}
              value={form.primaryWalletId}
              wallets={primaryWallets}
              disabled={creating}
              error={errors.primaryWalletId}
              placeholder={t("transactionForm.placeholders.select")}
              searchPlaceholder={t(
                "transactionForm.placeholders.searchWallets",
              )}
              emptyMessage={t("transactionForm.placeholders.noWallets")}
              clearLabel={t("transactionForm.placeholders.clearSelection")}
              toggleLabel={t("transactionForm.placeholders.toggleOptions")}
              walletTypeLabels={walletTypeLabels}
              onChange={(value) => setValue("primaryWalletId", value)}
            />
            {recipe.secondaryRole && recipe.secondaryLabel ? (
              <WalletSelect
                id={`${formId}-secondary-wallet`}
                label={t(`transactionForm.fields.${recipe.secondaryLabel}`)}
                value={form.secondaryWalletId}
                wallets={secondaryWallets}
                disabled={creating}
                error={errors.secondaryWalletId}
                placeholder={t("transactionForm.placeholders.select")}
                searchPlaceholder={t(
                  "transactionForm.placeholders.searchWallets",
                )}
                emptyMessage={t("transactionForm.placeholders.noWallets")}
                clearLabel={t("transactionForm.placeholders.clearSelection")}
                toggleLabel={t("transactionForm.placeholders.toggleOptions")}
                walletTypeLabels={walletTypeLabels}
                onChange={(value) => setValue("secondaryWalletId", value)}
              />
            ) : null}
            {form.type === "INCOME" || form.type === "EXPENSE" ? (
              <CounterpartySelect
                key={form.type}
                id={`${formId}-counterparty`}
                transactionType={form.type}
                label={t("transactionForm.fields.counterparty")}
                value={form.counterpartyId}
                disabled={creating}
                error={errors.counterpartyId}
                placeholder={t("transactionForm.placeholders.optional")}
                searchPlaceholder={t(
                  "transactionForm.placeholders.searchCounterparties",
                )}
                emptyMessage={t(
                  "transactionForm.placeholders.noCounterparties",
                )}
                minSearchMessage={t(
                  "transactionForm.placeholders.counterpartySearchHint",
                )}
                loadingMessage={t(
                  "transactionForm.placeholders.searchingCounterparties",
                )}
                errorMessage={t(
                  "transactionForm.placeholders.counterpartySearchError",
                )}
                loadMoreLabel={t("transactionForm.placeholders.loadMore")}
                clearLabel={t("transactionForm.placeholders.clearSelection")}
                toggleLabel={t("transactionForm.placeholders.toggleOptions")}
                onChange={(value) => setValue("counterpartyId", value)}
              />
            ) : null}
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
                  setValue("paymentMethod", value as v1.finance.PaymentMethod)
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
                disabled={creating}
                error={errors.categoryId}
                options={visibleCategories.map((category) => ({
                  value: category.id,
                  label: category.name,
                }))}
                placeholder={t("transactionForm.placeholders.optional")}
                searchPlaceholder={t(
                  "transactionForm.placeholders.searchCategories",
                )}
                emptyMessage={t("transactionForm.placeholders.noCategories")}
                clearLabel={t("transactionForm.placeholders.clearSelection")}
                toggleLabel={t("transactionForm.placeholders.toggleOptions")}
                onChange={(value) => setValue("categoryId", value ?? "")}
              />
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("transactionForm.sections.details")}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
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
          </CardContent>
        </Card>

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
    </div>
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
        ariaDescribedBy={error ? `${id}-error` : undefined}
        value={value}
        disabled={disabled}
        options={options}
        placeholder={placeholder}
        searchPlaceholder={searchPlaceholder}
        emptyMessage={emptyMessage}
        clearLabel={clearLabel}
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
