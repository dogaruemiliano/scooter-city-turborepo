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
import { Button, Card, Input, Label, Separator } from "@repo/ui/components";
import { ImageIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import {
  createExpense,
  createSupplier,
  previewExpense,
  uploadExpenseReceipt,
} from "../_lib/expense-api";
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
  type ExpenseFormFocusField,
  type ExpenseFormValues,
} from "../_lib/expense-form";

/** How long the form waits after a keystroke before asking for a preview. */
const PREVIEW_DEBOUNCE_MS = 400;
const RECEIPT_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export interface ExpenseFormProps {
  book: v1.finance.FinanceBook;
  books: readonly v1.finance.FinanceBook[];
  accounts: readonly v1.finance.LedgerAccount[];
  categories: readonly v1.finance.ExpenseCategory[];
  costObjects: readonly v1.finance.CostObject[];
  /** Already localized by the server component that renders this form. */
  expensesHref: string;
  initialValues?: ExpenseFormValues;
  /** READY scan whose private image will be claimed when the form is saved. */
  extractionDraftId?: string;
  /** First invalid scan field to reveal when continuing from confirmation. */
  initialFocusField?: ExpenseFormFocusField;
}

export function ExpenseForm({
  book,
  books,
  accounts,
  categories,
  costObjects,
  expensesHref,
  initialValues,
  extractionDraftId,
  initialFocusField,
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
  const [receiptFile, setReceiptFile] = useState<File>();
  const [receiptPreview, setReceiptPreview] = useState<string>();
  const [receiptUploadToken, setReceiptUploadToken] = useState<string>();
  const [receiptUploading, setReceiptUploading] = useState(false);
  const [receiptError, setReceiptError] = useState<string>();
  const receiptInputRef = useRef<HTMLInputElement>(null);

  // One key for the life of this form. A retry after a timeout returns the
  // original operation instead of recording the expense a second time.
  const [idempotencyKey] = useState(() => crypto.randomUUID());

  const form = useZodForm<ExpenseFormValues, ExpenseFormValues>(
    expenseFormSchema,
    {
      defaultValues:
        initialValues ??
        expenseFormDefaults({
          bookId: book.id,
          today: todayDateOnly(),
        }),
      labelFor: (path) => labelForPath(path, t),
    },
  );

  useEffect(() => {
    if (!initialFocusField) return;

    let cancelled = false;
    const frame = requestAnimationFrame(() => {
      void form.trigger(initialFocusField).then(() => {
        if (cancelled) return;

        const field = document.querySelector<HTMLElement>(
          `[data-field-name="${initialFocusField}"]`,
        );
        field?.scrollIntoView({ block: "center" });
        form.setFocus(initialFocusField, { shouldSelect: true });
      });
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
    };
  }, [form, initialFocusField]);

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

  useEffect(
    () => () => {
      if (receiptPreview) URL.revokeObjectURL(receiptPreview);
    },
    [receiptPreview],
  );

  const paymentsTotalMinor = sumLines(values.payments ?? []);
  const allocationsTotalMinor = sumLines(values.allocations ?? []);

  async function onSubmit(submitted: ExpenseFormValues) {
    setSubmitting(true);
    setSubmitError(null);

    try {
      let valuesToSave = submitted;
      const extractedDocument = submitted.documents[0];
      if (
        extractionDraftId &&
        !submitted.supplierId &&
        extractedDocument?.supplierName &&
        extractedDocument.supplierTaxId
      ) {
        const supplier = await createSupplier({
          name: extractedDocument.supplierName,
          taxIdentifier: extractedDocument.supplierTaxId,
        });
        valuesToSave = {
          ...submitted,
          supplierId: supplier.id,
          description: supplier.name,
          documents: submitted.documents.map((document, index) =>
            index === 0
              ? {
                  ...document,
                  supplierName: supplier.name,
                  supplierTaxId: supplier.taxIdentifier,
                }
              : document,
          ),
        };
        form.reset(valuesToSave);
      }

      let uploadToken = receiptUploadToken;

      if (!extractionDraftId && receiptFile && !uploadToken) {
        setReceiptError(undefined);
        setReceiptUploading(true);

        try {
          uploadToken = await uploadExpenseReceipt(receiptFile);
          setReceiptUploadToken(uploadToken);
        } catch {
          setReceiptError(t("documents.imageUploadFailed"));
          return;
        } finally {
          setReceiptUploading(false);
        }
      }

      const operation = await createExpense(
        {
          ...toCreateExpenseInput(valuesToSave),
          ...(extractionDraftId ? { extractionDraftId } : {}),
          ...(!extractionDraftId && uploadToken
            ? { receiptUploadToken: uploadToken }
            : {}),
        },
        idempotencyKey,
      );

      // Built here rather than passed in: a href-building function cannot
      // cross the server/client boundary, and the id only exists now.
      router.push(localizePath(FINANCE_PATHS.operation(operation.id), locale));
      router.refresh();
    } catch (error) {
      // A presigned completion token is intentionally short-lived. Keep the
      // local File, but obtain a fresh upload/token on the next submit so a
      // validation or network failure cannot strand the receipt.
      if (!extractionDraftId && receiptFile) {
        setReceiptUploadToken(undefined);
      }
      setSubmitError(messageForError(error, tErrors));
    } finally {
      setSubmitting(false);
    }
  }

  function selectReceipt(file: File | null) {
    if (!file) return;

    if (!(RECEIPT_IMAGE_TYPES as readonly string[]).includes(file.type)) {
      setReceiptError(t("documents.imageUnsupportedType"));
      return;
    }

    setReceiptFile(file);
    setReceiptPreview(URL.createObjectURL(file));
    setReceiptUploadToken(undefined);
    setReceiptError(undefined);
  }

  function removeReceipt() {
    setReceiptFile(undefined);
    setReceiptPreview(undefined);
    setReceiptUploadToken(undefined);
    setReceiptError(undefined);
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

            {extractionDraftId ? (
              <div className="flex items-center gap-3 border-y border-border py-3">
                <ImageIcon
                  className="size-5 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
                <div className="min-w-0">
                  <p className="text-sm font-medium">
                    {t("documents.receiptAttached")}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t("documents.receiptAttachedHint")}
                  </p>
                </div>
              </div>
            ) : null}

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
                      onValueChange={(type) => {
                        if (type === "INVOICE") return;
                        form.setValue(`documents.${index}.documentSeries`, "", {
                          shouldDirty: true,
                          shouldValidate: true,
                        });
                      }}
                    />
                  </FormField>

                  {values.documents?.[index]?.type === "INVOICE" ? (
                    <FormField
                      name={`documents.${index}.documentSeries`}
                      label={t("documents.documentSeries")}
                    >
                      <FormInput autoComplete="off" />
                    </FormField>
                  ) : null}

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

            {!extractionDraftId ? (
              <div className="flex flex-col gap-3 pt-2">
                <div className="flex flex-col gap-1">
                  <h3 className="text-sm font-medium">
                    {t("documents.imageTitle")}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {t("documents.imageDescription")}
                  </p>
                </div>

                <Input
                  ref={receiptInputRef}
                  id="expense-receipt-image"
                  type="file"
                  accept={RECEIPT_IMAGE_TYPES.join(",")}
                  className="sr-only"
                  disabled={submitting || receiptUploading}
                  onChange={(event) => {
                    selectReceipt(event.target.files?.[0] ?? null);
                    event.currentTarget.value = "";
                  }}
                />

                {receiptPreview && receiptFile ? (
                  <div className="flex min-h-20 flex-col gap-3 border-y border-border py-3 sm:flex-row sm:items-center">
                    {/* eslint-disable-next-line @next/next/no-img-element -- local object URL preview. */}
                    <img
                      src={receiptPreview}
                      alt={t("documents.imagePreviewAlt")}
                      className="size-16 shrink-0 rounded-lg object-cover"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {receiptFile.name}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {receiptUploading
                          ? t("documents.imageUploading")
                          : receiptError
                            ? t("documents.imageUploadErrorStatus")
                            : t("documents.imageReady")}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={submitting || receiptUploading}
                        onClick={() => receiptInputRef.current?.click()}
                      >
                        {t("documents.imageReplace")}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={submitting || receiptUploading}
                        onClick={removeReceipt}
                      >
                        <Trash2Icon aria-hidden="true" />
                        {t("documents.imageRemove")}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Label
                    htmlFor="expense-receipt-image"
                    className="flex min-h-20 cursor-pointer items-center gap-4 border-y border-border py-3 transition-colors duration-fast ease-standard hover:bg-muted/50"
                  >
                    <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                      <ImageIcon className="size-5" aria-hidden="true" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium">
                        {t("documents.imageAdd")}
                      </span>
                      <span className="mt-1 block text-xs font-normal text-muted-foreground">
                        {t("documents.imageFormats")}
                      </span>
                    </span>
                  </Label>
                )}

                {receiptError ? (
                  <p role="alert" className="text-sm text-destructive">
                    {receiptError}
                  </p>
                ) : null}
              </div>
            ) : null}
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

          <FormSummary title={t("newTitle")} message={submitError} />

          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={submitting || receiptUploading}>
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
