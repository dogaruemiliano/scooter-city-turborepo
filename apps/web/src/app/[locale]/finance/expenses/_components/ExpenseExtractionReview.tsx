"use client";

import { v1 } from "@repo/api-shared";
import { aspectRatio } from "@repo/theme";
import {
  BottomSheet,
  BottomSheetBody,
  BottomSheetContent,
  BottomSheetHeader,
  BottomSheetTitle,
  BottomSheetTrigger,
  Button,
  CalendarPicker,
  Input,
  Spinner,
  Textarea,
} from "@repo/ui/components";
import {
  CheckIcon,
  ChevronRightIcon,
  ImageIcon,
  PencilLineIcon,
} from "lucide-react";
import Image from "next/image";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";

import { resolveRouteLocale } from "@/i18n/paths";
import { financeUserLabel, formatMinorAmount } from "@/lib/finance-format";
import {
  allocationDefaultsForCostObject,
  expenseFormFocusFieldForIssuePath,
  expenseFormSchema,
  safeMinor,
  todayDateOnly,
  type ExpenseFormFocusField,
  type ExpenseFormValues,
} from "../_lib/expense-form";
import { ExpenseSupplierPicker } from "./ExpenseSupplierPicker";

interface ExpenseExtractionReviewProps {
  draft: v1.finance.ExpenseExtractionDraft;
  values: ExpenseFormValues;
  previewUrl: string;
  books: readonly v1.finance.FinanceBook[];
  accounts: readonly v1.finance.LedgerAccount[];
  categories: readonly v1.finance.ExpenseCategory[];
  costObjects: readonly v1.finance.CostObject[];
  initialSuppliers: readonly v1.finance.Supplier[];
  currentUserId: string;
  saving: boolean;
  error?: string;
  onValuesChange: (values: ExpenseFormValues) => void;
  onSave: () => void;
  onEditManually: (focusField?: ExpenseFormFocusField) => void;
}

type ReviewOption = {
  value: string;
  label: string;
  description?: string;
};

export function ExpenseExtractionReview({
  draft,
  values,
  previewUrl,
  books,
  accounts,
  categories,
  costObjects,
  initialSuppliers,
  currentUserId,
  saving,
  error,
  onValuesChange,
  onSave,
  onEditManually,
}: ExpenseExtractionReviewProps) {
  const t = useTranslations("finance.expense.captureSheet");
  const tExpense = useTranslations("finance.expense");
  const tCommon = useTranslations("finance.common");
  const locale = resolveRouteLocale(useLocale());
  const [amountEditing, setAmountEditing] = useState(false);
  const [documentSeriesEditing, setDocumentSeriesEditing] = useState(false);
  const [documentNumberEditing, setDocumentNumberEditing] = useState(false);
  const [receiptPreviewAspectRatio, setReceiptPreviewAspectRatio] = useState(
    aspectRatio.receiptPortrait,
  );
  const book = books.find((candidate) => candidate.id === values.bookId);
  const category = categories.find(
    (candidate) => candidate.id === values.categoryId,
  );
  const payment = values.payments[0];
  const allocation = values.allocations[0];
  const document = values.documents[0];
  const supplier = document?.supplierName ?? "";
  const costObject = costObjects.find(
    (candidate) => candidate.id === values.costObjectId,
  );
  const amountMinor = safeMinor(values.amount) ?? 0;
  const currency =
    draft.result?.currency.value &&
    /^[A-Z]{3}$/.test(draft.result.currency.value)
      ? draft.result.currency.value
      : (book?.functionalCurrency ?? "RON");
  const validation = expenseFormSchema.safeParse(values);
  const fieldsNeedingAttention = validation.success
    ? []
    : validation.error.issues.reduce<
        Array<{ field: ExpenseFormFocusField; label: string }>
      >((fields, issue) => {
        const field = expenseFormFocusFieldForIssuePath(issue.path);
        if (!field || fields.some((candidate) => candidate.field === field)) {
          return fields;
        }
        fields.push({ field, label: expenseFieldLabel(field, tExpense) });
        return fields;
      }, []);
  const firstFieldNeedingAttention = fieldsNeedingAttention[0]?.field;
  const canSave = validation.success;

  const associates = v1.finance.financeBookAssociates(book);
  const beneficiary =
    allocation?.type === "COMMON"
      ? tExpense("allocations.types.COMMON")
      : allocation?.associateId
        ? associates.find(
            (associate) => associate.id === allocation.associateId,
          )
        : undefined;
  const beneficiaryLabel =
    typeof beneficiary === "string"
      ? beneficiary
      : beneficiary
        ? financeUserLabel(beneficiary)
        : t("notFound");
  const payer = associates.find(
    (associate) => associate.id === payment?.payerAssociateId,
  );
  const sourceLabel = payment
    ? payment.sourceType === "ASSOCIATE_PERSONAL_FUNDS"
      ? payer
        ? t("personalFundsBy", { name: financeUserLabel(payer) })
        : tExpense("payments.sourceTypes.ASSOCIATE_PERSONAL_FUNDS")
      : (accounts.find((account) => account.id === payment.sourceAccountId)
          ?.name ?? tExpense("payments.sourceTypes.BOOK_ACCOUNT"))
    : t("notFound");

  function update(next: Partial<ExpenseFormValues>) {
    onValuesChange({ ...values, ...next });
  }

  function updateAmount(amount: string) {
    update({
      amount,
      payments: values.payments.map((line, index) =>
        index === 0 ? { ...line, amount } : line,
      ),
      allocations: values.allocations.map((line, index) =>
        index === 0 ? { ...line, amount } : line,
      ),
    });
  }

  function selectBook(bookId: string) {
    const nextBook = books.find((candidate) => candidate.id === bookId);
    if (!nextBook) return;
    const currentCategoryCode = categories.find(
      (candidate) => candidate.id === values.categoryId,
    )?.code;
    const exactCategory = categories.find(
      (candidate) =>
        candidate.bookId === nextBook.id &&
        candidate.code === currentCategoryCode,
    );
    const fallbackCategoryCode = categoryFallbackCodeForBookSwitch(
      book?.type,
      nextBook.type,
      currentCategoryCode,
    );
    const nextCategory =
      exactCategory ??
      categories.find(
        (candidate) =>
          candidate.bookId === nextBook.id &&
          candidate.code === fallbackCategoryCode,
      );
    const allowedTreatments =
      v1.finance.EXPENSE_TREATMENTS_BY_BOOK_TYPE[nextBook.type];
    const treatment =
      nextCategory?.defaultTreatment &&
      allowedTreatments.includes(nextCategory.defaultTreatment)
        ? nextCategory.defaultTreatment
        : allowedTreatments[0];
    const defaultAccount = defaultPaymentAccount(accounts, nextBook.id);
    const currentAllocation = values.allocations[0];
    const hasCurrentBeneficiary = nextBook.members.some(
      (member) => member.associateId === currentAllocation?.associateId,
    );
    const currentCostObjectCode = costObjects.find(
      (candidate) => candidate.id === values.costObjectId,
    )?.code;
    const nextCostObject = costObjects.find(
      (candidate) =>
        candidate.bookId === nextBook.id &&
        candidate.code === currentCostObjectCode,
    );

    update({
      bookId: nextBook.id,
      categoryId: nextCategory?.id ?? "",
      costObjectId: nextCostObject?.id ?? "",
      treatment,
      payments: [
        {
          ...(values.payments[0] ?? {
            paymentMethod: "OTHER" as const,
            amount: values.amount,
          }),
          sourceType:
            nextBook.type === "ASSOCIATE_POOL"
              ? "ASSOCIATE_PERSONAL_FUNDS"
              : "BOOK_ACCOUNT",
          sourceAccountId:
            nextBook.type === "COMPANY" ? (defaultAccount?.id ?? "") : "",
          payerAssociateId:
            nextBook.type === "ASSOCIATE_POOL" ? currentUserId : "",
          amount: values.amount,
        },
      ],
      allocations:
        currentAllocation?.type === "ASSOCIATE_SPECIFIC" &&
        !hasCurrentBeneficiary
          ? [{ type: "COMMON", associateId: "", amount: values.amount }]
          : values.allocations,
    });
  }

  return (
    <div
      data-slot="expense-extraction-review"
      className="flex min-h-0 flex-1 flex-col bg-popover text-popover-foreground"
    >
      <div className="flex-1 overflow-y-auto overscroll-contain px-4 pt-3 pb-6 sm:px-6">
        <div className="mx-auto flex w-full max-w-2xl flex-col">
          <div className="flex min-h-24 items-center justify-between gap-4 border-b border-border py-4">
            <span className="text-sm text-muted-foreground">
              {tExpense("fields.amount")}
            </span>
            {amountEditing ? (
              <div className="flex min-w-0 items-center gap-2">
                <Input
                  autoFocus
                  aria-label={tExpense("fields.amount")}
                  inputMode="decimal"
                  autoComplete="off"
                  value={values.amount}
                  onChange={(event) => updateAmount(event.target.value)}
                  onBlur={() => setAmountEditing(false)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") event.currentTarget.blur();
                  }}
                  className="h-14 w-44 text-right text-3xl font-semibold tabular-nums md:h-14 md:text-3xl"
                />
                <span className="text-base font-medium">{currency}</span>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setAmountEditing(true)}
                className="group flex min-w-0 items-center gap-2 rounded-md px-2 py-1 text-right outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={t("editValue", {
                  field: tExpense("fields.amount"),
                })}
              >
                <strong className="text-4xl font-semibold tabular-nums">
                  {amountMinor > 0
                    ? formatMinorAmount(amountMinor, currency, locale)
                    : t("notFound")}
                </strong>
                <PencilLineIcon
                  className="size-4 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
              </button>
            )}
          </div>

          <div data-slot="expense-extraction-fields">
            <CalendarPicker
              presentation="sheet"
              title={t("chooseDate")}
              triggerLabel={tExpense("fields.occurredAt")}
              renderTrigger={
                <ReviewRowButton
                  label={tExpense("fields.occurredAt")}
                  value={formatDate(values.occurredAt, locale) ?? t("notFound")}
                />
              }
              locale={locale}
              today={todayDateOnly()}
              maxDate={todayDateOnly()}
              value={values.occurredAt}
              onValueChange={(occurredAt) =>
                update({
                  occurredAt,
                  documents: values.documents.map((item, index) =>
                    index === 0 ? { ...item, issuedAt: occurredAt } : item,
                  ),
                })
              }
              labels={{
                chooseMonthAndYear: t("calendar.chooseMonthAndYear"),
                done: t("calendar.done"),
                month: t("calendar.month"),
                nextMonth: t("calendar.nextMonth"),
                previousMonth: t("calendar.previousMonth"),
                year: t("calendar.year"),
              }}
            />

            <ExpenseSupplierPicker
              initialSuppliers={initialSuppliers}
              selectedSupplierId={values.supplierId}
              detectedName={document?.supplierName ?? ""}
              detectedTaxIdentifier={document?.supplierTaxId ?? ""}
              onSupplierChange={(nextSupplier) =>
                update({
                  supplierId: nextSupplier.id,
                  description: nextSupplier.name,
                  documents: ensureDocument(values).map((item, index) =>
                    index === 0
                      ? {
                          ...item,
                          supplierName: nextSupplier.name,
                          supplierTaxId: nextSupplier.taxIdentifier,
                        }
                      : item,
                  ),
                })
              }
              trigger={
                <ReviewRowButton
                  label={t("supplier")}
                  value={supplier || t("notFound")}
                  subvalue={document?.supplierTaxId || undefined}
                />
              }
            />

            <TextEditorSheet
              title={t("editValue", {
                field: tExpense("fields.description"),
              })}
              label={tExpense("fields.description")}
              value={values.description}
              emptyLabel={t("notFound")}
              onValueChange={(description) => update({ description })}
            />

            <OptionSheet
              title={t("chooseDocumentType")}
              value={document?.type ?? ""}
              options={v1.finance.FINANCIAL_DOCUMENT_TYPES.map((type) => ({
                value: type,
                label: tExpense(`documents.types.${type}`),
              }))}
              onValueChange={(type) =>
                update({
                  documents: ensureDocument(values).map((item, index) =>
                    index === 0
                      ? {
                          ...item,
                          type: type as v1.finance.FinancialDocumentType,
                          documentSeries:
                            type === "INVOICE" ? item.documentSeries : "",
                        }
                      : item,
                  ),
                })
              }
              trigger={
                <ReviewRowButton
                  label={tExpense("documents.type")}
                  value={
                    document
                      ? tExpense(`documents.types.${document.type}`)
                      : t("notFound")
                  }
                />
              }
            />

            {document?.type === "INVOICE" ? (
              documentSeriesEditing ? (
                <InlineTextRow
                  label={t("documentSeries")}
                  value={document.documentSeries}
                  onChange={(documentSeries) =>
                    update({
                      documents: ensureDocument(values).map((item, index) =>
                        index === 0 ? { ...item, documentSeries } : item,
                      ),
                    })
                  }
                  onDone={() => setDocumentSeriesEditing(false)}
                />
              ) : (
                <ReviewRowButton
                  label={t("documentSeries")}
                  value={document.documentSeries || t("notFound")}
                  onClick={() => setDocumentSeriesEditing(true)}
                />
              )
            ) : null}

            {documentNumberEditing ? (
              <InlineTextRow
                label={t("documentNumber")}
                value={document?.documentNumber ?? ""}
                onChange={(documentNumber) =>
                  update({
                    documents: ensureDocument(values).map((item, index) =>
                      index === 0 ? { ...item, documentNumber } : item,
                    ),
                  })
                }
                onDone={() => setDocumentNumberEditing(false)}
              />
            ) : (
              <ReviewRowButton
                label={t("documentNumber")}
                value={document?.documentNumber || t("notFound")}
                onClick={() => setDocumentNumberEditing(true)}
              />
            )}

            <OptionSheet
              title={t("chooseBook")}
              value={values.bookId}
              options={books.map((candidate) => ({
                value: candidate.id,
                label: v1.finance.financeBookName(candidate, locale),
                description: t(`bookHints.${candidate.type}`),
              }))}
              onValueChange={selectBook}
              trigger={
                <ReviewRowButton
                  label={tExpense("fields.book")}
                  value={book ? t(`bookLabels.${book.type}`) : t("notFound")}
                />
              }
            />

            <OptionSheet
              title={t("chooseCategory")}
              value={values.categoryId}
              options={categories
                .filter((candidate) => candidate.bookId === values.bookId)
                .map((candidate) => ({
                  value: candidate.id,
                  label: candidate.name,
                }))}
              onValueChange={(categoryId) => {
                const nextCategory = categories.find(
                  (candidate) => candidate.id === categoryId,
                );
                const allowed = book
                  ? v1.finance.EXPENSE_TREATMENTS_BY_BOOK_TYPE[book.type]
                  : [];
                update({
                  categoryId,
                  ...(nextCategory?.defaultTreatment &&
                  allowed.includes(nextCategory.defaultTreatment)
                    ? { treatment: nextCategory.defaultTreatment }
                    : {}),
                });
              }}
              trigger={
                <ReviewRowButton
                  label={tExpense("fields.category")}
                  value={category?.name ?? t("notFound")}
                />
              }
            />

            <OptionSheet
              title={t("chooseCostObject")}
              value={values.costObjectId}
              options={[
                { value: "", label: tCommon("none") },
                ...costObjects
                  .filter(
                    (candidate) =>
                      candidate.bookId === values.bookId && candidate.isActive,
                  )
                  .map((candidate) => ({
                    value: candidate.id,
                    label: candidate.name,
                  })),
              ]}
              onValueChange={(costObjectId) => {
                const nextCostObject = costObjects.find(
                  (candidate) => candidate.id === costObjectId,
                );
                const allocationDefaults = allocationDefaultsForCostObject(
                  nextCostObject,
                  values.amount,
                );
                update({
                  costObjectId,
                  ...(allocationDefaults
                    ? { allocations: allocationDefaults }
                    : {}),
                });
              }}
              trigger={
                <ReviewRowButton
                  label={tExpense("fields.costObject")}
                  value={costObject?.name ?? tCommon("none")}
                />
              }
            />

            <OptionSheet
              title={t("chooseTreatment")}
              value={values.treatment}
              options={(book
                ? v1.finance.EXPENSE_TREATMENTS_BY_BOOK_TYPE[book.type]
                : []
              ).map((treatment) => ({
                value: treatment,
                label: tExpense(`treatments.${treatment}`),
              }))}
              onValueChange={(treatment) =>
                update({
                  treatment: treatment as ExpenseFormValues["treatment"],
                })
              }
              trigger={
                <ReviewRowButton
                  label={tExpense("fields.treatment")}
                  value={tExpense(`treatments.${values.treatment}`)}
                />
              }
            />

            <OptionSheet
              title={t("choosePaymentMethod")}
              value={payment?.paymentMethod ?? ""}
              options={v1.finance.PAYMENT_METHODS.map((method) => ({
                value: method,
                label: tExpense(`payments.methods.${method}`),
              }))}
              onValueChange={(paymentMethod) =>
                update({
                  payments: values.payments.map((line, index) =>
                    index === 0
                      ? {
                          ...line,
                          paymentMethod:
                            paymentMethod as v1.finance.PaymentMethod,
                        }
                      : line,
                  ),
                })
              }
              trigger={
                <ReviewRowButton
                  label={tExpense("payments.method")}
                  value={
                    payment
                      ? tExpense(`payments.methods.${payment.paymentMethod}`)
                      : t("notFound")
                  }
                />
              }
            />

            <OptionSheet
              title={t("choosePaymentSource")}
              value={paymentSourceValue(payment)}
              options={paymentSourceOptions(book, accounts, tExpense)}
              onValueChange={(source) => {
                const [kind, id = ""] = source.split(":");
                update({
                  payments: values.payments.map((line, index) =>
                    index === 0
                      ? {
                          ...line,
                          sourceType:
                            kind === "associate"
                              ? "ASSOCIATE_PERSONAL_FUNDS"
                              : "BOOK_ACCOUNT",
                          sourceAccountId: kind === "account" ? id : "",
                          payerAssociateId: kind === "associate" ? id : "",
                        }
                      : line,
                  ),
                });
              }}
              trigger={
                <ReviewRowButton
                  label={tExpense("payments.sourceType")}
                  value={sourceLabel}
                />
              }
            />

            <OptionSheet
              title={t("chooseBeneficiary")}
              value={allocationValue(allocation)}
              options={beneficiaryOptions(book, tExpense)}
              onValueChange={(beneficiaryValue) => {
                const [kind, associateId = ""] = beneficiaryValue.split(":");
                update({
                  allocations: [
                    kind === "common"
                      ? {
                          type: "COMMON",
                          associateId: "",
                          amount: values.amount,
                        }
                      : {
                          type: "ASSOCIATE_SPECIFIC",
                          associateId,
                          amount: values.amount,
                        },
                  ],
                });
              }}
              trigger={
                <ReviewRowButton
                  label={tExpense("allocations.title")}
                  value={beneficiaryLabel}
                />
              }
            />

            <TextEditorSheet
              title={t("editValue", {
                field: tExpense("documents.notes"),
              })}
              label={tExpense("documents.notes")}
              value={document?.notes ?? ""}
              emptyLabel={tCommon("none")}
              multiline
              onValueChange={(notes) =>
                update({
                  documents: ensureDocument(values).map((item, index) =>
                    index === 0 ? { ...item, notes } : item,
                  ),
                })
              }
            />
          </div>

          <figure
            data-slot="receipt-preview"
            className="mt-6 flex flex-col gap-3"
          >
            <figcaption className="flex items-center gap-2 text-sm font-medium">
              <ImageIcon
                className="size-5 text-muted-foreground"
                aria-hidden="true"
              />
              {t("receiptAttached")}
            </figcaption>
            <div
              data-slot="receipt-preview-frame"
              className="relative w-full overflow-hidden rounded-lg bg-muted sm:mx-auto sm:max-w-72"
              style={{ aspectRatio: receiptPreviewAspectRatio }}
            >
              <Image
                src={previewUrl}
                alt={t("receiptPreview")}
                fill
                unoptimized
                className="object-contain object-center"
                onLoad={(event) => {
                  const { naturalWidth, naturalHeight } = event.currentTarget;
                  if (naturalWidth <= 0 || naturalHeight <= 0) return;

                  setReceiptPreviewAspectRatio(
                    Math.max(
                      aspectRatio.receiptPortrait,
                      naturalWidth / naturalHeight,
                    ),
                  );
                }}
              />
            </div>
          </figure>

          {!canSave ? (
            <div
              className="mt-4 border-l-2 border-warning pl-3 text-sm text-warning"
              role="status"
            >
              <p>{t("needsManualReview")}</p>
              {fieldsNeedingAttention.length > 0 ? (
                <>
                  <p className="mt-2 font-medium">
                    {t("fieldsNeedingAttention")}
                  </p>
                  <ul className="mt-1 list-disc space-y-1 pl-5">
                    {fieldsNeedingAttention.map((field) => (
                      <li key={field.field}>{field.label}</li>
                    ))}
                  </ul>
                </>
              ) : null}
            </div>
          ) : null}
          {error ? (
            <p className="mt-4 text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}
        </div>
      </div>

      <div className="border-t border-border bg-popover px-4 pt-4 pb-[max(var(--spacing-4),env(safe-area-inset-bottom))] sm:px-6">
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-2">
          <Button
            type="button"
            size="lg"
            disabled={!canSave || saving}
            onClick={onSave}
            className="w-full"
          >
            {saving ? <Spinner /> : null}
            {saving ? t("saving") : t("save")}
          </Button>
          <Button
            type="button"
            variant="text"
            disabled={saving}
            onClick={() => onEditManually(firstFieldNeedingAttention)}
            className="w-full"
          >
            <PencilLineIcon aria-hidden="true" />
            {t("editManually")}
          </Button>
        </div>
      </div>
    </div>
  );
}

function expenseFieldLabel(
  field: ExpenseFormFocusField,
  t: ReturnType<typeof useTranslations<"finance.expense">>,
): string {
  switch (field) {
    case "bookId":
      return t("fields.book");
    case "amount":
      return t("fields.amount");
    case "occurredAt":
      return t("fields.occurredAt");
    case "treatment":
      return t("fields.treatment");
    case "categoryId":
      return t("fields.category");
    case "payments.0.sourceType":
      return t("payments.sourceType");
    case "payments.0.sourceAccountId":
      return t("payments.account");
    case "payments.0.payerAssociateId":
      return t("payments.payer");
    case "payments.0.paymentMethod":
      return t("payments.method");
    case "payments.0.amount":
      return t("payments.amount");
    case "allocations.0.type":
      return t("allocations.type");
    case "allocations.0.associateId":
      return t("allocations.associate");
    case "allocations.0.amount":
      return t("allocations.amount");
  }
}

function ReviewRowButton({
  label,
  value,
  subvalue,
  disabled = false,
  onClick,
  ...props
}: {
  label: string;
  value: string;
  subvalue?: string;
  disabled?: boolean;
  onClick?: () => void;
} & Omit<React.ComponentProps<"button">, "children" | "onClick">) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="group flex min-h-16 w-full items-center justify-between gap-6 border-b border-border py-3 text-left outline-none enabled:hover:bg-muted enabled:focus-visible:ring-2 enabled:focus-visible:ring-inset enabled:focus-visible:ring-ring disabled:cursor-default"
      {...props}
    >
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="flex min-w-0 items-center gap-2 text-right text-base font-medium">
        <span className="min-w-0">
          <span className="block break-words">{value}</span>
          {subvalue ? (
            <span className="mt-0.5 block text-sm font-normal text-muted-foreground">
              {subvalue}
            </span>
          ) : null}
        </span>
        {!disabled ? (
          <ChevronRightIcon
            className="size-4 shrink-0 text-muted-foreground"
            aria-hidden="true"
          />
        ) : null}
      </span>
    </button>
  );
}

function InlineTextRow({
  label,
  value,
  onChange,
  onDone,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onDone: () => void;
}) {
  return (
    <div className="flex min-h-16 items-center justify-between gap-4 border-b border-border py-3">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="w-full max-w-xs">
        <Input
          autoFocus
          aria-label={label}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onBlur={onDone}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
          }}
          className="text-right"
        />
      </span>
    </div>
  );
}

function OptionSheet({
  title,
  value,
  options,
  onValueChange,
  trigger,
}: {
  title: string;
  value: string;
  options: readonly ReviewOption[];
  onValueChange: (value: string) => void;
  trigger: React.ReactElement;
}) {
  const [open, setOpen] = useState(false);

  return (
    <BottomSheet open={open} onOpenChange={setOpen}>
      <BottomSheetTrigger render={trigger}>{title}</BottomSheetTrigger>
      <BottomSheetContent>
        <BottomSheetHeader>
          <BottomSheetTitle>{title}</BottomSheetTitle>
        </BottomSheetHeader>
        <BottomSheetBody safeAreaBottom className="gap-0 px-0">
          {options.map((option) => {
            const selected = option.value === value;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => {
                  onValueChange(option.value);
                  setOpen(false);
                }}
                className="flex min-h-16 w-full items-center gap-3 border-b border-border px-4 py-3 text-left outline-none last:border-b-0 hover:bg-muted focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-base font-medium">
                    {option.label}
                  </span>
                  {option.description ? (
                    <span className="mt-0.5 block text-sm text-muted-foreground">
                      {option.description}
                    </span>
                  ) : null}
                </span>
                {selected ? (
                  <CheckIcon
                    className="size-5 shrink-0 text-link"
                    aria-hidden="true"
                  />
                ) : null}
              </button>
            );
          })}
        </BottomSheetBody>
      </BottomSheetContent>
    </BottomSheet>
  );
}

function TextEditorSheet({
  title,
  label,
  value,
  emptyLabel,
  multiline = false,
  onValueChange,
}: {
  title: string;
  label: string;
  value: string;
  emptyLabel: string;
  multiline?: boolean;
  onValueChange: (value: string) => void;
}) {
  const t = useTranslations("finance.expense.captureSheet");
  const [open, setOpen] = useState(false);

  return (
    <BottomSheet open={open} onOpenChange={setOpen}>
      <BottomSheetTrigger
        render={<ReviewRowButton label={label} value={value || emptyLabel} />}
      >
        {title}
      </BottomSheetTrigger>
      <BottomSheetContent>
        <BottomSheetHeader>
          <BottomSheetTitle>{title}</BottomSheetTitle>
        </BottomSheetHeader>
        <BottomSheetBody safeAreaBottom className="gap-4">
          {multiline ? (
            <Textarea
              autoFocus
              aria-label={label}
              value={value}
              onChange={(event) => onValueChange(event.target.value)}
            />
          ) : (
            <Input
              autoFocus
              aria-label={label}
              autoComplete="off"
              value={value}
              onChange={(event) => onValueChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") setOpen(false);
              }}
            />
          )}
          <Button
            type="button"
            className="w-full"
            onClick={() => setOpen(false)}
          >
            {t("calendar.done")}
          </Button>
        </BottomSheetBody>
      </BottomSheetContent>
    </BottomSheet>
  );
}

function categoryFallbackCodeForBookSwitch(
  currentBookType: v1.finance.FinanceBookType | undefined,
  nextBookType: v1.finance.FinanceBookType,
  currentCategoryCode: string | undefined,
): string | undefined {
  if (!currentCategoryCode) return undefined;
  if (currentBookType === nextBookType) return undefined;
  if (nextBookType === "ASSOCIATE_POOL") {
    return currentCategoryCode === "OTHER" ? "POOL_OTHER" : "POOL_SHARED_COST";
  }
  return "OTHER";
}

function ensureDocument(
  values: ExpenseFormValues,
): ExpenseFormValues["documents"] {
  return values.documents.length > 0
    ? values.documents
    : [
        {
          type: "RECEIPT",
          documentSeries: "",
          documentNumber: "",
          issuedAt: values.occurredAt,
          supplierName: "",
          supplierTaxId: "",
          notes: "",
        },
      ];
}

function defaultPaymentAccount(
  accounts: readonly v1.finance.LedgerAccount[],
  bookId: string,
) {
  return (
    accounts.find(
      (account) =>
        account.bookId === bookId &&
        account.role === "BANK" &&
        account.isDefault,
    ) ??
    accounts.find(
      (account) =>
        account.bookId === bookId &&
        account.category === "ASSET" &&
        (v1.finance.EXPENSE_PAYMENT_SOURCE_ROLES as readonly string[]).includes(
          account.role,
        ),
    )
  );
}

function paymentSourceValue(
  payment: ExpenseFormValues["payments"][number] | undefined,
) {
  if (!payment) return "";
  return payment.sourceType === "ASSOCIATE_PERSONAL_FUNDS"
    ? `associate:${payment.payerAssociateId}`
    : `account:${payment.sourceAccountId}`;
}

function paymentSourceOptions(
  book: v1.finance.FinanceBook | undefined,
  accounts: readonly v1.finance.LedgerAccount[],
  tExpense: ReturnType<typeof useTranslations<"finance.expense">>,
): ReviewOption[] {
  if (!book) return [];
  const accountOptions = accounts
    .filter(
      (account) =>
        account.bookId === book.id &&
        account.category === "ASSET" &&
        (v1.finance.EXPENSE_PAYMENT_SOURCE_ROLES as readonly string[]).includes(
          account.role,
        ),
    )
    .map((account) => ({
      value: `account:${account.id}`,
      label: account.name,
      description: tExpense("payments.sourceTypes.BOOK_ACCOUNT"),
    }));
  const associateOptions = v1.finance
    .financeBookAssociates(book)
    .map((associate) => ({
      value: `associate:${associate.id}`,
      label: financeUserLabel(associate),
      description: tExpense("payments.sourceTypes.ASSOCIATE_PERSONAL_FUNDS"),
    }));
  return [...accountOptions, ...associateOptions];
}

function allocationValue(
  allocation: ExpenseFormValues["allocations"][number] | undefined,
) {
  if (!allocation) return "";
  return allocation.type === "COMMON"
    ? "common:"
    : `associate:${allocation.associateId}`;
}

function beneficiaryOptions(
  book: v1.finance.FinanceBook | undefined,
  tExpense: ReturnType<typeof useTranslations<"finance.expense">>,
): ReviewOption[] {
  return [
    {
      value: "common:",
      label: tExpense("allocations.types.COMMON"),
    },
    ...v1.finance.financeBookAssociates(book).map((associate) => ({
      value: `associate:${associate.id}`,
      label: financeUserLabel(associate),
      description: tExpense("allocations.types.ASSOCIATE_SPECIFIC"),
    })),
  ];
}

function formatDate(dateOnly: string, locale: string): string | null {
  const parsed = new Date(`${dateOnly}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "UTC",
  }).format(parsed);
}
