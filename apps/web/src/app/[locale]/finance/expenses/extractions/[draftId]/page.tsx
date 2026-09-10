import { v1 } from "@repo/api-shared";
import { messages } from "@repo/i18n";
import { Badge, buttonVariants, Spinner } from "@repo/ui/components";
import {
  AlertCircleIcon,
  CheckCircle2Icon,
  CircleHelpIcon,
  PencilLineIcon,
  RotateCcwIcon,
} from "lucide-react";
import type { Metadata } from "next";
import type { ReactNode } from "react";

import { Link } from "@/i18n/navigation";
import { resolveRouteLocale } from "@/i18n/paths";
import { formatMinorAmount } from "@/lib/finance-format";
import {
  fetchFinance,
  financeCookieHeader,
  requireFinanceAdmin,
} from "../../../_lib/finance-server";
import { FINANCE_PATHS } from "../../../_lib/links";

interface ExpenseExtractionPageProps {
  params: Promise<{ locale: string; draftId: string }>;
}

export async function generateMetadata({
  params,
}: ExpenseExtractionPageProps): Promise<Metadata> {
  const { locale: rawLocale } = await params;
  const locale = resolveRouteLocale(rawLocale);
  return { title: messages[locale].appShell.pages.reviewFinanceExpense };
}

export default async function ExpenseExtractionPage({
  params,
}: ExpenseExtractionPageProps) {
  const { locale: rawLocale, draftId } = await params;
  const locale = resolveRouteLocale(rawLocale);
  const path = FINANCE_PATHS.expenseExtraction(draftId);
  await requireFinanceAdmin(locale, path);
  const draft = await fetchFinance(
    locale,
    path,
    v1.finance.ROUTES.expenses.extraction(draftId),
    v1.finance.expenseExtractionDraftSchema,
    await financeCookieHeader(),
  );
  const t = messages[locale].finance.expense.extractionReview;

  if (draft.status === "ANALYZING") {
    return (
      <ExtractionState
        icon={<Spinner className="size-6" />}
        title={t.analyzingTitle}
        description={t.analyzingDescription}
      />
    );
  }

  if (draft.status === "FAILED" || !draft.result) {
    return (
      <ExtractionState
        icon={<AlertCircleIcon className="size-6 text-destructive" />}
        title={t.failedTitle}
        description={draft.failureMessage ?? t.failedDescription}
      >
        <Link href={FINANCE_PATHS.newExpense} className={buttonVariants()}>
          <RotateCcwIcon data-icon="inline-start" aria-hidden="true" />
          {t.startOver}
        </Link>
        <Link
          href={FINANCE_PATHS.newExpenseManual}
          className={buttonVariants({ variant: "outline" })}
        >
          <PencilLineIcon data-icon="inline-start" aria-hidden="true" />
          {t.manual}
        </Link>
      </ExtractionState>
    );
  }

  const result = draft.result;
  const currency = /^[A-Z]{3}$/.test(result.currency.value ?? "")
    ? result.currency.value!
    : "RON";
  const manualHref = `${FINANCE_PATHS.newExpenseManual}?${new URLSearchParams({
    draft: draft.id,
  })}`;

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-8">
      <div className="flex flex-col gap-2">
        <p className="text-base text-foreground">{t.intro}</p>
        <p className="text-sm text-muted-foreground">{t.notRecorded}</p>
      </div>

      <section aria-labelledby="receipt-values" className="flex flex-col gap-5">
        <div className="flex flex-col gap-1">
          <p className="text-sm text-muted-foreground">{t.amount}</p>
          <h2
            id="receipt-values"
            className="text-4xl font-semibold tabular-nums"
          >
            {result.amountMinor.value === null
              ? t.notFound
              : formatMinorAmount(result.amountMinor.value, currency, locale)}
          </h2>
          <Confidence
            value={result.amountMinor.confidence}
            template={t.confidence}
          />
        </div>

        <dl className="grid border-y border-border sm:grid-cols-2 sm:divide-x sm:divide-border">
          <div className="grid content-start gap-4 py-5 sm:pr-6">
            <ExtractedValue
              label={t.date}
              value={result.occurredAt.value}
              confidence={result.occurredAt.confidence}
              confidenceTemplate={t.confidence}
              fallback={t.notFound}
            />
            {result.suggestedDocumentType === "INVOICE" ? (
              <ExtractedValue
                label={t.documentSeries}
                value={result.documentSeries.value}
                confidence={result.documentSeries.confidence}
                confidenceTemplate={t.confidence}
                fallback={t.notFound}
              />
            ) : null}
            <ExtractedValue
              label={t.documentNumber}
              value={result.documentNumber.value}
              confidence={result.documentNumber.confidence}
              confidenceTemplate={t.confidence}
              fallback={t.notFound}
            />
            <ExtractedValue
              label={t.supplier}
              value={result.supplierName.value}
              confidence={result.supplierName.confidence}
              confidenceTemplate={t.confidence}
              fallback={t.notFound}
            />
            <ExtractedValue
              label={t.supplierTaxId}
              value={result.supplierTaxIdentifier.value}
              confidence={result.supplierTaxIdentifier.confidence}
              confidenceTemplate={t.confidence}
              fallback={t.notFound}
            />
          </div>
          <div className="grid content-start gap-4 py-5 sm:pl-6">
            <ExtractedValue
              label={t.customer}
              value={result.customerName.value}
              confidence={result.customerName.confidence}
              confidenceTemplate={t.confidence}
              fallback={t.notFound}
            />
            <ExtractedValue
              label={t.customerTaxId}
              value={result.customerTaxIdentifier.value}
              confidence={result.customerTaxIdentifier.confidence}
              confidenceTemplate={t.confidence}
              fallback={t.notFound}
            />
            <CompanyMatchStatus
              status={result.companyMatch.status}
              labels={{
                matched: t.companyMatched,
                mismatched: t.companyMismatched,
                unknown: t.companyUnknown,
              }}
            />
          </div>
        </dl>
      </section>

      <section
        aria-labelledby="expense-suggestions"
        className="flex flex-col gap-4"
      >
        <h2 id="expense-suggestions" className="text-base font-medium">
          {t.suggestionsTitle}
        </h2>
        <dl className="grid gap-3 sm:grid-cols-2">
          <Suggestion
            label={t.book}
            value={
              result.suggestedBookType === "COMPANY"
                ? t.companyBook
                : result.suggestedBookType === "ASSOCIATE_POOL"
                  ? t.poolBook
                  : t.noSuggestion
            }
          />
          <Suggestion
            label={t.paymentMethod}
            value={
              result.suggestedPaymentMethod
                ? messages[locale].finance.expense.payments.methods[
                    result.suggestedPaymentMethod
                  ]
                : t.noSuggestion
            }
          />
          <Suggestion
            label={t.allocation}
            value={
              result.suggestedAllocationType
                ? messages[locale].finance.expense.allocations.types[
                    result.suggestedAllocationType
                  ]
                : t.noSuggestion
            }
          />
          <Suggestion
            label={t.category}
            value={result.suggestedCategoryCode ?? t.noSuggestion}
          />
        </dl>
        {result.suggestedPaymentMethod === "CARD" &&
        result.suggestedAllocationType === "COMMON" ? (
          <p className="text-sm text-muted-foreground">{t.cardCommon}</p>
        ) : null}
      </section>

      <div className="flex flex-wrap items-center gap-2">
        <Link href={manualHref} className={buttonVariants()}>
          {t.continue}
        </Link>
        <Link
          href={FINANCE_PATHS.newExpense}
          className={buttonVariants({ variant: "outline" })}
        >
          {t.startOver}
        </Link>
      </div>
    </div>
  );
}

function ExtractionState({
  icon,
  title,
  description,
  children,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <div className="mx-auto flex w-full max-w-xl flex-col items-center gap-4 py-16 text-center">
      {icon}
      <div className="flex flex-col gap-1">
        <h2 className="text-xl font-medium">{title}</h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      {children ? <div className="flex flex-wrap gap-2">{children}</div> : null}
    </div>
  );
}

function ExtractedValue({
  label,
  value,
  confidence,
  confidenceTemplate,
  fallback,
}: {
  label: string;
  value: string | null;
  confidence: number | null;
  confidenceTemplate: string;
  fallback: string;
}) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-sm font-medium">{value || fallback}</dd>
      <Confidence value={confidence} template={confidenceTemplate} />
    </div>
  );
}

function Confidence({
  value,
  template,
}: {
  value: number | null;
  template: string;
}) {
  if (value === null) return null;
  return (
    <p className="mt-1 text-xs text-muted-foreground">
      {template.replace("{value}", String(Math.round(value)))}
    </p>
  );
}

function CompanyMatchStatus({
  status,
  labels,
}: {
  status: v1.finance.CompanyMatchStatus;
  labels: { matched: string; mismatched: string; unknown: string };
}) {
  const matched = status === "MATCHED";
  const Icon = matched
    ? CheckCircle2Icon
    : status === "MISMATCHED"
      ? AlertCircleIcon
      : CircleHelpIcon;
  const label = matched
    ? labels.matched
    : status === "MISMATCHED"
      ? labels.mismatched
      : labels.unknown;

  return (
    <div className="flex items-start gap-2 text-sm">
      <Icon
        className={
          matched ? "mt-0.5 size-4 text-success" : "mt-0.5 size-4 text-warning"
        }
        aria-hidden="true"
      />
      <p>{label}</p>
    </div>
  );
}

function Suggestion({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-h-16 items-center justify-between gap-4 rounded-lg border border-border px-4 py-3">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd>
        <Badge variant="secondary">{value}</Badge>
      </dd>
    </div>
  );
}
