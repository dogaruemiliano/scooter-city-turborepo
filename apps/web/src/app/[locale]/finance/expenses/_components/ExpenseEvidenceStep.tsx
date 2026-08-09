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
  Label,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components";
import { AlertTriangleIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState, type Dispatch } from "react";

import type { SelectedExpenseEvidence } from "../_lib/expense-api";
import {
  expenseReviewWarnings,
  expenseVatSummary,
  type ExpenseFormAction,
  type ExpenseFormErrors,
  type ExpenseFormState,
} from "../_lib/expense-form";
import { ExpenseEvidencePicker } from "./ExpenseEvidencePicker";

const ADVANCED_DOCUMENT_ITEM = "advanced-document-details";

interface ExpenseEvidenceStepProps {
  disabled: boolean;
  dispatch: Dispatch<ExpenseFormAction>;
  errors: ExpenseFormErrors;
  fiscalEvidence: SelectedExpenseEvidence | null;
  isVatRegistered: boolean;
  onFiscalEvidenceChange(value: SelectedExpenseEvidence | null): void;
  onFiscalProcessingChange(processing: boolean): void;
  onPosEvidenceChange(value: SelectedExpenseEvidence | null): void;
  onPosProcessingChange(processing: boolean): void;
  posEvidence: SelectedExpenseEvidence | null;
  state: ExpenseFormState;
}

export function ExpenseEvidenceStep({
  disabled,
  dispatch,
  errors,
  fiscalEvidence,
  isVatRegistered,
  onFiscalEvidenceChange,
  onFiscalProcessingChange,
  onPosEvidenceChange,
  onPosProcessingChange,
  posEvidence,
  state,
}: ExpenseEvidenceStepProps) {
  const t = useTranslations("finance.expenses.form");
  const [openAdvancedItems, setOpenAdvancedItems] = useState<string[]>([]);
  const fiscalRequired = state.hasCompanyCui === "YES";
  const posRequired = fiscalRequired && state.paymentSource === "COMPANY_CARD";
  const summary = expenseVatSummary(
    state,
    isVatRegistered && fiscalRequired && Boolean(fiscalEvidence),
  );
  const warnings = expenseReviewWarnings(state);
  const advancedInvalid = Boolean(
    errors.documentType ||
    errors.documentNumber ||
    errors.documentDate ||
    errors.buyerCuiStatus ||
    errors.documentBuyerCui ||
    errors.vatLines,
  );
  const setField = (
    field: "documentType" | "documentNumber" | "documentDate" | "supplierCui",
    value: string,
  ) => dispatch({ type: "SET_FIELD", field, value });

  useEffect(() => {
    if (
      !advancedInvalid ||
      openAdvancedItems.includes(ADVANCED_DOCUMENT_ITEM)
    ) {
      return;
    }

    const frame = requestAnimationFrame(() => {
      setOpenAdvancedItems([ADVANCED_DOCUMENT_ITEM]);
    });
    return () => cancelAnimationFrame(frame);
  }, [advancedInvalid, openAdvancedItems]);

  return (
    <section className="animate-in fade-in-0 flex flex-col gap-5 border-t border-border p-4 duration-fast ease-standard motion-reduce:animate-none sm:p-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-base font-semibold">{t("evidence.title")}</h2>
        <p className="text-sm text-muted-foreground">
          {fiscalRequired
            ? t("evidence.requiredHelp")
            : t("evidence.optionalHelp")}
        </p>
      </div>

      <ExpenseEvidencePicker
        disabled={disabled}
        label={t("evidence.fiscalLabel")}
        required={fiscalRequired}
        value={fiscalEvidence}
        error={errors.fiscalEvidence}
        onChange={onFiscalEvidenceChange}
        onProcessingChange={onFiscalProcessingChange}
      />

      {posRequired ? (
        <ExpenseEvidencePicker
          disabled={disabled}
          label={t("evidence.posLabel")}
          required
          value={posEvidence}
          error={errors.posEvidence}
          onChange={onPosEvidenceChange}
          onProcessingChange={onPosProcessingChange}
        />
      ) : null}

      <Accordion value={openAdvancedItems} onValueChange={setOpenAdvancedItems}>
        <AccordionItem
          value={ADVANCED_DOCUMENT_ITEM}
          className="rounded-lg border border-border px-3"
        >
          <AccordionTrigger
            aria-invalid={advancedInvalid}
            aria-describedby={
              errors.vatLines ? "expense-vat-lines-error" : undefined
            }
          >
            {t("advancedDetails")}
          </AccordionTrigger>
          <AccordionContent className="flex flex-col gap-6">
            <div className="flex flex-col gap-1">
              <h3 className="text-sm font-semibold">{t("document.title")}</h3>
              <p className="text-xs text-muted-foreground">
                {t("document.help")}
              </p>
            </div>

            {fiscalEvidence ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <SelectField
                  id="expense-document-type"
                  label={t("document.type")}
                  value={state.documentType}
                  error={errors.documentType}
                  disabled={disabled}
                  placeholder={t("placeholders.documentType")}
                  items={[
                    { value: "INVOICE", label: t("document.types.INVOICE") },
                    {
                      value: "FISCAL_RECEIPT",
                      label: t("document.types.FISCAL_RECEIPT"),
                    },
                  ]}
                  onChange={(value) => setField("documentType", value)}
                />
                <TextField
                  id="expense-document-number"
                  label={t("document.number")}
                  value={state.documentNumber}
                  error={errors.documentNumber}
                  disabled={disabled}
                  placeholder={t("placeholders.documentNumber")}
                  onChange={(value) => setField("documentNumber", value)}
                />
                <TextField
                  id="expense-document-date"
                  label={t("document.date")}
                  date
                  value={state.documentDate}
                  error={errors.documentDate}
                  disabled={disabled}
                  onChange={(value) => setField("documentDate", value)}
                />
                <TextField
                  id="expense-supplier-cui"
                  label={t("document.supplierCui")}
                  value={state.supplierCui}
                  disabled={disabled}
                  placeholder={t("placeholders.supplierCui")}
                  onChange={(value) => setField("supplierCui", value)}
                />
              </div>
            ) : (
              <p className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">
                {t("document.noFile")}
              </p>
            )}

            <section
              className="flex flex-col gap-3 border-t border-border pt-5"
              aria-labelledby="expense-vat-title"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 id="expense-vat-title" className="text-sm font-semibold">
                    {t("vat.title", { currency: state.currency })}
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    {!fiscalRequired
                      ? t("vat.noCompanyCui")
                      : isVatRegistered
                        ? t("vat.registered")
                        : t("vat.notRegistered")}
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={disabled}
                  onClick={() =>
                    dispatch({
                      type: "ADD_VAT_LINE",
                      id: crypto.randomUUID(),
                    })
                  }
                >
                  <PlusIcon data-icon="inline-start" />
                  {t("vat.addLine")}
                </Button>
              </div>

              <div className="flex flex-col divide-y divide-border rounded-lg border border-border">
                {state.vatLines.map((line, index) => (
                  <div key={line.id} className="grid gap-3 p-3 sm:grid-cols-4">
                    <VatLineInput
                      id={`expense-vat-${line.id}-net`}
                      label={t("vat.netAmount")}
                      value={line.netAmount}
                      disabled={disabled}
                      invalid={Boolean(errors.vatLines)}
                      onChange={(value) =>
                        dispatch({
                          type: "UPDATE_VAT_LINE",
                          id: line.id,
                          field: "netAmount",
                          value,
                        })
                      }
                    />
                    <VatLineInput
                      id={`expense-vat-${line.id}-rate`}
                      label={t("vat.rate")}
                      value={line.ratePercent}
                      disabled={disabled}
                      invalid={Boolean(errors.vatLines)}
                      onChange={(value) =>
                        dispatch({
                          type: "UPDATE_VAT_LINE",
                          id: line.id,
                          field: "ratePercent",
                          value,
                        })
                      }
                    />
                    <VatLineInput
                      id={`expense-vat-${line.id}-amount`}
                      label={t("vat.amount")}
                      value={line.vatAmount}
                      disabled={disabled}
                      invalid={Boolean(errors.vatLines)}
                      onChange={(value) =>
                        dispatch({
                          type: "UPDATE_VAT_LINE",
                          id: line.id,
                          field: "vatAmount",
                          value,
                        })
                      }
                    />
                    <div className="flex items-end">
                      <Button
                        type="button"
                        variant="ghost"
                        className="w-full"
                        disabled={disabled}
                        aria-label={t("vat.removeLineNumber", {
                          number: index + 1,
                        })}
                        onClick={() =>
                          dispatch({ type: "REMOVE_VAT_LINE", id: line.id })
                        }
                      >
                        <Trash2Icon data-icon="inline-start" />
                        {t("vat.removeLine")}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>

              {errors.vatLines ? (
                <p
                  id="expense-vat-lines-error"
                  role="alert"
                  className="text-xs text-destructive"
                >
                  {errors.vatLines}
                </p>
              ) : null}

              <div className="grid overflow-hidden rounded-lg border border-border bg-muted sm:grid-cols-5">
                <VatMetric
                  label={t("vat.netAmount")}
                  value={summary.netAmount}
                />
                <VatMetric label={t("vat.amount")} value={summary.vatAmount} />
                <VatMetric
                  label={t("vat.recoverable")}
                  value={summary.recoverableVatAmount}
                />
                <VatMetric
                  label={t("vat.recognizedCost")}
                  value={summary.recognizedCostAmount}
                />
                <VatMetric
                  label={t("vat.total")}
                  value={summary.documentTotal}
                />
              </div>
            </section>

            {warnings.length > 0 ? (
              <Alert className="border-warning-subtle bg-warning-subtle text-warning">
                <AlertTriangleIcon aria-hidden="true" />
                <AlertTitle>{t("review.warningsTitle")}</AlertTitle>
                <AlertDescription>
                  <ul className="list-disc pl-4">
                    {warnings.map((warning) => (
                      <li key={warning}>{t(`review.warnings.${warning}`)}</li>
                    ))}
                  </ul>
                </AlertDescription>
              </Alert>
            ) : null}
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </section>
  );
}

function VatLineInput({
  disabled,
  id,
  invalid,
  label,
  onChange,
  value,
}: {
  disabled: boolean;
  id: string;
  invalid: boolean;
  label: string;
  onChange(value: string): void;
  value: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        inputMode="decimal"
        value={value}
        disabled={disabled}
        aria-invalid={invalid}
        aria-describedby={invalid ? "expense-vat-lines-error" : undefined}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

function VatMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 border-b border-border p-3 last:border-b-0 sm:border-r sm:border-b-0 sm:last:border-r-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="font-mono text-sm tabular-nums">{value}</span>
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
  value,
}: {
  date?: boolean;
  disabled: boolean;
  error?: string;
  id: string;
  label: string;
  onChange(value: string): void;
  placeholder?: string;
  value: string;
}) {
  const locale = useLocale();

  if (date) {
    return (
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${id}-day`}>{label}</Label>
        <DatePartsField
          baseId={id}
          aria-describedby={error ? `${id}-error` : undefined}
          disabled={disabled}
          invalid={Boolean(error)}
          label={label}
          locale={locale}
          value={value}
          onChange={onChange}
        />
        {error ? (
          <p
            id={`${id}-error`}
            role="alert"
            className="text-xs text-destructive"
          >
            {error}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
        onChange={(event) => onChange(event.target.value)}
      />
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-xs text-destructive">
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
  placeholder,
  value,
}: {
  disabled: boolean;
  error?: string;
  id: string;
  items: Array<{ label: string; value: string }>;
  label: string;
  onChange(value: string): void;
  placeholder: string;
  value: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Select
        value={value || null}
        disabled={disabled}
        onValueChange={(next) => next && onChange(next)}
      >
        <SelectTrigger
          id={id}
          className="w-full"
          aria-invalid={Boolean(error)}
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
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
