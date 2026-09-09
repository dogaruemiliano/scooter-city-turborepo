"use client";

/**
 * One operation, in full.
 *
 * The page shows what happened, who paid, and who benefited as three separate
 * sections, mirroring the model. The journal entry is last and framed as
 * supporting detail — true, but not the thing most readers came for.
 */
import { ApiError, v1 } from "@repo/api-shared";
import type { SupportedLocale } from "@repo/i18n";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Card,
  Input,
  Label,
  Separator,
} from "@repo/ui/components";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useId, useState } from "react";

import { Link } from "@/i18n/navigation";
import { localizePath, resolveRouteLocale } from "@/i18n/paths";
import {
  financeUserLabel,
  formatFinanceDate,
  formatFinanceDateTime,
  formatMinorAmount,
} from "@/lib/finance-format";
import { reverseOperation } from "../expenses/_lib/expense-api";
import { FINANCE_PATHS } from "../_lib/links";
import { JournalLines } from "./FinancialImpactPreview";

export interface FinancialOperationDetailsProps {
  operation: v1.finance.FinancialOperation;
  currency: string;
}

export function FinancialOperationDetails({
  operation,
  currency,
}: FinancialOperationDetailsProps) {
  const t = useTranslations("finance.operation");
  const tOperations = useTranslations("finance.operations");
  const tPreview = useTranslations("finance.preview");
  const tExpense = useTranslations("finance.expense");
  const tFunding = useTranslations("finance.funding");
  const tErrors = useTranslations("finance.errors");
  const locale = resolveRouteLocale(useLocale()) as SupportedLocale;
  const router = useRouter();
  const reasonId = useId();

  const [reason, setReason] = useState("");
  const [reversing, setReversing] = useState(false);
  const [reverseError, setReverseError] = useState<string | null>(null);

  const canReverse = operation.status === "POSTED";

  async function onReverse() {
    setReversing(true);
    setReverseError(null);

    try {
      const reversal = await reverseOperation(
        operation.id,
        reason ? { reason } : {},
        crypto.randomUUID(),
      );

      router.push(localizePath(FINANCE_PATHS.operation(reversal.id), locale));
      router.refresh();
    } catch (error) {
      setReverseError(
        error instanceof ApiError && error.message
          ? error.message
          : tErrors("generic"),
      );
    } finally {
      setReversing(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-medium">
            {operation.description ?? tOperations(`kinds.${operation.kind}`)}
          </h1>
          <p className="text-sm text-muted-foreground">
            {tOperations(`kinds.${operation.kind}`)} · {t("occurredOn")}{" "}
            {formatFinanceDate(operation.occurredAt, locale)}
          </p>
        </div>

        <Badge variant={canReverse ? "outline" : "secondary"}>
          {tOperations(`statuses.${operation.status}`)}
        </Badge>
      </header>

      {operation.reversedByOperationId ? (
        <Alert>
          <AlertTitle>{t("alreadyReversed")}</AlertTitle>
          <AlertDescription>
            <Link
              href={FINANCE_PATHS.operation(operation.reversedByOperationId)}
              className="underline underline-offset-4"
            >
              {t("reversedBy")}
            </Link>
          </AlertDescription>
        </Alert>
      ) : null}

      {operation.reversalOfOperationId ? (
        <Alert>
          <AlertDescription>
            <Link
              href={FINANCE_PATHS.operation(operation.reversalOfOperationId)}
              className="underline underline-offset-4"
            >
              {t("reversalOf")}
            </Link>
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="flex flex-col gap-3 p-4">
          <h2 className="text-base font-medium">{t("sections.details")}</h2>
          <dl className="flex flex-col gap-2 text-sm">
            {operation.expense ? (
              <>
                <DetailRow
                  label={t("fields.amount")}
                  value={formatMinorAmount(
                    operation.expense.amountMinor,
                    currency,
                    locale,
                  )}
                />
                <DetailRow
                  label={t("fields.treatment")}
                  value={tExpense(`treatments.${operation.expense.treatment}`)}
                />
                <DetailRow
                  label={t("fields.category")}
                  value={operation.expense.category?.name ?? "—"}
                />
                <DetailRow
                  label={t("fields.costObject")}
                  value={operation.expense.costObject?.name ?? "—"}
                />
              </>
            ) : null}
            {operation.associateFunding ? (
              <>
                <DetailRow
                  label={t("fields.amount")}
                  value={formatMinorAmount(
                    operation.associateFunding.amountMinor,
                    currency,
                    locale,
                  )}
                />
                <DetailRow
                  label={tFunding("fields.provider")}
                  value={financeUserLabel(operation.associateFunding.associate)}
                />
                <DetailRow
                  label={tFunding("fields.destination")}
                  value={operation.associateFunding.destinationAccount.name}
                />
                <DetailRow
                  label={tFunding("fields.type")}
                  value={tFunding(`types.${operation.associateFunding.type}`)}
                />
                <DetailRow
                  label={tFunding("fields.reference")}
                  value={operation.associateFunding.reference ?? "—"}
                />
                <DetailRow
                  label={tFunding("fields.notes")}
                  value={operation.associateFunding.notes ?? "—"}
                />
              </>
            ) : null}
            <DetailRow
              label={t("recordedOn")}
              value={
                operation.postedAt
                  ? formatFinanceDateTime(operation.postedAt, locale)
                  : "—"
              }
            />
          </dl>
        </Card>

        <Card className="flex flex-col gap-3 p-4">
          <h2 className="text-base font-medium">{tPreview("title")}</h2>
          <dl className="flex flex-col gap-2 text-sm">
            <DetailRow
              label={tPreview("companyExpense")}
              value={formatMinorAmount(
                operation.summary.companyExpenseMinor,
                currency,
                locale,
              )}
            />
            <DetailRow
              label={tPreview("companyCashImpact")}
              value={formatMinorAmount(
                operation.summary.companyCashImpactMinor,
                currency,
                locale,
              )}
            />
            {operation.summary.companyEquityIncreaseMinor !== 0 ? (
              <DetailRow
                label={tPreview("companyEquityIncrease")}
                value={formatMinorAmount(
                  operation.summary.companyEquityIncreaseMinor,
                  currency,
                  locale,
                )}
              />
            ) : null}
            {operation.summary.associatePayables.map((payable) => (
              <DetailRow
                key={payable.associateId}
                label={tPreview("payables")}
                value={formatMinorAmount(payable.amountMinor, currency, locale)}
              />
            ))}
            {operation.summary.specificEconomicBenefits.map((benefit) => (
              <DetailRow
                key={benefit.associateId}
                label={tPreview("specificBenefit")}
                value={formatMinorAmount(benefit.amountMinor, currency, locale)}
              />
            ))}
            <DetailRow
              label={tPreview("commonBenefit")}
              value={formatMinorAmount(
                operation.summary.commonEconomicBenefitMinor,
                currency,
                locale,
              )}
            />
          </dl>
        </Card>
      </div>

      {operation.expense && operation.expense.payments.length > 0 ? (
        <Card className="flex flex-col gap-3 p-4">
          <h2 className="text-base font-medium">{t("sections.payments")}</h2>
          <ul className="flex flex-col gap-2 text-sm">
            {operation.expense.payments.map((payment) => (
              <li
                key={payment.id}
                className="flex flex-wrap items-baseline justify-between gap-2"
              >
                <span>
                  {payment.sourceType === "BOOK_ACCOUNT"
                    ? (payment.sourceAccount?.name ??
                      tExpense("payments.sourceTypes.BOOK_ACCOUNT"))
                    : payment.payerAssociate
                      ? financeUserLabel(payment.payerAssociate)
                      : tExpense(
                          "payments.sourceTypes.ASSOCIATE_PERSONAL_FUNDS",
                        )}
                  <span className="ml-2 text-xs text-muted-foreground">
                    {tExpense(`payments.methods.${payment.paymentMethod}`)}
                  </span>
                </span>
                <span className="font-medium tabular-nums">
                  {formatMinorAmount(payment.amountMinor, currency, locale)}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {operation.allocations.length > 0 ? (
        <Card className="flex flex-col gap-3 p-4">
          <h2 className="text-base font-medium">{t("sections.allocations")}</h2>
          <ul className="flex flex-col gap-2 text-sm">
            {operation.allocations.map((allocation) => (
              <li
                key={allocation.id}
                className="flex flex-wrap items-baseline justify-between gap-2"
              >
                <span>
                  {allocation.type === "COMMON"
                    ? tExpense("allocations.types.COMMON")
                    : ((allocation.associate
                        ? financeUserLabel(allocation.associate)
                        : allocation.associateId) ?? "—")}
                </span>
                <span className="font-medium tabular-nums">
                  {formatMinorAmount(allocation.amountMinor, currency, locale)}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {operation.documents.length > 0 ? (
        <Card className="flex flex-col gap-3 p-4">
          <h2 className="text-base font-medium">{t("sections.documents")}</h2>
          <ul className="flex flex-col gap-2 text-sm">
            {operation.documents.map((document) => (
              <li key={document.id} className="flex flex-col">
                <span>
                  {tExpense(`documents.types.${document.type}`)}
                  {document.type === "INVOICE" && document.documentSeries
                    ? ` · ${document.documentSeries}${
                        document.documentNumber
                          ? ` ${document.documentNumber}`
                          : ""
                      }`
                    : document.documentNumber
                      ? ` · ${document.documentNumber}`
                      : ""}
                </span>
                {document.supplierName ? (
                  <span className="text-xs text-muted-foreground">
                    {document.supplierName}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {operation.journalEntry ? (
        <Card className="flex flex-col gap-3 p-4">
          <h2 className="text-base font-medium">{t("sections.journal")}</h2>
          <JournalLines
            postings={operation.journalEntry.postings.map((posting) => ({
              accountId: posting.accountId,
              accountCode: posting.account.code,
              accountName: posting.account.name,
              accountRole: posting.account.role,
              accountCategory: posting.account.category,
              associateId: posting.account.associateId,
              signedAmountMinor: posting.signedAmountMinor,
              description: posting.description ?? "",
            }))}
            currency={currency}
            locale={locale}
          />
        </Card>
      ) : null}

      {canReverse ? (
        <Card className="flex flex-col gap-3 p-4">
          <h2 className="text-base font-medium">{t("reverseTitle")}</h2>
          <p className="text-sm text-muted-foreground">
            {t("reverseDescription")}
          </p>

          {reverseError ? (
            <Alert variant="destructive">
              <AlertDescription>{reverseError}</AlertDescription>
            </Alert>
          ) : null}

          <div className="flex flex-col gap-2">
            <Label htmlFor={reasonId}>{t("reverseReason")}</Label>
            <Input
              id={reasonId}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </div>

          <Separator />

          <Button
            type="button"
            variant="destructive"
            className="self-start"
            disabled={reversing}
            onClick={() => void onReverse()}
          >
            {t("reverseConfirm")}
          </Button>
        </Card>
      ) : null}
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium tabular-nums">{value}</dd>
    </div>
  );
}
