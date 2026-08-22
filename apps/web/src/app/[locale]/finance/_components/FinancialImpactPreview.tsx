"use client";

/**
 * What an operation does to the books, in plain language.
 *
 * Everything here comes from the server's posting plan — the UI does no
 * financial arithmetic of its own, so what the user reads before confirming
 * is exactly what gets posted.
 *
 * Debit/credit vocabulary is deliberately kept out of the main panel. It is
 * available one disclosure away, for the reader who wants it.
 */
import type { v1 } from "@repo/api-shared";
import type { SupportedLocale } from "@repo/i18n";
import { Button, Card, Separator, Spinner } from "@repo/ui/components";
import { useTranslations } from "next-intl";
import { useState } from "react";

import {
  formatMinorAmount,
  formatSignedMinorAmount,
} from "@/lib/finance-format";

export interface FinancialImpactPreviewProps {
  plan: v1.finance.PostingPlan | undefined;
  currency: string;
  locale: SupportedLocale;
  pending?: boolean;
  error?: string;
  associateNames?: ReadonlyMap<string, string>;
  onRetry?: () => void;
}

export function FinancialImpactPreview({
  plan,
  currency,
  locale,
  pending = false,
  error,
  associateNames,
  onRetry,
}: FinancialImpactPreviewProps) {
  const t = useTranslations("finance.preview");
  const [showJournal, setShowJournal] = useState(false);

  const nameOf = (associateId: string) =>
    associateNames?.get(associateId) ?? associateId;

  return (
    <Card className="flex flex-col gap-4 p-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-base font-medium">{t("title")}</h2>
        <p className="text-sm text-muted-foreground">{t("description")}</p>
      </div>

      {pending ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner /> {t("pending")}
        </p>
      ) : null}

      {error && !pending ? (
        <div className="flex flex-col items-start gap-2">
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
          {onRetry ? (
            <Button type="button" variant="outline" size="sm" onClick={onRetry}>
              {t("refresh")}
            </Button>
          ) : null}
        </div>
      ) : null}

      {plan && !pending ? (
        <>
          <dl className="flex flex-col gap-3">
            <ImpactRow
              label={t("companyExpense")}
              value={formatMinorAmount(
                plan.summary.companyExpenseMinor,
                currency,
                locale,
              )}
              muted={plan.summary.companyExpenseMinor === 0}
            />

            {plan.summary.companyAssetIncreaseMinor !== 0 ? (
              <ImpactRow
                label={t("companyAssetIncrease")}
                value={formatMinorAmount(
                  plan.summary.companyAssetIncreaseMinor,
                  currency,
                  locale,
                )}
              />
            ) : null}

            <ImpactRow
              label={t("companyCashImpact")}
              value={formatSignedMinorAmount(
                plan.summary.companyCashImpactMinor,
                currency,
                locale,
              )}
              muted={plan.summary.companyCashImpactMinor === 0}
            />

            {plan.summary.companyEquityIncreaseMinor !== 0 ? (
              <ImpactRow
                label={t("companyEquityIncrease")}
                value={formatMinorAmount(
                  plan.summary.companyEquityIncreaseMinor,
                  currency,
                  locale,
                )}
              />
            ) : null}

            <AmountGroup
              label={t("payables")}
              amounts={plan.summary.associatePayables}
              currency={currency}
              locale={locale}
              nameOf={nameOf}
              emptyLabel={t("noImpact")}
            />

            <AmountGroup
              label={t("receivables")}
              amounts={plan.summary.associateReceivables}
              currency={currency}
              locale={locale}
              nameOf={nameOf}
              emptyLabel={t("noImpact")}
            />

            <AmountGroup
              label={t("specificBenefit")}
              amounts={plan.summary.specificEconomicBenefits}
              currency={currency}
              locale={locale}
              nameOf={nameOf}
              emptyLabel={t("noImpact")}
            />

            <ImpactRow
              label={t("commonBenefit")}
              value={formatMinorAmount(
                plan.summary.commonEconomicBenefitMinor,
                currency,
                locale,
              )}
              muted={plan.summary.commonEconomicBenefitMinor === 0}
            />
          </dl>

          <Separator />

          <div className="flex flex-col gap-3">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="self-start"
              aria-expanded={showJournal}
              onClick={() => setShowJournal((open) => !open)}
            >
              {showJournal ? t("journalHide") : t("journalToggle")}
            </Button>

            {showJournal ? (
              <JournalLines
                postings={plan.postings}
                currency={currency}
                locale={locale}
              />
            ) : null}
          </div>
        </>
      ) : null}
    </Card>
  );
}

function ImpactRow({
  label,
  value,
  muted = false,
}: {
  label: string;
  value: string;
  muted?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd
        className={
          muted ? "text-sm text-muted-foreground" : "text-sm font-medium"
        }
      >
        {value}
      </dd>
    </div>
  );
}

function AmountGroup({
  label,
  amounts,
  currency,
  locale,
  nameOf,
  emptyLabel,
}: {
  label: string;
  amounts: readonly v1.finance.AssociateAmount[];
  currency: string;
  locale: SupportedLocale;
  nameOf: (associateId: string) => string;
  emptyLabel: string;
}) {
  if (amounts.length === 0) {
    return <ImpactRow label={label} value={emptyLabel} muted />;
  }

  return (
    <div className="flex flex-col gap-1">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      {amounts.map((amount) => (
        <dd
          key={amount.associateId}
          className="flex items-baseline justify-between gap-4 text-sm"
        >
          <span>{nameOf(amount.associateId)}</span>
          <span className="font-medium">
            {formatMinorAmount(amount.amountMinor, currency, locale)}
          </span>
        </dd>
      ))}
    </div>
  );
}

/**
 * The double-entry lines. Debits and credits are split into two columns
 * rather than shown as signed numbers, because that is the form an
 * accountant reads without translating.
 */
export function JournalLines({
  postings,
  currency,
  locale,
}: {
  postings: readonly v1.finance.PostingLine[];
  currency: string;
  locale: SupportedLocale;
}) {
  const t = useTranslations("finance.preview");

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-muted-foreground">{t("journalDescription")}</p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-md text-sm">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th scope="col" className="py-2 pr-4 font-normal">
                {t("columns.account")}
              </th>
              <th scope="col" className="py-2 pr-4 text-right font-normal">
                {t("columns.debit")}
              </th>
              <th scope="col" className="py-2 text-right font-normal">
                {t("columns.credit")}
              </th>
            </tr>
          </thead>
          <tbody>
            {postings.map((posting, index) => (
              <tr key={`${posting.accountId}-${index}`} className="border-b">
                <td className="py-2 pr-4">
                  <span className="block">{posting.accountName}</span>
                  <span className="block text-xs text-muted-foreground">
                    {posting.description}
                  </span>
                </td>
                <td className="py-2 pr-4 text-right tabular-nums">
                  {posting.signedAmountMinor > 0
                    ? formatMinorAmount(
                        posting.signedAmountMinor,
                        currency,
                        locale,
                      )
                    : null}
                </td>
                <td className="py-2 text-right tabular-nums">
                  {posting.signedAmountMinor < 0
                    ? formatMinorAmount(
                        -posting.signedAmountMinor,
                        currency,
                        locale,
                      )
                    : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
