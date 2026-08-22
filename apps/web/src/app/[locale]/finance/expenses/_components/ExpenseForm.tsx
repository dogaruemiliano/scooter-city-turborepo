"use client";

/**
 * Records an expense.
 *
 * The form is arranged around the three questions the finance model keeps
 * apart, in order: what was bought, who paid for it, and who benefited. They
 * are separate sections because they have genuinely independent answers —
 * collapsing them is the mistake this whole module exists to avoid.
 *
 * The impact panel is filled by the server. Whenever the entry is complete
 * enough to post, the form asks the API what it would do; nothing here adds
 * up debits and credits on its own.
 */
import { ApiError, v1 } from "@repo/api-shared";
import type { SupportedLocale } from "@repo/i18n";
import { Button, Card, Separator } from "@repo/ui/components";
import { PlusIcon, Trash2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useState } from "react";
import { FormProvider, useFieldArray, useWatch } from "react-hook-form";

import { FormField } from "@/components/form/FormField";
import {
  FormInput,
  FormSelect,
  FormTextarea,
} from "@/components/form/controls";
import { FormSummary } from "@/components/form/FormSummary";
import { localizePath, resolveRouteLocale } from "@/i18n/paths";
import { financeUserLabel, formatMinorAmount } from "@/lib/finance-format";
import { useZodForm } from "@/lib/form/use-zod-form";
import { FinancialImpactPreview } from "../../_components/FinancialImpactPreview";
import { FINANCE_PATHS } from "../../_lib/links";
import { createExpense, previewExpense } from "../_lib/expense-api";
import {
  allocationDefaultsForCostObject,
  emptyAllocationLine,
  emptyDocumentLine,
  emptyPaymentLine,
  expenseFormDefaults,
  expenseFormSchema,
  sumLines,
  toCreateExpenseInput,
  todayDateOnly,
  type ExpenseFormValues,
} from "../_lib/expense-form";

/** How long the form waits after a keystroke before asking for a preview. */
const PREVIEW_DEBOUNCE_MS = 400;

export interface ExpenseFormProps {
  book: v1.finance.FinanceBook;
  books: readonly v1.finance.FinanceBook[];
  accounts: readonly v1.finance.LedgerAccount[];
  categories: readonly v1.finance.ExpenseCategory[];
  costObjects: readonly v1.finance.CostObject[];
  /** Already localized by the server component that renders this form. */
  expensesHref: string;
}

export function ExpenseForm({
  book,
  books,
  accounts,
  categories,
  costObjects,
  expensesHref,
}: ExpenseFormProps) {
  const t = useTranslations("finance.expense");
  const tCommon = useTranslations("finance.common");
  const tErrors = useTranslations("finance.errors");
  const locale = resolveRouteLocale(useLocale());
  const router = useRouter();

  const [plan, setPlan] = useState<v1.finance.PostingPlan>();
  const [previewPending, setPreviewPending] = useState(false);
  const [previewError, setPreviewError] = useState<string>();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // One key for the life of this form. A retry after a timeout returns the
  // original operation instead of recording the expense a second time.
  const [idempotencyKey] = useState(() => crypto.randomUUID());

  const form = useZodForm<ExpenseFormValues, ExpenseFormValues>(
    expenseFormSchema,
    {
      defaultValues: expenseFormDefaults({
        bookId: book.id,
        today: todayDateOnly(),
      }),
      labelFor: (path) => labelForPath(path, t),
    },
  );

  const payments = useFieldArray({ control: form.control, name: "payments" });
  const allocations = useFieldArray({
    control: form.control,
    name: "allocations",
  });
  const documents = useFieldArray({ control: form.control, name: "documents" });

  const values = useWatch({ control: form.control }) as ExpenseFormValues;

  const activeBook = useMemo(
    () => books.find((candidate) => candidate.id === values.bookId) ?? book,
    [book, books, values.bookId],
  );

  const availableTreatments =
    v1.finance.EXPENSE_TREATMENTS_BY_BOOK_TYPE[activeBook.type];

  const paymentSourceAccounts = useMemo(
    () =>
      accounts.filter(
        (account) =>
          account.bookId === values.bookId &&
          account.category === "ASSET" &&
          (
            v1.finance.EXPENSE_PAYMENT_SOURCE_ROLES as readonly string[]
          ).includes(account.role),
      ),
    [accounts, values.bookId],
  );

  const bookCategories = useMemo(
    () => categories.filter((category) => category.bookId === values.bookId),
    [categories, values.bookId],
  );

  const bookCostObjects = useMemo(
    () =>
      costObjects.filter((costObject) => costObject.bookId === values.bookId),
    [costObjects, values.bookId],
  );

  const associates = useMemo(() => {
    return activeBook.members.flatMap((member) =>
      member.associate ? [member.associate] : [],
    );
  }, [activeBook]);

  const associateNames = useMemo(
    () =>
      new Map(
        associates.map((associate) => [
          associate.id,
          financeUserLabel(associate),
        ]),
      ),
    [associates],
  );

  const currency = activeBook.functionalCurrency;

  /**
   * Ask the server what this entry would do. Only fires once the form
   * validates — an incomplete entry has no meaningful impact to show.
   */
  const refreshPreview = useCallback(
    async (signal?: AbortSignal) => {
      const parsed = expenseFormSchema.safeParse(form.getValues());

      if (!parsed.success) {
        setPlan(undefined);
        setPreviewError(undefined);
        setPreviewPending(false);
        return;
      }

      setPreviewPending(true);
      setPreviewError(undefined);

      try {
        setPlan(
          await previewExpense(toCreateExpenseInput(parsed.data), signal),
        );
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError")
          return;
        setPlan(undefined);
        setPreviewError(messageForError(error, tErrors));
      } finally {
        setPreviewPending(false);
      }
    },
    [form, tErrors],
  );

  // Debounced so typing an amount does not fire a request per keystroke.
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      void refreshPreview(controller.signal);
    }, PREVIEW_DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [refreshPreview, values]);

  const paymentsTotalMinor = sumLines(values.payments ?? []);
  const allocationsTotalMinor = sumLines(values.allocations ?? []);

  async function onSubmit(submitted: ExpenseFormValues) {
    setSubmitting(true);
    setSubmitError(null);

    try {
      const operation = await createExpense(
        toCreateExpenseInput(submitted),
        idempotencyKey,
      );

      // Built here rather than passed in: a href-building function cannot
      // cross the server/client boundary, and the id only exists now.
      router.push(localizePath(FINANCE_PATHS.operation(operation.id), locale));
      router.refresh();
    } catch (error) {
      setSubmitError(messageForError(error, tErrors));
    } finally {
      setSubmitting(false);
    }
  }

  /** Prefills the benefit lines — and only those — from a cost object. */
  function applyCostObjectDefaults(costObjectId: string) {
    const costObject = bookCostObjects.find(
      (candidate) => candidate.id === costObjectId,
    );
    const defaults = allocationDefaultsForCostObject(
      costObject,
      form.getValues("amount"),
    );

    if (defaults) {
      allocations.replace(defaults);
    }
  }

  /** Keeps treatment valid when moving between company and pool books. */
  function applyBookTreatment(bookId: string) {
    const nextBook = books.find((candidate) => candidate.id === bookId) ?? book;
    const allowedTreatments =
      v1.finance.EXPENSE_TREATMENTS_BY_BOOK_TYPE[nextBook.type];
    const currentTreatment = form.getValues("treatment");
    const [defaultTreatment] = allowedTreatments;

    if (defaultTreatment && !allowedTreatments.includes(currentTreatment)) {
      form.setValue("treatment", defaultTreatment, {
        shouldDirty: true,
        shouldValidate: true,
      });
    }
  }

  return (
    <FormProvider {...form}>
      <form
        noValidate
        onSubmit={form.handleSubmit(onSubmit)}
        className="flex flex-col gap-6 lg:flex-row lg:items-start"
      >
        <div className="flex min-w-0 flex-1 flex-col gap-6">
          <FormSummary title={t("newTitle")} message={submitError} />

          <Card className="flex flex-col gap-4 p-4">
            <SectionHeading title={t("steps.details")} />

            <FormField name="bookId" label={t("fields.book")} required>
              <FormSelect
                onValueChange={applyBookTreatment}
                options={books.map((candidate) => ({
                  value: candidate.id,
                  label: candidate.name,
                }))}
              />
            </FormField>
            <p className="text-sm text-muted-foreground">{t("hints.book")}</p>

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField name="amount" label={t("fields.amount")} required>
                <FormInput inputMode="decimal" autoComplete="off" />
              </FormField>

              <FormField
                name="occurredAt"
                label={t("fields.occurredAt")}
                required
              >
                <FormInput type="date" />
              </FormField>
            </div>

            <FormField name="treatment" label={t("fields.treatment")} required>
              <FormSelect
                options={availableTreatments.map((treatment) => ({
                  value: treatment,
                  label: t(`treatments.${treatment}`),
                }))}
              />
            </FormField>
            <p className="text-sm text-muted-foreground">
              {t(`treatmentHints.${values.treatment ?? "OPERATING_EXPENSE"}`)}
            </p>

            <FormField name="categoryId" label={t("fields.category")} required>
              <FormSelect
                placeholder={t("placeholders.category")}
                options={bookCategories.map((category) => ({
                  value: category.id,
                  label: category.name,
                }))}
              />
            </FormField>

            <FormField name="costObjectId" label={t("fields.costObject")}>
              <FormSelect
                emptyOption={{ label: tCommon("none") }}
                onValueChange={applyCostObjectDefaults}
                options={bookCostObjects.map((costObject) => ({
                  value: costObject.id,
                  label: costObject.name,
                }))}
              />
            </FormField>
            <p className="text-sm text-muted-foreground">
              {t("hints.costObject")}
            </p>

            <FormField name="description" label={t("fields.description")}>
              <FormTextarea rows={2} />
            </FormField>
          </Card>

          <Card className="flex flex-col gap-4 p-4">
            <SectionHeading
              title={t("payments.title")}
              description={t("payments.description")}
            />

            {payments.fields.map((field, index) => (
              <div key={field.id} className="flex flex-col gap-3">
                {index > 0 ? <Separator /> : null}

                <div className="grid gap-3 sm:grid-cols-2">
                  <FormField
                    name={`payments.${index}.sourceType`}
                    label={t("payments.sourceType")}
                    required
                  >
                    <FormSelect
                      options={v1.finance.EXPENSE_PAYMENT_SOURCE_TYPES.map(
                        (sourceType) => ({
                          value: sourceType,
                          label: t(`payments.sourceTypes.${sourceType}`),
                        }),
                      )}
                    />
                  </FormField>

                  {values.payments?.[index]?.sourceType ===
                  "ASSOCIATE_PERSONAL_FUNDS" ? (
                    <FormField
                      name={`payments.${index}.payerAssociateId`}
                      label={t("payments.payer")}
                      required
                    >
                      <FormSelect
                        options={associates.map((associate) => ({
                          value: associate.id,
                          label: financeUserLabel(associate),
                        }))}
                      />
                    </FormField>
                  ) : (
                    <FormField
                      name={`payments.${index}.sourceAccountId`}
                      label={t("payments.account")}
                      required
                    >
                      <FormSelect
                        options={paymentSourceAccounts.map((account) => ({
                          value: account.id,
                          label: account.name,
                        }))}
                      />
                    </FormField>
                  )}

                  <FormField
                    name={`payments.${index}.paymentMethod`}
                    label={t("payments.method")}
                    required
                  >
                    <FormSelect
                      options={v1.finance.PAYMENT_METHODS.map((method) => ({
                        value: method,
                        label: t(`payments.methods.${method}`),
                      }))}
                    />
                  </FormField>

                  <FormField
                    name={`payments.${index}.amount`}
                    label={t("payments.amount")}
                    required
                  >
                    <FormInput inputMode="decimal" autoComplete="off" />
                  </FormField>
                </div>

                {payments.fields.length > 1 ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="self-start"
                    onClick={() => payments.remove(index)}
                  >
                    <Trash2Icon aria-hidden="true" />
                    {t("payments.removeLine")}
                  </Button>
                ) : null}
              </div>
            ))}

            <div className="flex flex-wrap items-center justify-between gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => payments.append(emptyPaymentLine())}
              >
                <PlusIcon aria-hidden="true" />
                {t("payments.addLine")}
              </Button>
              <p className="text-sm text-muted-foreground">
                {t("payments.total")}:{" "}
                {formatMinorAmount(paymentsTotalMinor, currency, locale)}
              </p>
            </div>
          </Card>

          <Card className="flex flex-col gap-4 p-4">
            <SectionHeading
              title={t("allocations.title")}
              description={t("allocations.description")}
            />

            {allocations.fields.map((field, index) => (
              <div key={field.id} className="flex flex-col gap-3">
                {index > 0 ? <Separator /> : null}

                <div className="grid gap-3 sm:grid-cols-2">
                  <FormField
                    name={`allocations.${index}.type`}
                    label={t("allocations.type")}
                    required
                  >
                    <FormSelect
                      options={v1.finance.ECONOMIC_ALLOCATION_TYPES.map(
                        (type) => ({
                          value: type,
                          label: t(`allocations.types.${type}`),
                        }),
                      )}
                    />
                  </FormField>

                  {values.allocations?.[index]?.type ===
                  "ASSOCIATE_SPECIFIC" ? (
                    <FormField
                      name={`allocations.${index}.associateId`}
                      label={t("allocations.associate")}
                      required
                    >
                      <FormSelect
                        options={associates.map((associate) => ({
                          value: associate.id,
                          label: financeUserLabel(associate),
                        }))}
                      />
                    </FormField>
                  ) : null}

                  <FormField
                    name={`allocations.${index}.amount`}
                    label={t("allocations.amount")}
                    required
                  >
                    <FormInput inputMode="decimal" autoComplete="off" />
                  </FormField>
                </div>

                {allocations.fields.length > 1 ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="self-start"
                    onClick={() => allocations.remove(index)}
                  >
                    <Trash2Icon aria-hidden="true" />
                    {t("allocations.removeLine")}
                  </Button>
                ) : null}
              </div>
            ))}

            <div className="flex flex-wrap items-center justify-between gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => allocations.append(emptyAllocationLine())}
              >
                <PlusIcon aria-hidden="true" />
                {t("allocations.addLine")}
              </Button>
              <p className="text-sm text-muted-foreground">
                {t("allocations.total")}:{" "}
                {formatMinorAmount(allocationsTotalMinor, currency, locale)}
              </p>
            </div>
          </Card>

          <Card className="flex flex-col gap-4 p-4">
            <SectionHeading
              title={t("documents.title")}
              description={t("documents.description")}
            />

            {documents.fields.map((field, index) => (
              <div key={field.id} className="flex flex-col gap-3">
                {index > 0 ? <Separator /> : null}

                <div className="grid gap-3 sm:grid-cols-2">
                  <FormField
                    name={`documents.${index}.type`}
                    label={t("documents.type")}
                    required
                  >
                    <FormSelect
                      options={v1.finance.FINANCIAL_DOCUMENT_TYPES.map(
                        (type) => ({
                          value: type,
                          label: t(`documents.types.${type}`),
                        }),
                      )}
                    />
                  </FormField>

                  <FormField
                    name={`documents.${index}.documentNumber`}
                    label={t("documents.documentNumber")}
                  >
                    <FormInput autoComplete="off" />
                  </FormField>

                  <FormField
                    name={`documents.${index}.issuedAt`}
                    label={t("documents.issuedAt")}
                  >
                    <FormInput type="date" />
                  </FormField>

                  <FormField
                    name={`documents.${index}.supplierName`}
                    label={t("documents.supplierName")}
                  >
                    <FormInput autoComplete="off" />
                  </FormField>

                  <FormField
                    name={`documents.${index}.supplierTaxId`}
                    label={t("documents.supplierTaxId")}
                  >
                    <FormInput autoComplete="off" />
                  </FormField>
                </div>

                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="self-start"
                  onClick={() => documents.remove(index)}
                >
                  <Trash2Icon aria-hidden="true" />
                  {t("documents.removeLine")}
                </Button>
              </div>
            ))}

            <Button
              type="button"
              variant="outline"
              size="sm"
              className="self-start"
              onClick={() => documents.append(emptyDocumentLine())}
            >
              <PlusIcon aria-hidden="true" />
              {t("documents.addLine")}
            </Button>
          </Card>
        </div>

        <aside className="flex w-full flex-col gap-4 lg:sticky lg:top-4 lg:w-96">
          <FinancialImpactPreview
            plan={plan}
            currency={currency}
            locale={locale as SupportedLocale}
            pending={previewPending}
            error={previewError}
            associateNames={associateNames}
            onRetry={() => void refreshPreview()}
          />

          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={submitting}>
              {submitting ? t("submitting") : t("submit")}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => router.push(expensesHref)}
            >
              {tCommon("cancel")}
            </Button>
          </div>
        </aside>
      </form>
    </FormProvider>
  );
}

function SectionHeading({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <h2 className="text-base font-medium">{title}</h2>
      {description ? (
        <p className="text-sm text-muted-foreground">{description}</p>
      ) : null}
    </div>
  );
}

function labelForPath(
  path: string,
  t: ReturnType<typeof useTranslations<"finance.expense">>,
): string {
  const labels: Record<string, string> = {
    bookId: t("fields.book"),
    amount: t("fields.amount"),
    occurredAt: t("fields.occurredAt"),
    description: t("fields.description"),
    treatment: t("fields.treatment"),
    categoryId: t("fields.category"),
    costObjectId: t("fields.costObject"),
    "payments.sourceType": t("payments.sourceType"),
    "payments.sourceAccountId": t("payments.account"),
    "payments.payerAssociateId": t("payments.payer"),
    "payments.paymentMethod": t("payments.method"),
    "payments.amount": t("payments.amount"),
    "allocations.type": t("allocations.type"),
    "allocations.associateId": t("allocations.associate"),
    "allocations.amount": t("allocations.amount"),
  };

  return labels[path] ?? path;
}

/**
 * Domain errors carry a stable code and a sentence written for a human. The
 * server's wording is preferred for validation failures — it knows which
 * number did not add up.
 */
export function messageForError(
  error: unknown,
  t: (key: string) => string,
): string {
  if (!(error instanceof ApiError)) return t("generic");

  switch (error.code) {
    case "FINANCE_IDEMPOTENCY_CONFLICT":
      return t("idempotencyConflict");
    case "FINANCE_LEDGER_MISCONFIGURED":
      return t("ledgerMisconfigured");
    case "FINANCE_VALIDATION_FAILED":
      return error.message || t("validation");
    case "FINANCE_NOT_FOUND":
      return t("notFound");
    default:
      return error.status === 403 ? t("forbidden") : t("generic");
  }
}
