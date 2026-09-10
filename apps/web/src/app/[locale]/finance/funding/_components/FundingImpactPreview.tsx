"use client";

import type { v1 } from "@repo/api-shared";
import type { SupportedLocale } from "@repo/i18n";
import { Button, Spinner } from "@repo/ui/components";
import {
  ArrowDownToLineIcon,
  CircleMinusIcon,
  HandCoinsIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { formatMinorAmount } from "@/lib/finance-format";
import { JournalLines } from "../../_components/FinancialImpactPreview";

export function FundingImpactPreview({
  plan,
  currency,
  locale,
  providerName,
  type,
  pending,
  error,
  onRetry,
}: {
  plan?: v1.finance.PostingPlan;
  currency: string;
  locale: SupportedLocale;
  providerName: string;
  type: v1.finance.AssociateFundingType;
  pending: boolean;
  error?: string;
  onRetry: () => void;
}) {
  const t = useTranslations("finance.funding.impact");
  const [showJournal, setShowJournal] = useState(false);
  const amount = plan
    ? formatMinorAmount(
        Math.abs(plan.summary.companyCashImpactMinor),
        currency,
        locale,
      )
    : "—";

  return (
    <aside>
      <div className="flex flex-col gap-1 pb-5">
        <h2 className="text-base font-medium">{t("title")}</h2>
        <p className="text-sm text-muted-foreground">{t("description")}</p>
      </div>

      {pending ? (
        <p className="flex items-center gap-2 border-t border-border py-4 text-sm text-muted-foreground">
          <Spinner /> {t("calculating")}
        </p>
      ) : null}

      {error && !pending ? (
        <div className="flex flex-col items-start gap-3 border-t border-border py-5">
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
          <Button type="button" variant="outline" size="sm" onClick={onRetry}>
            {t("retry")}
          </Button>
        </div>
      ) : null}

      {!error && !pending ? (
        <>
          <dl>
            <ImpactRow
              icon={ArrowDownToLineIcon}
              label={t("moneyReceived")}
              value={amount}
              tone="success"
            />
            <ImpactRow
              icon={HandCoinsIcon}
              label={
                type === "LOAN"
                  ? t("companyOwes", { name: providerName })
                  : t("capitalIncrease")
              }
              value={amount}
            />
            <ImpactRow
              icon={CircleMinusIcon}
              label={t("income")}
              value={t("noIncome")}
              muted
            />
          </dl>

          {plan ? (
            <div className="flex flex-col gap-3 border-t border-border pt-5">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full"
                aria-expanded={showJournal}
                onClick={() => setShowJournal((open) => !open)}
              >
                {showJournal ? t("hideJournal") : t("showJournal")}
              </Button>
              {showJournal ? (
                <JournalLines
                  postings={plan.postings}
                  currency={currency}
                  locale={locale}
                />
              ) : null}
            </div>
          ) : null}
        </>
      ) : null}
    </aside>
  );
}

function ImpactRow({
  icon: Icon,
  label,
  value,
  muted = false,
  tone = "default",
}: {
  icon: typeof ArrowDownToLineIcon;
  label: string;
  value: string;
  muted?: boolean;
  tone?: "default" | "success";
}) {
  return (
    <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-3 border-t border-border py-4">
      <span
        className={
          tone === "success"
            ? "flex size-6 items-center justify-center text-success"
            : "flex size-6 items-center justify-center text-muted-foreground"
        }
      >
        <Icon className="size-4" aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <dt className="text-sm text-muted-foreground">{label}</dt>
        <dd
          className={
            muted
              ? "mt-1 text-sm text-muted-foreground"
              : "mt-1 text-base font-medium tabular-nums"
          }
        >
          {value}
        </dd>
      </div>
    </div>
  );
}
